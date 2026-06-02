# Process Control

Use this folder to keep project execution disciplined and repeatable.

Current control files:

- `OPERATIONAL_QA.md`: production-like QA flow for Auth, tenant isolation, core RPCs and accounting.
- `AUTH_WORKSPACE_LOADING.md`: post-login Auth, tenant and license loading contract.
- `ACCOUNTING_STANDARD.md`: fixed accounting contract for member balances, product credit, total debt and member deletion.
- `DESIGN_SYSTEM.md`: rules for changing the office UI theme from centralized files.
- `ACCOUNTING_MODEL.md`: double-entry accounting model used by operational RPCs.

Before changing database, accounting, Auth/workspace loading, deploy, security, GitHub or design-system behavior, read the matching file and update it when the process changes.
