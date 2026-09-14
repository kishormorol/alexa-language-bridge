import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { languageName } from '../domain/languages.js';
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
      if (house.members.length === 0) return text('Nobody is registered in this household yet.');
      return text(
        house.members
          .map((m) => `- ${m.name} — ${languageName(m.language)} (${m.language})`)
          .join('\n'),
      );
    },
  );
}
