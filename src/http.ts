import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createServer } from './server.js';
import type { ToolDeps } from './tools/index.js';
import type { HouseholdOAuthProvider } from './auth/provider.js';

const MCP_PATH = '/mcp';

export interface AppOptions extends ToolDeps {
  /**
   * When present, OAuth 2.1 is enforced: /mcp requires a bearer token and the
   * authorization-server and protected-resource metadata documents are served.
   */
  auth?: { provider: HouseholdOAuthProvider; publicUrl: string };
}

/**
 * Streamable HTTP, per MCP spec 2025-11-25. One transport and one server instance
 * per session; the session id travels in the `mcp-session-id` header.
 */
export function createApp(options: AppOptions) {
  const { auth, ...deps } = options;
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, sessions: transports.size, auth: auth !== undefined });
  });

  const guard: express.RequestHandler[] = [];
  if (auth) {
    const url = new URL(auth.publicUrl);
    app.use(
      mcpAuthRouter({
        provider: auth.provider,
        issuerUrl: url,
        baseUrl: url,
        resourceServerUrl: new URL(MCP_PATH, url),
        resourceName: 'Alexa Language Bridge',
        scopesSupported: ['household'],
      }),
    );
    guard.push(
      requireBearerAuth({
        verifier: auth.provider,
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(MCP_PATH, url)),
      }),
    );
  }

  app.post(MCP_PATH, ...guard, async (req: Request, res: Response) => {
    const sessionId = req.header('mcp-session-id');
    const existing = sessionId ? transports.get(sessionId) : undefined;

    if (existing) {
      await existing.handleRequest(req, res, req.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        transports.set(id, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    const server = createServer(deps);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const bySession = async (req: Request, res: Response) => {
    const sessionId = req.header('mcp-session-id');
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unknown or missing mcp-session-id' },
        id: null,
      });
      return;
    }
    await transport.handleRequest(req, res);
  };

  // SSE stream for server-initiated messages, and session teardown.
  app.get(MCP_PATH, ...guard, bySession);
  app.delete(MCP_PATH, ...guard, bySession);

  return app;
}
