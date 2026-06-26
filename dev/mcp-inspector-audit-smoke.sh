#!/usr/bin/env bash
# Audit MCP Inspector smoke (generic placeholder config).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSPECTOR=(npx -y @modelcontextprotocol/inspector --cli)
CFG="$ROOT/dev/mcp-inspector.audit.json"
SRV="gemini-data-agent-audit"

echo "== Audit: tools/list"
"${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/list >/dev/null

echo "== Audit: audit.data_agents.inventory (protocol; GCP may fail without credentials)"
set +e
"${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/call \
	--tool-name audit.data_agents.inventory \
	--tool-arg project=my-gcp-project \
	--tool-arg location=global >/dev/null 2>&1
RC=$?
set -e
test "$RC" -eq 0 || echo "Note: inventory call returned RC=$RC (expected with placeholder project)"

echo "OK: audit MCP Inspector smoke passed."
