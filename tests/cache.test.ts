import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CachingLanguageProvider } from '../src/lang/cache.js';
import type { LanguageProvider, TranslateRequest, TranslateResult } from '../src/lang/provider.js';

/** Counts calls and can be made slow, so in-flight sharing is observable. */
class CountingProvider implements LanguageProvider {
  readonly name = 'counting';
  calls = 0;
  constructor(private readonly delayMs = 0) {}

  async translate({ text, to, from }: TranslateRequest): Promise<TranslateResult> {
    this.calls += 1;
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return { text: `${text}:${to}`, detectedLanguage: from ?? 'en-US' };
  }
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-cache-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('CachingLanguageProvider', () => {
  it('calls the model once for a phrase the household repeats', async () => {
    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, null);
    const req: TranslateRequest = { text: 'chal', from: 'bn-BD', to: 'en-US' };

    expect((await cache.translate(req)).text).toBe('chal:en-US');
    expect((await cache.translate(req)).text).toBe('chal:en-US');
    expect((await cache.translate(req)).text).toBe('chal:en-US');
    expect(inner.calls).toBe(1);
  });

  it('keys on direction, so the reverse translation is a separate entry', async () => {
    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, null);

    await cache.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });
    await cache.translate({ text: 'chal', from: 'en-US', to: 'bn-BD' });
    expect(inner.calls).toBe(2);
  });

  it('shares one in-flight call between identical concurrent misses', async () => {
    const inner = new CountingProvider(30);
    const cache = new CachingLanguageProvider(inner, null);
    const req: TranslateRequest = { text: 'chal', from: 'bn-BD', to: 'en-US' };

    const results = await Promise.all([
      cache.translate(req),
      cache.translate(req),
      cache.translate(req),
    ]);

    expect(results.every((r) => r.text === 'chal:en-US')).toBe(true);
    expect(inner.calls).toBe(1);
  });

  it('does not cache or call out when source and target match', async () => {
    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, null);

    await cache.translate({ text: 'rice', from: 'en-US', to: 'en-US' });
    expect(cache.size).toBe(0);
  });

  it('survives a restart, which is the point of persisting it', async () => {
    const path = join(dir, 'translations.json');
    const first = new CachingLanguageProvider(new CountingProvider(), path);
    await first.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });
    await first.flush();

    const secondInner = new CountingProvider();
    const second = new CachingLanguageProvider(secondInner, path);
    const result = await second.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    expect(result.text).toBe('chal:en-US');
    expect(secondInner.calls).toBe(0);
    await second.flush();
  });

  it('does not write to disk on a cache hit, which is the hot path', async () => {
    const path = join(dir, 'translations.json');
    const cache = new CachingLanguageProvider(new CountingProvider(), path);
    const req: TranslateRequest = { text: 'chal', from: 'bn-BD', to: 'en-US' };

    await cache.translate(req);
    await cache.flush();
    const { stat } = await import('node:fs/promises');
    const before = (await stat(path)).mtimeMs;

    await new Promise((r) => setTimeout(r, 10));
    await cache.translate(req);
    await cache.flush();

    expect((await stat(path)).mtimeMs).toBe(before);
  });

  it('treats an unreadable cache file as a cold cache rather than failing', async () => {
    const path = join(dir, 'translations.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, 'not json at all', 'utf8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, path);
    const result = await cache.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    expect(result.text).toBe('chal:en-US');
    expect(inner.calls).toBe(1);
    warn.mockRestore();
    // Writes are fire-and-forget by design, so settle them before the dir is removed.
    await cache.flush();
  });

  it('does not cache a failure, so a transient error is retried', async () => {
    let attempt = 0;
    const flaky: LanguageProvider = {
      name: 'flaky',
      async translate({ text, to, from }) {
        attempt += 1;
        if (attempt === 1) throw new Error('transient');
        return { text: `${text}:${to}`, detectedLanguage: from ?? 'en-US' };
      },
    };
    const cache = new CachingLanguageProvider(flaky, null);
    const req: TranslateRequest = { text: 'chal', from: 'bn-BD', to: 'en-US' };

    await expect(cache.translate(req)).rejects.toThrow('transient');
    expect((await cache.translate(req)).text).toBe('chal:en-US');
  });
});

describe('CachingLanguageProvider loading an older cache', () => {
  const req: TranslateRequest = { text: 'have you eaten?', from: 'en-US', to: 'bn-BD' };

  async function seed(path: string, text: string) {
    const { writeFile } = await import('node:fs/promises');
    const good: TranslateRequest = { text: 'chal', from: 'bn-BD', to: 'en-US' };
    await writeFile(
      path,
      JSON.stringify({
        [CachingLanguageProvider.key(req)]: {
          text,
          detectedLanguage: 'en-US',
          hits: 0,
          lastUsed: '2026-09-14T13:14:47.325Z',
        },
        [CachingLanguageProvider.key(good)]: {
          text: 'rice',
          detectedLanguage: 'bn-BD',
          hits: 0,
          lastUsed: '2026-09-14T13:14:36.096Z',
        },
      }),
      'utf8',
    );
  }

  it('does not serve a rendering a model was still arguing with', async () => {
    // The entry that was actually on disk: written before the Bedrock provider
    // bounded its reply, and read aloud on every hit since.
    const path = join(dir, 'translations.json');
    await seed(path, 'kheyecho?\n\n(already in Bangla romanised)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, path);
    const result = await cache.translate(req);

    expect(result.text).toBe('have you eaten?:bn-BD');
    expect(inner.calls).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/evicted 1 unservable entry/));
    warn.mockRestore();
    await cache.flush();
  });

  it('keeps the good entries it loads alongside a bad one', async () => {
    const path = join(dir, 'translations.json');
    await seed(path, 'kheyecho?\n\n(already in Bangla romanised)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, path);
    const result = await cache.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });

    expect(result.text).toBe('rice');
    expect(inner.calls).toBe(0);
    warn.mockRestore();
    await cache.flush();
  });

  it('heals the file, so the bad entry is gone after a restart', async () => {
    const path = join(dir, 'translations.json');
    await seed(path, 'kheyecho?\n\n(already in Bangla romanised)');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first = new CachingLanguageProvider(new CountingProvider(), path);
    await first.translate({ text: 'chal', from: 'bn-BD', to: 'en-US' });
    await first.flush();

    const { readFile } = await import('node:fs/promises');
    const onDisk = await readFile(path, 'utf8');
    expect(onDisk).not.toContain('already in Bangla romanised');
    expect(onDisk).toContain('rice');
    warn.mockRestore();
  });
});

describe('CachingLanguageProvider keying', () => {
  it('keys on context and script, so the same word can render differently', async () => {
    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, null);
    const base = { text: 'chal', from: 'bn-BD', to: 'en-US' } as const;

    await cache.translate({ ...base });
    await cache.translate({ ...base, context: 'a shopping list item' });
    await cache.translate({ ...base, context: 'a shopping list item', toScript: 'latin' });

    expect(inner.calls).toBe(3);
  });
});
