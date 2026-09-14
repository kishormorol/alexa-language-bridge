import { randomUUID } from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * In-memory client registry with dynamic registration (RFC 7591), which is how an
 * MCP host that has never seen this server before obtains credentials.
 *
 * In-memory is a deliberate demo choice: clients re-register on restart. Swapping
 * in a durable store is a change behind this interface only.
 */
export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  #clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.#clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): OAuthClientInformationFull {
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.#clients.set(registered.client_id, registered);
    return registered;
  }

  /** Test seam. */
  get size(): number {
    return this.#clients.size;
  }
}
