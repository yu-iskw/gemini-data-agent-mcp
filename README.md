# gemini-data-agent-mcp

MCP servers for [**Gemini Data Agents**](https://cloud.google.com/gemini/docs/conversational-analytics-api/overview) on Google Cloud.

Install role-separated MCP packages under **`@gemini-data-agents`**:

| Package                               | Audience                     | Binary                        | npm install                                      |
| ------------------------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------ |
| **`@gemini-data-agents/analyst-mcp`** | Data analysts, coding agents | `gemini-data-analyst-mcp`     | `npm install -g @gemini-data-agents/analyst-mcp` |
| **`@gemini-data-agents/admin-mcp`**   | Operators                    | `gemini-data-agent-admin-mcp` | Monorepo/dev only (not published yet)            |

Works with Cursor, Claude Code, Codex, and any MCP client that supports **stdio** transport.

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

## Quickstart: analyst server

1. Create a config file. Start from [examples/analyst.config.yaml](examples/analyst.config.yaml).

2. Authenticate with Google Cloud (ADC):

   ```bash
   gcloud auth application-default login
   ```

3. Register the server in your MCP client:

```json
{
  "mcpServers": {
    "gemini-data-analyst": {
      "command": "gemini-data-analyst-mcp",
      "args": ["--config", "/absolute/path/to/config.yaml"]
    }
  }
}
```

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

Example MCP client entry:

```json
{
  "mcpServers": {
    "gemini-data-agent-admin": {
      "command": "node",
      "args": [
        "/absolute/path/to/gemini-data-agent-mcp/packages/admin-mcp/dist/cli.js",
        "--config",
        "/absolute/path/to/admin-config.yaml"
      ]
    }
  }
}
```

Typical workflow:

1. Call **`generate_analyst_registry_yaml`** in your MCP client.
2. Copy the returned YAML into your repository.
3. Open a PR, review, and merge.
4. Point analyst **`--config`** at the committed file path.

See [examples/admin.config.yaml](examples/admin.config.yaml) and [examples/generated.registry.yaml](examples/generated.registry.yaml).

## YAML configuration

Both servers share the same v2 agent definition schema.

### Minimal config

```yaml
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/us-central1/dataAgents/my-agent
    tools:
      - query_data_agent
```

Omit `impersonate_service_account` for ADC (local dev). Optional `server` block configures MCP server identity and logging.

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
