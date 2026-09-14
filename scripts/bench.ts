/**
 * Measures tool round-trip latency against the 500 ms budget Alexa+ requires.
 *
 *   npm run bench                              # echo provider: measures our own overhead
 *   LANGUAGE_PROVIDER=bedrock npm run bench    # the real number
 *
 * Reports cold and warm separately, because the cache is the whole latency strategy
 * and an average across both hides which half is failing.
 */
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/http.js';
import { HouseholdStore } from '../src/state/store.js';
import { createLanguageProvider } from '../src/lang/index.js';

const BUDGET_MS = 500;
const HID = 'bench';

const PHRASES = [
  'chal',
  'dal',
  'peyaj',
  'tel',
  'lobon',
  'chini',
  'dim',
  'mach',
  'morich',
  'adrak',
];

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    n: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1),
  };
}

function row(label: string, s: ReturnType<typeof stats>) {
  const verdict = s.p95 <= BUDGET_MS ? 'PASS' : 'OVER BUDGET';
  const fmt = (n: number) => `${n.toFixed(0)}ms`.padStart(8);
  return `${label.padEnd(22)} n=${String(s.n).padStart(3)}  p50=${fmt(s.p50)}  p95=${fmt(s.p95)}  max=${fmt(s.max)}   ${verdict}`;
}

const dir = await mkdtemp(join(tmpdir(), 'alb-bench-'));
const language = createLanguageProvider();
const app = createApp({
  store: new HouseholdStore(join(dir, 'state.json')),
  language,
});
const http = createServer(app);
await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
const { port } = http.address() as AddressInfo;

const client = new Client({ name: 'bench', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));

await client.callTool({
  name: 'register_household_member',
  arguments: { householdId: HID, name: 'Ma', language: 'bn-BD' },
});
await client.callTool({
  name: 'register_household_member',
  arguments: { householdId: HID, name: 'Rafi', language: 'en-US' },
});

async function timed(name: string, args: Record<string, unknown>): Promise<number> {
  const start = performance.now();
  const result = await client.callTool({ name, arguments: args });
  const elapsed = performance.now() - start;
  if (result.isError) {
    const text = (result.content as { text?: string }[])[0]?.text ?? 'unknown';
    throw new Error(`${name} failed: ${text}`);
  }
  return elapsed;
}

console.log(`\nlanguage provider: ${language.name}`);
console.log(`budget: ${BUDGET_MS}ms round trip\n`);

// Cold: each phrase crosses languages for the first time.
const cold: number[] = [];
for (const phrase of PHRASES) {
  cold.push(
    await timed('interpret_for_household', {
      householdId: HID,
      speaker: 'Ma',
      listener: 'Rafi',
      utterance: phrase,
    }),
  );
}

// Warm: the same phrases again, which is what a real household actually does.
const warm: number[] = [];
for (let pass = 0; pass < 3; pass += 1) {
  for (const phrase of PHRASES) {
    warm.push(
      await timed('interpret_for_household', {
        householdId: HID,
        speaker: 'Ma',
        listener: 'Rafi',
        utterance: phrase,
      }),
    );
  }
}

// A tool that touches state but never the model, to separate our overhead from the model's.
const local: number[] = [];
for (let i = 0; i < 20; i += 1) {
  local.push(await timed('list_household_members', { householdId: HID }));
}

console.log(row('cold (model call)', stats(cold)));
console.log(row('warm (cache hit)', stats(warm)));
console.log(row('local (no model)', stats(local)));

const warmStats = stats(warm);
const coldStats = stats(cold);
console.log(
  `\ncache saves ${(coldStats.p50 - warmStats.p50).toFixed(0)}ms at p50 ` +
    `(${coldStats.p50 > 0 ? (((coldStats.p50 - warmStats.p50) / coldStats.p50) * 100).toFixed(0) : '0'}%)`,
);

await client.close();
http.close();
await rm(dir, { recursive: true, force: true });

if (coldStats.p95 > BUDGET_MS) {
  console.log(
    `\nCold p95 is over budget. Options, in order: a faster model ` +
      `(BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5), pre-warming the cache with the ` +
      `household's common phrases, or moving the server closer to the Bedrock region.`,
  );
  process.exitCode = 1;
}
