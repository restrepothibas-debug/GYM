#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

EXPECTED_SUPABASE_PROJECT_REF="vuebqjashgcoexpihmko"
EXPECTED_SUPABASE_URL="https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co"

fail=0

ok() {
  printf 'ok: %s\n' "$1"
}

warn() {
  printf 'warn: %s\n' "$1"
}

bad() {
  printf 'fail: %s\n' "$1"
  fail=1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

check_json() {
  file="$1"
  if [ -f "$file" ]; then
    ok "$file present"
    if has_cmd node; then
      if node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$file" >/dev/null 2>&1; then
        ok "$file valid JSON"
      else
        bad "$file invalid JSON"
      fi
    else
      warn "node not found; skipping JSON validation for $file"
    fi
  else
    bad "$file missing"
  fi
}

printf 'Agent preflight for %s\n' "$ROOT_DIR"

if [ -f ".env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
  ok ".env.local loaded"
else
  bad ".env.local missing"
fi

for name in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF VITE_SUPABASE_URL GH_TOKEN GITHUB_TOKEN; do
  value="${!name:-}"
  if [ -n "$value" ]; then
    ok "$name set"
  else
    bad "$name missing"
  fi
done

for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  value="${!name:-}"
  if [ -n "$value" ]; then
    ok "$name set"
  else
    warn "$name missing; Vercel MCP OAuth can still work, but Vercel CLI deploy/link may need it"
  fi
done

check_json ".mcp.json"
check_json ".cursor/mcp.json"
check_json ".vscode/mcp.json"

if [ -f ".env.example" ]; then
  ok ".env.example present"
else
  bad ".env.example missing"
fi

for file in .mcp.json .cursor/mcp.json .vscode/mcp.json; do
  if [ -f "$file" ]; then
    if grep -q "${EXPECTED_SUPABASE_PROJECT_REF}\\|SUPABASE_PROJECT_REF" "$file"; then
      ok "$file points to Supabase project ${EXPECTED_SUPABASE_PROJECT_REF}"
    else
      bad "$file does not point to Supabase project ${EXPECTED_SUPABASE_PROJECT_REF}"
    fi
    if grep -q "https://api.githubcopilot.com/mcp/" "$file"; then
      ok "$file includes GitHub MCP"
    else
      bad "$file missing GitHub MCP"
    fi
    if grep -q "https://mcp.vercel.com" "$file"; then
      ok "$file includes Vercel MCP"
    else
      bad "$file missing Vercel MCP"
    fi
  fi
done

secret_pattern='(s''bp_|github_''pat_|g''hp_|g''ho_|g''hu_|g''hs_|g''hr_|v''ca_)'
if grep -REn "$secret_pattern" .mcp.json .cursor/mcp.json .vscode/mcp.json .env.example AGENTS.md >/dev/null 2>&1; then
  bad "tracked agent config appears to contain a literal secret pattern"
else
  ok "tracked agent config does not contain known literal secret patterns"
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ok "git repository detected"
  git status --short --branch
  if git remote get-url origin >/dev/null 2>&1; then
    printf 'git origin: %s\n' "$(git remote get-url origin)"
  else
    bad "git origin missing"
  fi
else
  bad "not inside a git repository"
fi

if [ -d ".agents/skills" ]; then
  skill_count="$(find .agents/skills -name SKILL.md | wc -l | tr -d ' ')"
  ok "$skill_count project skills available"
else
  bad ".agents/skills missing"
fi

if [ -f "skills-lock.json" ]; then
  ok "skills-lock.json present"
else
  bad "skills-lock.json missing"
fi

if has_cmd codex; then
  codex_mcp_output="$(codex mcp list 2>&1)"
  printf '%s\n' "$codex_mcp_output"
  if printf '%s\n' "$codex_mcp_output" | grep -q "$EXPECTED_SUPABASE_PROJECT_REF" &&
    printf '%s\n' "$codex_mcp_output" | grep -q "SUPABASE_ACCESS_TOKEN"; then
    ok "Codex Supabase MCP points to ${EXPECTED_SUPABASE_PROJECT_REF} with SUPABASE_ACCESS_TOKEN"
  else
    bad "Codex Supabase MCP is not bound to ${EXPECTED_SUPABASE_PROJECT_REF}; run npm run codex:mcp:fix and restart Codex from this repo"
  fi
else
  warn "codex CLI not found"
fi

if has_cmd supabase; then
  printf 'supabase version: %s\n' "$(supabase --version)"
  if [ "${SUPABASE_PROJECT_REF:-}" = "$EXPECTED_SUPABASE_PROJECT_REF" ]; then
    ok "Supabase project ref matches expected project"
  else
    bad "Supabase project ref does not match ${EXPECTED_SUPABASE_PROJECT_REF}"
  fi
  if [ "${VITE_SUPABASE_URL:-}" = "$EXPECTED_SUPABASE_URL" ]; then
    ok "VITE_SUPABASE_URL matches expected project"
  else
    bad "VITE_SUPABASE_URL does not match ${EXPECTED_SUPABASE_URL}"
  fi
  if [ -f "supabase/.temp/project-ref" ] && grep -qx "$EXPECTED_SUPABASE_PROJECT_REF" "supabase/.temp/project-ref"; then
    ok "Supabase CLI linked to ${EXPECTED_SUPABASE_PROJECT_REF}"
  else
    bad "Supabase CLI link missing or points to another project"
  fi
  if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    if supabase projects list -o json 2>/dev/null | grep -q "\"ref\": \"${EXPECTED_SUPABASE_PROJECT_REF}\""; then
      ok "Supabase API token can access ${EXPECTED_SUPABASE_PROJECT_REF}"
    else
      bad "Supabase API token could not verify access to ${EXPECTED_SUPABASE_PROJECT_REF}; replace SUPABASE_ACCESS_TOKEN in .env.local with a token from the correct Supabase account"
    fi
  fi
else
  bad "supabase CLI not found"
fi

if has_cmd gh; then
  if [ -n "${GH_TOKEN:-}" ]; then
    if GH_TOKEN="$GH_TOKEN" gh api user --jq '.login' >/dev/null 2>&1; then
      ok "GitHub token works with gh api"
    else
      bad "GitHub token failed gh api validation"
    fi
  else
    bad "GH_TOKEN missing"
  fi
else
  bad "GitHub CLI gh not found"
fi

if has_cmd vercel; then
  printf 'vercel version: %s\n' "$(vercel --version 2>/dev/null || printf 'unknown')"
  ok "Vercel CLI found"
else
  warn "Vercel CLI not found"
fi

if has_cmd docker; then
  ok "Docker found for optional local GitHub MCP"
elif has_cmd github-mcp-server; then
  ok "github-mcp-server binary found for optional local GitHub MCP"
else
  warn "Docker/github-mcp-server not found; use remote GitHub MCP or gh CLI"
fi

exit "$fail"
