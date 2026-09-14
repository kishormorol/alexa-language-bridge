import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPeopleTools } from './people.js';
import { registerMessageTools } from './messages.js';
import { registerHomeTools } from './home.js';
import type { ToolDeps } from './shared.js';

export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerPeopleTools(server, deps);
  registerMessageTools(server, deps);
  registerHomeTools(server, deps);
}

export type { ToolDeps } from './shared.js';
