import type { Response } from 'express';

export function sendJsonRpcError(
  res: Response,
  status: number,
  message: string,
  code = -32000,
): void {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

export function sendSessionError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}
