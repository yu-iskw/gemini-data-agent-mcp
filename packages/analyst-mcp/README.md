# @gemini-data-agents/analyst-mcp

MCP server for **data analysts** and coding agents: query [Gemini Data Agents](https://cloud.google.com/gemini/docs/conversational-analytics-api/overview) on Google Cloud, manage multi-client **shared sessions**, and read a **static YAML agent registry** (stdio transport).

**CLI binary:** `gemini-data-analyst-mcp` (unchanged; the npm package name is `@gemini-data-agents/analyst-mcp`).

## Installation

```bash
npm install -g @gemini-data-agents/analyst-mcp
```

Verify:

```bash
gemini-data-analyst-mcp --help
gemini-data-analyst-mcp validate-config --config /path/to/config.yaml
```

## MCP client configuration

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

Transport: **stdio** only (default). Logs go to **stderr**; MCP JSON-RPC stays on **stdout**.

## Configuration

Point `--config` at a YAML file listing your agents.

- Minimal: [examples/analyst.config.minimal.yaml](../../examples/analyst.config.minimal.yaml)
- Full: [examples/analyst.config.full.yaml](../../examples/analyst.config.full.yaml)
- JSON Schema: [schemas/app-config.v2.schema.json](../../schemas/app-config.v2.schema.json) (regenerate with `pnpm schema:export`)

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

Per-agent **`tools`** gate which data-agent API tools succeed. Session and registry tools are always available. The analyst server does **not** register raw REST passthrough.

## Authentication

Use ADC by default (`gcloud auth application-default login`). Set **`impersonate_service_account`** per agent for CI or shared runners (grant `roles/iam.serviceAccountTokenCreator`).

## MCP tools

The server registers **13 tools** in two groups. Descriptions match the MCP tool metadata in `src/tools.ts`.

### Session identity envelope

All **session collaboration** tools require an identity envelope on every call (used for ACL and audit):

| Parameter      | Required | Description                                   |
| -------------- | -------- | --------------------------------------------- |
| `tenant_id`    | yes      | Tenant identifier                             |
| `user_id`      | yes      | User identifier                               |
| `client_name`  | yes      | Calling client (e.g. `cursor`, `claude-code`) |
| `workspace_id` | no       | Optional workspace scope                      |

Mutating session tools use **optimistic concurrency**: pass `expected_revision` from the last successful response; stale revisions return `CONFLICT`.

---

### Data agent tools (7)

Tools that call the Gemini Data Agents API using agents from your YAML registry.

#### `query_data_agent`

Ask a natural-language analytical question to a configured Gemini Data Agent.

| Parameter            | Required | Description                                    |
| -------------------- | -------- | ---------------------------------------------- |
| `agent`              | yes      | Configured data agent name                     |
| `prompt`             | yes      | Natural-language analytical question           |
| `api_version`        | no       | `v1`, `v1beta`, or `v1alpha`                   |
| `generation_options` | no       | Gemini Data Agents generation options (object) |
| `context`            | no       | Optional `queryData` context object            |
| `timeout_seconds`    | no       | 1–600 seconds                                  |

**Capability:** `query_data_agent` must be in the agent `tools` list.

---

#### `chat_data_agent`

Chat with a configured Gemini Data Agent, optionally continuing a persisted conversation.

| Parameter         | Required | Description                                              |
| ----------------- | -------- | -------------------------------------------------------- |
| `agent`           | yes      | Configured data agent name                               |
| `prompt`          | yes      | User prompt for this chat turn                           |
| `conversation`    | no       | Conversation resource name or ID                         |
| `context_version` | no       | `CONTEXT_VERSION_UNSPECIFIED`, `STAGING`, or `PUBLISHED` |
| `thinking_mode`   | no       | `THINKING_MODE_UNSPECIFIED`, `FAST`, or `THINKING`       |
| `api_version`     | no       | API version override                                     |
| `timeout_seconds` | no       | 1–600 seconds                                            |

**Tool:** `chat_data_agent` must be in the agent `tools` list.

---

#### `create_data_agent_conversation`

Create a managed conversation for multi-turn chat with a configured data agent.

| Parameter         | Required | Description                                        |
| ----------------- | -------- | -------------------------------------------------- |
| `agent`           | yes      | Configured data agent name                         |
| `conversation_id` | no       | Custom conversation ID (auto-generated if omitted) |
| `request_id`      | no       | Idempotency key for safe retries                   |
| `api_version`     | no       | API version override                               |
| `timeout_seconds` | no       | 1–600 seconds                                      |

**Tool:** `chat_data_agent` must be in the agent `tools` list.

---

#### `list_conversation_messages`

List stored messages for a managed conversation.

| Parameter         | Required | Description                      |
| ----------------- | -------- | -------------------------------- |
| `agent`           | yes      | Configured data agent name       |
| `conversation`    | yes      | Conversation resource name or ID |
| `page_size`       | no       | 1–100                            |
| `page_token`      | no       | Pagination token                 |
| `filter`          | no       | Message filter expression        |
| `api_version`     | no       | API version override             |
| `timeout_seconds` | no       | 1–600 seconds                    |

**Tool:** `chat_data_agent` must be in the agent `tools` list.

---

#### `list_data_agents`

List locally configured Gemini Data Agents from the YAML registry (no Google API call).

| Parameter               | Required | Description                                   |
| ----------------------- | -------- | --------------------------------------------- |
| `include_redacted_auth` | no       | Include redacted auth block (default `false`) |

---

#### `get_data_agent_config`

Return redacted configuration for a named Gemini Data Agent.

| Parameter | Required | Description                |
| --------- | -------- | -------------------------- |
| `agent`   | yes      | Configured data agent name |

---

#### `get_operation`

Retrieve a long-running operation for a Gemini Data Agent.

| Parameter        | Required | Description                  |
| ---------------- | -------- | ---------------------------- |
| `agent`          | yes      | Configured data agent name   |
| `operation_name` | yes      | Full operation resource name |
| `api_version`    | no       | API version override         |

---

### Session collaboration tools (6)

Tools that bind **local session state** (revision, intent, ACL) to a **managed Data Agent conversation**. Use these when multiple clients or users share analytical context.

#### `session_create`

Create a shared session that binds local session state to a managed Data Agent conversation.

| Parameter                             | Required | Description                                                  |
| ------------------------------------- | -------- | ------------------------------------------------------------ |
| `agent`                               | yes      | Configured data agent name                                   |
| `tenant_id`, `user_id`, `client_name` | yes      | Identity envelope                                            |
| `workspace_id`                        | no       | Optional workspace                                           |
| `session_id`                          | no       | Custom session ID (auto-generated if omitted)                |
| `initial_intent`                      | no       | `explore`, `debug`, `report`, or `ad-hoc` (default `ad-hoc`) |
| `request_id`                          | no       | Idempotency key                                              |
| `api_version`                         | no       | API version override                                         |
| `timeout_seconds`                     | no       | 1–600 seconds                                                |

---

#### `session_chat`

Run one chat turn against an existing shared session.

| Parameter                             | Required | Description                                  |
| ------------------------------------- | -------- | -------------------------------------------- |
| `session_id`                          | yes      | Session identifier                           |
| `prompt`                              | yes      | User prompt                                  |
| `expected_revision`                   | yes      | Revision from last successful mutation (≥ 1) |
| `tenant_id`, `user_id`, `client_name` | yes      | Identity envelope                            |
| `workspace_id`                        | no       | Optional workspace                           |
| `context_version`                     | no       | Data agent context version                   |
| `thinking_mode`                       | no       | Chat thinking mode                           |
| `api_version`                         | no       | API version override                         |
| `timeout_seconds`                     | no       | 1–600 seconds                                |

---

#### `session_switch_intent`

Switch session intent with optimistic concurrency protection.

| Parameter                             | Required | Description                               |
| ------------------------------------- | -------- | ----------------------------------------- |
| `session_id`                          | yes      | Session identifier                        |
| `target_intent`                       | yes      | `explore`, `debug`, `report`, or `ad-hoc` |
| `expected_revision`                   | yes      | Current revision (≥ 1)                    |
| `tenant_id`, `user_id`, `client_name` | yes      | Identity envelope                         |
| `reason`                              | no       | Human-readable reason for the switch      |
| `workspace_id`                        | no       | Optional workspace                        |

---

#### `session_fork`

Fork a new session from an existing shared session.

| Parameter                             | Required | Description                     |
| ------------------------------------- | -------- | ------------------------------- |
| `parent_session_id`                   | yes      | Session to fork from            |
| `tenant_id`, `user_id`, `client_name` | yes      | Identity envelope               |
| `new_session_id`                      | no       | Custom ID for the child session |
| `request_id`                          | no       | Idempotency key                 |
| `workspace_id`                        | no       | Optional workspace              |

---

#### `session_reset`

Move a session head pointer to a prior revision.

| Parameter                             | Required | Description                 |
| ------------------------------------- | -------- | --------------------------- |
| `session_id`                          | yes      | Session identifier          |
| `target_revision`                     | yes      | Revision to rewind to (≥ 1) |
| `expected_revision`                   | yes      | Current revision (≥ 1)      |
| `tenant_id`, `user_id`, `client_name` | yes      | Identity envelope           |
| `workspace_id`                        | no       | Optional workspace          |

---

#### `session_handoff`

Generate a portable handoff payload for a session (for another client or user).

| Parameter                             | Required | Description        |
| ------------------------------------- | -------- | ------------------ |
| `session_id`                          | yes      | Session identifier |
| `tenant_id`, `user_id`, `client_name` | yes      | Identity envelope  |
| `workspace_id`                        | no       | Optional workspace |

---

### Tools not exposed

The analyst server **does not** register:

| Tool                                                                                             | Reason                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `raw_data_agent_request`                                                                         | Raw REST passthrough is disabled for analysts                         |
| `generate_analyst_registry_yaml`, `validate_analyst_registry_yaml`, `diff_analyst_registry_yaml` | Admin/registry tools — see `@gemini-data-agents/admin-mcp` (monorepo) |
| `create_remote_data_agent`, other lifecycle stubs                                                | Admin control plane only                                              |

## MCP resources

| URI                                              | Description                           |
| ------------------------------------------------ | ------------------------------------- |
| `gemini-data-agent://agents`                     | JSON list of all configured agents    |
| `gemini-data-agent://agents/{agent}`             | Redacted configuration for one agent  |
| `gemini-data-agent://agents/{agent}/tools`       | Enabled MCP tools for one agent       |
| `gemini-data-agent://agents/{agent}/auth-policy` | Non-secret auth posture for one agent |
| `gemini-data-agent://prompts`                    | Catalog of available MCP prompts      |

## MCP prompts

| Prompt                         | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `switch_intent`                | Guide an intent transition before calling `session_switch_intent` |
| `fork_session`                 | Prepare a controlled session fork with branching rationale        |
| `resume_session`               | Resume a session with recap and next-turn proposal                |
| `handoff_summary`              | Generate a concise handoff summary from a handoff payload         |
| `analyze_data_question`        | Answer a direct analytical question via a data agent              |
| `investigate_data_issue`       | Multi-step investigation of a data issue                          |
| `explain_generated_query`      | Explain SQL/query returned by a data agent                        |
| `compare_segments`             | Compare two data segments                                         |
| `find_anomalies`               | Look for anomalies in a metric or dataset                         |
| `prepare_data_analysis_report` | Structure findings into an analysis report                        |

## Security defaults

| Setting                  | Default        |
| ------------------------ | -------------- |
| Secret redaction         | Enabled        |
| Audit logging            | Enabled        |
| Prompt/response in audit | Disabled       |
| Result persistence       | Disabled       |
| Raw passthrough tool     | Not registered |

## CLI reference

```bash
gemini-data-analyst-mcp --config config.yaml
gemini-data-analyst-mcp validate-config --config config.yaml
gemini-data-analyst-mcp inspect-config --config config.yaml
```

## Monorepo development

Full repository docs: [README](../../README.md) (end users) and [CONTRIBUTING](../../CONTRIBUTING.md) (developers).

```bash
pnpm --filter @gemini-data-agents/analyst-mcp build
node packages/analyst-mcp/dist/cli.js --config config.yaml
```

## License

Apache-2.0
