const REVENUE_KEYS = new Set(['membership_revenue', 'product_revenue', 'other_income']);

export function buildAccountingSummary(ledgerEntries = []) {
  const summary = {
    membershipRevenue: 0,
    productRevenue: 0,
    otherIncome: 0,
    operatingExpense: 0,
    cashNet: 0,
    cardReceivable: 0,
    accountsReceivable: 0,
    customerCredits: 0,
    trialBalanceDebit: 0,
    trialBalanceCredit: 0,
  };

  ledgerEntries.forEach(entry => {
    const accountKey = entry.accountKey;
    const debit = Number(entry.debit || 0);
    const credit = Number(entry.credit || 0);

    summary.trialBalanceDebit += debit;
    summary.trialBalanceCredit += credit;

    if (accountKey === 'membership_revenue') summary.membershipRevenue += credit - debit;
    if (accountKey === 'product_revenue') summary.productRevenue += credit - debit;
    if (accountKey === 'other_income') summary.otherIncome += credit - debit;
    if (accountKey === 'operating_expense') summary.operatingExpense += debit - credit;
    if (accountKey === 'cash') summary.cashNet += debit - credit;
    if (accountKey === 'card_clearing') summary.cardReceivable += debit - credit;
    if (accountKey === 'accounts_receivable') summary.accountsReceivable += debit - credit;
    if (accountKey === 'customer_credits') summary.customerCredits += credit - debit;
  });

  summary.totalRevenue = summary.membershipRevenue + summary.productRevenue + summary.otherIncome;
  summary.netOperationalResult = summary.totalRevenue - summary.operatingExpense;
  summary.isBalanced = Math.round(summary.trialBalanceDebit * 100) === Math.round(summary.trialBalanceCredit * 100);

  return summary;
}

export function getRecentLedgerTransactions(ledgerEntries = [], limit = 12) {
  const byTransaction = new Map();

  ledgerEntries.forEach(entry => {
    const id = entry.transactionId;
    if (!id) return;

    const current = byTransaction.get(id) || {
      id,
      description: entry.transactionDescription || 'Movimiento contable',
      occurredOn: entry.occurredOn,
      sourceTable: entry.sourceTable,
      createdAt: entry.transactionCreatedAt || entry.createdAt,
      debit: 0,
      credit: 0,
      revenueType: null,
    };

    current.debit += Number(entry.debit || 0);
    current.credit += Number(entry.credit || 0);
    if (REVENUE_KEYS.has(entry.accountKey)) current.revenueType = entry.accountKey;
    byTransaction.set(id, current);
  });

  return [...byTransaction.values()]
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .slice(0, limit);
}
