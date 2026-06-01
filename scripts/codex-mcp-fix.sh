#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

EXPECTED_SUPABASE_PROJECT_REF="aivttuylquomdzsmhfcs"
EXPECTED_SUPABASE_URL="https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co"
MCP_URL="https://mcp.supabase.com/mcp?project_ref=${EXPECTED_SUPABASE_PROJECT_REF}"

fail() {
  printf 'fail: %s\n' "$1" >&2
  exit 1
}

ok() {
  printf 'ok: %s\n' "$1"
}

if ! command -v codex >/dev/null 2>&1; then
  fail "codex CLI not found"
fi

if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
else
  fail ".env.local missing"
fi

if [ "${SUPABASE_PROJECT_REF:-}" != "$EXPECTED_SUPABASE_PROJECT_REF" ]; then
  fail "SUPABASE_PROJECT_REF must be ${EXPECTED_SUPABASE_PROJECT_REF}; update .env.local first"
fi

if [ "${VITE_SUPABASE_URL:-}" != "$EXPECTED_SUPABASE_URL" ]; then
  fail "VITE_SUPABASE_URL must be ${EXPECTED_SUPABASE_URL}; update .env.local first"
fi

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  fail "SUPABASE_ACCESS_TOKEN missing in .env.local"
fi

codex mcp remove supabase >/dev/null 2>&1 || true
codex mcp add supabase --url "$MCP_URL" --bearer-token-env-var SUPABASE_ACCESS_TOKEN

codex_mcp_output="$(codex mcp get supabase 2>&1)"
printf '%s\n' "$codex_mcp_output"

if printf '%s\n' "$codex_mcp_output" | grep -q "$EXPECTED_SUPABASE_PROJECT_REF" &&
  printf '%s\n' "$codex_mcp_output" | grep -q "bearer_token_env_var: SUPABASE_ACCESS_TOKEN"; then
  ok "Codex Supabase MCP bound to ${EXPECTED_SUPABASE_PROJECT_REF}"
else
  fail "Codex Supabase MCP did not bind to ${EXPECTED_SUPABASE_PROJECT_REF}"
fi

if command -v supabase >/dev/null 2>&1; then
  if supabase projects list -o json 2>/dev/null | grep -q "\"ref\": \"${EXPECTED_SUPABASE_PROJECT_REF}\""; then
    ok "SUPABASE_ACCESS_TOKEN can access ${EXPECTED_SUPABASE_PROJECT_REF}"
  else
    fail "SUPABASE_ACCESS_TOKEN cannot access ${EXPECTED_SUPABASE_PROJECT_REF}; use a token from the correct Supabase account"
  fi
else
  printf 'warn: supabase CLI not found; skipped token access verification\n'
fi

printf 'Restart Codex from this repo after loading .env.local, then run /mcp.\n'
