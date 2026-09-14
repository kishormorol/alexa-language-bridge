import { config } from '../config.js';
import { EchoLanguageProvider, type LanguageProvider } from './provider.js';
import { BedrockLanguageProvider } from './bedrock.js';
import { CachingLanguageProvider } from './cache.js';

function createInner(): LanguageProvider {
  switch (config.languageProvider) {
    case 'echo':
      return new EchoLanguageProvider();
    case 'bedrock':
      return new BedrockLanguageProvider({
        region: config.awsRegion,
        model: config.bedrockModelId,
        endpoint: config.bedrockEndpoint === 'mantle' ? 'mantle' : 'runtime',
        profile: config.awsProfile,
        ...(config.bedrockEffort ? { effort: config.bedrockEffort } : {}),
      });
    default:
      throw new Error(`Unknown LANGUAGE_PROVIDER "${config.languageProvider}"`);
  }
}

export function createLanguageProvider(): LanguageProvider {
  const inner = createInner();
  // The echo provider is instant and deterministic; caching it only hides bugs.
  if (inner.name === 'echo') return inner;
  return new CachingLanguageProvider(inner, config.translationCachePath || null);
}

export type { LanguageProvider, TranslateRequest, TranslateResult } from './provider.js';
export { EchoLanguageProvider } from './provider.js';
export { CachingLanguageProvider } from './cache.js';
