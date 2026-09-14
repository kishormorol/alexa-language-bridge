import type { LanguageProvider } from './provider.js';
import type { LanguageTag } from '../domain/languages.js';
import type { Script } from '../domain/types.js';

/**
 * The phrases a household actually repeats.
 *
 * Cold translation measures ~635 ms at p50 against a 500 ms budget; a cache hit is
 * ~1 ms. The gap is entirely first-utterance. Since a kitchen conversation is far
 * more predictable than general language — the same groceries, the same handful of
 * chores — most of that first-utterance cost can be paid before anyone speaks.
 *
 * Kept deliberately short. This is a warm start, not a dictionary: every entry costs
 * one model call at registration, and a long list would trade a latency problem for
 * a startup problem.
 */
export const COMMON_PHRASES = [
  // Groceries
  'rice',
  'milk',
  'eggs',
  'onions',
  'oil',
  'salt',
  'sugar',
  'tea',
  'bread',
  'fish',
  // Around the house
  'the light',
  'the fan',
  'the kitchen',
  'the bedroom',
  // What people actually say to each other
  'have you eaten?',
  'dinner is ready',
  'I am going out',
  'call me back',
  'the doctor',
  'take your medicine',
] as const;

export interface PrewarmTarget {
  language: LanguageTag;
  script: Script;
}

export interface PrewarmResult {
  attempted: number;
  warmed: number;
  failed: number;
  elapsedMs: number;
  /** Why warming failed, when it did. Distinct messages only. */
  errors: string[];
}

/**
 * How many warm-up calls to have in flight at once.
 *
 * The limit that bites is requests per minute, not concurrency — eight parallel
 * calls succeed, but forty in quick succession return `429 Too many requests` on a
 * new account's default quota. Two at a time with backoff keeps under it. Warming
 * is background work with nobody waiting, so there is nothing to gain from racing
 * and a half-warm cache to lose.
 */
const CONCURRENCY = 2;

/** Backoff schedule for retries. Throttling is transient; give it room. */
const BACKOFF_MS = [500, 1500, 4000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Warm the common phrases in both directions between two members.
 *
 * The list is written in English, but warming only English-to-Bangla helps the
 * English speaker and nobody else — the person who actually needs this product
 * says "chal", not "rice", and would still pay full cost on every phrase. So each
 * phrase is translated once, then its *result* is translated back. That second
 * call is what puts "chal -> rice" in the cache, which is the direction that
 * matters.
 *
 * Failures are counted, never thrown: a warm start is an optimisation, and a
 * household that cannot pre-warm should still work, just slower on first use.
 */
export interface PrewarmOptions {
  context?: string | undefined;
  /** Override the retry schedule. Tests use a fast one; production uses the default. */
  backoffMs?: readonly number[] | undefined;
}

export async function prewarm(
  provider: LanguageProvider,
  from: PrewarmTarget,
  to: PrewarmTarget,
  options: PrewarmOptions = {},
): Promise<PrewarmResult> {
  const { context, backoffMs = BACKOFF_MS } = options;
  const started = performance.now();
  if (from.language === to.language) {
    return { attempted: 0, warmed: 0, failed: 0, elapsedMs: 0, errors: [] };
  }

  let warmed = 0;
  let failed = 0;
  const errors = new Set<string>();

  const request = (text: string) =>
    provider.translate({
      text,
      from: from.language,
      to: to.language,
      toScript: to.script,
      ...(context === undefined ? {} : { context }),
    });

  const reverse = (text: string) =>
    provider.translate({
      text,
      from: to.language,
      to: from.language,
      toScript: from.script,
      ...(context === undefined ? {} : { context }),
    });

  const queue = [...COMMON_PHRASES];
  const worker = async (): Promise<void> => {
    for (;;) {
      const text = queue.shift();
      if (text === undefined) return;
      let lastError: unknown;
      let translated: string | undefined;
      for (let attempt = 0; attempt <= backoffMs.length && translated === undefined; attempt += 1) {
        if (attempt > 0) await sleep(backoffMs[attempt - 1] ?? 1000);
        try {
          translated = (await request(text)).text;
        } catch (err) {
          lastError = err;
        }
      }

      if (translated === undefined) {
        failed += 1;
        errors.add(
          lastError instanceof Error ? lastError.message.slice(0, 160) : String(lastError),
        );
        continue;
      }
      warmed += 1;

      // Now warm the way back, using what came out — this is the direction the
      // non-English speaker actually uses.
      try {
        await reverse(translated);
        warmed += 1;
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, COMMON_PHRASES.length) }, worker),
  );

  return {
    attempted: COMMON_PHRASES.length * 2,
    warmed,
    failed,
    elapsedMs: performance.now() - started,
    errors: [...errors],
  };
}
