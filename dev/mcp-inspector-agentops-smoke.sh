#!/usr/bin/env bash
# AgentOps MCP Inspector smoke (generic placeholder config).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSPECTOR=(npx -y @modelcontextprotocol/inspector --cli)
CFG="$ROOT/dev/mcp-inspector.agentops.json"
SRV="gemini-data-agent-agentops"

echo "== AgentOps: tools/list"
"${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/list >/dev/null

echo "== AgentOps: offline_eval.validate_cases"
"${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/call \
	--tool-name agentops.offline_eval.validate_cases \
	--tool-arg 'cases=[{"id":"c1","input":"hello"}]' >/dev/null

echo "OK: agentops MCP Inspector smoke passed."
