import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HouseholdStore } from '../state/store.js';
import type { LanguageProvider } from '../lang/provider.js';
import { renderInto } from '../lang/render.js';
import { LANGUAGE_TAGS, isSupported, languageName, type LanguageTag } from '../domain/languages.js';
import type { Message, Rendering } from '../domain/types.js';

export interface ToolDeps {
  store: HouseholdStore;
  language: LanguageProvider;
}

const languageTag = z
  .string()
  .refine(isSupported, { message: `language must be one of: ${LANGUAGE_TAGS.join(', ')}` })
  .transform((v) => v as LanguageTag);

const householdId = z
  .string()
  .min(1)
  .describe('Identifier for the household. One Alexa+ device group is one household.');

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

function failure(body: string) {
  return { ...text(body), isError: true as const };
}

export function registerTools(server: McpServer, { store, language }: ToolDeps): void {
  server.registerTool(
    'register_household_member',
    {
      title: 'Register a household member',
      description:
        'Add a person to the household and record the language they speak. Re-registering an existing name updates their language.',
      inputSchema: {
        householdId,
        name: z.string().min(1).describe('What the household calls this person, e.g. "Ma".'),
        language: languageTag.describe('BCP-47 tag of the language this person speaks.'),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ householdId: hid, name, language: tag }) => {
      const member = await store.addMember(hid, name, tag);
      return text(`${member.name} speaks ${languageName(member.language)} (${member.language}).`);
    },
  );

  server.registerTool(
    'list_household_members',
    {
      title: 'List household members',
      description: 'List everyone in the household and the language each of them speaks.',
      inputSchema: { householdId },
      annotations: { readOnlyHint: true },
    },
    async ({ householdId: hid }) => {
      const house = await store.household(hid);
      if (house.members.length === 0) {
        return text('Nobody is registered in this household yet.');
      }
      const lines = house.members.map((m) => `- ${m.name} — ${languageName(m.language)} (${m.language})`);
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'leave_message',
    {
      title: 'Leave a message for someone in the household',
      description:
        'Record a spoken message for another household member. The message is stored in the language it was spoken and delivered in the language the recipient speaks.',
      inputSchema: {
        householdId,
        from: z.string().min(1).describe('Name or id of the person speaking.'),
        to: z.string().min(1).describe('Name or id of the person the message is for.'),
        message: z.string().min(1).describe('What was said, in the speaker’s own language.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, from, to, message }) => {
      const sender = await store.findMember(hid, from);
      if (!sender) return failure(`No household member called "${from}". Register them first.`);
      const recipient = await store.findMember(hid, to);
      if (!recipient) return failure(`No household member called "${to}". Register them first.`);
      if (sender.id === recipient.id) return failure('A message needs a different sender and recipient.');

      const original: Rendering = { language: sender.language, text: message };
      const { rendering } = await renderInto(language, original, [original], recipient.language);

      const renderings: Rendering[] = [original];
      if (rendering.language !== original.language) renderings.push(rendering);

      const record: Message = {
        id: randomUUID(),
        fromMemberId: sender.id,
        toMemberId: recipient.id,
        createdAt: new Date().toISOString(),
        readAt: null,
        original,
        renderings,
      };
      await store.addMessage(hid, record);

      return text(
        `Saved for ${recipient.name}. They will hear it in ${languageName(recipient.language)}:\n${rendering.text}`,
      );
    },
  );

  server.registerTool(
    'get_messages',
    {
      title: 'Get messages waiting for someone',
      description:
        'Read back the messages waiting for a household member, each rendered in the language that person speaks.',
      inputSchema: {
        householdId,
        member: z.string().min(1).describe('Name or id of the person checking their messages.'),
        includeRead: z.boolean().default(false).describe('Include messages already heard.'),
        markRead: z.boolean().default(true).describe('Mark the returned messages as heard.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, includeRead, markRead }) => {
      const person = await store.findMember(hid, member);
      if (!person) return failure(`No household member called "${member}".`);

      const waiting = await store.messagesFor(hid, person.id, includeRead);
      if (waiting.length === 0) {
        return text(`Nothing waiting for ${person.name}.`);
      }

      const house = await store.household(hid);
      const nameOf = (id: string) => house.members.find((m) => m.id === id)?.name ?? 'someone';

      const lines: string[] = [];
      for (const msg of waiting) {
        const { rendering } = await renderInto(language, msg.original, msg.renderings, person.language);
        if (!msg.renderings.some((r) => r.language === rendering.language)) {
          msg.renderings.push(rendering);
        }
        lines.push(`From ${nameOf(msg.fromMemberId)}: ${rendering.text}`);
      }

      if (markRead) await store.markRead(hid, waiting.map((m) => m.id));
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'interpret_for_household',
    {
      title: 'Interpret something said in another language',
      description:
        'Take an utterance in one household member’s language and return it in another’s, so the room can follow a live conversation.',
      inputSchema: {
        householdId,
        speaker: z.string().min(1).describe('Name or id of the person speaking.'),
        listener: z.string().min(1).describe('Name or id of the person who needs to understand.'),
        utterance: z.string().min(1).describe('What was said.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ householdId: hid, speaker, listener, utterance }) => {
      const from = await store.findMember(hid, speaker);
      if (!from) return failure(`No household member called "${speaker}".`);
      const to = await store.findMember(hid, listener);
      if (!to) return failure(`No household member called "${listener}".`);

      const original: Rendering = { language: from.language, text: utterance };
      const { rendering } = await renderInto(language, original, [original], to.language);
      return text(
        `${from.name} (${languageName(from.language)}): ${utterance}\n${to.name} hears (${languageName(to.language)}): ${rendering.text}`,
      );
    },
  );
}
