import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LanguageTag } from '../domain/languages.js';
import type { LanguageProvider, TranslateRequest, TranslateResult } from './provider.js';

interface Entry {
  text: string;
  detectedLanguage: LanguageTag;
  hits: number;
  lastUsed: string;
}

/**
 * Whether a stored rendering is safe to hand to a household.
 *
 * A cache serves what it holds forever, so it cannot trust a file written by an
 * older build. Before the Bedrock provider bounded its reply, a model that argued
 * with itself was stored whole — "kheyecho?\n\n(already in Bangla romanised)" —
 * and would be read aloud on every hit. A rendering is one spoken line; anything
 * else is dropped on load and re-fetched on the next ask, by a provider that now
 * refuses to produce it.
 */
function isServable(entry: unknown): entry is Entry {
  if (typeof entry !== 'object' || entry === null) return false;
  const { text, detectedLanguage } = entry as Partial<Entry>;
  return (
    typeof text === 'string' &&
    text.trim() !== '' &&
    !text.includes('\n') &&
    typeof detectedLanguage === 'string'
  );
}

/**
 * Content-addressed cache in front of any language provider.
 *
 * The 500 ms round-trip budget is the reason this exists. A household says the same
 * handful of things over and over — the same groceries, the same reminders, the same
 * "have you eaten?" — so most turns should never reach the model at all. Per-message
 * renderings already avoid re-translating one stored message; this avoids
 * re-translating the same *words* wherever they turn up.
 *
 * Identical concurrent misses share one in-flight call rather than racing.
 */
export class CachingLanguageProvider implements LanguageProvider {
  readonly #inner: LanguageProvider;
  readonly #path: string | null;
  readonly #entries = new Map<string, Entry>();
  readonly #inFlight = new Map<string, Promise<TranslateResult>>();
  #loaded = false;
  #writes: Promise<void> = Promise.resolve();

  constructor(inner: LanguageProvider, path: string | null) {
    this.#inner = inner;
    this.#path = path;
  }

  get name(): string {
    return `${this.#inner.name}+cache`;
  }

  static key({ text, from, to, context, toScript }: TranslateRequest): string {
    return createHash('sha256')
      .update(`${from ?? ''}|${to}|${toScript ?? ''}|${context ?? ''}|${text}`)
      .digest('hex');
  }

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    // A same-language request is not worth an entry; the inner provider
    // short-circuits it anyway.
    if (req.from === req.to) return this.#inner.translate(req);

    await this.#load();
    const key = CachingLanguageProvider.key(req);

    const hit = this.#entries.get(key);
    if (hit) {
      // Deliberately not persisted. A hit is the hot path of a 500 ms budget, and
      // rewriting the whole file to bump a counter would put a disk write on it.
      // Hit stats are in-memory telemetry; only new entries are worth durability.
      hit.hits += 1;
      hit.lastUsed = new Date().toISOString();
      return { text: hit.text, detectedLanguage: hit.detectedLanguage };
    }

    const pending = this.#inFlight.get(key);
    if (pending) return pending;

    const call = this.#inner
      .translate(req)
      .then((result) => {
        this.#entries.set(key, {
          text: result.text,
          detectedLanguage: result.detectedLanguage,
          hits: 0,
          lastUsed: new Date().toISOString(),
        });
        this.#persist();
        return result;
      })
      .finally(() => {
        this.#inFlight.delete(key);
      });

    this.#inFlight.set(key, call);
    return call;
  }

  get size(): number {
    return this.#entries.size;
  }

  async #load(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;
    if (!this.#path) return;
    try {
      const raw = await readFile(this.#path, 'utf8');
      let evicted = 0;
      for (const [key, entry] of Object.entries(JSON.parse(raw) as Record<string, Entry>)) {
        if (!isServable(entry)) {
          evicted += 1;
          continue;
        }
        this.#entries.set(key, entry);
      }
      if (evicted > 0) {
        console.warn(`[cache] evicted ${evicted} unservable entr${evicted === 1 ? 'y' : 'ies'} from ${this.#path}`);
        // Rewrite now so the file heals, rather than waiting for the next miss.
        this.#persist();
      }
    } catch (err) {
      // A missing or unreadable cache is not an error — it is a cold cache.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[cache] ignoring unreadable cache at ${this.#path}`);
      }
    }
  }

  #persist(): void {
    const path = this.#path;
    if (!path) return;
    this.#writes = this.#writes.then(async () => {
      const body = JSON.stringify(Object.fromEntries(this.#entries), null, 2);
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${randomUUID()}.tmp`;
      await writeFile(tmp, body, 'utf8');
      await rename(tmp, path);
    });
  }

  async flush(): Promise<void> {
    await this.#writes;
  }
}
