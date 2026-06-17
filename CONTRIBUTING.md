# Contributing

Thanks for contributing to **gemini-data-agent-mcp**. End-user documentation lives in [README.md](README.md); this file covers development, repository layout, and releases.

## Repository layout

| Package                                        | npm name                          | Published?         | Role                                                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/core`](packages/core)               | `@gemini-data-agents/core`        | No (`private`)     | Shared config (Zod), YAML load/validate, registry YAML serialize/diff, ADC/impersonation auth, Gemini Data Agents REST client, redaction, audit logging helpers, and **shared MCP HTTP transport + OAuth** helpers. |
| [`packages/analyst-mcp`](packages/analyst-mcp) | `@gemini-data-agents/analyst-mcp` | **Yes**            | Analyst MCP server. Binary: **`gemini-data-analyst-mcp`**. Bundles core.                                                                                                                                            |
| [`packages/admin-mcp`](packages/admin-mcp)     | `@gemini-data-agents/admin-mcp`   | No (publish-ready) | Admin MCP server. Binary: **`gemini-data-agent-admin-mcp`**. Bundles core.                                                                                                                                          |

## Architecture

```text
                    ┌─────────────────────────────┐
                    │  @gemini-data-agents/core   │
                    │  (private workspace only)   │
                    │  config · client · security │
                    │  HTTP transport · OAuth   │
                    │  registry YAML helpers    │
                    └──────────────┬──────────────┘
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼
┌────────────────────┐   ┌────────────────────┐
│ analyst-mcp        │   │ admin-mcp          │
│ (read-only registry│   │ (YAML artifacts,  │
│  + sessions)       │   │  lifecycle stubs)  │
└─────────┬──────────┘   └─────────┬──────────┘
          │ stdio or HTTP MCP       │ stdio or HTTP MCP
          ▼                       ▼
   Static YAML file          Human copies YAML
   on disk                   to Git / PR manually
          │
          ▼
   geminidataanalytics.googleapis.com
```

### Non-goals (current scope)

- **No GitHub automation** from the admin server (no commit, push, or PR APIs).
- **No Cloud Run / Docker deploy docs** in this iteration (HTTP + OAuth work locally first).
- Analyst server **does not** expose raw REST passthrough or admin-only lifecycle tools.
- **Core is not published** to npm; it is bundled into each MCP package tarball.
- **Admin MCP is not published** to npm yet (monorepo/dev only).

## Development setup

**Requirements:** Node.js (see [`.node-version`](.node-version)), [pnpm](https://pnpm.io/) (see root `package.json` `packageManager`).

```bash
git clone https://github.com/yu-iskw/gemini-data-agent-mcp.git
cd gemini-data-agent-mcp
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format
```

Build individual packages:

```bash
pnpm --filter @gemini-data-agents/core build
pnpm --filter @gemini-data-agents/analyst-mcp build
pnpm --filter @gemini-data-agents/admin-mcp build
```

Run servers from built artifacts (without a global npm install):

```bash
node packages/analyst-mcp/dist/cli.js --config config.yaml
node packages/admin-mcp/dist/cli.js --config admin-config.yaml
```

## Configuration

MCP servers resolve settings in layers. **Precedence (highest wins):** CLI flags → environment variables → YAML → built-in defaults.

| Layer       | Owns                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| YAML        | Agent registry, stable `server.name`, default transport, optional OAuth issuer        |
| Environment | Container deploy-time overrides (`PORT`, `MCP_HOST`, OAuth URLs, etc.)                |
| CLI         | Local dev overrides (`--transport`, `--log-level`, `--host`, `--port`, `--http-path`) |

`inspect-config` applies **YAML + environment only** (CLI flags are not reflected).

### Environment variables

| Variable                   | Maps to                            | Notes                                                  |
| -------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `PORT`                     | `server.bind.port`                 | Cloud Run injects this; must be 1–65535                |
| `MCP_TRANSPORT`            | `server.transport`                 | `stdio` or `http`                                      |
| `MCP_HOST`                 | `server.bind.host`                 | e.g. `0.0.0.0` in containers                           |
| `MCP_PUBLIC_URL`           | `server.public_url`                | Canonical public MCP URL (required for HTTP)           |
| `MCP_HTTP_PATH`            | `server.http.path`                 | Must match `public_url` pathname if both set           |
| `MCP_CORS_ALLOWED_ORIGINS` | `server.http.cors.allowed_origins` | Comma-separated browser origins                        |
| `MCP_LOG_LEVEL`            | `server.log_level`                 | `DEBUG`, `INFO`, `WARN`, `ERROR`                       |
| `MCP_OAUTH_ENABLED`        | `server.oauth.enabled`             | `true`/`false`, `1`/`0`, `yes`/`no`                    |
| `MCP_OAUTH_ISSUER`         | `server.oauth.issuer`              | Identity Platform or Keycloak issuer URL               |
| `MCP_OAUTH_RESOURCE_URL`   | `server.oauth.resource_url`        | Defaults from `public_url` when omitted                |
| `MCP_ALLOW_INSECURE_HTTP`  | (guard only)                       | Must be `true` when `oauth.enabled: false` on loopback |

Agent tools, impersonation, and scopes remain YAML-only. Invalid env values throw `CONFIG_INVALID_ENV`.

Example container env block (conceptual):

```bash
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_PUBLIC_URL=https://analyst-mcp-xxx.run.app/mcp
MCP_OAUTH_ISSUER=https://securetoken.google.com/PROJECT_ID
```

HTTP transport requires `server.public_url` (or `server.oauth.resource_url` during migration) and a `server.oauth` block. Set `oauth.enabled: false` only for local CI smoke tests with `MCP_ALLOW_INSECURE_HTTP=true` on a loopback bind host; this mode is rejected when `NODE_ENV=production`.

Session limits (`server.http.sessions`: `max_sessions`, `idle_ttl_ms`, `max_sessions_per_principal`) and CORS allowlists (`server.http.cors.allowed_origins`) are configured in YAML. When no CORS origins are set, CORS middleware is omitted (native MCP clients are unaffected).

Runtime overrides that set `transport: http` are validated the same way.

Tests live under `packages/*/src/**/*.test.ts`. Run the full suite with `pnpm test` from the repository root.

### MCP smoke test (Inspector)

After building, run a non-interactive MCP Inspector handshake against the analyst and admin servers:

```bash
pnpm build
pnpm smoke:mcp
```

Inspector configs live under [`dev/`](dev/) (`mcp-inspector.analyst.json`, `mcp-inspector.admin.json`). Use [`.cursor/mcp.json`](.cursor/mcp.json) for Cursor in this repo.

Suggested pre-commit gate:

```bash
pnpm lint:eslint && pnpm knip && pnpm lint && pnpm test
```

See [AGENTS.md](AGENTS.md) for repository conventions and agent tooling.

## Releasing

Only **`@gemini-data-agents/analyst-mcp`** is published to npm today. It bundles the private **`@gemini-data-agents/core`** workspace package via `bundledDependencies`.

CI uses `pnpm publish --filter @gemini-data-agents/analyst-mcp` with a hoisted node linker (required for bundling). Local development keeps the default isolated linker; only the publish path switches to hoisted.

Do **not** use `npm pack` inside `packages/analyst-mcp` to validate the release tarball — with a hoisted workspace layout it can follow symlinks and report a multi‑MB bogus archive. Use `pnpm publish --filter @gemini-data-agents/analyst-mcp --dry-run --no-git-checks` (after hoisted install) or the validate job in [`.github/workflows/publish.yml`](.github/workflows/publish.yml).

### First release (one-time bootstrap)

npm trusted publishing requires the package to exist on npm before you can configure a trusted publisher. Use a granular npm token for the initial publish:

1. Bump the version in [`packages/analyst-mcp/package.json`](packages/analyst-mcp/package.json) (and core if you keep versions in sync for bundled semver rewrite).
2. Run `pnpm build && pnpm test`.
3. Publish locally (with `NODE_AUTH_TOKEN` set or after `npm login`):

   ```bash
   pnpm publish:npm:analyst
   ```

   After bootstrap, restore the dev linker:

   ```bash
   pnpm config delete node-linker
   pnpm install
   ```

4. On [npm](https://docs.npmjs.com/trusted-publishers) → **@gemini-data-agents/analyst-mcp** → **Settings → Trusted publishing**, configure:
   - Provider: GitHub Actions
   - Repository: `yu-iskw/gemini-data-agent-mcp`
   - Workflow filename: `publish.yml`
5. Optionally enable **Require 2FA and disallow tokens** after verifying OIDC works.

### Subsequent releases

1. Bump the version in `packages/analyst-mcp/package.json` (and core if synced).
2. Create a GitHub Release — [`.github/workflows/publish.yml`](.github/workflows/publish.yml) publishes via OIDC (no `NPM_TOKEN` required).

## Pull requests

- Branch from `main`.
- Run `pnpm lint && pnpm test` before opening a PR.
- Use conventional commit messages: `type(scope): description` (e.g. `feat(analyst): add tool`).

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 license.
