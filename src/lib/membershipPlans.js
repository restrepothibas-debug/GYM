export const DEFAULT_MEMBERSHIP_PLANS = [
  { planKey: 'diario', name: 'Pase Diario', durationDays: 1, price: 5000, active: true, sortOrder: 10 },
  { planKey: 'semanal', name: 'Plan Semanal', durationDays: 7, price: 20000, active: true, sortOrder: 20 },
  { planKey: 'mensual', name: 'Mensualidad', durationDays: 30, price: 60000, active: true, sortOrder: 30 },
  { planKey: 'trimestral', name: 'Plan Trimestral', durationDays: 90, price: 150000, active: true, sortOrder: 40 },
  { planKey: 'anual', name: 'Plan Anual', durationDays: 365, price: 500000, active: true, sortOrder: 50 },
];

export function normalizePlanKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function sortMembershipPlans(plans) {
  return [...plans].sort((left, right) => (
    Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
    left.name.localeCompare(right.name)
  ));
}

export function getActiveMembershipPlans(plans) {
  return sortMembershipPlans((plans || []).filter(plan => plan.active !== false));
}

export function mapMembershipPlanRow(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planKey: row.plan_key,
    name: row.name,
    durationDays: Number(row.duration_days || 0),
    price: Number(row.price || 0),
    active: row.active !== false,
    sortOrder: Number(row.sort_order || 100),
  };
}

export function toMembershipPlanPayload(plan) {
  /*
   * The plan catalog is tenant configuration, not display-only data. Keep the
   * payload normalized before sending it to Supabase so React components cannot
   * introduce malformed plan keys or negative financial values.
   */
  return {
    plan_key: normalizePlanKey(plan.planKey || plan.name),
    name: String(plan.name || '').trim(),
    duration_days: Math.max(Number(plan.durationDays || 0), 0),
    price: Math.max(Number(plan.price || 0), 0),
    active: plan.active !== false,
    sort_order: Number(plan.sortOrder || 100),
  };
}
