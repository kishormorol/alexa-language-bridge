import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { languageName } from '../domain/languages.js';
import type { Message } from '../domain/types.js';
import {
  failure,
  forMember,
  householdId,
  memberRef,
  spoken,
  text,
  unknownMember,
  type ToolDeps,
} from './shared.js';

export function registerMessageTools(server: McpServer, { store, language }: ToolDeps): void {
  server.registerTool(
    'leave_message',
    {
      title: 'Leave a message for someone in the household',
      description:
        'Record a spoken message for another household member. Stored in the language it was spoken, delivered in the language the recipient speaks, whenever they next ask.',
      inputSchema: {
        householdId,
        from: memberRef('Name or id of the person speaking.'),
        to: memberRef('Name or id of the person the message is for.'),
        message: z.string().min(1).describe('What was said, in the speaker’s own language.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, from, to, message }) => {
      const sender = await store.findMember(hid, from);
      if (!sender) return unknownMember(from);
      const recipient = await store.findMember(hid, to);
      if (!recipient) return unknownMember(to);
      if (sender.id === recipient.id) return failure('A message needs a different sender and recipient.');

      const utterance = spoken(sender, message);
      const delivered = await forMember(language, utterance, recipient);

      const record: Message = {
        id: randomUUID(),
        fromMemberId: sender.id,
        toMemberId: recipient.id,
        createdAt: new Date().toISOString(),
        readAt: null,
        ...utterance,
      };
      await store.addMessage(hid, record);

      return text(
        `Saved for ${recipient.name}. They will hear it in ${languageName(recipient.language)}:\n${delivered.text}`,
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
        member: memberRef('Name or id of the person checking their messages.'),
        includeRead: z.boolean().default(false).describe('Include messages already heard.'),
        markRead: z.boolean().default(true).describe('Mark the returned messages as heard.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, includeRead, markRead }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const waiting = await store.messagesFor(hid, person.id, includeRead);
      if (waiting.length === 0) return text(`Nothing waiting for ${person.name}.`);

      const house = await store.household(hid);
      const nameOf = (id: string) => house.members.find((m) => m.id === id)?.name ?? 'someone';

      const lines: string[] = [];
      for (const msg of waiting) {
        const rendered = await forMember(language, msg, person);
        lines.push(`From ${nameOf(msg.fromMemberId)}: ${rendered.text}`);
      }
      await store.save();
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
        speaker: memberRef('Name or id of the person speaking.'),
        listener: memberRef('Name or id of the person who needs to understand.'),
        utterance: z.string().min(1).describe('What was said.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ householdId: hid, speaker, listener, utterance }) => {
      const from = await store.findMember(hid, speaker);
      if (!from) return unknownMember(speaker);
      const to = await store.findMember(hid, listener);
      if (!to) return unknownMember(listener);

      const said = spoken(from, utterance);
      const heard = await forMember(language, said, to);
      return text(
        `${from.name} (${languageName(from.language)}): ${utterance}\n` +
          `${to.name} hears (${languageName(to.language)}): ${heard.text}`,
      );
    },
  );
}
