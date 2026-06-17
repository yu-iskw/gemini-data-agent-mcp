# gemini-data-agent-mcp

MCP servers for [**Gemini Data Agents**](https://cloud.google.com/gemini/docs/conversational-analytics-api/overview) on Google Cloud.

Install role-separated MCP packages under **`@gemini-data-agents`**:

| Package                               | Audience                     | Binary                        | npm install                                      |
| ------------------------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------ |
| **`@gemini-data-agents/analyst-mcp`** | Data analysts, coding agents | `gemini-data-analyst-mcp`     | `npm install -g @gemini-data-agents/analyst-mcp` |
| **`@gemini-data-agents/admin-mcp`**   | Operators                    | `gemini-data-agent-admin-mcp` | Monorepo/dev only (not published yet)            |

Works with Cursor, Claude Code, Claude Agent SDK, Deep Agents, Codex, and any MCP client that supports **stdio** transport.

## Architecture

```text
  Analyst MCP                         Admin MCP
  (read-only registry + sessions)     (YAML artifacts for Git)
         │                                   │
         └─────────────┬─────────────────────┘
                       ▼
            geminidataanalytics.googleapis.com
```

Analysts consume a **committed YAML file** on disk. Operators use the admin server to produce that YAML; humans copy it into Git (no automated commit/PR from the server). For operators, run the admin server from a clone: `node packages/admin-mcp/dist/cli.js --config admin-config.yaml` (see [Quickstart: admin server](#quickstart-admin-server)).

## Installation

```bash
npm install -g @gemini-data-agents/analyst-mcp
```

Verify (analyst binary only — admin requires a monorepo clone; see [Quickstart: admin server](#quickstart-admin-server)):

```bash
gemini-data-analyst-mcp --help
```

## MCP client configuration (`mcp.json`)

MCP hosts need a **client config** that tells them how to spawn or connect to a server. That is separate from the **server YAML** (`--config`) that defines which Gemini Data Agents and tools are exposed.

| Layer  | File                                          | Purpose                                            |
| ------ | --------------------------------------------- | -------------------------------------------------- |
| Client | `mcp.json` / `.mcp.json` / `.cursor/mcp.json` | Spawn the MCP server (`command`, `args`, `env`)    |
| Server | `analyst.config.yaml`                         | Agent registry, GCP resources, auth, enabled tools |

### End users (npm install)

1. Copy [examples/mcp.json](examples/mcp.json) to your project as `.mcp.json` (or `.cursor/mcp.json` for Cursor).
2. Create `config/analyst.config.yaml` from [examples/analyst.config.minimal.yaml](examples/analyst.config.minimal.yaml).
3. Authenticate: `gcloud auth application-default login`.
4. Validate: `gemini-data-analyst-mcp validate-config --config config/analyst.config.yaml`.

### Monorepo contributors

1. Build: `pnpm install && pnpm build`.
2. Use [.cursor/mcp.json](.cursor/mcp.json) in this repo, or copy [examples/mcp.monorepo-dev.json](examples/mcp.monorepo-dev.json) to `.mcp.json`.
3. Edit [examples/analyst.config.minimal.yaml](examples/analyst.config.minimal.yaml) with real `data_agent` resource names.

### Where each client looks

| Client               | Config path                                                               | Root key     |
| -------------------- | ------------------------------------------------------------------------- | ------------ |
| **Cursor**           | `.cursor/mcp.json`, `~/.cursor/mcp.json`                                  | `mcpServers` |
| **Claude Agent SDK** | `.mcp.json` (project root)                                                | `mcpServers` |
| **Claude Desktop**   | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) | `mcpServers` |
| **Deep Agents Code** | `~/.deepagents/.mcp.json`, `.deepagents/.mcp.json`, `.mcp.json`           | `mcpServers` |
| **VS Code**          | `.vscode/mcp.json`                                                        | `servers`    |

### Claude Agent SDK

`.mcp.json` loads when `settingSources` includes `"project"` (default). Or pass servers in code and allow tools explicitly:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: 'List configured data agents',
  options: {
    mcpServers: {
      'gemini-data-analyst': {
        command: 'gemini-data-analyst-mcp',
        args: ['--config', '/absolute/path/to/analyst.config.yaml'],
      },
    },
    allowedTools: ['mcp__gemini-data-analyst__*'],
  },
})) {
  // handle messages
}
```

MCP tools are named `mcp__{server}__{tool}`.

### Deep Agents Code

Deep Agents auto-discovers `.mcp.json` at the project root (Claude Code compatible). Project-level stdio servers may require approval on first run; use `--trust-project-mcp` in CI or non-interactive mode.

ADC and impersonation stay in server YAML, not `mcp.json`. Only **stdio** transport is supported today; configure `http` in YAML is rejected at startup.

## Quickstart: analyst server

1. Create a config file. Start from [examples/analyst.config.minimal.yaml](examples/analyst.config.minimal.yaml) or see [examples/analyst.config.full.yaml](examples/analyst.config.full.yaml) for all optional fields.

2. Authenticate with Google Cloud (ADC):

   ```bash
   gcloud auth application-default login
   ```

3. Register the server in your MCP client — see [MCP client configuration (`mcp.json`)](#mcp-client-configuration-mcpjson).

4. Validate your config before connecting:

```bash
gemini-data-analyst-mcp validate-config --config /absolute/path/to/config.yaml
```

The analyst server exposes analytical tools, session collaboration, resources, and prompts. It does **not** expose raw REST passthrough or registry-generation tools.

## Quickstart: admin server

For operators generating registry YAML that analysts will commit (monorepo clone required — admin is not on npm yet):

```bash
node packages/admin-mcp/dist/cli.js --config /absolute/path/to/admin-config.yaml
```

Register the server in your MCP client — see [MCP client configuration (`mcp.json`)](#mcp-client-configuration-mcpjson) and [examples/mcp.monorepo-dev.json](examples/mcp.monorepo-dev.json) for the admin entry.

Typical workflow:

1. Call **`generate_analyst_registry_yaml`** in your MCP client.
2. Copy the returned YAML into your repository.
3. Open a PR, review, and merge.
4. Point analyst **`--config`** at the committed file path.

See [examples/admin.config.minimal.yaml](examples/admin.config.minimal.yaml), [examples/admin.config.full.yaml](examples/admin.config.full.yaml), and [examples/generated.registry.yaml](examples/generated.registry.yaml).

## YAML configuration

Both servers share the same v2 agent definition schema.

### Minimal config

See [examples/analyst.config.minimal.yaml](examples/analyst.config.minimal.yaml):

```yaml
# yaml-language-server: $schema=../schemas/app-config.v2.schema.json
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/us-central1/dataAgents/my-agent
    tools:
      - query_data_agent
```

Omit `impersonate_service_account` for ADC (local dev). Optional `server` block configures MCP server identity and logging.

### Full config

See [examples/analyst.config.full.yaml](examples/analyst.config.full.yaml) for a multi-agent setup with:

- `server` (`name`, `log_level`, `transport`)
- `display_name`, `description`, `generation_options`
- Per-agent `api_version` override
- Per-agent `impersonate_service_account` (multi-project)
- Optional `client: { project, location }` when API routing differs from the `data_agent` resource
- All four allowed tool names on chat-enabled agents

Admin examples: [examples/admin.config.minimal.yaml](examples/admin.config.minimal.yaml) and [examples/admin.config.full.yaml](examples/admin.config.full.yaml).

### JSON Schema

Editor validation and autocomplete: [schemas/app-config.v2.schema.json](schemas/app-config.v2.schema.json).

Add to the top of a YAML config file:

```yaml
# yaml-language-server: $schema=../schemas/app-config.v2.schema.json
```

Regenerate after schema changes:

```bash
pnpm schema:export
```

### Advanced options

- **`api_version`**: required at root; optional per-agent override.
- **`agents.<name>.tools`**: MCP tool names enabled for that agent (`query_data_agent`, `chat_data_agent`, `create_data_agent_conversation`, `list_conversation_messages`).
- **`agents.<name>.impersonate_service_account`**: per-agent service account impersonation (ADC is used when omitted).
- **`agents.<name>.client`**: optional `{ project, location }` when API client routing differs from the `data_agent` resource.

### Validation rules

| Rule                                  | Behavior |
| ------------------------------------- | -------- |
| Missing or empty `agents`             | Failure  |
| Missing root `api_version`            | Failure  |
| `data_agent` not a full resource name | Failure  |
| Unknown tool name in `tools`          | Failure  |
| Empty `tools` list                    | Failure  |

Validate any file before use:

```bash
gemini-data-analyst-mcp validate-config --config config.yaml
node packages/admin-mcp/dist/cli.js validate-config --config admin-config.yaml
```

## Authentication

Credentials use **Application Default Credentials (ADC)** by default. Set **`impersonate_service_account`** on an agent for service account impersonation (CI or shared runners; grant `roles/iam.serviceAccountTokenCreator`).

Local development: `gcloud auth application-default login`. See [Google Cloud ADC docs](https://cloud.google.com/docs/authentication/application-default-credentials).

## MCP tools and resources

### Analyst (`gemini-data-analyst-mcp`)

**Tools:** `query_data_agent`, `chat_data_agent`, `create_data_agent_conversation`, `list_conversation_messages`, `list_data_agents`, `get_data_agent_config`, `get_operation`, `session_create`, `session_chat`, `session_switch_intent`, `session_fork`, `session_reset`, `session_handoff`.

**Resources:** `gemini-data-agent://agents`, `gemini-data-agent://agents/{agent}`, `gemini-data-agent://agents/{agent}/tools`, `gemini-data-agent://agents/{agent}/auth-policy`, `gemini-data-agent://prompts`.

**Prompts:** session-oriented prompts plus `analyze_data_question`, `investigate_data_issue`, `explain_generated_query`, `compare_segments`, `find_anomalies`, `prepare_data_analysis_report`.

### Admin (`gemini-data-agent-admin-mcp`)

**Tools:** `generate_analyst_registry_yaml`, `validate_analyst_registry_yaml`, `diff_analyst_registry_yaml`, `inspect_admin_auth`, `dry_run_data_agent_change`, and remote lifecycle stubs (currently **NOT_IMPLEMENTED**).

## CLI reference

```bash
# Start servers
gemini-data-analyst-mcp --config config.yaml
node packages/admin-mcp/dist/cli.js --config admin-config.yaml

# Validate or inspect config
gemini-data-analyst-mcp validate-config --config config.yaml
gemini-data-analyst-mcp inspect-config --config config.yaml
node packages/admin-mcp/dist/cli.js validate-config --config admin-config.yaml
```

Supported transport: **`stdio`** (default). **`http`** is rejected at startup.

## Security defaults

| Setting                      | Default            |
| ---------------------------- | ------------------ |
| Secret redaction             | **Enabled**        |
| Audit logging                | **Enabled**        |
| Prompt/response in audit     | **Disabled**       |
| Result persistence           | **Disabled**       |
| Analyst raw passthrough tool | **Not registered** |

Operational logs go to **stderr**; MCP JSON-RPC stays on **stdout**.

## Troubleshooting

| Symptom                                        | What to try                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `CONFIG_NOT_FOUND` / `CONFIG_VALIDATION_ERROR` | Run `validate-config` on the same file passed to `--config`.                      |
| `AUTH_FAILED`                                  | Check ADC (`gcloud auth application-default login`) or impersonation IAM.         |
| `Transport "http" is not yet supported`        | Use `--transport stdio` (or omit; stdio is default).                              |
| Malformed stdio / broken MCP handshake         | Ensure nothing writes non-protocol text to **stdout**; logs belong on **stderr**. |

## Contributing

Bug reports, feature requests, and pull requests are welcome. For development setup, monorepo layout, and release instructions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0
