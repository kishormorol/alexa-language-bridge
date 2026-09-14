import type { LanguageTag } from '../domain/languages.js';

export interface TranslateRequest {
  text: string;
  to: LanguageTag;
  from?: LanguageTag;
}

export interface TranslateResult {
  text: string;
  /** The language the input was actually in, detected when `from` was not supplied. */
  detectedLanguage: LanguageTag;
}

export interface LanguageProvider {
  readonly name: string;
  translate(req: TranslateRequest): Promise<TranslateResult>;
}

/**
 * Development provider. Deterministic, offline, and instant, so the transport,
 * state and tool surface can be built and tested before Bedrock model access is
 * granted on the hackathon AWS account.
 *
 * It does not translate. It marks text so that a wrong-language rendering is
 * obvious in tests and in the simulator rather than silently plausible.
 */
export class EchoLanguageProvider implements LanguageProvider {
  readonly name = 'echo';

  async translate({ text, to, from }: TranslateRequest): Promise<TranslateResult> {
    const detected = from ?? 'en-US';
    if (detected === to) return { text, detectedLanguage: detected };
    return { text: `[${to}] ${text}`, detectedLanguage: detected };
  }
}
