import type { GoogleRestRequest, GoogleRestTransport } from '../google/transport.js';

type FakeTransportHandler = (request: GoogleRestRequest) => unknown | Promise<unknown>;

interface FakeGoogleRestTransportOptions {
  handler: FakeTransportHandler;
}

export function createFakeGoogleRestTransport(
  options: FakeGoogleRestTransportOptions,
): GoogleRestTransport {
  return {
    async request<TResponse>(request: GoogleRestRequest): Promise<TResponse> {
      const result = await options.handler(request);
      return result as TResponse;
    },
  };
}
