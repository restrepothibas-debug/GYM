#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

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
  codex mcp list || warn "codex mcp list failed"
else
  warn "codex CLI not found"
fi

if has_cmd supabase; then
  printf 'supabase version: %s\n' "$(supabase --version)"
  if [ "${SUPABASE_PROJECT_REF:-}" = "vuebqjashgcoexpihmko" ]; then
    ok "Supabase project ref matches expected project"
  else
    bad "Supabase project ref does not match vuebqjashgcoexpihmko"
  fi
  if [ -f "supabase/.temp/project-ref" ] && grep -qx "vuebqjashgcoexpihmko" "supabase/.temp/project-ref"; then
    ok "Supabase CLI linked to vuebqjashgcoexpihmko"
  else
    bad "Supabase CLI link missing or points to another project"
  fi
  if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    if supabase projects list -o json 2>/dev/null | grep -q '"ref": "vuebqjashgcoexpihmko"'; then
      ok "Supabase API token can access vuebqjashgcoexpihmko"
    else
      bad "Supabase API token could not verify access to vuebqjashgcoexpihmko"
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

exit "$fail"
