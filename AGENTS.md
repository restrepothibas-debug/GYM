# Agent Operating Contract

This repository is a React 19 + Vite + Tailwind CSS gym management app backed by Supabase and deployed through Vercel.

Every agent must run the preflight before infrastructure, database, deploy, GitHub, or security work:

```bash
npm run agent:preflight
```

If the preflight reports missing environment variables, load local secrets first:

```bash
set -a
source .env.local
set +a
```

Never print token values. `.env.local` is local-only and must not be committed.

## Required Context

Before changing code, inspect the relevant project skills:

```bash
find .agents/skills -maxdepth 2 -name SKILL.md | sort
```

Use the matching skill for the task. Key installed skills include:

- Supabase: `supabase`, `supabase-postgres-best-practices`
- Vercel and React: `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-react-view-transitions`, `web-design-guidelines`
- GitHub and security: `git-commit`, `conventional-commit`, `github-issues`, `github-release`, `github-actions-efficiency`, `dependabot`, `codeql`, `secret-scanning`, `security-review`
- Testing/UI: `javascript-typescript-jest`, `react19-test-patterns`, `react19-source-patterns`, `react19-concurrent-patterns`, `playwright-generate-test`, `playwright-explore-website`, `webapp-testing`, `ui-screenshots`, `quality-playbook`

## Supabase

Project ref:

```text
vuebqjashgcoexpihmko
```

Remote URL:

```text
https://vuebqjashgcoexpihmko.supabase.co
```

Codex MCP is configured globally as a streamable HTTP server using:

```text
SUPABASE_ACCESS_TOKEN
```

MCP tools are loaded when Codex starts. If a running session cannot see Supabase MCP tools, restart Codex from this repo after loading `.env.local`:

```bash
cd /Users/alexanderrestrepoepieyu/Desktop/gym
set -a
source .env.local
set +a
codex
```

If MCP is unavailable in a session, use Supabase CLI with `.env.local` loaded. The local project must remain linked to `vuebqjashgcoexpihmko`.

## Data Security Standard

The database must be strict multi-tenant before production deploy.

- Every operational table must include `tenant_id`.
- RLS must filter by membership in `tenant_memberships`.
- Do not ship broad `authenticated` policies that expose all tenant data.
- Sales, payments, stock changes, purchases, and cash movements must use transactional SQL/RPC.
- License state must support at least `active`, `expired`, `cancelled`, and `trial`.

Expected base tables:

- `tenants`
- `tenant_memberships`
- `licenses`
- `members`
- `products`
- `attendance_log`
- `member_purchases`
- `cash_flow`

Do not deploy to Vercel before tenant isolation and RLS are reviewed.

## GitHub

Remote:

```text
https://github.com/restrepothibas-debug/GYM.git
```

GitHub CLI access is token-based through `.env.local` variables:

```text
GH_TOKEN
GITHUB_TOKEN
```

Agents must source `.env.local` before using `gh`. A plain `gh auth status` may fail if the shell has not loaded `GH_TOKEN`.

## Desktop Target

If a Windows desktop build is requested, prefer Tauri for smaller size and performance. Use Electron only if the feature set requires the larger ecosystem.
