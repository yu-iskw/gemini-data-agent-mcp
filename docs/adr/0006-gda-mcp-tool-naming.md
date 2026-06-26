# ADR 0006: GDA MCP tool naming

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** maintainers
- **Related:** [ADR 0004](0004-mcp-role-tool-ownership.md), [ADR 0005](0005-mcp-governance-trust-boundaries.md)

## Context

Multiple MCP servers expose Gemini Data Analytics operations. Tool names were inconsistent (`audit.*`, `agentops.*`, bare `data_agents.*`) and **collided across servers** (e.g. `data_agents.patch` on admin vs agentops with different semantics).

[MCP tool naming](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) requires uniqueness **per server**; hosts that merge `tools/list` need **globally distinct** names when behavior differs.

Config `agents.*.tools` entries (e.g. `query_data_agent`) are **Google capability keys**, not MCP tool names—they are unchanged.

## Decision

### Rule

```text
gda.<resource>.<action>[_<qualifier>]
```

- **`gda`** — Gemini Data Analytics API (`geminidataanalytics.googleapis.com`)
- **Qualifier** — only when the same RPC has different behavior (`patch_staging`, `chat_staging`), not role names

### Examples

| New name                          | Maps to                          |
| --------------------------------- | -------------------------------- |
| `gda.data_agents.list`            | `dataAgents.list`                |
| `gda.data_agents.patch`           | admin publish patch              |
| `gda.data_agents.patch_staging`   | agentops staging patch (guarded) |
| `gda.locations.chat`              | analyst `locations:chat`         |
| `gda.locations.chat_staging`      | agentops behavior test           |
| `gda.governance_reports.generate` | composite audit report           |

### Breaking change

All MCP tool and prompt names migrate to `gda.*` in one release. **No deprecated aliases** (active development policy).

### Canonical constants

Shared string constants live in `packages/core/src/mcp/gda-tool-names.ts` and are exported from `@gemini-data-agents/core`.

## Consequences

- Multiplexed MCP clients can enable admin + agentops without `patch` ambiguity.
- READMEs and ADR-0004 tool tables reference `gda.*` names.
- Host allowlists that referenced old MCP tool names must update.

## Migration (selected)

| Old                            | New                             |
| ------------------------------ | ------------------------------- |
| `data_agents.patch` (agentops) | `gda.data_agents.patch_staging` |
| `data_agents.patch` (admin)    | `gda.data_agents.patch`         |
| `audit.conversations.list`     | `gda.conversations.list`        |
| `agentops.behavior.chat`       | `gda.locations.chat_staging`    |
| `session_chat`                 | `gda.sessions.chat`             |
| `switch_intent` (prompt)       | `gda.prompt.switch_intent`      |

Full table: see implementation commit / package READMEs.
