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

import {
  DEFAULT_IDLE_TTL_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_MAX_SESSIONS_PER_PRINCIPAL,
  resolveBindHost,
  resolveBindPort,
  resolveHttpPath,
} from '../config/http-config-validation.js';
import { logError, logInfo } from '../observability/logging.js';

import { sendJsonRpcError, sendSessionError } from './http-errors.js';
import { buildOAuthMetadata, createJwtTokenVerifier, getPrincipalIdFromAuth } from './oauth.js';
import { createSessionManager } from './session-manager.js';

import type { AppConfig } from '../types.js';
import type { SessionManager } from './session-manager.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Request, Response } from 'express';

export interface StartMcpHttpServerOptions {
  config: AppConfig;
  createMcpServer: () => McpServer;
  /** Test-only: bypass JWT verification with a fixed principal per bearer token. */
  testTokenVerifier?: OAuthTokenVerifier;
}

export interface McpHttpServerHandle {
  /** Canonical public URL from config (OAuth resource URL, client-facing). */
  baseUrl: URL;
  /** Actual local bind URL (host/port the listener is bound to). */
  bindUrl: URL;
  close: () => Promise<void>;
}

interface McpRoutesContext {
  sessionManager: SessionManager;
  oauthEnabled: boolean;
}

export async function startMcpHttpServer(
  options: StartMcpHttpServerOptions,
): Promise<McpHttpServerHandle> {
  const { config, createMcpServer } = options;
  const serverConfig = config.server;
  const httpPath = resolveHttpPath(serverConfig);
  const host = resolveBindHost(serverConfig);
  const port = resolveBindPort(serverConfig);
  const oauth = serverConfig.oauth;
  const publicUrl = serverConfig.public_url;

  if (!oauth) {
    throw new Error('server.oauth is required when transport is http');
  }
  if (!publicUrl) {
    throw new Error('server.public_url is required when transport is http');
  }

  const resourceServerUrl = new URL(publicUrl);
  const maxBodyBytes = serverConfig.http?.max_body_bytes ?? DEFAULT_MAX_BODY_BYTES;
  const sessionOptions = {
    maxSessions: serverConfig.http?.sessions?.max_sessions ?? DEFAULT_MAX_SESSIONS,
    idleTtlMs: serverConfig.http?.sessions?.idle_ttl_ms ?? DEFAULT_IDLE_TTL_MS,
    maxSessionsPerPrincipal:
      serverConfig.http?.sessions?.max_sessions_per_principal ?? DEFAULT_MAX_SESSIONS_PER_PRINCIPAL,
  };

  const app = express();
  let routesContext: McpRoutesContext | undefined;

  app.use(
    json({
      limit: maxBodyBytes,
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf?.toString() ?? '';
      },
    }),
  );

  const allowedOrigins = serverConfig.http?.cors?.allowed_origins ?? [];
  if (allowedOrigins.length > 0) {
    app.use(
      cors({
        origin: allowedOrigins,
        credentials: false,
        exposedHeaders: ['Mcp-Session-Id'],
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      }),
    );
  }

  if (oauth.enabled) {
    const oauthMetadata = await buildOAuthMetadata(oauth);
    const tokenVerifier = options.testTokenVerifier ?? createJwtTokenVerifier(oauth);
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

    routesContext = registerMcpRoutes(app, httpPath, createMcpServer, {
      authMiddleware,
      oauthEnabled: true,
      sessionOptions,
    });
  } else {
    routesContext = registerMcpRoutes(app, httpPath, createMcpServer, {
      oauthEnabled: false,
      sessionOptions,
    });
  }

  return await new Promise<McpHttpServerHandle>((resolve, reject) => {
    const listener = app.listen(port, host, () => {
      const address = listener.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      const baseUrl = new URL(publicUrl);
      const bindUrl = new URL(
        httpPath,
        `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`,
      );

      logInfo('transport', 'MCP HTTP server listening', {
        url: baseUrl.href,
        bind: bindUrl.href,
        oauth: oauth.enabled,
        server: serverConfig.name,
      });

      resolve({
        baseUrl,
        bindUrl,
        close: async () => {
          const errors: unknown[] = [];

          if (routesContext) {
            routesContext.sessionManager.stopSweeper();
            try {
              await routesContext.sessionManager.closeAll();
            } catch (err) {
              errors.push(err);
            }
          }

          await new Promise<void>((closeResolve, closeReject) => {
            listener.close((err) => {
              if (err) {
                closeReject(err);
                return;
              }
              closeResolve();
            });
          }).catch((err) => {
            errors.push(err);
          });

          if (errors.length > 0) {
            throw new AggregateError(errors, 'Failed to shut down MCP HTTP server cleanly');
          }
        },
      });
    });
    listener.on('error', reject);
  });
}

interface RegisterMcpRoutesOptions {
  authMiddleware?: express.RequestHandler;
  oauthEnabled: boolean;
  sessionOptions: {
    maxSessions: number;
    idleTtlMs: number;
    maxSessionsPerPrincipal: number;
  };
}

function parseSessionId(req: Request): string | undefined {
  const sessionIdHeader = req.headers['mcp-session-id'];
  return typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;
}

function resolveRequestPrincipalId(req: Request, oauthEnabled: boolean): string | undefined {
  if (!oauthEnabled) {
    return undefined;
  }
  return getPrincipalIdFromAuth((req as Request & { auth?: AuthInfo }).auth);
}

function isPrincipalMismatch(
  record: { principalId?: string },
  principalId: string | undefined,
  oauthEnabled: boolean,
): boolean {
  return Boolean(oauthEnabled && record.principalId && principalId !== record.principalId);
}

async function forwardTransportRequest(
  label: string,
  transport: StreamableHTTPServerTransport,
  req: Request,
  res: Response,
  body?: unknown,
): Promise<void> {
  try {
    if (body === undefined) {
      await transport.handleRequest(req, res);
    } else {
      await transport.handleRequest(req, res, body);
    }
  } catch (err) {
    logError('transport', label, { error: String(err) });
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
}

function registerMcpRoutes(
  app: express.Application,
  httpPath: string,
  createMcpServer: () => McpServer,
  options: RegisterMcpRoutesOptions,
): McpRoutesContext {
  const sessionManager = createSessionManager(options.sessionOptions);
  sessionManager.startSweeper();

  const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
    const sessionId = parseSessionId(req);
    const principalId = resolveRequestPrincipalId(req, options.oauthEnabled);

    if (sessionId) {
      const record = sessionManager.get(sessionId);
      if (!record) {
        sendJsonRpcError(res, 404, 'Session not found or expired');
        return;
      }
      if (isPrincipalMismatch(record, principalId, options.oauthEnabled)) {
        sendJsonRpcError(res, 403, 'Forbidden: session principal mismatch');
        return;
      }
      sessionManager.touch(sessionId);
      await forwardTransportRequest(
        'MCP HTTP request failed',
        record.transport,
        req,
        res,
        req.body,
      );
      return;
    }

    if (!isInitializeRequest(req.body)) {
      sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
      return;
    }

    const acceptResult = sessionManager.canAcceptSession(principalId);
    if (!acceptResult.ok) {
      logInfo('transport', 'session_rejected', {
        reason: acceptResult.reason,
        principal_id: principalId,
        sessions_active: sessionManager.activeCount(),
      });
      sendJsonRpcError(
        res,
        503,
        acceptResult.reason === 'principal_limit'
          ? 'Service Unavailable: per-principal session limit exceeded'
          : 'Service Unavailable: session limit exceeded',
      );
      return;
    }

    const server = createMcpServer();
    const transport = createTransport(sessionManager, server, principalId);
    await server.connect(transport);
    await forwardTransportRequest('MCP HTTP initialize failed', transport, req, res, req.body);
  };

  const handleSessionRequest = async (req: Request, res: Response): Promise<void> => {
    const sessionId = parseSessionId(req);
    if (!sessionId) {
      sendSessionError(res, 400, 'Invalid or missing session ID');
      return;
    }

    const record = sessionManager.get(sessionId);
    if (!record) {
      sendSessionError(res, 404, 'Session not found or expired');
      return;
    }

    const principalId = resolveRequestPrincipalId(req, options.oauthEnabled);
    if (isPrincipalMismatch(record, principalId, options.oauthEnabled)) {
      sendSessionError(res, 403, 'Forbidden: session principal mismatch');
      return;
    }

    sessionManager.touch(sessionId);
    await forwardTransportRequest('MCP HTTP session request failed', record.transport, req, res);
  };

  if (options.authMiddleware) {
    app.post(httpPath, options.authMiddleware, mcpPostHandler);
    app.get(httpPath, options.authMiddleware, handleSessionRequest);
    app.delete(httpPath, options.authMiddleware, handleSessionRequest);
  } else {
    app.post(httpPath, mcpPostHandler);
    app.get(httpPath, handleSessionRequest);
    app.delete(httpPath, handleSessionRequest);
  }

  return { sessionManager, oauthEnabled: options.oauthEnabled };
}

function createTransport(
  sessionManager: SessionManager,
  server: McpServer,
  principalId: string | undefined,
): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      sessionManager.register(newSessionId, {
        transport,
        server,
        principalId,
      });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      void sessionManager.remove(transport.sessionId);
    }
  };

  return transport;
}
