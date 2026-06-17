/** Validated Google/OIDC access-token principal (from introspection). */
export interface GooglePrincipalIdentity {
  issuer: string;
  subject: string;
  clientId?: string;
  hd?: string;
  expiresAt: number;
}

export function googleIdentityKey(identity: GooglePrincipalIdentity): string {
  const parts = [
    `iss:${encodeURIComponent(identity.issuer)}`,
    `sub:${encodeURIComponent(identity.subject)}`,
  ];
  if (identity.clientId) {
    parts.push(`client:${encodeURIComponent(identity.clientId)}`);
  }
  if (identity.hd) {
    parts.push(`hd:${encodeURIComponent(identity.hd)}`);
  }
  return parts.join('|');
}

export function isGoogleIdentityExpired(
  identity: GooglePrincipalIdentity,
  nowSec?: number,
): boolean {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  return identity.expiresAt <= now;
}
