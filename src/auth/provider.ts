import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { InMemoryClientsStore } from './clients.js';

const AUTH_CODE_TTL_MS = 60_000;
const ACCESS_TOKEN_TTL_S = 3600;

interface PendingCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  /** RFC 8707 resource indicator. Binds the eventual token to this server. */
  resource: string | undefined;
  expiresAt: number;
}

interface IssuedToken {
  clientId: string;
  scopes: string[];
  resource: string | undefined;
  expiresAt: number;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

/** Compare resource indicators the way RFC 8707 requires: exact, minus a trailing slash. */
function sameResource(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const norm = (s: string) => s.replace(/\/+$/, '');
  return norm(a) === norm(b);
}

/**
 * OAuth 2.1 authorization server for this MCP resource.
 *
 * Spec-correct on the parts that gate acceptance — PKCE S256, resource indicators,
 * audience-bound tokens, single-use authorization codes — and deliberately simple
 * on the parts that are product decisions: there is no login page, and `authorize`
 * approves immediately. A real deployment replaces `authorize` with a consent
 * screen and nothing else changes.
 */
export class HouseholdOAuthProvider implements OAuthServerProvider {
  readonly #clients = new InMemoryClientsStore();
  readonly #codes = new Map<string, PendingCode>();
  readonly #tokens = new Map<string, IssuedToken>();
  readonly #refresh = new Map<string, IssuedToken>();
  readonly #canonicalResource: string;

  constructor(canonicalResource: string) {
    this.#canonicalResource = canonicalResource;
  }

  get clientsStore(): InMemoryClientsStore {
    return this.#clients;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const requested = params.resource?.href;
    if (requested !== undefined && !sameResource(requested, this.#canonicalResource)) {
      throw new InvalidTargetError(
        `This server only issues tokens for ${this.#canonicalResource}`,
      );
    }

    const code = token();
    this.#codes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      resource: requested,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state !== undefined) redirect.searchParams.set('state', params.state);
    res.redirect(redirect.href);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const pending = this.#take(client, authorizationCode, false);
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const pending = this.#take(client, authorizationCode, true);

    if (redirectUri !== undefined && redirectUri !== pending.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    }
    if (!sameResource(resource?.href, pending.resource)) {
      throw new InvalidTargetError('resource does not match the authorization request');
    }

    // The SDK verifies PKCE before calling us unless skipLocalPkceValidation is set.
    // Re-check anyway: a token must never be issued without proof of possession.
    if (codeVerifier !== undefined) {
      const digest = createHash('sha256').update(codeVerifier).digest('base64url');
      if (digest !== pending.codeChallenge) {
        throw new InvalidGrantError('code_verifier does not match code_challenge');
      }
    }

    return this.#issue(pending);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const held = this.#refresh.get(refreshToken);
    if (!held || held.clientId !== client.client_id) {
      throw new InvalidGrantError('Unknown refresh token');
    }
    if (!sameResource(resource?.href, held.resource)) {
      throw new InvalidTargetError('resource does not match the original grant');
    }
    const narrowed = scopes?.filter((s) => held.scopes.includes(s)) ?? held.scopes;
    if (scopes?.some((s) => !held.scopes.includes(s))) {
      throw new InvalidRequestError('Cannot widen scope on refresh');
    }

    this.#refresh.delete(refreshToken);
    return this.#issue({ ...held, scopes: narrowed });
  }

  async verifyAccessToken(accessToken: string): Promise<AuthInfo> {
    // Must be InvalidTokenError, not InvalidGrantError: RFC 6750 requires a bad
    // bearer token to come back as 401 with a WWW-Authenticate challenge, so the
    // client knows to re-authenticate. invalid_grant maps to 400, which reads as
    // "your request was malformed" and leaves the client with nowhere to go.
    const held = this.#tokens.get(accessToken);
    if (!held) throw new InvalidTokenError('Unknown access token');
    if (held.expiresAt < Date.now()) {
      this.#tokens.delete(accessToken);
      throw new InvalidTokenError('Access token expired');
    }
    return {
      token: accessToken,
      clientId: held.clientId,
      scopes: held.scopes,
      expiresAt: Math.floor(held.expiresAt / 1000),
      ...(held.resource === undefined ? {} : { resource: new URL(held.resource) }),
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    for (const store of [this.#tokens, this.#refresh]) {
      const held = store.get(request.token);
      if (held && held.clientId === client.client_id) store.delete(request.token);
    }
  }

  #take(client: OAuthClientInformationFull, code: string, consume: boolean): PendingCode {
    const pending = this.#codes.get(code);
    if (!pending || pending.clientId !== client.client_id) {
      throw new InvalidGrantError('Unknown authorization code');
    }
    if (pending.expiresAt < Date.now()) {
      this.#codes.delete(code);
      throw new InvalidGrantError('Authorization code expired');
    }
    // Single use: the code dies the moment it is exchanged.
    if (consume) this.#codes.delete(code);
    return pending;
  }

  #issue(grant: Omit<IssuedToken, 'expiresAt'>): OAuthTokens {
    const accessToken = token();
    const refreshToken = token();
    const record: IssuedToken = {
      ...grant,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_S * 1000,
    };
    this.#tokens.set(accessToken, record);
    this.#refresh.set(refreshToken, record);
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      refresh_token: refreshToken,
      scope: grant.scopes.join(' '),
    };
  }
}
