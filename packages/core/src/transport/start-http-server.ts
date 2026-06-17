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

import { runWithAuthRequestContextAsync } from '../auth/request-context.js';
import {
  configUsesUserToken,
  resolveGoogleAccessTokenHeaderName,
  resolveUserTokenConfig,
} from '../auth/user-token-config.js';
import {
  DEFAULT_IDLE_TTL_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_MAX_SESSIONS_PER_PRINCIPAL,
  resolveBindHost,
  resolveBindPort,
  resolveHttpPath,
} from '../config/http-config-validation.js';
import { logFingerprint } from '../observability/fingerprints.js';
import { logError, logInfo } from '../observability/logging.js';

import { sendJsonRpcError, sendSessionError } from './http-errors.js';
import { createIngressClientAllowlistMiddleware } from './ingress-policy.js';
import {
  buildOAuthMetadata,
  createJwtTokenVerifier,
  getPrincipalIdFromAuth,
  resolveIntrospectionUrl,
} from './oauth.js';
import { createOriginValidationMiddleware } from './origin-validation.js';
import { createSessionManager } from './session-manager.js';
import {
  type UserTokenIngressContext,
  type ValidatedGoogleRequest,
  validateGoogleTokenForRequest,
} from './user-token-middleware.js';

import type { GooglePrincipalIdentity } from '../auth/google-identity.js';
import type { TokenIntrospector } from '../auth/oauth-introspection.js';
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
  /** Test-only: bypass Google token introspection with a fixed identity per token. */
  testTokenIntrospector?: TokenIntrospector;
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

function createMcpHttpShutdown(
  listener: ReturnType<express.Application['listen']>,
  routesContext: McpRoutesContext | undefined,
): () => Promise<void> {
  return async () => {
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
  };
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

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

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

  const usesUserToken = configUsesUserToken(config);
  const googleAccessTokenHeader = resolveGoogleAccessTokenHeaderName(config);
  const userTokenIngress = await resolveUserTokenIngressContext(
    options,
    config,
    oauth,
    usesUserToken,
    googleAccessTokenHeader,
  );

  const mcpRouteOptions = {
    usesUserToken,
    googleAccessTokenHeader,
    sessionOptions,
    userTokenIngress,
  };

  if (oauth.enabled) {
    routesContext = await registerOAuthMcpRoutes({
      app,
      httpPath,
      createMcpServer,
      oauth,
      resourceServerUrl,
      allowedOrigins,
      usesUserToken,
      userTokenIngress,
      mcpRouteOptions,
      resourceName: serverConfig.name,
      testTokenVerifier: options.testTokenVerifier,
    });
  } else {
    routesContext = registerMcpRoutes(app, httpPath, createMcpServer, {
      oauthEnabled: false,
      publicUrl: resourceServerUrl,
      allowedOrigins,
      ...mcpRouteOptions,
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
        close: createMcpHttpShutdown(listener, routesContext),
      });
    });
    listener.on('error', reject);
  });
}

interface RegisterMcpRoutesOptions {
  routeMiddleware?: express.RequestHandler[];
  oauthEnabled: boolean;
  publicUrl: URL;
  allowedOrigins: string[];
  usesUserToken: boolean;
  googleAccessTokenHeader: string;
  userTokenIngress?: UserTokenIngressContext;
  sessionOptions: {
    maxSessions: number;
    idleTtlMs: number;
    maxSessionsPerPrincipal: number;
  };
}

async function resolveUserTokenIngressContext(
  options: StartMcpHttpServerOptions,
  config: AppConfig,
  oauth: NonNullable<AppConfig['server']['oauth']>,
  usesUserToken: boolean,
  googleAccessTokenHeader: string,
): Promise<UserTokenIngressContext | undefined> {
  if (!usesUserToken) {
    return undefined;
  }

  const userTokenConfig = resolveUserTokenConfig(config);
  if (!userTokenConfig) {
    throw new Error('server.http.user_token is required when any agent uses auth_mode user_token');
  }

  const introspectionUrl = await resolveIntrospectionUrl(
    oauth,
    userTokenConfig.google_token.introspection_url,
  );

  return {
    userTokenConfig,
    introspectionUrl,
    googleAccessTokenHeader,
    testIntrospector: options.testTokenIntrospector,
  };
}

interface RegisterOAuthMcpRoutesParams {
  app: express.Application;
  httpPath: string;
  createMcpServer: () => McpServer;
  oauth: NonNullable<AppConfig['server']['oauth']>;
  resourceServerUrl: URL;
  allowedOrigins: string[];
  usesUserToken: boolean;
  userTokenIngress: UserTokenIngressContext | undefined;
  mcpRouteOptions: Omit<
    RegisterMcpRoutesOptions,
    'routeMiddleware' | 'oauthEnabled' | 'publicUrl' | 'allowedOrigins'
  >;
  resourceName: string;
  testTokenVerifier?: OAuthTokenVerifier;
}

async function registerOAuthMcpRoutes(
  params: RegisterOAuthMcpRoutesParams,
): Promise<McpRoutesContext> {
  const {
    app,
    httpPath,
    createMcpServer,
    oauth,
    resourceServerUrl,
    allowedOrigins,
    usesUserToken,
    userTokenIngress,
    mcpRouteOptions,
    resourceName,
    testTokenVerifier,
  } = params;
  const oauthMetadata = await buildOAuthMetadata(oauth);
  const tokenVerifier = testTokenVerifier ?? createJwtTokenVerifier(oauth);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl,
      scopesSupported: oauth.scopes_supported,
      resourceName,
    }),
  );

  const authMiddleware = requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: oauth.required_scopes,
    resourceMetadataUrl,
  });
  const routeMiddleware = usesUserToken
    ? [
        authMiddleware,
        createIngressClientAllowlistMiddleware(
          new Set(userTokenIngress!.userTokenConfig.trusted_ingress_client_ids),
        ),
      ]
    : [authMiddleware];

  return registerMcpRoutes(app, httpPath, createMcpServer, {
    routeMiddleware,
    oauthEnabled: true,
    publicUrl: resourceServerUrl,
    allowedOrigins,
    ...mcpRouteOptions,
  });
}

interface McpPostHandlerDeps {
  sessionManager: SessionManager;
  createMcpServer: () => McpServer;
  options: RegisterMcpRoutesOptions;
}

async function handleMcpPostWithSession(
  req: Request,
  res: Response,
  sessionId: string,
  principalId: string | undefined,
  deps: McpPostHandlerDeps,
): Promise<void> {
  const { sessionManager, options } = deps;
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
  const validatedGoogle = await resolveValidatedGoogleToken(
    req,
    res,
    options,
    record.googleIdentity,
  );
  if (options.usesUserToken && !validatedGoogle) {
    return;
  }
  await forwardTransportRequest({
    label: 'MCP HTTP request failed',
    transport: record.transport,
    req,
    res,
    usesUserToken: options.usesUserToken,
    validatedGoogle,
    body: req.body,
  });
}

async function handleMcpPostInitialize(
  req: Request,
  res: Response,
  principalId: string | undefined,
  deps: McpPostHandlerDeps,
): Promise<void> {
  const { sessionManager, createMcpServer, options } = deps;
  const reservation = sessionManager.reserve(principalId);
  if (!reservation.ok) {
    logInfo('transport', 'session_rejected', {
      reason: reservation.reason,
      ...(principalId ? { principal_fingerprint: logFingerprint(principalId) } : {}),
      sessions_active: sessionManager.activeCount(),
    });
    sendJsonRpcError(
      res,
      503,
      reservation.reason === 'principal_limit'
        ? 'Service Unavailable: per-principal session limit exceeded'
        : 'Service Unavailable: session limit exceeded',
    );
    return;
  }

  const server = createMcpServer();
  const validatedGoogle = await resolveValidatedGoogleToken(req, res, options);
  if (options.usesUserToken && !validatedGoogle) {
    sessionManager.release(reservation.token);
    return;
  }

  const transport = createTransport(
    sessionManager,
    server,
    principalId,
    reservation.token,
    validatedGoogle?.googleIdentity,
  );
  try {
    await server.connect(transport);
    await forwardTransportRequest({
      label: 'MCP HTTP initialize failed',
      transport,
      req,
      res,
      usesUserToken: options.usesUserToken,
      validatedGoogle,
      body: req.body,
    });
  } catch (err) {
    logError('transport', 'MCP HTTP initialize failed', { error: String(err) });
    if (!res.headersSent) {
      res.status(500).end();
    }
  } finally {
    if (!transport.sessionId) {
      sessionManager.release(reservation.token);
    }
  }
}

function createMcpPostHandler(deps: McpPostHandlerDeps): express.RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const sessionId = parseSessionId(req);
    const principalId = resolveRequestPrincipalId(req, deps.options.oauthEnabled);

    if (sessionId) {
      await handleMcpPostWithSession(req, res, sessionId, principalId, deps);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      sendJsonRpcError(res, 400, 'Bad Request: No valid session ID provided');
      return;
    }

    await handleMcpPostInitialize(req, res, principalId, deps);
  };
}

interface MountMcpHttpRoutesParams {
  app: express.Application;
  httpPath: string;
  originMiddleware: express.RequestHandler;
  routeMiddleware: express.RequestHandler[];
  mcpPostHandler: express.RequestHandler;
  handleSessionRequest: express.RequestHandler;
}

function mountMcpHttpRoutes(params: MountMcpHttpRoutesParams): void {
  const { app, httpPath, originMiddleware, routeMiddleware, mcpPostHandler, handleSessionRequest } =
    params;
  const chain = [originMiddleware, ...routeMiddleware];
  app.post(httpPath, ...chain, mcpPostHandler);
  app.get(httpPath, ...chain, handleSessionRequest);
  app.delete(httpPath, ...chain, handleSessionRequest);
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

interface ForwardTransportRequestParams {
  label: string;
  transport: StreamableHTTPServerTransport;
  req: Request;
  res: Response;
  usesUserToken: boolean;
  validatedGoogle?: ValidatedGoogleRequest;
  body?: unknown;
}

async function forwardTransportRequest(params: ForwardTransportRequestParams): Promise<void> {
  const { label, transport, req, res, usesUserToken, validatedGoogle, body } = params;
  const runHandler = async (): Promise<void> => {
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
  };

  if (!usesUserToken) {
    await runHandler();
    return;
  }

  if (!validatedGoogle) {
    sendJsonRpcError(res, 500, 'Internal error: missing validated Google credentials');
    return;
  }

  await runWithAuthRequestContextAsync(
    {
      googleAccessToken: validatedGoogle.googleAccessToken,
      googleIdentity: validatedGoogle.googleIdentity,
    },
    runHandler,
  );
}

async function resolveValidatedGoogleToken(
  req: Request,
  res: Response,
  options: RegisterMcpRoutesOptions,
  sessionGoogleIdentity?: GooglePrincipalIdentity,
  useSessionError = false,
): Promise<ValidatedGoogleRequest | undefined> {
  if (!options.usesUserToken || !options.userTokenIngress) {
    return undefined;
  }

  return validateGoogleTokenForRequest(req, res, options.userTokenIngress, {
    mcpAuth: (req as Request & { auth?: AuthInfo }).auth,
    bindingMode: options.userTokenIngress.userTokenConfig.binding.mode,
    sessionGoogleIdentity,
    useSessionError,
  });
}

function registerMcpRoutes(
  app: express.Application,
  httpPath: string,
  createMcpServer: () => McpServer,
  options: RegisterMcpRoutesOptions,
): McpRoutesContext {
  const sessionManager = createSessionManager(options.sessionOptions);
  sessionManager.startSweeper();
  const originMiddleware = createOriginValidationMiddleware(
    new Set(options.allowedOrigins),
    options.publicUrl,
  );

  const postDeps: McpPostHandlerDeps = { sessionManager, createMcpServer, options };
  const mcpPostHandler = createMcpPostHandler(postDeps);

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
    const validatedGoogle = await resolveValidatedGoogleToken(
      req,
      res,
      options,
      record.googleIdentity,
      true,
    );
    if (options.usesUserToken && !validatedGoogle) {
      return;
    }
    await forwardTransportRequest({
      label: 'MCP HTTP session request failed',
      transport: record.transport,
      req,
      res,
      usesUserToken: options.usesUserToken,
      validatedGoogle,
    });
  };

  mountMcpHttpRoutes({
    app,
    httpPath,
    originMiddleware,
    routeMiddleware: options.routeMiddleware ?? [],
    mcpPostHandler,
    handleSessionRequest,
  });

  return { sessionManager, oauthEnabled: options.oauthEnabled };
}

function createTransport(
  sessionManager: SessionManager,
  server: McpServer,
  principalId: string | undefined,
  reservationToken: string,
  googleIdentity?: GooglePrincipalIdentity,
): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      sessionManager.commit(reservationToken, newSessionId, {
        transport,
        server,
        principalId,
        googleIdentity,
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
