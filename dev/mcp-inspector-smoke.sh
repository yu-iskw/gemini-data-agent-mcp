#!/usr/bin/env bash
# Non-interactive MCP Inspector checks (@modelcontextprotocol/inspector --cli).
# Run from repository root after: pnpm build
# Inspector version is not pinned; use: npm view @modelcontextprotocol/inspector version

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSPECTOR=(npx -y @modelcontextprotocol/inspector --cli)
CFG_ANALYST="$ROOT/dev/mcp-inspector.analyst.json"
SRV_ANALYST="gemini-data-analyst"
CFG_ADMIN="$ROOT/dev/mcp-inspector.admin.json"
SRV_ADMIN="gemini-data-agent-admin"

echo "== Analyst: tools/list"
"${INSPECTOR[@]}" --config "$CFG_ANALYST" --server "$SRV_ANALYST" --method tools/list >/dev/null

echo "== Analyst: tools/call gda.registry.list_agents"
"${INSPECTOR[@]}" --config "$CFG_ANALYST" --server "$SRV_ANALYST" --method tools/call --tool-name gda.registry.list_agents >/dev/null

echo "== Analyst: resources/list + prompts/list"
"${INSPECTOR[@]}" --config "$CFG_ANALYST" --server "$SRV_ANALYST" --method resources/list >/dev/null
"${INSPECTOR[@]}" --config "$CFG_ANALYST" --server "$SRV_ANALYST" --method prompts/list >/dev/null

echo "== Analyst: resources/read"
"${INSPECTOR[@]}" --config "$CFG_ANALYST" --server "$SRV_ANALYST" --method resources/read --uri "gemini-data-agent://agents/my-agent" >/dev/null

echo "== Analyst: tools/call gda.sessions.create (may return GCP/API tool error with placeholder project)"
"${INSPECTOR[@]}" --config "$CFG_ANALYST" --server "$SRV_ANALYST" --method tools/call --tool-name gda.sessions.create \
	--tool-arg agent=my-agent --tool-arg tenant_id=t1 --tool-arg user_id=u1 --tool-arg client_name=mcp-inspector-smoke >/dev/null || true

echo "== Admin: tools/list"
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method tools/list >/dev/null

echo "== Admin: dry_run + inspect"
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method tools/call --tool-name gda.registry.generate_analyst_yaml --tool-arg use_loaded_config=true >/dev/null
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method tools/call --tool-name gda.registry.diff_analyst_yaml --tool-arg baseline=a:1 --tool-arg proposed=a:2 >/dev/null
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method tools/call --tool-name gda.auth.inspect >/dev/null
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method tools/call --tool-name gda.registry.dry_run_agent_change \
	--tool-arg agent_name=z --tool-arg proposed_agent='{"project":"my-gcp-project","location":"us-central1","api_version":"v1beta","data_agent":"z","auth":{"mode":"adc"}}' >/dev/null

echo "== Admin: RFC gda.data_agents.list registered"
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method tools/list | grep -q gda.data_agents.list

echo "== Admin: resources/list (expect exit 1, Method not found)"
set +e
"${INSPECTOR[@]}" --config "$CFG_ADMIN" --server "$SRV_ADMIN" --method resources/list 2>/dev/null
RC=$?
set -e
test "$RC" -eq 1

echo "OK: MCP Inspector smoke passed."
