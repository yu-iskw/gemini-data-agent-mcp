# Contributing

Thanks for contributing to **gemini-data-agent-mcp**. End-user documentation lives in [README.md](README.md); this file covers development, repository layout, and releases.

## Repository layout

| Package                                                                        | Role                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`packages/gemini-data-agent-mcp`](packages/gemini-data-agent-mcp)             | **npm publish target.** Bundles core + both MCP servers; exposes **`gemini-data-analyst-mcp`** and **`gemini-data-agent-admin-mcp`** binaries.                                       |
| [`packages/gemini-data-agent-core`](packages/gemini-data-agent-core)           | Shared config (Zod), YAML load/validate, registry YAML serialize/diff, ADC/impersonation auth, Gemini Data Agents REST client, redaction, audit logging helpers. **No MCP runtime.** |
| [`packages/gemini-data-analyst-mcp`](packages/gemini-data-analyst-mcp)         | Analyst MCP server source. Binary: **`gemini-data-analyst-mcp`**.                                                                                                                    |
| [`packages/gemini-data-agent-admin-mcp`](packages/gemini-data-agent-admin-mcp) | Admin MCP server source. Binary: **`gemini-data-agent-admin-mcp`**.                                                                                                                  |

## Architecture

```text
                    ┌─────────────────────────────┐
                    │  gemini-data-agent-core     │
                    │  config · client · security │
                    │  registry YAML helpers      │
                    └──────────────┬──────────────┘
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼
┌────────────────────┐   ┌────────────────────┐
│ gemini-data-       │   │ gemini-data-agent- │
│ analyst-mcp        │   │ admin-mcp          │
│ (read-only registry│   │ (YAML artifacts,  │
│  + sessions)       │   │  lifecycle stubs)  │
└─────────┬──────────┘   └─────────┬──────────┘
          │ stdio MCP             │ stdio MCP
          ▼                       ▼
   Static YAML file          Human copies YAML
   on disk                   to Git / PR manually
          │
          ▼
   geminidataanalytics.googleapis.com
```

### Non-goals (current scope)

- **No GitHub automation** from the admin server (no commit, push, or PR APIs).
- **No HTTP MCP transport** unless added later (`stdio` is supported).
- Analyst server **does not** expose raw REST passthrough or admin-only lifecycle tools.

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
pnpm --filter gemini-data-agent-core build
pnpm --filter gemini-data-analyst-mcp build
pnpm --filter gemini-data-agent-admin-mcp build
```

Run servers from built artifacts (without a global npm install):

```bash
node packages/gemini-data-analyst-mcp/dist/cli.js --config config.yaml
node packages/gemini-data-agent-admin-mcp/dist/cli.js --config admin-config.yaml
```

Tests live under `packages/*/src/**/*.test.ts`. Run the full suite with `pnpm test` from the repository root.

Suggested pre-commit gate:

```bash
pnpm lint:eslint && pnpm knip && pnpm lint && pnpm test
```

See [AGENTS.md](AGENTS.md) for repository conventions and agent tooling.

## Releasing

Publishing is handled by [`packages/gemini-data-agent-mcp`](packages/gemini-data-agent-mcp) — a single npm package that bundles the core, analyst, and admin workspace packages via `bundledDependencies`.

CI uses `pnpm publish --filter gemini-data-agent-mcp` with a hoisted node linker (required for bundling). Local development keeps the default isolated linker; only the publish path switches to hoisted.

### First release (one-time bootstrap)

npm trusted publishing requires the package to exist on npm before you can configure a trusted publisher. Use a granular npm token for the initial publish:

1. Bump the version in [`packages/gemini-data-agent-mcp/package.json`](packages/gemini-data-agent-mcp/package.json).
2. Run `pnpm build && pnpm test`.
3. Publish locally (with `NODE_AUTH_TOKEN` set or after `npm login`):

   ```bash
   pnpm publish:npm
   ```

   After bootstrap, restore the dev linker if needed:

   ```bash
   pnpm config delete node-linker
   pnpm install
   ```

4. On [npmjs.com](https://www.npmjs.com) → **gemini-data-agent-mcp** → **Settings → Trusted publishing**, configure:
   - Provider: GitHub Actions
   - Repository: `yu-iskw/gemini-data-agent-mcp`
   - Workflow filename: `publish.yml`
5. Optionally enable **Require 2FA and disallow tokens** after verifying OIDC works.

### Subsequent releases

1. Bump the version in `packages/gemini-data-agent-mcp/package.json`.
2. Create a GitHub Release — [`.github/workflows/publish.yml`](.github/workflows/publish.yml) publishes via OIDC (no `NPM_TOKEN` required).

## Pull requests

- Branch from `main`.
- Run `pnpm lint && pnpm test` before opening a PR.
- Use conventional commit messages: `type(scope): description` (e.g. `feat(analyst): add tool`).

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 license.
