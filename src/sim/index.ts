import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../http.js';
import { HouseholdStore } from '../state/store.js';
import { createLanguageProvider } from '../lang/index.js';
import { HouseholdOAuthProvider } from '../auth/provider.js';
import { createRouter } from './router.js';
import { SimulatedHost } from './host.js';
import { SIM_UI } from './ui.js';
import { prewarm } from '../lang/prewarm.js';

const SIM_PORT = Number.parseInt(process.env['SIM_PORT'] ?? '4000', 10);
const HOUSEHOLD = process.env['SIM_HOUSEHOLD'] ?? 'demo';

/**
 * One command that stands the whole thing up: the MCP server with OAuth enforced,
 * a host that authenticates against it properly, and a screen to watch it happen.
 * The hackathon rules allow a simulated Alexa+ experience, and the real toolkit is
 * gated behind Amazon onboarding we do not have — see FL-003.
 */
const store = new HouseholdStore(process.env['STATE_PATH'] ?? '.state/sim.json');
const language = createLanguageProvider();

// Bind an ephemeral port first so the canonical resource URI matches what we serve.
const probe = createServer();
await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
const mcpPort = (probe.address() as AddressInfo).port;
await new Promise<void>((r) => probe.close(() => r()));

const origin = `http://127.0.0.1:${mcpPort}`;
const mcp = createServer(
  createApp({
    store,
    language,
    auth: { provider: new HouseholdOAuthProvider(`${origin}/mcp`), publicUrl: origin },
  }),
);
await new Promise<void>((r) => mcp.listen(mcpPort, '127.0.0.1', r));

const host = new SimulatedHost(origin, createRouter(process.env['ROUTER'] ?? 'rules'));
await host.connect();

// Seed a household so the demo opens on something rather than nothing.
const seed: [string, string, 'native' | 'latin'][] = [
  // Ma speaks Bangla but types it in Latin letters, as most of the diaspora does.
  ['Ma', 'bn-BD', 'latin'],
  ['Rafi', 'en-US', 'native'],
];
for (const [name, language, script] of seed) {
  await host.call('register_household_member', {
    householdId: HOUSEHOLD,
    name,
    language,
    script,
  });
}
await host.call('register_device', {
  householdId: HOUSEHOLD,
  member: 'Rafi',
  label: 'lamp',
  room: 'kitchen',
});

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('html').send(SIM_UI);
});

app.get('/api/members', async (_req, res) => {
  const house = await store.household(HOUSEHOLD);
  res.json(house.members.map((m) => ({ name: m.name, language: m.language })));
});

app.post('/api/say', async (req, res) => {
  const { speaker, utterance } = req.body as { speaker?: string; utterance?: string };
  if (!speaker || !utterance) {
    res.status(400).json({ error: 'speaker and utterance are required' });
    return;
  }
  try {
    res.json(await host.say(utterance, speaker, HOUSEHOLD));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Pay the first-utterance cost before anyone speaks. Cold translation is ~635 ms
// against a 500 ms budget; a hit is ~1 ms. Opt-in, because it costs one model call
// per phrase per direction at startup.
if ((process.env['PREWARM'] ?? 'false') !== 'false') {
  const house = await store.household(HOUSEHOLD);
  const [a, b] = house.members;
  if (a && b) {
    const started = performance.now();
    // Deliberately not awaited: the server should answer immediately and warm up
    // behind the scenes. Anything asked before warming finishes simply pays the
    // cold cost once.
    void (async () => {
      const forward = await prewarm(language, a, b);
      const back = await prewarm(language, b, a);
      console.log(
        `[simulator] pre-warmed ${forward.warmed + back.warmed} phrases ` +
          `(${forward.failed + back.failed} failed) in ${(performance.now() - started).toFixed(0)}ms`,
      );
      for (const message of new Set([...forward.errors, ...back.errors])) {
        console.warn(`[simulator] pre-warm error: ${message}`);
      }
    })();
  }
}

app.listen(SIM_PORT, () => {
  console.log(`[simulator] open http://localhost:${SIM_PORT}`);
  console.log(`[simulator] MCP server on ${origin}/mcp (OAuth 2.1 enforced)`);
  console.log(`[simulator] household "${HOUSEHOLD}" · router ${process.env['ROUTER'] ?? 'rules'}`);
});
