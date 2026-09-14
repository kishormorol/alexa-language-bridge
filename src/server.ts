import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, type ToolDeps } from './tools/index.js';
import { registerHouseholdCard } from './apps/household-card.js';

export const SERVER_INFO = {
  name: 'alexa-language-bridge',
  version: '0.1.0',
} as const;

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {}, resources: {} },
    instructions: [
      'Gives every member of a household the run of the house in the language they speak,',
      'including those who do not speak English.',
      '',
      'Register each person once with register_household_member. After that, always pass the',
      'name of whoever is speaking as `member` — tool output comes back in that person’s',
      'language, so getting the speaker right is what makes this work.',
      '',
      'Shared lists (add_to_list, read_list, complete_list_item), reminders (set_reminder,',
      'get_reminders) and devices (register_device, set_device_state) are household-wide: what',
      'one person adds in their language, anyone else reads in theirs. Matching is done across',
      'every language an item is known by, so a person can tick off or switch off something',
      'another member named in a language they do not read.',
      '',
      'leave_message stores a message for another member and delivers it in their language when',
      'they next ask with get_messages. interpret_for_household carries a live utterance between',
      'two people in the room.',
      '',
      'set_reminder needs an ISO 8601 timestamp — resolve natural language like "tomorrow',
      'morning" before calling.',
    ].join('\n'),
  });

  registerHouseholdCard(server);
  registerTools(server, deps);
  return server;
}
