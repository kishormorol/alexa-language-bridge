import { describe, expect, it, vi } from 'vitest';
import { renderInto } from '../src/lang/render.js';
import { EchoLanguageProvider } from '../src/lang/provider.js';
import type { Rendering } from '../src/domain/types.js';

const original: Rendering = { language: 'bn-BD', text: 'khaoa hoyeche?' };

describe('renderInto', () => {
  it('reuses an existing rendering rather than calling the provider', async () => {
    const provider = new EchoLanguageProvider();
    const spy = vi.spyOn(provider, 'translate');
    const cachedEnglish: Rendering = { language: 'en-US', text: 'have you eaten?' };

    const result = await renderInto(provider, original, [original, cachedEnglish], 'en-US');

    expect(result.cached).toBe(true);
    expect(result.rendering.text).toBe('have you eaten?');
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls the provider when the target language is not cached', async () => {
    const provider = new EchoLanguageProvider();
    const result = await renderInto(provider, original, [original], 'en-US');

    expect(result.cached).toBe(false);
    expect(result.rendering.language).toBe('en-US');
  });

  it('returns the original untouched when source and target match', async () => {
    const provider = new EchoLanguageProvider();
    const result = await renderInto(provider, original, [original], 'bn-BD');

    expect(result.rendering.text).toBe(original.text);
  });
});
