import { describe, expect, it, vi } from 'vitest';
import { COMMON_PHRASES, prewarm } from '../src/lang/prewarm.js';
import { CachingLanguageProvider } from '../src/lang/cache.js';
import type { LanguageProvider, TranslateRequest, TranslateResult } from '../src/lang/provider.js';

class CountingProvider implements LanguageProvider {
  readonly name = 'counting';
  calls = 0;
  async translate({ text, to, from }: TranslateRequest): Promise<TranslateResult> {
    this.calls += 1;
    return { text: `${text}:${to}`, detectedLanguage: from ?? 'en-US' };
  }
}

const MA = { language: 'bn-BD', script: 'latin' } as const;
const RAFI = { language: 'en-US', script: 'native' } as const;

describe('prewarm', () => {
  it('warms every common phrase', async () => {
    const inner = new CountingProvider();
    const result = await prewarm(inner, RAFI, MA);

    // Each phrase is warmed there and back, so the speaker of either language hits.
    expect(result.attempted).toBe(COMMON_PHRASES.length * 2);
    expect(result.warmed).toBe(COMMON_PHRASES.length * 2);
    expect(result.failed).toBe(0);
    expect(inner.calls).toBe(COMMON_PHRASES.length * 2);
  });

  it('makes the first real utterance a cache hit, which is the whole point', async () => {
    const inner = new CountingProvider();
    const cache = new CachingLanguageProvider(inner, null);
    await prewarm(cache, RAFI, MA);
    const afterWarm = inner.calls;

    await cache.translate({ text: 'rice', from: 'en-US', to: 'bn-BD', toScript: 'latin' });

    expect(inner.calls).toBe(afterWarm);
  });

  it('does nothing when both people share a language', async () => {
    const inner = new CountingProvider();
    const result = await prewarm(inner, RAFI, { language: 'en-US', script: 'native' });

    expect(result.attempted).toBe(0);
    expect(inner.calls).toBe(0);
  });

  it('retries through transient failures rather than giving up', async () => {
    let n = 0;
    const flaky: LanguageProvider = {
      name: 'flaky',
      async translate({ text, to, from }) {
        n += 1;
        // Every other call throttles, exactly as Bedrock does under load.
        if (n % 2 === 0) throw new Error('429 Too many requests');
        return { text: `${text}:${to}`, detectedLanguage: from ?? 'en-US' };
      },
    };

    const result = await prewarm(flaky, RAFI, MA, { backoffMs: [1, 1, 1] });
    expect(result.warmed).toBeGreaterThanOrEqual(COMMON_PHRASES.length);
  });

  it('counts failures instead of throwing when retries are exhausted', async () => {
    const dead: LanguageProvider = {
      name: 'dead',
      async translate() {
        throw new Error('429 Too many requests');
      },
    };

    const result = await prewarm(dead, RAFI, MA, { backoffMs: [1, 1, 1] });
    expect(result.failed).toBe(COMMON_PHRASES.length);
    expect(result.warmed).toBe(0);
    expect(result.errors).toContain('429 Too many requests');
  });

  it('warms into the reader’s script, not just their language', async () => {
    const inner = new CountingProvider();
    const spy = vi.spyOn(inner, 'translate');
    await prewarm(inner, RAFI, MA);

    const calls = spy.mock.calls.map(([req]) => req);
    const outbound = calls.filter((c) => c.to === 'bn-BD');
    const inbound = calls.filter((c) => c.to === 'en-US');
    expect(outbound).toHaveLength(COMMON_PHRASES.length);
    expect(outbound.every((c) => c.toScript === 'latin')).toBe(true);
    expect(inbound).toHaveLength(COMMON_PHRASES.length);
    expect(inbound.every((c) => c.toScript === 'native')).toBe(true);
  });
});
