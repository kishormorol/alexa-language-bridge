import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import type { ToolDeps } from './tools/index.js';

const MCP_PATH = '/mcp';

/**
 * Streamable HTTP, per MCP spec 2025-11-25. One transport and one server instance
 * per session; the session id travels in the `mcp-session-id` header.
 */
export function createApp(deps: ToolDeps) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, sessions: transports.size });
  });

  app.post(MCP_PATH, async (req: Request, res: Response) => {
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
  app.get(MCP_PATH, bySession);
  app.delete(MCP_PATH, bySession);

  return app;
}
