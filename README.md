# gemini-data-agent-mcp

MCP servers for [**Gemini Data Agents**](https://cloud.google.com/gemini/docs/data-analytics) on Google Cloud.

Install one npm package and get two role-separated CLI binaries:

| Binary                            | Audience                     | Purpose                                                                                  |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| **`gemini-data-analyst-mcp`**     | Data analysts, coding agents | Query and chat with data agents, manage shared sessions, read a **static YAML registry** |
| **`gemini-data-agent-admin-mcp`** | Operators                    | Generate, validate, and diff analyst registry YAML for humans to commit                  |

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

Analysts consume a **committed YAML file** on disk. Operators use the admin server to produce that YAML; humans copy it into Git (no automated commit/PR from the server).

## Installation

```bash
npm install -g gemini-data-agent-mcp
```

Verify:

```bash
gemini-data-analyst-mcp --help
gemini-data-agent-admin-mcp --help
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

For operators generating registry YAML that analysts will commit:

```bash
gemini-data-agent-admin-mcp --config /absolute/path/to/admin-config.yaml
```

Example MCP client entry:

```json
{
  "mcpServers": {
    "gemini-data-agent-admin": {
      "command": "gemini-data-agent-admin-mcp",
      "args": ["--config", "/absolute/path/to/admin-config.yaml"]
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

Both servers share the same agent definition schema.

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
- **`security`**: redaction, audit, persistence, raw passthrough policy (for config validation).
- **`agents.<name>.capabilities`**: enable `query_data`, `chat`; generated analyst registry YAML from the admin server forces `raw_passthrough` to **false**.

### Validation rules

| Rule                                                           | Behavior |
| -------------------------------------------------------------- | -------- |
| Missing or empty `agents`                                      | Failure  |
| Missing `project`                                              | Failure  |
| `api_version` not in `version_policy.allowed_versions`         | Failure  |
| `impersonation` without `impersonate_service_account`          | Failure  |
| `raw_passthrough.enabled=true` without `allowed_path_patterns` | Failure  |

Validate any file before use:

```bash
gemini-data-analyst-mcp validate-config --config config.yaml
gemini-data-agent-admin-mcp validate-config --config admin-config.yaml
```

## Authentication

Credentials use **Application Default Credentials (ADC)** or **service account impersonation**.

| `auth.mode`     | When to use                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `adc`           | Local development; run `gcloud auth application-default login`                                           |
| `impersonation` | CI or shared runners; set `impersonate_service_account` and grant `roles/iam.serviceAccountTokenCreator` |

See comments in [examples/analyst.config.yaml](examples/analyst.config.yaml) and [Google Cloud ADC docs](https://cloud.google.com/docs/authentication/application-default-credentials).

## MCP tools and resources

### Analyst (`gemini-data-analyst-mcp`)

**Tools:** `query_data_agent`, `chat_data_agent`, `create_data_agent_conversation`, `list_conversation_messages`, `list_data_agents`, `get_data_agent_config`, `get_operation`, `session_create`, `session_chat`, `session_switch_intent`, `session_fork`, `session_reset`, `session_handoff`.

**Resources:** `gemini-data-agent://agents`, `gemini-data-agent://agents/{agent}`, `gemini-data-agent://agents/{agent}/capabilities`, `gemini-data-agent://agents/{agent}/auth-policy`, `gemini-data-agent://prompts`.

**Prompts:** session-oriented prompts plus `analyze_data_question`, `investigate_data_issue`, `explain_generated_query`, `compare_segments`, `find_anomalies`, `prepare_data_analysis_report`.

### Admin (`gemini-data-agent-admin-mcp`)

**Tools:** `generate_analyst_registry_yaml`, `validate_analyst_registry_yaml`, `diff_analyst_registry_yaml`, `inspect_admin_auth`, `dry_run_data_agent_change`, and remote lifecycle stubs (currently **NOT_IMPLEMENTED**).

## CLI reference

```bash
# Start servers
gemini-data-analyst-mcp --config config.yaml
gemini-data-agent-admin-mcp --config admin-config.yaml

# Validate or inspect config
gemini-data-analyst-mcp validate-config --config config.yaml
gemini-data-analyst-mcp inspect-config --config config.yaml
gemini-data-agent-admin-mcp validate-config --config admin-config.yaml
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
