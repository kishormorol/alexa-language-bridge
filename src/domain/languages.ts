/**
 * Languages the bridge can carry. Kept deliberately small: every one of these needs
 * a demo-quality round trip, and a long list of half-working locales scores worse
 * than a short list that always works.
 */
export const SUPPORTED_LANGUAGES = {
  'en-US': 'English',
  'bn-BD': 'Bangla',
  'hi-IN': 'Hindi',
  'ur-PK': 'Urdu',
  'es-US': 'Spanish',
  'zh-CN': 'Mandarin',
} as const;

export type LanguageTag = keyof typeof SUPPORTED_LANGUAGES;

export const LANGUAGE_TAGS = Object.keys(SUPPORTED_LANGUAGES) as LanguageTag[];

export function isSupported(tag: string): tag is LanguageTag {
  return Object.hasOwn(SUPPORTED_LANGUAGES, tag);
}

export function languageName(tag: LanguageTag): string {
  return SUPPORTED_LANGUAGES[tag];
}
