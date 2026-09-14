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

let http: Server;
let baseUrl: URL;
let dir: string;
const HID = 'h-home';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-home-'));
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

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const body = (result.content as { type: string; text: string }[])[0]?.text ?? '';
  return { body, isError: result.isError === true };
}

describe('household tasks across languages', () => {
  beforeAll(async () => {
    const client = await connect();
    await call(client, 'register_household_member', { householdId: HID, name: 'Ma', language: 'bn-BD' });
    await call(client, 'register_household_member', { householdId: HID, name: 'Rafi', language: 'en-US' });
    await client.close();
  });

  it('lets Ma add to the shopping list and Rafi read it in English', async () => {
    const client = await connect();
    await call(client, 'add_to_list', { householdId: HID, member: 'Ma', item: 'chal' });

    const read = await call(client, 'read_list', { householdId: HID, member: 'Rafi' });
    expect(read.body).toContain('[en-US]');
    expect(read.body).toContain('chal');
    await client.close();
  });

  it('lets Ma tick off an item Rafi added in English', async () => {
    const client = await connect();
    await call(client, 'add_to_list', { householdId: HID, member: 'Rafi', item: 'milk' });

    const done = await call(client, 'complete_list_item', {
      householdId: HID,
      member: 'Ma',
      item: 'milk',
    });
    expect(done.isError).toBe(false);
    expect(done.body).toContain('✓');

    const remaining = await call(client, 'read_list', { householdId: HID, member: 'Rafi' });
    expect(remaining.body).not.toContain('milk');
    await client.close();
  });

  it('delivers a reminder Ma set for Rafi in Rafi’s language', async () => {
    const client = await connect();
    await call(client, 'set_reminder', {
      householdId: HID,
      member: 'Ma',
      forMember: 'Rafi',
      reminder: 'doctor',
      dueAt: '2026-10-01T09:00:00.000Z',
    });

    const due = await call(client, 'get_reminders', { householdId: HID, member: 'Rafi' });
    expect(due.body).toContain('[en-US]');
    await client.close();
  });

  it('rejects a reminder with an unparseable time rather than storing rubbish', async () => {
    const client = await connect();
    const result = await call(client, 'set_reminder', {
      householdId: HID,
      member: 'Ma',
      reminder: 'ok',
      dueAt: 'tomorrow morning',
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('lets Ma turn off a light Rafi registered in English', async () => {
    const client = await connect();
    await call(client, 'register_device', {
      householdId: HID,
      member: 'Rafi',
      label: 'lamp',
      room: 'kitchen',
    });

    const on = await call(client, 'set_device_state', {
      householdId: HID,
      member: 'Ma',
      device: 'lamp',
      state: 'on',
    });
    expect(on.isError).toBe(false);
    expect(on.body).toContain('on');
    await client.close();
  });

  it('asks rather than guesses when a spoken name matches two things', async () => {
    const client = await connect();
    await call(client, 'register_device', {
      householdId: HID,
      member: 'Rafi',
      label: 'lamp stand',
      room: 'hall',
    });

    const result = await call(client, 'set_device_state', {
      householdId: HID,
      member: 'Rafi',
      device: 'lamp',
      state: 'off',
    });
    expect(result.isError).toBe(true);
    expect(result.body).toContain('more than one');
    await client.close();
  });
});
