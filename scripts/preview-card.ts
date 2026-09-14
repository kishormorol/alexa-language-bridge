/**
 * Renders the MCP Apps card to a standalone HTML file with sample data, so the
 * design can be iterated on in a browser without a host. Writes to the path given
 * as the first argument, or ./card-preview.html.
 *
 *   npm run preview:card
 */
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/http.js';
import { HouseholdStore } from '../src/state/store.js';
import { EchoLanguageProvider } from '../src/lang/provider.js';
import { HOUSEHOLD_CARD_URI } from '../src/apps/household-card.js';

const SAMPLES = [
  {
    kind: 'exchange',
    title: 'In the room',
    spoken: { name: 'Ma', language: 'bn-BD', languageName: 'Bangla', text: 'ভাত খেয়েছ?' },
    heard: { name: 'Rafi', language: 'en-US', languageName: 'English', text: 'Have you eaten?' },
  },
  {
    kind: 'list',
    title: 'shopping list',
    reader: { name: 'Rafi', language: 'en-US', languageName: 'English' },
    items: [
      { text: 'rice', done: false },
      { text: 'lentils', done: false },
      { text: 'milk', done: true },
    ],
  },
];

const out = process.argv[2] ?? 'card-preview.html';

const app = createApp({
  store: new HouseholdStore('.state/preview.json'),
  language: new EchoLanguageProvider(),
});
const http = createServer(app);
await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
const { port } = http.address() as AddressInfo;

const client = new Client({ name: 'preview', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));

const resource = await client.readResource({ uri: HOUSEHOLD_CARD_URI });
const html = (resource.contents[0] as { text: string }).text;

// One page, every sample stacked, each in its own iframe so they stay isolated
// exactly as a host would render them.
const frames = SAMPLES.map((sample) => {
  const doc = html.replace(
    '</script>',
    `\nglobalThis.mcpAppData = ${JSON.stringify(sample)};\nrender(globalThis.mcpAppData);\n</script>`,
  );
  return `<iframe sandbox="allow-scripts" srcdoc="${doc.replace(/"/g, '&quot;')}"></iframe>`;
}).join('\n');

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>Card preview</title>
<style>
  body { margin:0; padding:24px; background:#e8e6e1; font:14px system-ui; }
  @media (prefers-color-scheme: dark) { body { background:#0e0d10; } }
  iframe { display:block; width:100%; max-width:680px; height:260px; margin:0 auto 24px; border:0; border-radius:14px; box-shadow:0 2px 12px rgba(0,0,0,.12); }
</style>
${frames}`,
);

await client.close();
http.close();
console.log(`wrote ${out}`);
