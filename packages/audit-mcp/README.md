# @gemini-data-agents/audit-mcp

MCP server for **auditors and governance**: read-only review of Gemini Data Agents usage, conversations, inventory, and governance reports on Google Cloud (stdio transport).

**CLI binary:** `gemini-data-agent-audit-mcp`

## Installation

```bash
npm install -g @gemini-data-agents/audit-mcp
```

Verify:

```bash
gemini-data-agent-audit-mcp --help
```

## MCP client configuration

```json
{
  "mcpServers": {
    "gemini-data-agent-audit": {
      "command": "gemini-data-agent-audit-mcp",
      "args": ["--config", "/absolute/path/to/config.yaml"]
    }
  }
}
```

Transport: **stdio** only (default). Logs go to **stderr**; MCP JSON-RPC stays on **stdout**.

## Configuration

Point `--config` at a YAML file listing your agents.

- Minimal: [examples/audit.config.minimal.yaml](../../examples/audit.config.minimal.yaml)
- JSON Schema: [schemas/app-config.v2.schema.json](../../schemas/app-config.v2.schema.json)

Minimal shape:

```yaml
# yaml-language-server: $schema=../schemas/app-config.v2.schema.json
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/global/dataAgents/my-agent
    tools:
      - query_data_agent
```

The `agent` parameter on each tool selects a configured registry key used for auth and API version resolution.

## Authentication

Use ADC by default (`gcloud auth application-default login`). Set **`impersonate_service_account`** per agent for CI or shared runners (grant `roles/iam.serviceAccountTokenCreator`).

## MCP tools

The server registers **4 read-only tools**.

| Tool                               | Purpose                                               | Key parameters                                    |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `audit.conversations.list`         | List conversations for audit review                   | `project`, `location`, `agent`, pagination/filter |
| `audit.messages.list`              | List messages in a conversation                       | `conversation`, `agent`, pagination/filter        |
| `audit.data_agents.inventory`      | Inventory Data Agents with summary metadata           | `project`, `location`, `agent`, pagination        |
| `audit.governance_report.generate` | Generate a governance report from paginated inventory | `project`, `location`, `agent`                    |

`audit.governance_report.generate` fetches all inventory pages (sequential API calls) and returns findings such as missing descriptions or owner labels.

## What this server does not expose

| Capability                        | Reason                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| Analyst query/session tools       | See [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md)   |
| Registry YAML generation          | See [`@gemini-data-agents/admin-mcp`](../admin-mcp/README.md)       |
| Offline evaluation                | See [`@gemini-data-agents/agentops-mcp`](../agentops-mcp/README.md) |
| Mutating lifecycle or IAM changes | Audit slice is read-oriented only                                   |
| MCP resources or prompts          | Not implemented on this server                                      |

## Security defaults

| Setting                  | Default        |
| ------------------------ | -------------- |
| Secret redaction         | Enabled        |
| Audit logging            | Enabled        |
| Prompt/response in audit | Disabled       |
| Raw REST passthrough     | Not registered |

## CLI reference

```bash
gemini-data-agent-audit-mcp --config config.yaml
```

## Monorepo development

Full repository docs: [README](../../README.md) (end users) and [CONTRIBUTING](../../CONTRIBUTING.md) (developers).

```bash
pnpm --filter @gemini-data-agents/audit-mcp build
node packages/audit-mcp/dist/cli.js --config config.yaml
```

## Related packages

| Package                                                         | Audience                |
| --------------------------------------------------------------- | ----------------------- |
| [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md)   | Data analysts           |
| [`@gemini-data-agents/admin-mcp`](../admin-mcp/README.md)       | Operators               |
| [`@gemini-data-agents/agentops-mcp`](../agentops-mcp/README.md) | AgentOps / offline eval |

## License

Apache-2.0
