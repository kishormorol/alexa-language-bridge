import { z } from 'zod';
import type { HouseholdStore } from '../state/store.js';
import type { LanguageProvider } from '../lang/provider.js';
import { renderInto } from '../lang/render.js';
import { LANGUAGE_TAGS, isSupported, type LanguageTag } from '../domain/languages.js';
import type { Member, Rendering, Utterance } from '../domain/types.js';

export interface ToolDeps {
  store: HouseholdStore;
  language: LanguageProvider;
}

export const languageTag = z
  .string()
  .refine(isSupported, { message: `language must be one of: ${LANGUAGE_TAGS.join(', ')}` })
  .transform((v) => v as LanguageTag);

export const householdId = z
  .string()
  .min(1)
  .describe('Identifier for the household. One Alexa+ device group is one household.');

export const memberRef = (what: string) => z.string().min(1).describe(what);

export function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

export function failure(body: string) {
  return { ...text(body), isError: true as const };
}

export function unknownMember(nameOrId: string) {
  return failure(
    `No household member called "${nameOrId}". Register them with register_household_member first.`,
  );
}

/** Build an utterance as spoken, with no renderings beyond the original yet. */
export function spoken(member: Member, body: string): Utterance {
  const original: Rendering = { language: member.language, text: body };
  return { original, renderings: [original] };
}

/**
 * Render an utterance into a member's language, caching the result on the record so
 * the next read is free. Everything in the house is stored as spoken and rendered
 * for whoever is asking — this is the function that enforces it.
 */
export async function forMember(
  language: LanguageProvider,
  utterance: Utterance,
  member: Member,
): Promise<{ text: string; cached: boolean }> {
  const { rendering, cached } = await renderInto(
    language,
    utterance.original,
    utterance.renderings,
    member.language,
  );
  if (!cached && !utterance.renderings.some((r) => r.language === rendering.language)) {
    utterance.renderings.push(rendering);
  }
  return { text: rendering.text, cached };
}
