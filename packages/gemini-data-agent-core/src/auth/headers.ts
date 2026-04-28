export function normalizeHeaders(
  headers: Headers | Record<string, string>,
): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return headers;
}

export function getHeaderValue(
  headers: Headers | Record<string, string>,
  headerName: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(headerName) ?? headers.get(headerName.toLowerCase()) ?? undefined;
  }

  const lowerHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key === headerName || key === lowerHeaderName) {
      return value;
    }
  }

  return undefined;
}
