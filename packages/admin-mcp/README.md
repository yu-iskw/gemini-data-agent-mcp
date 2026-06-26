# @gemini-data-agents/admin-mcp

MCP server for **operators**: produce analyst registry YAML artifacts, inspect auth, and read Gemini Data Agents control-plane resources on Google Cloud (stdio transport).

**CLI binary:** `gemini-data-agent-admin-mcp`

## Installation

```bash
npm install -g @gemini-data-agents/admin-mcp
```

Verify:

```bash
gemini-data-agent-admin-mcp --help
gemini-data-agent-admin-mcp validate-config --config /path/to/config.yaml
```

## MCP client configuration

```json
{
  "mcpServers": {
    "gemini-data-agent-admin": {
      "command": "gemini-data-agent-admin-mcp",
      "args": ["--config", "/absolute/path/to/config.yaml"]
    }
  }
}
```

Transport: **stdio** only (default). Logs go to **stderr**; MCP JSON-RPC stays on **stdout**.

## Configuration

Point `--config` at a YAML file listing your agents.

- Minimal: [examples/admin.config.minimal.yaml](../../examples/admin.config.minimal.yaml)
- Full: [examples/admin.config.full.yaml](../../examples/admin.config.full.yaml)
- JSON Schema: [schemas/app-config.v2.schema.json](../../schemas/app-config.v2.schema.json)

Minimal shape:

```yaml
# yaml-language-server: $schema=../schemas/app-config.v2.schema.json
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/us-central1/dataAgents/my-agent
    tools:
      - query_data_agent
```

The `agent` parameter on Google-backed tools selects a configured registry key. Registry YAML tools operate on the loaded server config.

## Authentication

Use ADC by default (`gcloud auth application-default login`). Set **`impersonate_service_account`** per agent for CI or shared runners (grant `roles/iam.serviceAccountTokenCreator`).

Use **`inspect_admin_auth`** to confirm which auth mode and request header keys resolve for a named agent (no secret material returned).

## MCP tools

The server registers **9 tools** in two groups.

### Registry and local validation (5)

| Tool                             | Purpose                                                                | Key parameters                       |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `generate_analyst_registry_yaml` | Serialize the loaded config as analyst-safe YAML for manual Git commit | `use_loaded_config` (default `true`) |
| `validate_analyst_registry_yaml` | Parse and validate YAML against the shared registry schema             | `yaml`                               |
| `diff_analyst_registry_yaml`     | Line-oriented diff between two YAML strings                            | `baseline`, `proposed`               |
| `inspect_admin_auth`             | Resolve credentials and report auth mode (no secrets)                  | `agent` (optional)                   |
| `dry_run_data_agent_change`      | Validate a proposed agent merged into a config copy (no remote API)    | `agent_name`, `proposed_agent`       |

### Google control plane (read-only, 4)

| Tool                         | Purpose                                    | Key parameters                                    |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------- |
| `data_agents.list`           | List Data Agents in a project and location | `project`, `location`, `agent`, pagination/filter |
| `data_agents.get`            | Get one Data Agent by full resource name   | `name`, `agent`                                   |
| `data_agents.get_iam_policy` | Get IAM policy for a Data Agent            | `resource`, `agent`                               |
| `operations.get`             | Get a long-running operation               | `name`, `agent`                                   |

## What this server does not expose

| Capability                                                 | Reason                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Analyst session tools (`session_*`, `query_data_agent`, …) | See [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md)   |
| Audit governance tools                                     | See [`@gemini-data-agents/audit-mcp`](../audit-mcp/README.md)       |
| Offline evaluation                                         | See [`@gemini-data-agents/agentops-mcp`](../agentops-mcp/README.md) |
| MCP resources or prompts                                   | Not implemented on this server                                      |

The admin server does **not** auto-commit YAML to Git; operators copy generated YAML into version control manually.

## Security defaults

| Setting                  | Default        |
| ------------------------ | -------------- |
| Secret redaction         | Enabled        |
| Audit logging            | Enabled        |
| Prompt/response in audit | Disabled       |
| Raw REST passthrough     | Not registered |

## CLI reference

```bash
gemini-data-agent-admin-mcp --config config.yaml
gemini-data-agent-admin-mcp validate-config --config config.yaml
gemini-data-agent-admin-mcp inspect-config --config config.yaml
```

## Monorepo development

Full repository docs: [README](../../README.md) (end users) and [CONTRIBUTING](../../CONTRIBUTING.md) (developers).

```bash
pnpm --filter @gemini-data-agents/admin-mcp build
node packages/admin-mcp/dist/cli.js --config config.yaml
```

## Related packages

| Package                                                         | Audience                |
| --------------------------------------------------------------- | ----------------------- |
| [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md)   | Data analysts           |
| [`@gemini-data-agents/audit-mcp`](../audit-mcp/README.md)       | Auditors and governance |
| [`@gemini-data-agents/agentops-mcp`](../agentops-mcp/README.md) | AgentOps / offline eval |

## License

Apache-2.0
