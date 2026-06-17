import { sendJsonRpcError } from './http-errors.js';

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, RequestHandler, Response } from 'express';

export function createIngressClientAllowlistMiddleware(
  trustedClientIds: ReadonlySet<string>,
): RequestHandler {
  return (req: Request, res: Response, next) => {
    const auth = (req as Request & { auth?: AuthInfo }).auth;
    const clientId = auth?.clientId;
    if (!clientId || !trustedClientIds.has(clientId)) {
      sendJsonRpcError(res, 403, 'Invalid or unauthorized MCP client', -32_001);
      return;
    }
    next();
  };
}
