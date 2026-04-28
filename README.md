# gemini-data-agent-mcp

Monorepo for **Gemini Data Agents** MCP tooling: a shared TypeScript library plus two role-separated MCP servers (**analyst** vs **admin**).

Designed for use with coding agents (Cursor, Claude Code, Codex) and any MCP-capable client.

## Repository layout

| Package                                                                        | Role                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/gemini-data-agent-core`](packages/gemini-data-agent-core)           | Shared config (Zod), YAML load/validate, registry YAML serialize/diff, ADC/impersonation auth, Gemini Data Agents REST client, redaction, audit logging helpers. **No MCP runtime.**                                                                                                                    |
| [`packages/gemini-data-analyst-mcp`](packages/gemini-data-analyst-mcp)         | **Data analysts.** MCP server with analytical tools, session collaboration tools, resources, and prompts. Reads a **static YAML registry** only; **no** `raw_data_agent_request`; **no** registry-generation tools. CLI binary: **`gemini-data-analyst-mcp`**.                                          |
| [`packages/gemini-data-agent-admin-mcp`](packages/gemini-data-agent-admin-mcp) | **Administrators.** Local control-plane MCP server: generate/validate/diff analyst registry YAML (text returned to the client), auth inspection, dry-run validation, and **not implemented** remote lifecycle stubs. **No** GitHub commit/PR automation. CLI binary: **`gemini-data-agent-admin-mcp`**. |

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
│  + sessions)       │   │  lifecycle stubs)│
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
- **No HTTP MCP transport** expansion unless added later (`stdio` is supported).
- Analyst server **does not** expose raw REST passthrough or admin-only lifecycle tools.

---

## Installation

```bash
git clone https://github.com/yu-iskw/gemini-data-agent-mcp.git
cd gemini-data-agent-mcp
pnpm install
pnpm build
```

Binaries (after build):

- `packages/gemini-data-analyst-mcp/dist/cli.js` → **`gemini-data-analyst-mcp`**
- `packages/gemini-data-agent-admin-mcp/dist/cli.js` → **`gemini-data-agent-admin-mcp`**

---

## Quickstart: analyst server (data users)

1. Use a static registry file. See [examples/analyst.config.yaml](examples/analyst.config.yaml) and [YAML configuration](#yaml-configuration).

2. Start the analyst MCP server:

```bash
node packages/gemini-data-analyst-mcp/dist/cli.js --config config.yaml
```

3. MCP client configuration example:

```json
{
  "mcpServers": {
    "gemini-data-analyst": {
      "command": "node",
      "args": [
        "/path/to/repo/packages/gemini-data-analyst-mcp/dist/cli.js",
        "--config",
        "/path/to/config.yaml"
      ]
    }
  }
}
```

Analyst tools include `query_data_agent`, `chat_data_agent`, conversation helpers, `list_data_agents`, redacted `get_data_agent_config`, `get_operation`, and **`session_*`** tools for shared sessions. **`raw_data_agent_request` is not exposed.**

---

## Quickstart: admin server (operators)

Run locally when generating or validating registry YAML for humans to commit:

```bash
node packages/gemini-data-agent-admin-mcp/dist/cli.js --config admin-config.yaml
```

Admin MCP tools include `generate_analyst_registry_yaml`, `validate_analyst_registry_yaml`, `diff_analyst_registry_yaml`, `inspect_admin_auth`, `dry_run_data_agent_change`, and remote lifecycle tools that currently return **NOT_IMPLEMENTED** until wired to the Gemini client.

Workflow: call **`generate_analyst_registry_yaml`** → copy YAML into your repo → open PR / merge → analysts point **`--config`** at the committed file path.

See [examples/admin.config.yaml](examples/admin.config.yaml). Sample generated shape: [examples/generated.registry.yaml](examples/generated.registry.yaml).

---

## YAML configuration

Shared **`AppConfig`** schema lives in **core** and applies to both servers for agent definitions.

### Minimal config

```yaml
agents:
  my-agent:
    project: my-gcp-project
    location: us-central1
    api_version: v1beta
    data_agent: my-agent
    auth:
      mode: adc
```

Omitted sections receive safe defaults (`server`, `version_policy`, `security`, `defaults`, per-agent `capabilities`).

### Advanced options

- **`version_policy`**: constrain API versions and tool overrides.
- **`security`**: redaction, audit, persistence, raw passthrough policy (for **config validation**; analyst server does not expose raw passthrough tool).
- **`agents.<name>.capabilities`**: enable `query_data`, `chat`; `raw_passthrough` is forced **false** in **generated** analyst registry YAML from the admin serializer.

### Validation rules

| Rule                                                           | Behavior |
| -------------------------------------------------------------- | -------- |
| Missing or empty `agents`                                      | Failure  |
| Missing `project`                                              | Failure  |
| `api_version` not in `version_policy.allowed_versions`         | Failure  |
| `impersonation` without `impersonate_service_account`          | Failure  |
| `raw_passthrough.enabled=true` without `allowed_path_patterns` | Failure  |

---

## Authentication

Same credential model as before (**ADC** or **service account impersonation**). See [examples/analyst.config.yaml](examples/analyst.config.yaml) comments and Google Cloud docs for IAM and `iamcredentials.googleapis.com`.

---

## MCP surfaces

### Analyst (`gemini-data-analyst-mcp`)

**Tools (representative):** `query_data_agent`, `chat_data_agent`, `create_data_agent_conversation`, `list_conversation_messages`, `list_data_agents`, `get_data_agent_config`, `get_operation`, `session_create`, `session_chat`, `session_switch_intent`, `session_fork`, `session_reset`, `session_handoff`.

**Resources:** `gemini-data-agent://agents`, `gemini-data-agent://agents/{agent}`, `gemini-data-agent://agents/{agent}/capabilities`, `gemini-data-agent://agents/{agent}/auth-policy`, `gemini-data-agent://prompts`.

**Prompts:** session-oriented prompts plus `analyze_data_question`, `investigate_data_issue`, `explain_generated_query`, `compare_segments`, `find_anomalies`, `prepare_data_analysis_report`.

### Admin (`gemini-data-agent-admin-mcp`)

**Tools:** YAML generation/validation/diff, `inspect_admin_auth`, `dry_run_data_agent_change`, remote lifecycle stubs (`NOT_IMPLEMENTED`).

---

## Security defaults

| Setting                      | Default            |
| ---------------------------- | ------------------ |
| Secret redaction             | **Enabled**        |
| Audit logging                | **Enabled**        |
| Prompt/response in audit     | **Disabled**       |
| Result persistence           | **Disabled**       |
| Analyst raw passthrough tool | **Not registered** |

Operational logs use **stderr**; MCP JSON-RPC stays on **stdout** for `stdio` transport.

---

## CLI (both MCP packages)

```bash
# Analyst
node packages/gemini-data-analyst-mcp/dist/cli.js --config config.yaml
node packages/gemini-data-analyst-mcp/dist/cli.js validate-config --config config.yaml
node packages/gemini-data-analyst-mcp/dist/cli.js inspect-config --config config.yaml

# Admin
node packages/gemini-data-agent-admin-mcp/dist/cli.js --config admin-config.yaml
node packages/gemini-data-agent-admin-mcp/dist/cli.js validate-config --config admin-config.yaml
```

Supported transport: **`stdio`**. **`http`** is rejected at startup with a clear error.

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm format
```

Package filters:

```bash
pnpm --filter gemini-data-agent-core build
pnpm --filter gemini-data-analyst-mcp build
pnpm --filter gemini-data-agent-admin-mcp build
```

Tests live under `packages/*/src/**/*.test.ts`.

---

## Troubleshooting

- **`CONFIG_NOT_FOUND` / `CONFIG_VALIDATION_ERROR`:** Run `validate-config` on the same file you pass to `--config`.
- **`AUTH_FAILED`:** Check ADC (`gcloud auth application-default login`) or impersonation IAM setup.
- **`Transport "http" is not yet supported`:** Use `--transport stdio`.
- **Malformed stdio:** Ensure nothing writes non-protocol text to **stdout**; logs belong on **stderr**.

---

## License

Apache-2.0
