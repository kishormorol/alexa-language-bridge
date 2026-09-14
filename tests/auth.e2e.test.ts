import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/http.js';
import { HouseholdStore } from '../src/state/store.js';
import { EchoLanguageProvider } from '../src/lang/provider.js';
import { HouseholdOAuthProvider } from '../src/auth/provider.js';

let http: Server;
let origin: string;
let resourceUri: string;
let dir: string;

const REDIRECT = 'http://localhost:9999/callback';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alb-auth-'));
  // Bind first so the canonical resource URI matches the port we actually serve on.
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((r) => probe.close(() => r()));

  origin = `http://127.0.0.1:${port}`;
  resourceUri = `${origin}/mcp`;

  const app = createApp({
    store: new HouseholdStore(join(dir, 'state.json')),
    language: new EchoLanguageProvider(),
    auth: { provider: new HouseholdOAuthProvider(resourceUri), publicUrl: origin },
  });
  http = createServer(app);
  await new Promise<void>((r) => http.listen(port, '127.0.0.1', r));
});

afterAll(async () => {
  await new Promise<void>((r) => http.close(() => r()));
  await rm(dir, { recursive: true, force: true });
});

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

async function registerClient(): Promise<string> {
  const res = await fetch(`${origin}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'test-host',
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

async function getCode(clientId: string, challenge: string, resource = resourceUri) {
  const url = new URL(`${origin}/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', REDIRECT);
  url.searchParams.set('resource', resource);
  url.searchParams.set('state', 'xyz');

  const res = await fetch(url, { redirect: 'manual' });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location') ?? '');
  expect(location.searchParams.get('state')).toBe('xyz');
  return location.searchParams.get('code') ?? '';
}

async function exchange(body: Record<string, string>) {
  return fetch(`${origin}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
}

function initializeBody() {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  });
}

describe('OAuth 2.1', () => {
  it('refuses an unauthenticated MCP request with 401 and points at the metadata', async () => {
    const res = await fetch(resourceUri, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: initializeBody(),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate') ?? '').toContain('resource_metadata');
  });

  it('publishes authorization server metadata advertising S256', async () => {
    const res = await fetch(`${origin}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as {
      code_challenge_methods_supported?: string[];
      authorization_endpoint: string;
      token_endpoint: string;
    };
    expect(meta.code_challenge_methods_supported).toContain('S256');
    expect(meta.authorization_endpoint).toBeTruthy();
    expect(meta.token_endpoint).toBeTruthy();
  });

  it('publishes protected resource metadata for this server', async () => {
    const res = await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { resource: string; authorization_servers?: string[] };
    expect(meta.resource.replace(/\/$/, '')).toBe(resourceUri);
  });

  it('completes the full authorization code + PKCE + resource flow', async () => {
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();
    const code = await getCode(clientId, challenge);

    const res = await exchange({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: resourceUri,
    });
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as { access_token: string; token_type: string };
    expect(tokens.token_type).toBe('Bearer');

    const mcp = await fetch(resourceUri, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${tokens.access_token}`,
      },
      body: initializeBody(),
    });
    expect(mcp.status).toBe(200);
    expect(await mcp.text()).toContain('2025-11-25');
  });

  it('rejects a token exchange with the wrong code_verifier', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();
    const code = await getCode(clientId, challenge);

    const res = await exchange({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: randomBytes(32).toString('base64url'),
      resource: resourceUri,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects an authorization request for a resource this server does not serve', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();
    const url = new URL(`${origin}/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('redirect_uri', REDIRECT);
    url.searchParams.set('resource', 'https://someone-elses-server.example/mcp');

    const res = await fetch(url, { redirect: 'manual' });
    const location = res.headers.get('location') ?? '';
    // Either refused outright, or redirected back with an error rather than a code.
    expect(res.status === 302 ? location.includes('error') : res.status >= 400).toBe(true);
  });

  it('burns the authorization code after one use', async () => {
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();
    const code = await getCode(clientId, challenge);
    const body = {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: resourceUri,
    };

    expect((await exchange(body)).status).toBe(200);
    expect((await exchange(body)).status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a made-up bearer token', async () => {
    const res = await fetch(resourceUri, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer not-a-real-token',
      },
      body: initializeBody(),
    });
    expect(res.status).toBe(401);
  });
});
