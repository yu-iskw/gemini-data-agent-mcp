# @gemini-data-agents/audit-mcp

MCP server for **auditors and governance**: read-only review of Gemini Data Agents usage, conversations, inventory, IAM access, datasources, and governance reports.

**CLI binary:** `gemini-data-agent-audit-mcp`

Role ownership: [ADR 0004](../../docs/adr/0004-mcp-role-tool-ownership.md).

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

Transport: **stdio** (default) or **HTTP** (`--transport http`; see [dual-layer authentication ADR](../../docs/adr/0001-dual-layer-authentication.md)). Logs go to **stderr**; MCP JSON-RPC stays on **stdout** for stdio.

## Configuration

- Minimal: [examples/audit.config.minimal.yaml](../../examples/audit.config.minimal.yaml)
- JSON Schema: [schemas/app-config.v2.schema.json](../../schemas/app-config.v2.schema.json)

```yaml
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/global/dataAgents/my-agent
    tools:
      - query_data_agent
```

The optional **`agent`** parameter selects a registry key for credentials and API version (defaults to the first configured agent).

## Authentication

ADC by default (`gcloud auth application-default login`). Optional **`impersonate_service_account`** per agent.

Deploy credentials with read-only IAM where possible (`dataAgents.get`, `getIamPolicy`, `conversations.list`, etc.).

## Governance

**Analyze plane** — read-only tools for inventory, IAM read, usage, and governance reports. No mutations. See [ADR 0005](../../docs/adr/0005-mcp-governance-trust-boundaries.md).

## MCP tools

The server registers **8 read-only tools**. Metadata lives in `src/audit-tools.ts`.

---

### `gda.conversations.list`

List conversations for audit review.

| Parameter    | Required | Description                  |
| ------------ | -------- | ---------------------------- |
| `project`    | yes      | GCP project ID               |
| `location`   | yes      | GCP location                 |
| `page_size`  | no       | Pagination page size         |
| `page_token` | no       | Pagination token             |
| `filter`     | no       | API filter expression        |
| `agent`      | no       | Registry key for credentials |

**Returns:** `ListConversationsResponse` from the API.

---

### `gda.conversation_messages.list`

List messages in a conversation.

| Parameter      | Required | Description                     |
| -------------- | -------- | ------------------------------- |
| `conversation` | yes      | Full conversation resource name |
| `page_size`    | no       | Pagination page size            |
| `page_token`   | no       | Pagination token                |
| `filter`       | no       | API filter expression           |
| `agent`        | no       | Registry key for credentials    |

**Returns:** `ListConversationMessagesResponse` from the API.

---

### `gda.data_agents.inventory`

Inventory Data Agents with governance-oriented summary metadata.

| Parameter    | Required | Description                  |
| ------------ | -------- | ---------------------------- |
| `project`    | yes      | GCP project ID               |
| `location`   | yes      | GCP location                 |
| `page_size`  | no       | Pagination page size         |
| `page_token` | no       | Pagination token             |
| `agent`      | no       | Registry key for credentials |

**Returns:** JSON `{ count, agents: [...], nextPageToken? }` with flags such as `missingDescription` and `missingOwnerLabel`.

---

### `gda.data_agents.list_accessible`

List Data Agents accessible to the caller (`dataAgents.listAccessible`).

| Parameter    | Required | Description                  |
| ------------ | -------- | ---------------------------- |
| `project`    | yes      | GCP project ID               |
| `location`   | yes      | GCP location                 |
| `page_size`  | no       | Pagination page size         |
| `page_token` | no       | Pagination token             |
| `filter`     | no       | API filter expression        |
| `agent`      | no       | Registry key for credentials |

**Returns:** JSON `{ agents: [...], nextPageToken? }`.

---

### `gda.data_agents.datasources`

Summarize datasource references (BigQuery tables, Looker explores, database tables) from agent config.

| Parameter | Required | Description                   |
| --------- | -------- | ----------------------------- |
| `name`    | yes      | Full Data Agent resource name |
| `agent`   | no       | Registry key for credentials  |

**Returns:** `AgentDatasourceSummary`:

```json
{
  "name": "projects/.../dataAgents/...",
  "published": {
    "bigQueryTables": [{ "projectId": "...", "datasetId": "...", "tableId": "..." }],
    "lookerExplores": [{ "lookmlModel": "...", "explore": "..." }],
    "databaseTables": [{ "tableId": "..." }]
  },
  "staging": null
}
```

Empty contexts are returned as `null`.

---

### `gda.data_agents.get_iam_policy`

Get IAM policy for a Data Agent (who can use the agent). Moved from admin-mcp per ADR-0004.

| Parameter  | Required | Description                   |
| ---------- | -------- | ----------------------------- |
| `resource` | yes      | Full Data Agent resource name |
| `agent`    | no       | Registry key for credentials  |

**Returns:** IAM policy (`bindings`, optional `etag`, optional `version`).

---

### `gda.data_agents.usage`

Summarize per-agent conversation activity within a time window (default 30 days).

| Parameter             | Required | Description                                                     |
| --------------------- | -------- | --------------------------------------------------------------- |
| `project`             | yes      | GCP project ID                                                  |
| `location`            | yes      | GCP location                                                    |
| `window_days`         | no       | Usage window in days (default `30`)                             |
| `name`                | no       | Optional single Data Agent; when omitted, scores full inventory |
| `conversation_filter` | no       | Optional `conversations.list` filter (API syntax)               |
| `agent`               | no       | Registry key for credentials                                    |

**Returns:** JSON `{ windowDays, agents: AgentUsageSummary[], conversationsTruncated? }` where each agent includes `usedInWindow`, `conversationCountInWindow`, `lastActivityAt`, and `confidence` (`medium` when conversation→agent linkage is explicit).

---

### `gda.governance_reports.generate`

Generate a governance report from paginated inventory plus per-agent usage summaries.

| Parameter             | Required | Description                                                 |
| --------------------- | -------- | ----------------------------------------------------------- |
| `project`             | yes      | GCP project ID                                              |
| `location`            | yes      | GCP location                                                |
| `usage_window_days`   | no       | Usage window in days (default `30`)                         |
| `conversation_filter` | no       | Optional filter for `conversations.list` when scoring usage |
| `agent`               | no       | Registry key for credentials                                |

**Returns:** `GovernanceReport` including:

| Field                      | Meaning                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `summary.dataAgentCount`   | Agents in inventory                                                        |
| `summary.usageWindowDays`  | Conversation activity window (days)                                        |
| `summary.unusedAgentCount` | Agents with no conversation activity in the window                         |
| `summary.findingCount`     | Inventory findings count                                                   |
| `agentUsage`               | Per-agent usage summaries (`usedInWindow`, `conversationCountInWindow`, …) |
| `findings`                 | Structured inventory findings                                              |
| `evidence`                 | Data agent resource names cited                                            |
| `possiblyUnused`           | Agents with `usedInWindow === false` (`confidence: low`)                   |
| `possiblyUnusedTruncated`  | `true` when the list was capped (max 100 entries)                          |
| `inventoryTruncated`       | `true` when inventory pagination hit the internal page cap                 |
| `conversationsTruncated`   | `true` when conversation pagination hit the internal page cap              |

Usage is derived from **conversations** (`updateTime` / `createTime` in code); REST has no `lastUsed` field.

---

## What this server does not expose

| Capability                        | Package                                     |
| --------------------------------- | ------------------------------------------- |
| Analyst query/session tools       | [`analyst-mcp`](../analyst-mcp/README.md)   |
| Registry YAML / lifecycle writes  | [`admin-mcp`](../admin-mcp/README.md)       |
| Develop / offline eval            | [`agentops-mcp`](../agentops-mcp/README.md) |
| Mutating lifecycle or IAM changes | Audit slice is read-oriented only           |

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

```bash
pnpm --filter @gemini-data-agents/audit-mcp build
node packages/audit-mcp/dist/cli.js --config config.yaml
pnpm smoke:mcp:audit
```

## Related packages

| Package                                                         | Role       |
| --------------------------------------------------------------- | ---------- |
| [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md)   | Use        |
| [`@gemini-data-agents/admin-mcp`](../admin-mcp/README.md)       | Administer |
| [`@gemini-data-agents/agentops-mcp`](../agentops-mcp/README.md) | Develop    |

## License

Apache-2.0
