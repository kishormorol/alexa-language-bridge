import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { authorize, type Session } from './oauth-client.js';
import type { Router } from './router.js';

export interface Turn {
  speech: string;
  isError: boolean;
  tool: string | null;
  structuredContent: unknown | null;
  /** HTML of the MCP App the tool declared, if any. */
  cardHtml: string | null;
}

/**
 * Stands in for Alexa+: authenticates as an MCP host, routes an utterance to a tool,
 * calls it, and fetches the declared `ui://` resource so the screen can render it.
 */
export class SimulatedHost {
  #client: Client | null = null;
  #session: Session | null = null;
  #cards = new Map<string, string>();
  #toolCards = new Map<string, string>();

  constructor(
    private readonly origin: string,
    private readonly router: Router,
  ) {}

  async connect(): Promise<void> {
    const resource = new URL('/mcp', this.origin).href;
    this.#session = await authorize(this.origin, resource);

    const client = new Client({ name: 'alexa-plus-simulator', version: '0.1.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(resource), {
        requestInit: { headers: { authorization: `Bearer ${this.#session.accessToken}` } },
      }),
    );
    this.#client = client;

    // Remember which tools declare a UI, so a turn knows whether to show a card.
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const meta = tool._meta as { ui?: { resourceUri?: string } } | undefined;
      const uri = meta?.ui?.resourceUri;
      if (uri) this.#toolCards.set(tool.name, uri);
    }
  }

  get tools(): string[] {
    return [...this.#toolCards.keys()];
  }

  async call(tool: string, args: Record<string, unknown>): Promise<Turn> {
    const client = this.#require();
    const result = await client.callTool({ name: tool, arguments: args });
    const speech = (result.content as { type: string; text?: string }[] | undefined)
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n') ?? '';

    const uri = this.#toolCards.get(tool);
    return {
      speech,
      isError: result.isError === true,
      tool,
      structuredContent: result.structuredContent ?? null,
      cardHtml: uri && !result.isError ? await this.#card(uri) : null,
    };
  }

  async say(utterance: string, speaker: string, householdId: string): Promise<Turn> {
    const intent = await this.router.route(utterance, speaker, householdId);
    if (!intent) {
      return {
        speech: `I'm not sure what to do with that yet. Try "add rice to the list", "what's on the list", "turn off the lamp", or "tell Rafi that dinner is ready".`,
        isError: false,
        tool: null,
        structuredContent: null,
        cardHtml: null,
      };
    }
    return this.call(intent.tool, intent.arguments);
  }

  async #card(uri: string): Promise<string | null> {
    const cached = this.#cards.get(uri);
    if (cached) return cached;
    const result = await this.#require().readResource({ uri });
    const html = (result.contents[0] as { text?: string } | undefined)?.text ?? null;
    if (html) this.#cards.set(uri, html);
    return html;
  }

  #require(): Client {
    if (!this.#client) throw new Error('Host is not connected');
    return this.#client;
  }

  async close(): Promise<void> {
    await this.#client?.close();
    this.#client = null;
  }
}
