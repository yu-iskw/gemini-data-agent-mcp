# @gemini-data-agents/agentops-mcp

MCP server for **AgentOps**: offline evaluation case validation, result summarization, and stub evaluation runs for Gemini Data Agents (stdio transport).

**CLI binary:** `gemini-data-agent-agentops-mcp`

## Installation

```bash
npm install -g @gemini-data-agents/agentops-mcp
```

Verify:

```bash
gemini-data-agent-agentops-mcp --help
```

## MCP client configuration

```json
{
  "mcpServers": {
    "gemini-data-agent-agentops": {
      "command": "gemini-data-agent-agentops-mcp",
      "args": ["--config", "/absolute/path/to/config.yaml"]
    }
  }
}
```

Transport: **stdio** only (default). Logs go to **stderr**; MCP JSON-RPC stays on **stdout**.

## Configuration

Point `--config` at a YAML file listing your agents.

- Minimal: [examples/agentops.config.minimal.yaml](../../examples/agentops.config.minimal.yaml)
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

## Authentication

ADC and **`impersonate_service_account`** follow the shared v2 config schema. The current offline-eval tools run **locally** and do not call the Gemini Data Agents API except where noted below.

## MCP tools

The server registers **3 tools** for offline evaluation workflows.

| Tool                                     | Purpose                                     | Key parameters                                         |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| `agentops.offline_eval.validate_cases`   | Validate eval cases locally (no remote API) | `cases` (array of `{ id, input }`)                     |
| `agentops.offline_eval.summarize_result` | Summarize a run with pass/fail counts       | `run_id`, optional `cases`, `pass_count`, `fail_count` |
| `agentops.offline_eval.run`              | Queue a stub offline evaluation             | `data_agent`, `cases`                                  |

### Stub behavior

`agentops.offline_eval.run` validates cases locally, then uses an in-process evaluation client stub. It returns a **pending** status rather than executing live agent queries. Use this slice to wire MCP clients and case schemas before connecting to a full evaluation backend.

## What this server does not expose

| Capability                     | Reason                                                            |
| ------------------------------ | ----------------------------------------------------------------- |
| Live `query_data_agent` / chat | See [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md) |
| Audit inventory or governance  | See [`@gemini-data-agents/audit-mcp`](../audit-mcp/README.md)     |
| Registry YAML tools            | See [`@gemini-data-agents/admin-mcp`](../admin-mcp/README.md)     |
| MCP resources or prompts       | Not implemented on this server                                    |

## Security defaults

| Setting                  | Default        |
| ------------------------ | -------------- |
| Secret redaction         | Enabled        |
| Audit logging            | Enabled        |
| Prompt/response in audit | Disabled       |
| Raw REST passthrough     | Not registered |

## CLI reference

```bash
gemini-data-agent-agentops-mcp --config config.yaml
```

## Monorepo development

Full repository docs: [README](../../README.md) (end users) and [CONTRIBUTING](../../CONTRIBUTING.md) (developers).

```bash
pnpm --filter @gemini-data-agents/agentops-mcp build
node packages/agentops-mcp/dist/cli.js --config config.yaml
```

## Related packages

| Package                                                       | Audience                |
| ------------------------------------------------------------- | ----------------------- |
| [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md) | Data analysts           |
| [`@gemini-data-agents/admin-mcp`](../admin-mcp/README.md)     | Operators               |
| [`@gemini-data-agents/audit-mcp`](../audit-mcp/README.md)     | Auditors and governance |

## License

Apache-2.0
