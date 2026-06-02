# Operational QA

## Test User

- Email: `manolo@gmail.com`
- Password: `123456`

The user is for operational QA only. Do not use it for production data.

## Script

Run from the project root after loading `.env.local`:

```bash
set -a
source .env.local
set +a
node scripts/operational-qa.mjs
```

## Coverage

The script validates:

- Auth signup/signin for the test user.
- Tenant creation/access through RLS.
- Default ledger accounts per tenant.
- Product creation.
- Member creation with initial payment.
- Full plan payment at enrollment leaves member balance at `0`.
- Check-in idempotency.
- Plan renewal.
- Product sale with cash.
- Product credit that decreases stock and creates product debt without changing member membership balance.
- Member payment.
- General cash expense.
- Member deletion/deactivation preserves purchase and attendance history.
- Each ledger transaction balances debit and credit.
- Cash ledger net equals `cash_flow` net.
- Run-level trial balance is balanced.

## Passing Criteria

Every reported item must have `"ok": true`.

Accounting-specific required values in the current scenario:

- Member balance after operations: `-30000`.
- Full weekly plan payment scenario: `p_plan_price = 20000`, `p_initial_balance = 20000`, resulting `members.balance = 0`.
- Product credit scenario: `payment_method = credito`, `amount_paid = 0`, `payment_status = credit`.
- Deleted member scenario: `members.status = inactive`, active query returns `0`, history rows remain.
- Product stock after two sales: `8`.
- Cash ledger net equals cash-flow net.
- Total debit equals total credit.
