# ADR 0004: MCP role tool ownership

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** maintainers

## Context

ADR-0003 added `audit-mcp` and `agentops-mcp` with thin vertical slices. Tool placement still mixed jobs (e.g. IAM read on admin). Teams need clear boundaries:

- **admin-mcp** — administer published lifecycle, IAM writes, and retirement
- **audit-mcp** — analyze usage, access, and datasources (read-only)
- **agentops-mcp** — develop agents (create, staging edits, behavior tests, offline-eval prep)
- **analyst-mcp** — end-user analyst chat (unchanged)

All tools map to [`geminidataanalytics.googleapis.com`](https://docs.cloud.google.com/gemini/data-agents/reference/rest) unless noted.

## Decision

### Tool ownership

| Package          | Role       | Tools                                                                                                                                                                                   |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **admin-mcp**    | Administer | Registry YAML tools; `gda.data_agents.list`, `get`, `patch`, `delete`, `set_iam_policy`; `gda.operations.get`                                                                           |
| **audit-mcp**    | Analyze    | `gda.conversations.list`, `gda.conversation_messages.list`, `gda.data_agents.inventory`, `list_accessible`, `datasources`, `get_iam_policy`, `usage`, `gda.governance_reports.generate` |
| **agentops-mcp** | Develop    | `gda.data_agents.create`, `get`, `patch_staging`; `gda.locations.chat_staging`; `gda.offline_eval.*`                                                                                    |
| **analyst-mcp**  | Use        | Session and chat tools (unchanged)                                                                                                                                                      |

### Breaking changes

- `data_agents.get_iam_policy` moves from **admin-mcp** to **audit-mcp** as `gda.data_agents.get_iam_policy`.
- `data_agents.create` moves from **admin-mcp** to **agentops-mcp** (develop credentials create; admin retires via `delete`).

Acceptable during active development (ADR-0003).

### Out of scope (v1)

- Agent Platform / Vertex offline evaluation APIs (stub `offline_eval.run` remains documented)
- Cloud Logging usage analysis (`logging-client` stub unused)
- Shared role CLI/server factory
- Composite `access_report` tool (`datasources` + `get_iam_policy` are separate)

### Per-agent usage (conversations API)

- `gda.data_agents.usage` and `gda.governance_reports.generate` share core `summarizeAgentUsage`.
- Default window: **30 days**, applied in code using conversation `updateTime` / `createTime` (list API filters by agent/labels, not conversation create time).
- `possiblyUnused` lists agents with `usedInWindow === false` (`confidence: low` — REST has no `lastUsed` field).

## Consequences

- Auditors deploy audit-mcp credentials with IAM read, not admin mutations.
- Admin retains IAM **write** and **delete**; no `create`.
- Agentops **creates** agents and patches **stagingContext**; no `delete`.
- Governance reports include per-agent `agentUsage` for the configured window.
- Trust boundaries and separation of duties: [ADR 0005](0005-mcp-governance-trust-boundaries.md).
- MCP tool naming (`gda.*` namespace): [ADR 0006](0006-gda-mcp-tool-naming.md).
