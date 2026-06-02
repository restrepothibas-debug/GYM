# Fixed Accounting Standard

This file is the project-level accounting contract. Future agents must preserve it unless the user explicitly requests a new accounting model.

## Member Balance

`members.balance` belongs to memberships and member account credits only.

Formula at enrollment:

```text
members.balance = initial payment received - plan price
```

Meaning:

- Negative: membership debt / accounts receivable.
- Zero: membership paid.
- Positive: member credit.

Product credit must not subtract from `members.balance`.

## Product Transactions

Every product movement must decrease stock and create `member_purchases`.

Standard payment methods:

- `credito`: product delivered now, unpaid product debt.
- `efectivo`: paid immediately in cash.
- `tarjeta`: paid immediately by card.

Legacy inputs:

- `asignado` normalizes to `credito`.
- `monedero` normalizes to `credito` for new product operations.

## Ledger Rules

All monetary product transactions must post balanced ledger entries:

- Product credit: debit `accounts_receivable`, credit `product_revenue`.
- Product cash payment: debit `cash`, credit `product_revenue`.
- Product card payment: debit `card_clearing`, credit `product_revenue`.

Cash flow rows are created only for immediate payments.

## Debt Calculation

Total debt shown to operators is:

```text
total debt = max(-members.balance, 0) + sum(product.sale_total - product.amount_paid)
```

Do not calculate debt independently inside components. Use `src/lib/accounting.js`.

## Member Deletion

Deleting a member from the UI is a logical deactivation:

```text
members.status = inactive
```

Never physically delete a member from the app UI because attendance, product purchases, cash flow and ledger records are audit history.
