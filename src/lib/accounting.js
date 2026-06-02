export const PRODUCT_PAYMENT_METHOD_LABELS = {
  credito: 'Credito',
  asignado: 'Credito legado',
  monedero: 'Credito legado',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
};

const PAID_PRODUCT_METHODS = new Set(['efectivo', 'tarjeta']);

export function formatCurrency(value) {
  return `$${Math.abs(Number(value || 0)).toLocaleString()}`;
}

export function normalizeProductMethod(method) {
  if (method === 'asignado' || method === 'monedero') return 'credito';
  return method || 'credito';
}

export function getProductSaleTotal(product) {
  return Number(product?.saleTotal ?? product?.price ?? 0);
}

export function getProductAmountPaid(product) {
  if (product?.amountPaid !== undefined && product?.amountPaid !== null) {
    return Number(product.amountPaid || 0);
  }

  const method = normalizeProductMethod(product?.method);
  return PAID_PRODUCT_METHODS.has(method) ? getProductSaleTotal(product) : 0;
}

export function getProductDebtAmount(product) {
  if (product?.status === 'legacy_balance_charge') return 0;
  return Math.max(getProductSaleTotal(product) - getProductAmountPaid(product), 0);
}

export function getMemberDebtBreakdown(member) {
  const membershipDebt = Math.max(-(Number(member?.balance) || 0), 0);
  const productItems = (member?.products || [])
    .map(product => ({
      ...product,
      due: getProductDebtAmount(product),
      saleTotal: getProductSaleTotal(product),
      amountPaid: getProductAmountPaid(product),
      method: normalizeProductMethod(product.method),
    }))
    .filter(product => product.due > 0);
  const productDebt = productItems.reduce((sum, product) => sum + product.due, 0);

  return {
    membershipDebt,
    productDebt,
    productItems,
    totalDebt: membershipDebt + productDebt,
  };
}
