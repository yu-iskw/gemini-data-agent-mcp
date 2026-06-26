# ADR 0005: MCP governance trust boundaries

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** maintainers
- **Related:** [ADR 0004](0004-mcp-role-tool-ownership.md)

## Context

ADR-0004 assigns tools to role-specific MCP servers. Tool placement alone does not prevent accidental production changes: agentops could pass `publishedContext` in a patch mask or chat against `PUBLISHED` if credentials allow it.

Teams need clear **separation of duties**:

- Developers build and test in **staging** without publishing or sharing agents.
- Operators **publish**, **set IAM**, and **retire** agents.
- Auditors prove **who had access** and **whether agents were used**.
- End users consume **published** runtime via analyst-mcp.

## Decision

### Trust planes

| Plane          | Package      | Purpose                                                              |
| -------------- | ------------ | -------------------------------------------------------------------- |
| **Develop**    | agentops-mcp | Create agents; edit staging; behavior-test in STAGING                |
| **Administer** | admin-mcp    | Publish (`publishedContext` patch); IAM write; delete; registry YAML |
| **Analyze**    | audit-mcp    | Read-only inventory, IAM read, usage, governance reports             |
| **Use**        | analyst-mcp  | End-user chat against published configuration                        |

### Separation-of-duties matrix

| Action                   |     agentops      | admin | audit |  analyst  |
| ------------------------ | :---------------: | :---: | :---: | :-------: |
| Create agent             |        yes        |  no   |  no   |    no     |
| Edit staging             |        yes        |  no   |  no   |    no     |
| Publish (edit published) |        no         |  yes  |  no   |    no     |
| IAM write                |        no         |  yes  |  no   |    no     |
| IAM read                 |        no         |  no   |  yes  |    no     |
| Delete / retire          |        no         |  yes  |  no   |    no     |
| End-user chat            | STAGING test only |  no   |  no   | PUBLISHED |

### Publish and share

- **Publish** — admin `gda.data_agents.patch` with `update_mask` including `dataAnalyticsAgent.publishedContext` (no separate publish tool).
- **Share** — admin `gda.data_agents.set_iam_policy` grants principals access to invoke the agent via **analyst-mcp** against published config. Developers do not share agents through agentops.

### agentops enforcement

`agentops-mcp` rejects:

- Patch masks that include `publishedContext` or other non-allowlisted paths (see `assertAgentOpsPatchMask` in core).
- `gda.locations.chat_staging` with `context_version: PUBLISHED`.

Allowed patch paths: `dataAnalyticsAgent.stagingContext`, `displayName`, `description`, `labels`.

### IAM ownership (v1)

**admin-mcp** is the only MCP server with IAM **write** (`gda.data_agents.set_iam_policy`). **audit-mcp** provides IAM **read** (`gda.data_agents.get_iam_policy`).

### Deploy guidance

Run each MCP binary with a **dedicated service account** whose GCP IAM matches the matrix above. Illustrative custom roles:

| MCP server | Suggested permissions                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| agentops   | `dataAgents.create`, `dataAgents.get`, `dataAgents.patch` (dev resources); **no** `setIamPolicy`, **no** `delete` |
| admin      | `dataAgents.*` mutations needed for publish/retire; `setIamPolicy`                                                |
| audit      | `dataAgents.get`, `getIamPolicy`, `conversations.list`; no mutating permissions                                   |
| analyst    | chat/query against published agents only                                                                          |

MCP guards do not block direct REST if the service account is over-permissioned. Scope agentops credentials to dev projects or resources where possible.

### Non-goals

- Terraform / IaC workflows for IAM
- Approval broker or composite publish tool
- Multi-project environment planes in config
- agentops delete or IAM tools

## Consequences

- Developers iterate in staging without publish or IAM responsibilities.
- Operators own production-facing config and access.
- Auditors rely on audit-mcp for evidence; no mutating tools on that server.
- agentops patch/chat enforcement is defense in depth; GCP IAM remains the ultimate boundary.
