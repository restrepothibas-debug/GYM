import { useContext, useEffect, useMemo, useRef } from 'react';
import { BarChart3, CheckCircle, CircleDollarSign, CreditCard, ReceiptText, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { formatCurrency } from '../lib/accounting';
import { buildAccountingSummary, getRecentLedgerTransactions } from '../lib/accountingReports';

const REVENUE_LABELS = {
  membership_revenue: 'Membresía',
  product_revenue: 'Producto',
  other_income: 'Otros',
};

function AccountingMetric({ icon: Icon, label, value, tone = 'default' }) {
  return (
    <div className={`accounting-metric accounting-metric--${tone}`}>
      <span className="accounting-metric__icon" aria-hidden="true">
        <Icon className="w-4 h-4" />
      </span>
      <span className="accounting-metric__label">{label}</span>
      <strong className="accounting-metric__value">{formatCurrency(value)}</strong>
    </div>
  );
}

function Accounting() {
  const { dataLoading, isRemoteEnabled, ledgerEntries, refreshData } = useContext(GymContext);
  const requestedLedgerRefreshRef = useRef(false);
  const summary = useMemo(() => buildAccountingSummary(ledgerEntries), [ledgerEntries]);
  const recentTransactions = useMemo(() => getRecentLedgerTransactions(ledgerEntries), [ledgerEntries]);

  useEffect(() => {
    /*
     * The dashboard can render before the ledger query finishes on slow remote
     * sessions. Refresh once when entering the accounting module so formal
     * totals do not stay at zero while members/cash data already loaded.
     */
    if (!isRemoteEnabled || dataLoading || requestedLedgerRefreshRef.current || ledgerEntries.length > 0) return;
    requestedLedgerRefreshRef.current = true;
    void refreshData();
  }, [dataLoading, isRemoteEnabled, ledgerEntries.length, refreshData]);

  return (
    <div className="accounting-view animate-fadeIn">
      <div className="accounting-header">
        <div>
          <h3>Contabilidad</h3>
          <p>Ingresos, cartera y doble partida del gimnasio.</p>
        </div>
        <span className={`accounting-balance ${summary.isBalanced ? 'accounting-balance--ok' : 'accounting-balance--warn'}`}>
          <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {summary.isBalanced ? 'Balanceado' : 'Revisar balance'}
        </span>
      </div>

      <section className="accounting-metrics">
        <AccountingMetric icon={CircleDollarSign} label="Membresías" value={summary.membershipRevenue} tone="revenue" />
        <AccountingMetric icon={ReceiptText} label="Productos" value={summary.productRevenue} tone="product" />
        <AccountingMetric icon={TrendingUp} label="Otros ingresos" value={summary.otherIncome} tone="other" />
        <AccountingMetric icon={TrendingDown} label="Gastos" value={summary.operatingExpense} tone="expense" />
      </section>

      <section className="accounting-metrics accounting-metrics--secondary">
        <AccountingMetric icon={WalletCards} label="Caja neta" value={summary.cashNet} tone="cash" />
        <AccountingMetric icon={CreditCard} label="Tarjetas por cobrar" value={summary.cardReceivable} tone="card" />
        <AccountingMetric icon={BarChart3} label="Cuentas por cobrar" value={summary.accountsReceivable} tone="receivable" />
        <AccountingMetric icon={ReceiptText} label="Créditos atletas" value={summary.customerCredits} tone="credit" />
      </section>

      <section className="accounting-ledger">
        <div className="accounting-section-title">
          <h4>Movimientos contables recientes</h4>
          <span>{recentTransactions.length} registros</span>
        </div>
        <div className="accounting-ledger-list">
          {recentTransactions.length === 0 ? (
            <p className="accounting-empty">No hay asientos contables registrados.</p>
          ) : (
            recentTransactions.map(transaction => (
              <article key={transaction.id} className="accounting-ledger-row">
                <div className="accounting-ledger-row__main">
                  <strong>{transaction.description}</strong>
                  <span>{transaction.occurredOn || transaction.createdAt?.slice(0, 10)} · {transaction.sourceTable}</span>
                </div>
                <div className="accounting-ledger-row__amounts">
                  {transaction.revenueType && (
                    <span className="accounting-ledger-row__tag">
                      {REVENUE_LABELS[transaction.revenueType] || transaction.revenueType}
                    </span>
                  )}
                  <strong>{formatCurrency(Math.max(transaction.debit, transaction.credit))}</strong>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default Accounting;
