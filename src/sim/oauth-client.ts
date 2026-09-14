import { createHash, randomBytes } from 'node:crypto';

/**
 * Completes the OAuth 2.1 authorization code + PKCE flow against our own server,
 * headlessly. The simulated host is a real client: it registers dynamically, proves
 * possession with a code verifier, and passes the resource indicator — the same path
 * a production MCP host walks, minus a human clicking approve.
 */
export interface Session {
  accessToken: string;
  expiresAt: number;
}

const REDIRECT_URI = 'http://localhost:0/callback';

export async function authorize(origin: string, resource: string): Promise<Session> {
  const register = await fetch(new URL('/register', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Alexa+ simulator',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  if (!register.ok) {
    throw new Error(`Client registration failed: ${register.status} ${await register.text()}`);
  }
  const { client_id: clientId } = (await register.json()) as { client_id: string };

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const authorizeUrl = new URL('/authorize', origin);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('resource', resource);

  const redirected = await fetch(authorizeUrl, { redirect: 'manual' });
  const location = redirected.headers.get('location');
  if (!location) {
    throw new Error(`Authorization did not redirect: ${redirected.status}`);
  }
  const code = new URL(location).searchParams.get('code');
  if (!code) throw new Error(`Authorization returned no code: ${location}`);

  const token = await fetch(new URL('/token', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource,
    }),
  });
  if (!token.ok) {
    throw new Error(`Token exchange failed: ${token.status} ${await token.text()}`);
  }
  const tokens = (await token.json()) as { access_token: string; expires_in?: number };

  return {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
}
