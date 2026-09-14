import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Device, ListItem, Member, Reminder, Utterance } from '../domain/types.js';
import type { LanguageProvider } from '../lang/provider.js';
import { languageName } from '../domain/languages.js';
import { HOUSEHOLD_CARD_URI } from '../apps/household-card.js';
import { uiMeta } from '../apps/contract.js';
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

const listName = z
  .string()
  .min(1)
  .default('shopping')
  .describe('Which list. Defaults to the shopping list.');

const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'please', 'to', 'in', 'on', 'of']);

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));

/**
 * Match what someone said against a stored utterance, in any language it is held in.
 *
 * Containment has to work both ways: a person says "the lamp" for something stored
 * as "lamp", and "lamp" for something stored as "lamp stand". Falling back to word
 * overlap keeps both working without matching on stopwords alone.
 */
function mentions(utterance: Utterance, needle: string): boolean {
  const needleText = needle.trim().toLowerCase();
  if (needleText === '') return false;

  const needleWords = words(needleText);
  if (needleWords.length === 0) return false;

  return [utterance.original, ...utterance.renderings].some((r) => {
    const text = r.text.toLowerCase();
    if (text.includes(needleText) || needleText.includes(text)) return true;
    const textWords = new Set(words(text));
    return needleWords.some((w) => textWords.has(w));
  });
}

async function lines(
  language: LanguageProvider,
  items: readonly Utterance[],
  reader: Member,
  prefix: (index: number) => string,
): Promise<string> {
  const out: string[] = [];
  for (const [index, item] of items.entries()) {
    const rendered = await forMember(language, item, reader);
    out.push(`${prefix(index)}${rendered.text}`);
  }
  return out.join('\n');
}

export function registerHomeTools(server: McpServer, { store, language }: ToolDeps): void {
  // ---- lists ---------------------------------------------------------------

  server.registerTool(
    'add_to_list',
    {
      title: 'Add something to a household list',
      description:
        'Add an item to a shared household list, spoken in the adder’s own language. Anyone else reads it in theirs.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person adding the item.'),
        item: z.string().min(1).describe('What to add, as they said it.'),
        list: listName,
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, item, list }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const record: ListItem = {
        id: randomUUID(),
        addedByMemberId: person.id,
        addedAt: new Date().toISOString(),
        doneAt: null,
        ...spoken(person, item),
      };
      await store.addListItem(hid, list, record);

      const open = await store.listItems(hid, list, false);
      return text(`Added to the ${list} list. ${open.length} item${open.length === 1 ? '' : 's'} on it now.`);
    },
  );

  server.registerTool(
    'read_list',
    {
      title: 'Read a household list',
      description:
        'Read a shared household list back in the language of whoever is asking, whatever language each item was added in.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person asking.'),
        list: listName,
        includeDone: z.boolean().default(false).describe('Include items already ticked off.'),
      },
      annotations: { readOnlyHint: false },
      _meta: uiMeta(HOUSEHOLD_CARD_URI),
    },
    async ({ householdId: hid, member, list, includeDone }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const items = await store.listItems(hid, list, includeDone);
      if (items.length === 0) {
        const names = await store.listNames(hid);
        const hint = names.length > 0 ? ` Lists with something on them: ${names.join(', ')}.` : '';
        return text(`The ${list} list is empty.${hint}`);
      }

      const body = await lines(language, items, person, (i) => `${i + 1}. `);

      const rendered: { text: string; done: boolean }[] = [];
      for (const item of items) {
        const r = await forMember(language, item, person);
        rendered.push({ text: r.text, done: item.doneAt !== null });
      }
      await store.save();

      return {
        ...text(body),
        structuredContent: {
          kind: 'list',
          title: `${list} list`,
          reader: {
            name: person.name,
            language: person.language,
            languageName: languageName(person.language),
          },
          items: rendered,
        },
      };
    },
  );

  server.registerTool(
    'complete_list_item',
    {
      title: 'Tick something off a household list',
      description:
        'Mark an item done. Matches what the person says against the item in any language it is held in, so Ma can tick off something her son added in English.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person ticking it off.'),
        item: z.string().min(1).describe('What they said to tick off.'),
        list: listName,
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, item, list }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const open = await store.listItems(hid, list, false);
      const matches = open.filter((i) => mentions(i, item));
      if (matches.length === 0) return failure(`Nothing on the ${list} list matches "${item}".`);

      const closed = await store.completeListItems(hid, list, matches.map((m) => m.id));
      const body = await lines(language, closed, person, () => '✓ ');
      await store.save();
      return text(body);
    },
  );

  // ---- reminders -----------------------------------------------------------

  server.registerTool(
    'set_reminder',
    {
      title: 'Set a reminder for someone',
      description:
        'Set a reminder for yourself or another household member. Spoken in one language, delivered in theirs.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person setting it.'),
        forMember: memberRef('Who the reminder is for. Defaults to the person setting it.').optional(),
        reminder: z.string().min(1).describe('What to remind them of, as spoken.'),
        dueAt: z
          .string()
          .min(1)
          .describe('When it is due, as an ISO 8601 timestamp. Resolve natural language before calling.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, forMember: target, reminder, dueAt }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);
      const recipient = target ? await store.findMember(hid, target) : person;
      if (!recipient) return unknownMember(target ?? member);

      if (Number.isNaN(Date.parse(dueAt))) {
        return failure(`"${dueAt}" is not a valid ISO 8601 timestamp.`);
      }

      const utterance = spoken(person, reminder);
      const record: Reminder = {
        id: randomUUID(),
        forMemberId: recipient.id,
        createdByMemberId: person.id,
        createdAt: new Date().toISOString(),
        dueAt: new Date(dueAt).toISOString(),
        doneAt: null,
        ...utterance,
      };
      await store.addReminder(hid, record);

      const delivered = await forMember(language, utterance, recipient);
      await store.save();
      return text(`Reminder set for ${recipient.name}: ${delivered.text}`);
    },
  );

  server.registerTool(
    'get_reminders',
    {
      title: 'Get someone’s reminders',
      description: 'List the reminders waiting for a household member, in their own language.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person asking.'),
        includeDone: z.boolean().default(false).describe('Include reminders already done.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, includeDone }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const due = await store.remindersFor(hid, person.id, includeDone);
      if (due.length === 0) return text(`No reminders for ${person.name}.`);

      const body = await lines(language, due, person, (i) => `${i + 1}. `);
      await store.save();
      return text(body);
    },
  );

  // ---- devices -------------------------------------------------------------

  server.registerTool(
    'register_device',
    {
      title: 'Register a device in the house',
      description:
        'Add something controllable — a light, a fan — named in the language of whoever registered it.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person registering it.'),
        label: z.string().min(1).describe('What the household calls it, as spoken.'),
        room: z.string().min(1).describe('Which room it is in.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, label, room }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const device: Device = {
        id: randomUUID(),
        label: spoken(person, label),
        room,
        state: 'off',
        changedAt: new Date().toISOString(),
        changedByMemberId: null,
      };
      await store.addDevice(hid, device);
      return text(`Registered "${label}" in the ${room}. It is off.`);
    },
  );

  server.registerTool(
    'set_device_state',
    {
      title: 'Turn something on or off',
      description:
        'Turn a registered device on or off. Matches the spoken name against the device in any language it is known by, so anyone in the house can control it in their own words.',
      inputSchema: {
        householdId,
        member: memberRef('Name or id of the person asking.'),
        device: z.string().min(1).describe('What they called it.'),
        state: z.enum(['on', 'off']),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ householdId: hid, member, device, state }) => {
      const person = await store.findMember(hid, member);
      if (!person) return unknownMember(member);

      const all = await store.devices(hid);
      if (all.length === 0) return failure('No devices are registered in this household yet.');

      // Make sure every device is known in the asker's language before matching,
      // so "bati" finds the light their son registered as "lamp".
      for (const d of all) await forMember(language, d.label, person);
      await store.save();

      const matches = all.filter((d) => mentions(d.label, device) || d.room.toLowerCase() === device.toLowerCase());
      if (matches.length === 0) return failure(`Nothing in the house matches "${device}".`);
      if (matches.length > 1) {
        const names = await lines(language, matches.map((m) => m.label), person, () => '- ');
        return failure(`That matches more than one thing:\n${names}`);
      }

      const target = matches[0]!;
      const updated = await store.setDeviceState(hid, target.id, state, person.id);
      if (!updated) return failure('That device disappeared while we were looking at it.');

      const label = await forMember(language, updated.label, person);
      return text(`${label.text} (${updated.room}) is now ${updated.state}.`);
    },
  );
}
