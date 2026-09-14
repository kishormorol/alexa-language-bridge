import { config } from '../config.js';
import { EchoLanguageProvider, type LanguageProvider } from './provider.js';

export function createLanguageProvider(): LanguageProvider {
  switch (config.languageProvider) {
    case 'echo':
      return new EchoLanguageProvider();
    case 'bedrock':
      throw new Error(
        'LANGUAGE_PROVIDER=bedrock is not implemented yet — blocked on Bedrock model access. See PLAN.md milestone 6.',
      );
    default:
      throw new Error(`Unknown LANGUAGE_PROVIDER "${config.languageProvider}"`);
  }
}

export type { LanguageProvider, TranslateRequest, TranslateResult } from './provider.js';
export { EchoLanguageProvider } from './provider.js';
