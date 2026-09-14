import { config } from '../config.js';
import { EchoLanguageProvider, type LanguageProvider } from './provider.js';
import { BedrockLanguageProvider } from './bedrock.js';

export function createLanguageProvider(): LanguageProvider {
  switch (config.languageProvider) {
    case 'echo':
      return new EchoLanguageProvider();
    case 'bedrock':
      return new BedrockLanguageProvider({
        region: config.awsRegion,
        model: config.bedrockModelId,
        profile: config.awsProfile,
      });
    default:
      throw new Error(`Unknown LANGUAGE_PROVIDER "${config.languageProvider}"`);
  }
}

export type { LanguageProvider, TranslateRequest, TranslateResult } from './provider.js';
export { EchoLanguageProvider } from './provider.js';
