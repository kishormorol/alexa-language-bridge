import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/http.js';
import { HouseholdStore } from '../src/state/store.js';
import { EchoLanguageProvider } from '../src/lang/provider.js';
import { APP_MIME_TYPE, RESOURCE_URI_META_KEY } from '../src/apps/contract.js';
import { HOUSEHOLD_CARD_URI } from '../src/apps/household-card.js';

let http: Server;
let baseUrl: URL;
let dir: string;
const HID = 'h-apps';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-apps-'));
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

describe('MCP Apps contract', () => {
  it('publishes the card as a ui:// resource with the MCP Apps MIME type', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const card = resources.find((r) => r.uri === HOUSEHOLD_CARD_URI);
    expect(card).toBeDefined();
    expect(card?.mimeType).toBe(APP_MIME_TYPE);
    await client.close();
  });

  it('serves the card HTML with no external references a sandbox would block', async () => {
    const client = await connect();
    const result = await client.readResource({ uri: HOUSEHOLD_CARD_URI });
    const entry = result.contents[0] as { mimeType?: string; text?: string };
    expect(entry.mimeType).toBe(APP_MIME_TYPE);
    expect(entry.text).toContain('<!doctype html>');
    expect(entry.text ?? '').not.toMatch(/src=["']https?:/i);
    await client.close();
  });

  it('points the card-bearing tools at the resource in both metadata formats', async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    for (const name of ['interpret_for_household', 'read_list']) {
      const tool = tools.find((t) => t.name === name);
      const meta = tool?._meta as
        | { ui?: { resourceUri?: string }; [k: string]: unknown }
        | undefined;
      expect(meta?.ui?.resourceUri, `${name} modern format`).toBe(HOUSEHOLD_CARD_URI);
      expect(meta?.[RESOURCE_URI_META_KEY], `${name} legacy format`).toBe(HOUSEHOLD_CARD_URI);
    }
    await client.close();
  });

  it('returns structured content the card can render', async () => {
    const client = await connect();
    await client.callTool({
      name: 'register_household_member',
      arguments: { householdId: HID, name: 'Ma', language: 'bn-BD' },
    });
    await client.callTool({
      name: 'register_household_member',
      arguments: { householdId: HID, name: 'Rafi', language: 'en-US' },
    });

    const result = await client.callTool({
      name: 'interpret_for_household',
      arguments: { householdId: HID, speaker: 'Ma', listener: 'Rafi', utterance: 'bhaat kheyecho?' },
    });

    const data = result.structuredContent as {
      kind: string;
      spoken: { name: string; language: string };
      heard: { name: string; language: string };
    };
    expect(data.kind).toBe('exchange');
    expect(data.spoken.name).toBe('Ma');
    expect(data.spoken.language).toBe('bn-BD');
    expect(data.heard.name).toBe('Rafi');
    expect(data.heard.language).toBe('en-US');
    await client.close();
  });
});
