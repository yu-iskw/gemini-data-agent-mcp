# @gemini-data-agents/admin-mcp

MCP server for **operators**: produce analyst registry YAML artifacts, inspect auth, and manage Gemini Data Agents control-plane resources (lifecycle + IAM writes) on Google Cloud.

**CLI binary:** `gemini-data-agent-admin-mcp`

Role ownership: [ADR 0004](../../docs/adr/0004-mcp-role-tool-ownership.md).

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

Transport: **stdio** (default) or **HTTP** (`--transport http`; see [dual-layer authentication ADR](../../docs/adr/0001-dual-layer-authentication.md)). Logs go to **stderr**; MCP JSON-RPC stays on **stdout** for stdio.

## Configuration

Point `--config` at a YAML file listing your agents.

- Minimal: [examples/admin.config.minimal.yaml](../../examples/admin.config.minimal.yaml)
- Full: [examples/admin.config.full.yaml](../../examples/admin.config.full.yaml)
- JSON Schema: [schemas/app-config.v2.schema.json](../../schemas/app-config.v2.schema.json)

```yaml
# yaml-language-server: $schema=../schemas/app-config.v2.schema.json
api_version: v1beta

agents:
  my-agent:
    data_agent: projects/my-gcp-project/locations/us-central1/dataAgents/my-agent
    tools:
      - query_data_agent
```

The optional **`agent`** parameter on Google-backed tools selects a registry key for credentials and API version (defaults to the first configured agent). Registry YAML tools use the loaded server config.

## Authentication

Use ADC by default (`gcloud auth application-default login`). Set **`impersonate_service_account`** per agent for CI or shared runners (grant `roles/iam.serviceAccountTokenCreator`).

Use **`gda.auth.inspect`** to confirm auth mode and request header keys (no secret material returned).

## Governance

**Administer plane** — publish (`gda.data_agents.patch` with `dataAnalyticsAgent.publishedContext`), **IAM write** (`set_iam_policy`), delete, and registry YAML. Sharing with consumers is done via IAM so they use **analyst-mcp** against published config. See [ADR 0005](../../docs/adr/0005-mcp-governance-trust-boundaries.md).

## MCP tools

The server registers **11 tools** in two groups. Metadata lives in `src/admin-tools.ts` and `src/admin-rfc-tools.ts`.

---

### Registry and local validation (5)

No Gemini Data Agents API calls.

#### `gda.registry.generate_analyst_yaml`

Serialize the loaded configuration as analyst-safe YAML for manual Git commit.

| Parameter           | Required | Description                                                                                     |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `use_loaded_config` | no       | When `true` (default), use the server’s loaded config. Inline-only generation is not supported. |

**Returns:** YAML text.

---

#### `gda.registry.validate_analyst_yaml`

Parse and validate YAML against the shared analyst registry schema.

| Parameter | Required | Description              |
| --------- | -------- | ------------------------ |
| `yaml`    | yes      | Full YAML document text. |

**Returns:** JSON `{ valid: true, agent_count: number }`.

---

#### `gda.registry.diff_analyst_yaml`

Unified line-oriented diff between two YAML strings.

| Parameter  | Required | Description        |
| ---------- | -------- | ------------------ |
| `baseline` | yes      | Baseline YAML text |
| `proposed` | yes      | Proposed YAML text |

**Returns:** Unified diff text.

---

#### `gda.auth.inspect`

Resolve credentials and report auth mode (no secrets).

| Parameter | Required | Description                                           |
| --------- | -------- | ----------------------------------------------------- |
| `agent`   | no       | Registry key; defaults to the first configured agent. |

**Returns:** JSON `{ agent, auth_mode, request_header_keys }`.

---

#### `gda.registry.dry_run_agent_change`

Validate a proposed agent merged into a copy of the loaded config (no remote API).

| Parameter        | Required | Description                          |
| ---------------- | -------- | ------------------------------------ |
| `agent_name`     | yes      | Registry key for the agent.          |
| `proposed_agent` | yes      | YAML-shaped agent object to validate |

**Returns:** JSON `{ valid: true, message: "..." }`.

---

### Google control plane (6)

Calls `geminidataanalytics.googleapis.com`. Mutations are MCP-annotated (`delete` is destructive). **Create** is on [`agentops-mcp`](../agentops-mcp/README.md) (`gda.data_agents.create`).

#### `gda.data_agents.list`

List Data Agents in a project and location.

| Parameter    | Required | Description                                 |
| ------------ | -------- | ------------------------------------------- |
| `project`    | yes      | GCP project ID                              |
| `location`   | yes      | GCP location (e.g. `global`, `us-central1`) |
| `page_size`  | no       | Pagination page size                        |
| `page_token` | no       | Pagination token                            |
| `filter`     | no       | API filter expression                       |
| `agent`      | no       | Registry key for credentials                |

**Returns:** JSON `{ agents: [...], nextPageToken? }`.

---

#### `gda.data_agents.get`

Get one Data Agent by full resource name.

| Parameter | Required | Description                                                      |
| --------- | -------- | ---------------------------------------------------------------- |
| `name`    | yes      | Full resource name (`projects/.../locations/.../dataAgents/...`) |
| `agent`   | no       | Registry key for credentials                                     |

**Returns:** Full `DataAgent` resource.

---

#### `gda.data_agents.patch`

Update a Data Agent (including published configuration). Operators publish by patching `dataAnalyticsAgent.publishedContext`.

| Parameter     | Required | Description                       |
| ------------- | -------- | --------------------------------- |
| `name`        | yes      | Full Data Agent resource name     |
| `data_agent`  | yes      | Partial `DataAgent` body (object) |
| `update_mask` | no       | Protobuf field mask               |
| `agent`       | no       | Registry key for credentials      |

**Returns:** Updated `DataAgent` resource.

---

#### `gda.data_agents.delete`

Delete a Data Agent.

| Parameter | Required | Description                   |
| --------- | -------- | ----------------------------- |
| `name`    | yes      | Full Data Agent resource name |
| `agent`   | no       | Registry key for credentials  |

**Returns:** JSON `{ deleted: true, name: "..." }`.

---

#### `gda.data_agents.set_iam_policy`

Set IAM policy (IAM **write**).

| Parameter  | Required | Description                                                  |
| ---------- | -------- | ------------------------------------------------------------ |
| `resource` | yes      | Full Data Agent resource name                                |
| `policy`   | yes      | IAM policy (`bindings`, optional `etag`, optional `version`) |
| `agent`    | no       | Registry key for credentials                                 |

**Returns:** Applied IAM policy.

IAM **read** is on [`audit-mcp`](../audit-mcp/README.md) as `gda.data_agents.get_iam_policy`.

---

#### `gda.operations.get`

Get a long-running operation.

| Parameter | Required | Description                                         |
| --------- | -------- | --------------------------------------------------- |
| `name`    | yes      | Full operation name (`projects/.../operations/...`) |
| `agent`   | no       | Registry key for credentials                        |

**Returns:** Operation resource.

---

## What this server does not expose

| Capability                                                           | Package                                     |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Analyst session tools (`gda.sessions.*`, `gda.data_agents.query`, …) | [`analyst-mcp`](../analyst-mcp/README.md)   |
| Audit governance tools                                               | [`audit-mcp`](../audit-mcp/README.md)       |
| Develop / offline eval                                               | [`agentops-mcp`](../agentops-mcp/README.md) |
| MCP resources or prompts                                             | Not implemented                             |

The admin server does **not** auto-commit YAML to Git.

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

[README](../../README.md) · [CONTRIBUTING](../../CONTRIBUTING.md)

```bash
pnpm --filter @gemini-data-agents/admin-mcp build
node packages/admin-mcp/dist/cli.js --config config.yaml
pnpm smoke:mcp:admin
```

## Related packages

| Package                                                         | Role                    |
| --------------------------------------------------------------- | ----------------------- |
| [`@gemini-data-agents/analyst-mcp`](../analyst-mcp/README.md)   | Use (analyst chat)      |
| [`@gemini-data-agents/audit-mcp`](../audit-mcp/README.md)       | Analyze (governance)    |
| [`@gemini-data-agents/agentops-mcp`](../agentops-mcp/README.md) | Develop (staging, eval) |

## License

Apache-2.0
