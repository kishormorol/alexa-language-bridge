import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/http.js';
import { HouseholdStore } from '../src/state/store.js';
import type { LanguageProvider, TranslateRequest } from '../src/lang/provider.js';

/** Translates the way a real model would, for the two words this scenario needs. */
const DICTIONARY: Record<string, string> = { milk: 'dudh', dudh: 'milk' };
const translate = vi.fn(async ({ text, from, to }: TranslateRequest) => ({
  text: from === to ? text : (DICTIONARY[text] ?? text),
  detectedLanguage: from ?? to,
}));
const dictionary: LanguageProvider = { name: 'dictionary', translate };

let http: Server;
let baseUrl: URL;
let dir: string;
const HID = 'h-complete';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-complete-'));
  http = createServer(createApp({ store: new HouseholdStore(join(dir, 'state.json')), language: dictionary }));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  baseUrl = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`);
});

afterAll(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const body = (result.content as { type: string; text: string }[])[0]?.text ?? '';
  return { body, isError: result.isError === true };
}

describe('ticking off an item in the speaker’s own words', () => {
  it('lets Ma tick off "dudh" when Rafi added "milk" and she never read the list', async () => {
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(baseUrl));
    await call(client, 'register_household_member', { householdId: HID, name: 'Ma', language: 'bn-BD', script: 'latin' });
    await call(client, 'register_household_member', { householdId: HID, name: 'Rafi', language: 'en-US' });
    await call(client, 'add_to_list', { householdId: HID, member: 'Rafi', item: 'milk' });

    const done = await call(client, 'complete_list_item', { householdId: HID, member: 'Ma', item: 'dudh' });
    expect(done.isError).toBe(false);
    expect(done.body).toContain('✓ dudh');

    const remaining = await call(client, 'read_list', { householdId: HID, member: 'Rafi' });
    expect(remaining.body).not.toContain('milk');

    // The rendering was kept: asking about a second item does not re-translate milk.
    translate.mockClear();
    await call(client, 'add_to_list', { householdId: HID, member: 'Rafi', item: 'bread' });
    await call(client, 'complete_list_item', { householdId: HID, member: 'Ma', item: 'chal' });
    expect(translate.mock.calls.map(([r]) => r.text)).not.toContain('milk');
    await client.close();
  });
});
