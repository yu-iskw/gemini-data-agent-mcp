#!/usr/bin/env bash
# Admin MCP Inspector smoke (generic placeholder config).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSPECTOR=(npx -y @modelcontextprotocol/inspector --cli)
CFG="$ROOT/dev/mcp-inspector.admin.json"
SRV="gemini-data-agent-admin"

echo "== Admin: tools/list"
"${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/list >/dev/null

echo "== Admin: gda.data_agents.list (may fail without live GCP)"
set +e
OUT="$("${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/call \
	--tool-name gda.data_agents.list \
	--tool-arg project=my-gcp-project \
	--tool-arg location=us-central1 2>&1)"
RC=$?
set -e
if echo "$OUT" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
	:
elif echo "$OUT" | grep -q '"toolName"[[:space:]]*:[[:space:]]*"gda.data_agents.list"'; then
	# Structured error envelope (e.g. GCP PERMISSION_DENIED without live API)
	:
else
	echo "Expected structured ToolResultEnvelope for gda.data_agents.list"
	echo "$OUT"
	exit 1
fi

echo "== Admin: gda.auth.inspect"
"${INSPECTOR[@]}" --config "$CFG" --server "$SRV" --method tools/call --tool-name gda.auth.inspect >/dev/null

echo "OK: admin MCP Inspector smoke passed (list tool RC=$RC)."
