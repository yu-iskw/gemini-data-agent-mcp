# @gemini-data-agents/agentops-mcp

MCP server for **AgentOps / developers**: inspect and patch staging configuration, run behavior chat tests, and prepare offline evaluation cases locally.

**CLI binary:** `gemini-data-agent-agentops-mcp`

Role ownership: [ADR 0004](../../docs/adr/0004-mcp-role-tool-ownership.md).

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

Transport: **stdio** (default) or **HTTP** (`--transport http`; see [dual-layer authentication ADR](../../docs/adr/0001-dual-layer-authentication.md)). Logs go to **stderr**; MCP JSON-RPC stays on **stdout** for stdio.

## Configuration

- Minimal: [examples/agentops.config.minimal.yaml](../../examples/agentops.config.minimal.yaml)
- JSON Schema: [schemas/app-config.v2.schema.json](../../schemas/app-config.v2.schema.json)

```yaml
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/global/dataAgents/my-agent
    tools:
      - query_data_agent
```

The optional **`agent`** parameter selects credentials and API version for Google-backed tools.

## Authentication

ADC and **`impersonate_service_account`** follow the shared v2 config schema. Offline-eval tools run locally except where noted below.

## Governance

**Develop plane** — create agents and edit **staging** only. Patch masks are restricted to `stagingContext` and metadata fields; `publishedContext` is rejected. `gda.locations.chat_staging` accepts `STAGING` or `CONTEXT_VERSION_UNSPECIFIED` only. No IAM, publish, or delete tools. See [ADR 0005](../../docs/adr/0005-mcp-governance-trust-boundaries.md).

## MCP tools

The server registers **7 tools**. Metadata lives in `src/agentops-tools.ts`.

### Develop workflow

1. `gda.data_agents.create` — provision a new agent in a project/location
2. `gda.data_agents.get` — compare `stagingContext` vs `publishedContext`
3. `gda.data_agents.patch_staging` — edit staging (defaults `update_mask` to `dataAnalyticsAgent.stagingContext`)
4. `gda.locations.chat_staging` — single-turn test (`context_version` defaults to `STAGING`)
5. `gda.offline_eval.validate_cases` — validate case files locally

---

#### `gda.data_agents.create`

Create a Gemini Data Agent (develop workflow).

| Parameter    | Required | Description                        |
| ------------ | -------- | ---------------------------------- |
| `project`    | yes      | GCP project ID                     |
| `location`   | yes      | GCP location                       |
| `data_agent` | yes      | `DataAgent` resource body (object) |
| `agent`      | no       | Registry key for credentials       |

**Returns:** Created `DataAgent` resource.

---

#### `gda.data_agents.get`

Get a Gemini Data Agent (inspect staging vs published context).

| Parameter | Required | Description                   |
| --------- | -------- | ----------------------------- |
| `name`    | yes      | Full Data Agent resource name |
| `agent`   | no       | Registry key for credentials  |

**Returns:** Full `DataAgent` resource from the API.

---

#### `gda.data_agents.patch_staging`

Update a Data Agent for **staging** development.

| Parameter     | Required | Description                                                                                                                    |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | yes      | Full Data Agent resource name                                                                                                  |
| `data_agent`  | yes      | Partial `DataAgent` body (object)                                                                                              |
| `update_mask` | no       | Field mask; defaults to `dataAnalyticsAgent.stagingContext`. Allowed: `stagingContext`, `displayName`, `description`, `labels` |
| `agent`       | no       | Registry key for credentials                                                                                                   |

**Returns:** Updated `DataAgent` resource.

---

#### `gda.locations.chat_staging`

Single-turn chat against a Data Agent for behavior testing (`locations:chat`).

| Parameter         | Required | Description                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- |
| `data_agent`      | yes      | Full Data Agent resource name                                                                 |
| `prompt`          | yes      | Test prompt for this chat turn                                                                |
| `context_version` | no       | `CONTEXT_VERSION_UNSPECIFIED` or `STAGING` (default). `PUBLISHED` is not allowed on agentops. |
| `agent`           | no       | Registry key for credentials                                                                  |
| `timeout_seconds` | no       | 1–600 seconds                                                                                 |

**Returns:** JSON `{ response: ... }` from the chat API.

---

#### `gda.offline_eval.validate_cases`

Validate offline evaluation cases locally (no remote API).

| Parameter | Required | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `cases`   | yes      | Array of `{ id, input, expectedOutput?, metadata? }` (min 1) |

**Returns:** JSON `{ valid: true, caseCount: number }`.

---

#### `gda.offline_eval.summarize_result`

Summarize an offline evaluation run.

| Parameter    | Required | Description                         |
| ------------ | -------- | ----------------------------------- |
| `run_id`     | yes      | Run identifier                      |
| `cases`      | no       | Case array (same shape as validate) |
| `pass_count` | no       | Passed case count                   |
| `fail_count` | no       | Failed case count                   |

When `cases` is non-empty, provide `pass_count` and/or `fail_count`.

**Returns:** JSON `{ runId, caseCount, passCount, failCount, findings: string[] }`.

---

#### `gda.offline_eval.run`

Queue a **stub** offline evaluation (no live agent execution).

| Parameter    | Required | Description                   |
| ------------ | -------- | ----------------------------- |
| `data_agent` | yes      | Full Data Agent resource name |
| `cases`      | yes      | Case array (min 1)            |

**Returns:** JSON `{ runId, status: "pending", message }`.

Agent Platform / Vertex offline eval is deferred per [ADR 0004](../../docs/adr/0004-mcp-role-tool-ownership.md).

---

## What this server does not expose

| Capability                          | Package                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Multi-turn analyst sessions         | [`analyst-mcp`](../analyst-mcp/README.md)                                      |
| Audit inventory / IAM read          | [`audit-mcp`](../audit-mcp/README.md)                                          |
| Lifecycle create/delete / IAM write | [`admin-mcp`](../admin-mcp/README.md) (delete/IAM only; create is on agentops) |
| MCP resources or prompts            | Not implemented                                                                |

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

```bash
pnpm --filter @gemini-data-agents/agentops-mcp build
node packages/agentops-mcp/dist/cli.js --config config.yaml
pnpm smoke:mcp:agentops
```

## Related packages

| Package                                                       | Role       |
| ------------------------------------------------------------- | ---------- |
| [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md) | Use        |
| [`@gemini-data-agents/admin-mcp`](../admin-mcp/README.md)     | Administer |
| [`@gemini-data-agents/audit-mcp`](../audit-mcp/README.md)     | Analyze    |

## License

Apache-2.0
