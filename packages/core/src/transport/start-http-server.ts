import { randomUUID } from 'node:crypto';

import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import express, { json } from 'express';

import { logError, logInfo } from '../observability/logging.js';

import { buildOAuthMetadata, createJwtTokenVerifier } from './oauth.js';

import type { AppConfig } from '../types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Request, Response } from 'express';

export interface StartMcpHttpServerOptions {
  config: AppConfig;
  createMcpServer: () => McpServer;
}

export interface McpHttpServerHandle {
  baseUrl: URL;
  close: () => Promise<void>;
}

export async function startMcpHttpServer(
  options: StartMcpHttpServerOptions,
): Promise<McpHttpServerHandle> {
  const { config, createMcpServer } = options;
  const serverConfig = config.server;
  const httpPath = serverConfig.http?.path ?? '/mcp';
  const host = serverConfig.host ?? '127.0.0.1';
  const port = serverConfig.port ?? 8080;
  const oauth = serverConfig.oauth;

  if (!oauth) {
    throw new Error('server.oauth is required when transport is http');
  }

  const resourceServerUrl = new URL(oauth.resource_url);
  const app = express();

  app.use(
    json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf?.toString() ?? '';
      },
    }),
  );

  app.use(
    cors({
      origin: resourceServerUrl.origin,
      exposedHeaders: ['Mcp-Session-Id'],
    }),
  );

  if (oauth.enabled) {
    const oauthMetadata = await buildOAuthMetadata(oauth);
    const tokenVerifier = createJwtTokenVerifier(oauth);
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);

    app.use(
      mcpAuthMetadataRouter({
        oauthMetadata,
        resourceServerUrl,
        scopesSupported: oauth.scopes_supported,
        resourceName: serverConfig.name,
      }),
    );

    const authMiddleware = requireBearerAuth({
      verifier: tokenVerifier,
      requiredScopes: oauth.scopes_supported,
      resourceMetadataUrl,
    });

    registerMcpRoutes(app, httpPath, createMcpServer, authMiddleware);
  } else {
    registerMcpRoutes(app, httpPath, createMcpServer);
  }

  return await new Promise<McpHttpServerHandle>((resolve, reject) => {
    const listener = app.listen(port, host, () => {
      const address = listener.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      const baseUrl = new URL(httpPath, `http://${host}:${actualPort}`);

      logInfo('transport', `MCP HTTP server listening`, {
        url: baseUrl.href,
        oauth: oauth.enabled,
        server: serverConfig.name,
      });

      resolve({
        baseUrl,
        close: async () => {
          await new Promise<void>((closeResolve, closeReject) => {
            listener.close((err) => {
              if (err) {
                closeReject(err);
                return;
              }
              closeResolve();
            });
          });
        },
      });
    });
    listener.on('error', reject);
  });
}

function registerMcpRoutes(
  app: express.Application,
  httpPath: string,
  createMcpServer: () => McpServer,
  authMiddleware?: express.RequestHandler,
): void {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId) {
      const existing = transports.get(sessionId);
      if (!existing) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }
      transport = existing;
    } else if (isInitializeRequest(req.body)) {
      transport = createTransport(transports);
      const server = createMcpServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logError('transport', 'MCP HTTP request failed', { error: String(err) });
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  };

  const handleSessionRequest = async (req: Request, res: Response): Promise<void> => {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;
    if (!sessionId) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      logError('transport', 'MCP HTTP session request failed', { error: String(err) });
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  };

  if (authMiddleware) {
    app.post(httpPath, authMiddleware, mcpPostHandler);
    app.get(httpPath, authMiddleware, handleSessionRequest);
    app.delete(httpPath, authMiddleware, handleSessionRequest);
  } else {
    app.post(httpPath, mcpPostHandler);
    app.get(httpPath, handleSessionRequest);
    app.delete(httpPath, handleSessionRequest);
  }
}

function createTransport(
  transports: Map<string, StreamableHTTPServerTransport>,
): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
  };

  return transport;
}
