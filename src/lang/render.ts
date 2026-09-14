import type { LanguageProvider } from './provider.js';
import type { LanguageTag } from '../domain/languages.js';
import type { Rendering } from '../domain/types.js';

/**
 * Produce a rendering of `original` in `target`, reusing an existing one if the
 * message has already been carried into that language. Caching matters: the
 * latency budget for the whole round trip is 500 ms, and a household re-reads the
 * same messages far more often than new ones arrive.
 */
export async function renderInto(
  provider: LanguageProvider,
  original: Rendering,
  existing: readonly Rendering[],
  target: LanguageTag,
  context?: string,
  toScript?: import('../domain/types.js').Script,
): Promise<{ rendering: Rendering; cached: boolean }> {
  const hit = existing.find((r) => r.language === target);
  if (hit) return { rendering: hit, cached: true };

  const { text } = await provider.translate({
    text: original.text,
    from: original.language,
    to: target,
    ...(context === undefined ? {} : { context }),
    ...(toScript === undefined ? {} : { toScript }),
  });
  return { rendering: { language: target, text }, cached: false };
}
