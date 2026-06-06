# Accounting Model

The application now records operational money events in a double-entry ledger.

## Tables

- `ledger_accounts`: per-tenant chart of accounts.
- `ledger_transactions`: accounting transaction header.
- `ledger_entries`: debit/credit lines.
- `member_purchases`: product assignment/sale history. The legacy column `total_paid` remains for compatibility; new logic should prefer `sale_total`, `amount_paid` and `payment_status`.
- `membership_plans`: per-tenant plan catalog used by enrollment and renewal.
- `member_membership_events`: membership audit trail for enrollment, renewal and manual day adjustments.

All ledger tables include `tenant_id`, have RLS enabled and expose read access only to tenant members.

## Default Accounts

- `cash`: Caja y efectivo.
- `card_clearing`: Tarjetas por cobrar.
- `accounts_receivable`: Cuentas por cobrar socios.
- `customer_credits`: Creditos de socios.
- `membership_revenue`: Ingresos por membresias.
- `product_revenue`: Ingresos por productos.
- `other_income`: Otros ingresos.
- `operating_expense`: Gastos operativos.

## Required Rule

Every ledger transaction must balance:

```text
sum(debit) = sum(credit)
```

The helper `app_private.post_ledger_transaction` enforces this before inserting entries.

## Member Balance Contract

`members.balance` is an accounting status, not a standalone wallet:

- Negative balance: receivable/debt owed by the member.
- Zero balance: paid in full.
- Positive balance: customer credit in favor of the member.

During enrollment, the UI field "Pago Inicial Recibido" maps to the legacy RPC parameter `p_initial_balance`. That value is payment received for the selected plan, not a wallet top-up.

Required formula:

```text
members.balance = initial payment received - plan price
```

Example:

```text
Plan semanal: 20000
Pago inicial recibido: 20000
Resultado: members.balance = 0
```

## Operational Mapping

- Member enrollment: cash and/or accounts receivable debit, membership revenue credit, optional customer credit. A fully paid plan posts cash debit and membership revenue credit, leaving member balance at `0`.
- Member payment: cash debit, accounts receivable and/or customer credits credit.
- Plan renewal: customer credits and/or accounts receivable debit, membership revenue credit.
- Product credit: accounts receivable debit, product revenue credit.
- Product cash sale: cash debit, product revenue credit.
- Product card sale: card clearing debit, product revenue credit.
- Cash expense: operating expense debit, cash credit.
- General cash income: cash debit, other income credit.

## Product Balance Contract

Products are controlled through `member_purchases`, stock and paid/credit-sale accounting, not through the member plan balance.

Required rules:

- Product credit never subtracts from `members.balance`.
- Product credit records `member_purchases`, decreases stock, posts accounts receivable and product revenue.
- Immediate cash/card payment records `member_purchases`, decreases stock, posts ledger revenue and records cash flow.
- The legacy payment methods `asignado` and `monedero` must be treated as `credito` for new logic.
- Total debt is membership debt plus unpaid product credit debt.

## Payment Allocation Contract

Use `record_member_payment_allocated` for member payments that may target more
than membership debt.

- `p_target = membership`: applies payment to negative `members.balance`; excess becomes customer credit.
- `p_target = products`: applies payment to unpaid `member_purchases` first; only excess can affect membership debt or customer credit.
- `p_target = auto`: applies membership debt first, then product credit debt, then customer credit.
- Product credit payments update `member_purchases.amount_paid` and `payment_status`.
- Product credit payments must not decrease `members.balance`; `members.balance` remains the membership receivable/customer-credit contract.
- `record_payment` is a compatibility wrapper for membership-only payments.

## Membership Plan Contract

Plan names, duration and prices belong to `membership_plans` per tenant.

- Do not duplicate plan presets in React components.
- Do not constrain `members.plan` to a hardcoded enum. It must reference the tenant plan catalog.
- Enrollment and renewal RPCs must resolve price/duration from the tenant plan catalog.
- Manual day changes must call `adjust_member_membership_days` so `member_membership_events` records the reason and before/after dates.

## Member Deletion Contract

Deleting a gym user/member is a logical deactivation:

- Set `members.status = inactive`.
- Do not physically delete the member from the database from the app UI.
- Preserve attendance, purchases, cash flow and ledger records for audit.
- Active operational screens should load only `members.status = active`.
