# ADR 0002: MCP OAuth ingress token profile

## Status

Accepted

## Context

HTTP MCP servers verify ingress OAuth access tokens before exposing tools. Deployments may use Identity Platform, Keycloak, or other OIDC providers, but not every provider token shape is interchangeable.

## Decision

The supported **MCP ingress** token profile is:

| Requirement  | Behavior                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Token format | JWT verified via issuer JWKS (`server.oauth.token_profile: jwt_jwks`)                                                  |
| Discovery    | Issuer must publish `authorization_endpoint`, `token_endpoint`, `jwks_uri`                                             |
| Audience     | JWT `aud` must match one of `server.oauth.allowed_audiences` (defaults to `resource_url`)                              |
| Scopes       | Parsed from configured claims (`scope` string and/or `scp` array); enforced via `required_scopes` ⊆ `scopes_supported` |
| Principal    | Token must include `sub`, `azp`, or `client_id` for session accounting                                                 |

**Not supported at ingress:** opaque OAuth access tokens, token introspection for MCP bearer tokens, arbitrary audience/resource mappings without explicit `allowed_audiences`.

Identity Platform (`securetoken.google.com`) deployments must set `allowed_audiences` to the Firebase/Google project identifier; MCP `public_url` is not assumed to be the JWT audience.

## Consequences

- Documentation and schema descriptions must not claim generic OIDC compatibility beyond this profile.
- Provider-specific examples must include verified audience and scope configuration.
- Opaque-token or introspection-based MCP ingress may be added later as a new `token_profile` enum value.

## Future work

- `token_profile: opaque_introspection` for MCP ingress tokens
- RFC 8693 token exchange for BFF delegation assertions
