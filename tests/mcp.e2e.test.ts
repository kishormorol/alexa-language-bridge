import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createApp } from '../src/http.js';
import { HouseholdStore } from '../src/state/store.js';
import { EchoLanguageProvider } from '../src/lang/provider.js';

let http: Server;
let baseUrl: URL;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-e2e-'));
  const app = createApp({
    store: new HouseholdStore(join(dir, 'state.json')),
    language: new EchoLanguageProvider(),
  });
  http = createServer(app);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  baseUrl = new URL(`http://127.0.0.1:${port}/mcp`);
});

afterAll(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

async function connect() {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(baseUrl));
  return client;
}

describe('MCP server over Streamable HTTP', () => {
  it('negotiates the protocol version the hackathon requires', async () => {
    const client = await connect();
    expect(client.getServerVersion()?.name).toBe('alexa-language-bridge');
    expect(LATEST_PROTOCOL_VERSION).toBe('2025-11-25');
    await client.close();
  });

  it('advertises the household tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_to_list',
      'complete_list_item',
      'get_messages',
      'get_reminders',
      'interpret_for_household',
      'leave_message',
      'list_household_members',
      'read_list',
      'register_device',
      'register_household_member',
      'set_device_state',
      'set_reminder',
    ]);
    await client.close();
  });

  it('carries a message from one language to another across sessions', async () => {
    const first = await connect();
    await first.callTool({
      name: 'register_household_member',
      arguments: { householdId: 'h-e2e', name: 'Ma', language: 'bn-BD' },
    });
    await first.callTool({
      name: 'register_household_member',
      arguments: { householdId: 'h-e2e', name: 'Rafi', language: 'en-US' },
    });
    await first.callTool({
      name: 'leave_message',
      arguments: { householdId: 'h-e2e', from: 'Ma', to: 'Rafi', message: 'bhaat kheye nio' },
    });
    await first.close();

    // A brand new session: state must survive, or the add-on is a stateless wrapper.
    const second = await connect();
    const result = await second.callTool({
      name: 'get_messages',
      arguments: { householdId: 'h-e2e', member: 'Rafi' },
    });
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('From Ma');
    expect(text).toContain('[en-US]');
    await second.close();
  });

  it('reports an unknown member as a tool error rather than throwing', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'get_messages',
      arguments: { householdId: 'h-e2e', member: 'Nobody' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });
});
