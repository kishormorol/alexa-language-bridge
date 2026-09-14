import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, type ToolDeps } from './tools/index.js';

export const SERVER_INFO = {
  name: 'alexa-language-bridge',
  version: '0.1.0',
} as const;

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions:
      'Lets a household member who does not speak English use the device in their own language. ' +
      'Register each person with the language they speak, then use leave_message, get_messages and ' +
      'interpret_for_household to carry meaning between them.',
  });

  registerTools(server, deps);
  return server;
}
