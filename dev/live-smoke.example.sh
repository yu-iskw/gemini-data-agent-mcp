#!/usr/bin/env bash
# Example live-smoke driver: copy to dev/local/<project>/live-smoke.sh and customize.
# Reads YEXPERIMENT_CONFIG_DIR (default dev/local/yexperiment).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${YEXPERIMENT_CONFIG_DIR:-$ROOT/dev/local/yexperiment}"
cd "$ROOT"

if [[ ! -d $CONFIG_DIR ]]; then
	echo "Missing config dir: $CONFIG_DIR" >&2
	echo "Copy examples/live-smoke.config.example.yaml and inspector JSON into that directory." >&2
	exit 1
fi

INSPECTOR=(npx -y @modelcontextprotocol/inspector --cli)

echo "== Live smoke using $CONFIG_DIR"

echo "== Admin: data_agents.list"
"${INSPECTOR[@]}" --config "$CONFIG_DIR/mcp-inspector.admin.json" \
	--server gemini-data-agent-admin \
	--method tools/call --tool-name data_agents.list \
	--tool-arg "project=$(grep -E '^project:' "$CONFIG_DIR/.env" 2>/dev/null | cut -d: -f2- | tr -d ' ' || echo '')" \
	>/dev/null 2>&1 || {
	# Fallback: read project/location from analyst config via simple defaults in local scripts
	bash "$CONFIG_DIR/live-smoke.sh"
	exit $?
}

echo "OK: live-smoke example (delegate to local live-smoke.sh when present)"
