import { sendJsonRpcError } from './http-errors.js';

import type { Request, RequestHandler, Response } from 'express';

export function createOriginValidationMiddleware(
  allowedOrigins: ReadonlySet<string>,
  publicUrl: URL,
): RequestHandler {
  const canonicalOrigin = publicUrl.origin;

  return (req: Request, res: Response, next) => {
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }

    if (origin === canonicalOrigin || allowedOrigins.has(origin)) {
      next();
      return;
    }

    sendJsonRpcError(res, 403, 'Forbidden: invalid Origin header');
  };
}
