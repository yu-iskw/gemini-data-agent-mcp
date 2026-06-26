# ADR 0003: Add audit-mcp and agentops-mcp role packages

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** maintainers

## Context

The repository already separates shared concerns (`@gemini-data-agents/core`) from role-specific MCP servers (`analyst-mcp`, `admin-mcp`) per ADR-0002. Operators, auditors, and AgentOps engineers need distinct tool surfaces with least privilege.

## Decision

1. Add `@gemini-data-agents/audit-mcp` for usage, governance, and audit analysis (read-oriented).
2. Add `@gemini-data-agents/agentops-mcp` for offline and simulated agent evaluation workflows.
3. Strengthen `@gemini-data-agents/core` into a transport-independent domain layer (typed REST clients, MCP result/annotation helpers).
4. Support **STDIO and HTTP** transports in every role package from the beginning.
5. Use **Google IAM, ADC, optional service account impersonation, and HTTP bearer/OAuth validation** as the authorization boundary.
6. Do **not** embed a package-owned policy engine.
7. Enforce least privilege through **separate role packages and tool exposure**.
8. Use comprehensive official MCP tool annotations (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) as UX hints only—not security enforcement.
9. Prefer structured tool outputs using `structuredContent` and stable `outputSchema` where practical.
10. Retain `@gemini-data-agents/analyst-mcp` alongside the RFC role packages.

## Implementation order

1. Core domain layer (transport, clients, MCP helpers).
2. Thin vertical slices for admin, audit, and agentops MCP servers.
3. Expand agentops (offline eval, simulation), then audit (logging, governance), then admin (full lifecycle/IAM).

## Consequences

- More packages to maintain; each remains thin by keeping domain logic in core.
- Breaking changes during active development are acceptable (no backward compatibility requirement for legacy admin remote stub tool names).
- HTTP and STDIO share the same tool registry per package.
