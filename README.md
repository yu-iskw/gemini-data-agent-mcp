# gemini-data-agent-mcp

Production-grade **MCP server** that acts as a thin proxy to Google Gemini Data Agents / Data Analytics API with Gemini.

Designed for use with coding agents — Cursor, Claude Code, Codex, and any other MCP-capable client.

## What this is not

This is not a CRUD-focused data-agent management console.
This is not a replacement for Gemini Data Agents.
This is not a data warehouse client.
This is not a separate planning or analysis agent.
It is a thin MCP proxy that lets MCP clients invoke configured Gemini Data Agents.

---

## Architecture

```text
Coding Agent (Cursor / Claude Code / Codex)
        │  MCP
        ▼
gemini-data-agent-mcp
  ├── MCP Tools   (query_data_agent, send_data_agent_message, …)
  ├── MCP Resources (gemini-data-agent://agents/…)
  └── MCP Prompts (analyze_data_question, investigate_data_issue, …)
        │
        ▼
  YAML Agent Registry
        │
        ├── Credential Resolver
        │     ├── ADC
        │     ├── Workload Identity
        │     └── Service Account Impersonation
        │
        └── Gemini Data Agents REST Client
                │
                ▼
        geminidataanalytics.googleapis.com
```

---

## Installation

```bash
# Clone and install dependencies
git clone https://github.com/yu-iskw/gemini-data-agent-mcp.git
cd gemini-data-agent-mcp
pnpm install
pnpm build
```

The CLI is available as `gemini-data-agent-mcp` after building.

---

## Quickstart

1. Create a configuration file (see [YAML configuration](#yaml-configuration)):

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

All omitted fields are resolved from schema defaults during config validation.

1. Start the server:

```bash
node packages/gemini-data-agent-mcp/dist/cli.js --config config.yaml
```

1. Add to your MCP client (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gemini-data-agent": {
      "command": "node",
      "args": [
        "/path/to/packages/gemini-data-agent-mcp/dist/cli.js",
        "--config",
        "/path/to/config.yaml"
      ]
    }
  }
}
```

---

## YAML Configuration

### Minimal config (recommended starting point)

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

This is enough to start the server. Defaults are applied automatically for omitted sections (`server`, `version_policy`, `security`, `defaults`, `capabilities`).
`data_agent` accepts either a full resource name or a bare data agent ID; the ID form is recommended for readability.

### Advanced optional settings

Use these only when you need extra control:

- `version_policy`: constrain or override supported API versions.
- `security.raw_passthrough`: allow explicit raw REST passthrough patterns.
- `agents.<name>.capabilities`: enable/disable tool families per agent.
- `agents.<name>.generation_options`: tune query/answer generation behavior.

```yaml
version_policy:
  default: v1beta
  allowed_versions: [v1, v1beta, v1alpha]
  allow_tool_override: true
  warn_on_v1alpha: true

security:
  raw_passthrough:
    enabled: false
    allowed_methods: [GET, POST]
    allowed_path_patterns: []

agents:
  my-agent:
    capabilities:
      query_data: true
      a2a_send: false
      a2a_stream: false
      chat: false
      raw_passthrough: false
    generation_options:
      generate_query: true
      generate_query_result: true
      generate_natural_language_answer: true
      generate_explanation: true
      generate_disambiguation_question: true
```

### Validation rules

| Rule                                                           | Behavior        |
| -------------------------------------------------------------- | --------------- |
| Missing `agents` or empty map                                  | Startup failure |
| Missing `project`                                              | Startup failure |
| Unsupported `api_version`                                      | Startup failure |
| `impersonation` without `target_service_account`               | Startup failure |
| Unknown `auth.mode`                                            | Startup failure |
| `raw_passthrough.enabled=true` without `allowed_path_patterns` | Startup failure |

---

## Authentication modes

### `adc` — Application Default Credentials

For local development:

```bash
gcloud auth application-default login
```

```yaml
auth:
  mode: adc
```

### `workload_identity` — Metadata server credentials

For GKE, Cloud Run, GCE:

```yaml
auth:
  mode: workload_identity
```

### `impersonation` — Service account impersonation (recommended for production)

```yaml
auth:
  mode: impersonation
  source: adc # or workload_identity
  target_service_account: sa@project.iam.gserviceaccount.com
  scopes:
    - https://www.googleapis.com/auth/cloud-platform
```

Each agent can use a different target service account for least-privilege isolation.

---

## MCP Tools

| Tool                      | Description                                                       |
| ------------------------- | ----------------------------------------------------------------- |
| `query_data_agent`        | Ask a natural-language analytical question to a Gemini Data Agent |
| `list_data_agents`        | List configured agents from the YAML registry                     |
| `get_data_agent_config`   | Return redacted configuration for a named agent                   |
| `send_data_agent_message` | Send a message to an A2A-compatible data agent                    |
| `get_operation`           | Retrieve a long-running operation                                 |
| `raw_data_agent_request`  | Raw REST passthrough (disabled by default)                        |

### `query_data_agent`

```json
{
  "agent": "sales-prod",
  "prompt": "Why did revenue decline last week? Identify top contributing products.",
  "api_version": "v1beta",
  "timeout_seconds": 120
}
```

Response includes natural-language answer, generated query, intent explanation, query result, disambiguation questions, and diagnostics.

### `send_data_agent_message`

```json
{
  "agent": "sales-prod",
  "message": "Identify the top 5 anomalies in gross margin this quarter.",
  "blocking": true
}
```

Requires `capabilities.a2a_send: true` in the agent config.

---

## MCP Resources

| URI                                               | Description                               |
| ------------------------------------------------- | ----------------------------------------- |
| `gemini-data-agent://agents`                      | List of all configured agents             |
| `gemini-data-agent://agents/{agent}`              | Redacted config for a named agent         |
| `gemini-data-agent://agents/{agent}/capabilities` | Capabilities for a named agent            |
| `gemini-data-agent://agents/{agent}/auth-policy`  | Non-secret auth posture for a named agent |
| `gemini-data-agent://prompts`                     | List of available prompts                 |

All resources are safe to expose to models — secrets are redacted.

---

## MCP Prompts

| Prompt                         | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `analyze_data_question`        | Direct analytical question to a data agent     |
| `investigate_data_issue`       | Multi-step data issue investigation            |
| `explain_generated_query`      | Explain a generated query from a response      |
| `compare_segments`             | Compare two segments on a metric               |
| `find_anomalies`               | Identify anomalies in a metric                 |
| `prepare_data_analysis_report` | Prepare a structured report from agent outputs |

---

## Security defaults

| Setting                 | Default      |
| ----------------------- | ------------ |
| Secret redaction        | **Enabled**  |
| Audit logging           | **Enabled**  |
| Prompt/response logging | **Disabled** |
| Result persistence      | **Disabled** |
| Raw passthrough         | **Disabled** |

### ⚠ Raw passthrough warning

`raw_data_agent_request` is disabled by default. When enabled, it:

- Requires explicit `allowed_methods` and `allowed_path_patterns`
- Restricts the host to `geminidataanalytics.googleapis.com`
- Emits audit log entries for every call
- Requires `capabilities.raw_passthrough: true` per agent

Do not enable raw passthrough without a reviewed allowlist.

---

## CLI

```bash
# Start the server (stdio transport, default)
node dist/cli.js --config config.yaml

# Validate config without starting
node dist/cli.js validate-config --config config.yaml

# Print resolved config (secrets redacted)
node dist/cli.js inspect-config --config config.yaml
```

Options:

| Flag                | Default       | Description                       |
| ------------------- | ------------- | --------------------------------- |
| `--config`, `-c`    | `config.yaml` | Path to YAML config file          |
| `--log-level`, `-l` | `INFO`        | Log level (DEBUG/INFO/WARN/ERROR) |
| `--transport`, `-t` | `stdio`       | Transport type                    |

---

## Development

```bash
pnpm install
pnpm build        # Build all packages
pnpm test         # Run Vitest tests
pnpm lint         # Trunk linters
pnpm format       # Trunk formatters
```

Package-specific commands:

```bash
pnpm --filter gemini-data-agent-mcp build
pnpm --filter gemini-data-agent-mcp test
```

---

## Testing

All tests are under `packages/gemini-data-agent-mcp/src/__tests__/`.

```bash
pnpm test
```

Integration tests (opt-in, require live GCP credentials):

```bash
RUN_GDA_INTEGRATION_TESTS=1 GDA_MCP_TEST_CONFIG=./config.integration.yaml pnpm test
```

---

## Troubleshooting

**Server fails to start with CONFIG_NOT_FOUND**
: Check the `--config` path. Run `validate-config` first.

**Server fails with CONFIG_VALIDATION_ERROR**
: Run `validate-config` for a human-readable error. Impersonation requires `target_service_account`.

**AUTH_FAILED: Failed to obtain Google credentials**
: Run `gcloud auth application-default login` for local ADC. On GKE/Cloud Run, verify workload identity.

**PERMISSION_DENIED from Google API**
: The service account lacks access to the data agent or its data sources.

**Raw passthrough denied**
: Enable `security.raw_passthrough.enabled` and add matching `allowed_path_patterns`. Also set `capabilities.raw_passthrough: true` for the agent.

---

## License

Apache-2.0
