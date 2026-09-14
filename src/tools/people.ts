import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { languageName } from '../domain/languages.js';
import { z } from 'zod';
import { householdId, languageTag, memberRef, text, type ToolDeps } from './shared.js';

export function registerPeopleTools(server: McpServer, { store }: ToolDeps): void {
  server.registerTool(
    'register_household_member',
    {
      title: 'Register a household member',
      description:
        'Add a person to the household and record the language they speak. Re-registering an existing name updates their language.',
      inputSchema: {
        householdId,
        name: memberRef('What the household calls this person, e.g. "Ma".'),
        language: languageTag.describe('BCP-47 tag of the language this person speaks.'),
        script: z
          .enum(['native', 'latin'])
          .default('native')
          .describe(
            'How they write that language. "latin" for someone who speaks Bangla or Hindi but types it in Latin letters — "bati", not "বাতি".',
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ householdId: hid, name, language: tag, script }) => {
      const member = await store.addMember(hid, name, tag, script);
      const how = member.script === 'latin' ? ', written in Latin letters' : '';
      return text(
        `${member.name} speaks ${languageName(member.language)} (${member.language})${how}.`,
      );
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
      if (house.members.length === 0) return text('Nobody is registered in this household yet.');
      return text(
        house.members
          .map(
            (m) =>
              `- ${m.name} — ${languageName(m.language)} (${m.language})` +
              (m.script === 'latin' ? ', Latin letters' : ''),
          )
          .join('\n'),
      );
    },
  );
}
