const TEST_EMAIL = 'manolo@gmail.com';
const TEST_PASSWORD = '123456';
const TENANT_SLUG = 'manolo-office-qa';
const TENANT_NAME = 'Manolo Office QA';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required.');
}

const runId = Date.now();
const startedAt = new Date().toISOString();
const results = [];

function assertStep(name, condition, details = {}) {
  results.push({ name, ok: Boolean(condition), details });
  if (!condition) {
    throw new Error(`${name} failed: ${JSON.stringify(details)}`);
  }
}

async function fetchJson(path, { method = 'GET', token, body, headers = {} } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${supabaseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        apikey: publishableKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || response.statusText;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function signUpOrIgnoreExisting() {
  try {
    await fetchJson('/auth/v1/signup', {
      method: 'POST',
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    return { created: true };
  } catch (error) {
    if (/already|registered|exist/i.test(error.message)) {
      return { created: false };
    }
    throw error;
  }
}

async function signIn() {
  const data = await fetchJson('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
  });

  return {
    accessToken: data.access_token,
    userId: data.user?.id,
  };
}

async function selectRows(token, table, query) {
  return fetchJson(`/rest/v1/${table}?${query}`, { token });
}

async function insertRow(token, table, body, select = 'id') {
  return fetchJson(`/rest/v1/${table}?select=${select}`, {
    method: 'POST',
    token,
    body,
    headers: {
      Prefer: 'return=representation',
    },
  });
}

async function updateRows(token, table, query, body, select = 'id') {
  return fetchJson(`/rest/v1/${table}?${query}&select=${select}`, {
    method: 'PATCH',
    token,
    body,
    headers: {
      Prefer: 'return=representation',
    },
  });
}

async function rpc(token, name, body) {
  return fetchJson(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    token,
    body,
  });
}

async function getOrCreateTenant(token) {
  const existing = await selectRows(token, 'tenants', `select=id,name,slug&slug=eq.${TENANT_SLUG}&limit=1`);
  if (existing.length > 0) return existing[0].id;

  return rpc(token, 'create_tenant_for_current_user', {
    p_name: TENANT_NAME,
    p_slug: TENANT_SLUG,
    p_license_type: 'annual',
  });
}

function sumMoney(rows, field) {
  return rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function groupLedgerByAccount(entries) {
  const grouped = new Map();
  entries.forEach(entry => {
    const key = entry.ledger_accounts?.system_key || 'unknown';
    const current = grouped.get(key) || { debit: 0, credit: 0 };
    current.debit += Number(entry.debit || 0);
    current.credit += Number(entry.credit || 0);
    grouped.set(key, current);
  });
  return grouped;
}

async function run() {
  const signup = await signUpOrIgnoreExisting();
  const { accessToken, userId } = await signIn();
  assertStep('auth.signin', Boolean(accessToken && userId), { userId, signupCreated: signup.created });

  const tenantId = await getOrCreateTenant(accessToken);
  assertStep('tenant.active', Boolean(tenantId), { tenantId });

  // Mirrors the browser post-login workspace gate. If memberships, tenant or license
  // cannot be read with the authenticated user token, the UI must not proceed silently.
  const memberships = await selectRows(
    accessToken,
    'tenant_memberships',
    'select=tenant_id,role,status,created_at&status=eq.active&order=created_at.asc'
  );
  const tenantIds = memberships.map(membership => membership.tenant_id);
  const workspaceTenants = tenantIds.length > 0
    ? await selectRows(
      accessToken,
      'tenants',
      `select=id,name,slug,status,created_at&id=in.(${tenantIds.join(',')})&order=created_at.asc`
    )
    : [];
  const workspaceLicenses = tenantIds.length > 0
    ? await selectRows(
      accessToken,
      'licenses',
      `select=id,tenant_id,license_type,status,seats,starts_on,expires_on&tenant_id=in.(${tenantIds.join(',')})`
    )
    : [];
  const activeLicense = workspaceLicenses.find(license => (
    license.tenant_id === tenantId && ['active', 'trial'].includes(license.status)
  ));
  assertStep('auth.workspace_load_contract', Boolean(
    tenantIds.includes(tenantId) &&
    workspaceTenants.some(tenant => tenant.id === tenantId) &&
    activeLicense
  ), {
    memberships: memberships.length,
    tenants: workspaceTenants.length,
    licenses: workspaceLicenses.length,
    licenseStatus: activeLicense?.status || null,
  });

  const accounts = await selectRows(accessToken, 'ledger_accounts', `select=system_key&tenant_id=eq.${tenantId}`);
  assertStep('ledger.default_accounts', accounts.length >= 8, { count: accounts.length });

  const [customPlan] = await insertRow(accessToken, 'membership_plans', {
    tenant_id: tenantId,
    plan_key: `qa_custom_${runId}`,
    name: `QA Custom ${runId}`,
    duration_days: 11,
    price: 12345,
    sort_order: 900,
  }, 'id,plan_key,duration_days,price');
  const [renewalCustomPlan] = await insertRow(accessToken, 'membership_plans', {
    tenant_id: tenantId,
    plan_key: `qa_renew_${runId}`,
    name: `QA Renewal ${runId}`,
    duration_days: 13,
    price: 23456,
    sort_order: 901,
  }, 'id,plan_key,duration_days,price');
  assertStep('plans.custom_catalog_insert', Boolean(customPlan?.id && renewalCustomPlan?.id), {
    customPlan: customPlan?.plan_key,
    renewalCustomPlan: renewalCustomPlan?.plan_key,
  });

  const customPlanMemberId = await rpc(accessToken, 'create_member', {
    p_tenant_id: tenantId,
    p_name: `Socio Plan Custom QA ${runId}`,
    p_doc: `PLAN-${runId}`,
    p_phone: '3000000002',
    p_plan: customPlan.plan_key,
    p_expiry_date: new Date(Date.now() + 11 * 86400000).toISOString().slice(0, 10),
    p_plan_price: 0,
    p_initial_balance: 0,
  });
  const [customPlanMember] = await selectRows(
    accessToken,
    'members',
    `select=plan,balance&tenant_id=eq.${tenantId}&id=eq.${customPlanMemberId}`
  );
  assertStep('plans.custom_plan_enrollment', Boolean(
    customPlanMemberId &&
    customPlanMember?.plan === customPlan.plan_key &&
    Number(customPlanMember?.balance) === -12345
  ), {
    customPlanMemberId,
    customPlanMember,
  });

  await rpc(accessToken, 'renew_member_plan', {
    p_tenant_id: tenantId,
    p_member_id: customPlanMemberId,
    p_plan: renewalCustomPlan.plan_key,
    p_duration_days: 0,
    p_price: 0,
  });
  const [renewedCustomPlanMember] = await selectRows(
    accessToken,
    'members',
    `select=plan,balance&tenant_id=eq.${tenantId}&id=eq.${customPlanMemberId}`
  );
  assertStep('plans.custom_plan_renewal', Boolean(
    renewedCustomPlanMember?.plan === renewalCustomPlan.plan_key &&
    Number(renewedCustomPlanMember?.balance) === -35801
  ), {
    renewedCustomPlanMember,
  });

  const [product] = await insertRow(accessToken, 'products', {
    tenant_id: tenantId,
    name: `QA Agua ${runId}`,
    price: 4000,
    stock: 10,
  }, 'id,stock');
  assertStep('products.insert', Boolean(product?.id), { productId: product?.id });

  const memberId = await rpc(accessToken, 'create_member', {
    p_tenant_id: tenantId,
    p_name: `Socio QA ${runId}`,
    p_doc: `QA-${runId}`,
    p_phone: '3000000000',
    p_plan: 'mensual',
    p_expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    p_plan_price: 60000,
    p_initial_balance: 20000,
  });
  assertStep('members.create_with_initial_payment', Boolean(memberId), { memberId });

  await rpc(accessToken, 'record_checkin', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_checkin_date: new Date().toISOString().slice(0, 10),
  });
  await rpc(accessToken, 'record_checkin', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_checkin_date: new Date().toISOString().slice(0, 10),
  });
  const attendance = await selectRows(accessToken, 'attendance_log', `select=id&tenant_id=eq.${tenantId}&member_id=eq.${memberId}`);
  assertStep('attendance.idempotent_today', attendance.length === 1, { count: attendance.length });

  await rpc(accessToken, 'renew_member_plan', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_plan: 'semanal',
    p_duration_days: 7,
    p_price: 20000,
  });

  await rpc(accessToken, 'sell_product', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_product_id: product.id,
    p_payment_method: 'efectivo',
    p_quantity: 1,
  });

  await rpc(accessToken, 'sell_product', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_product_id: product.id,
    p_payment_method: 'credito',
    p_quantity: 1,
  });

  await rpc(accessToken, 'record_payment', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_amount: 30000,
    p_description: 'Pago QA cartera',
  });

  await rpc(accessToken, 'record_cash_movement', {
    p_tenant_id: tenantId,
    p_type: 'egreso',
    p_amount: 7000,
    p_description: 'Gasto QA papeleria',
  });

  const [member] = await selectRows(accessToken, 'members', `select=balance&tenant_id=eq.${tenantId}&id=eq.${memberId}`);
  assertStep('members.balance_after_operations', Number(member?.balance) === -30000, { balance: Number(member?.balance) });

  const [updatedProduct] = await selectRows(accessToken, 'products', `select=stock&tenant_id=eq.${tenantId}&id=eq.${product.id}`);
  assertStep('products.stock_after_sales', Number(updatedProduct?.stock) === 8, { stock: Number(updatedProduct?.stock) });

  const productPurchases = await selectRows(
    accessToken,
    'member_purchases',
    `select=id,sale_total,amount_paid,payment_status,payment_method&tenant_id=eq.${tenantId}&member_id=eq.${memberId}&product_id=eq.${product.id}&order=purchased_at.asc`
  );
  const creditPurchase = productPurchases.find(purchase => purchase.payment_method === 'credito');
  assertStep('products.credit_does_not_touch_member_balance', Boolean(
    creditPurchase &&
    Number(creditPurchase.sale_total) === 4000 &&
    Number(creditPurchase.amount_paid) === 0 &&
    creditPurchase.payment_status === 'credit'
  ), {
    purchases: productPurchases.length,
    creditPurchase,
    memberBalance: Number(member?.balance),
  });

  const productPaymentAllocation = await rpc(accessToken, 'record_member_payment_allocated', {
    p_tenant_id: tenantId,
    p_member_id: memberId,
    p_amount: 4000,
    p_target: 'products',
    p_description: 'Pago QA producto credito',
  });
  const [paidCreditPurchase] = await selectRows(
    accessToken,
    'member_purchases',
    `select=amount_paid,payment_status&tenant_id=eq.${tenantId}&id=eq.${creditPurchase.id}`
  );
  const [memberAfterProductPayment] = await selectRows(
    accessToken,
    'members',
    `select=balance&tenant_id=eq.${tenantId}&id=eq.${memberId}`
  );
  assertStep('payments.product_credit_allocation_rpc', Boolean(
    Number(productPaymentAllocation?.product_applied) === 4000 &&
    Number(productPaymentAllocation?.membership_applied) === 0 &&
    Number(paidCreditPurchase?.amount_paid) === 4000 &&
    paidCreditPurchase?.payment_status === 'paid' &&
    Number(memberAfterProductPayment?.balance) === -30000
  ), {
    allocation: productPaymentAllocation,
    paidCreditPurchase,
    memberBalance: Number(memberAfterProductPayment?.balance),
  });

  const fullPaymentMemberId = await rpc(accessToken, 'create_member', {
    p_tenant_id: tenantId,
    p_name: `Socio Pago Completo QA ${runId}`,
    p_doc: `FULL-${runId}`,
    p_phone: '3000000001',
    p_plan: 'semanal',
    p_expiry_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    p_plan_price: 20000,
    // Regression guard for the enrollment contract:
    // this is payment received for the plan, not a wallet top-up.
    // Full payment must leave balance at 0 and post cash/revenue entries.
    p_initial_balance: 20000,
  });
  const [fullPaymentMember] = await selectRows(
    accessToken,
    'members',
    `select=balance&tenant_id=eq.${tenantId}&id=eq.${fullPaymentMemberId}`
  );
  assertStep('members.full_plan_payment_balance_zero', Number(fullPaymentMember?.balance) === 0, {
    balance: Number(fullPaymentMember?.balance),
  });

  const ledgerTransactions = await selectRows(
    accessToken,
    'ledger_transactions',
    `select=id,source_table,description,created_at&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(startedAt)}`
  );
  assertStep('ledger.transactions_created', ledgerTransactions.length >= 7, { count: ledgerTransactions.length });

  const transactionIds = ledgerTransactions.map(transaction => transaction.id);
  const ledgerEntries = await selectRows(
    accessToken,
    'ledger_entries',
    `select=transaction_id,debit,credit,ledger_accounts(system_key)&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(startedAt)}`
  );

  const totalsByTransaction = new Map();
  ledgerEntries.forEach(entry => {
    if (!transactionIds.includes(entry.transaction_id)) return;
    const current = totalsByTransaction.get(entry.transaction_id) || { debit: 0, credit: 0 };
    current.debit += Number(entry.debit || 0);
    current.credit += Number(entry.credit || 0);
    totalsByTransaction.set(entry.transaction_id, current);
  });

  const unbalanced = [...totalsByTransaction.entries()].filter(([, totals]) => (
    roundMoney(totals.debit) !== roundMoney(totals.credit)
  ));
  assertStep('ledger.each_transaction_balanced', unbalanced.length === 0, { unbalancedCount: unbalanced.length });

  const cashFlow = await selectRows(
    accessToken,
    'cash_flow',
    `select=type,amount,created_at&tenant_id=eq.${tenantId}&created_at=gte.${encodeURIComponent(startedAt)}`
  );
  const cashFlowNet = roundMoney(
    sumMoney(cashFlow.filter(row => row.type === 'ingreso'), 'amount') -
    sumMoney(cashFlow.filter(row => row.type === 'egreso'), 'amount')
  );
  const groupedLedger = groupLedgerByAccount(ledgerEntries);
  const cashLedger = groupedLedger.get('cash') || { debit: 0, credit: 0 };
  const ledgerCashNet = roundMoney(cashLedger.debit - cashLedger.credit);
  assertStep('accounting.cash_matches_cash_flow', ledgerCashNet === cashFlowNet, { ledgerCashNet, cashFlowNet });

  const totalDebit = roundMoney(sumMoney(ledgerEntries, 'debit'));
  const totalCredit = roundMoney(sumMoney(ledgerEntries, 'credit'));
  assertStep('accounting.run_trial_balance', totalDebit === totalCredit, { totalDebit, totalCredit });

  const [inactiveMember] = await updateRows(
    accessToken,
    'members',
    `tenant_id=eq.${tenantId}&id=eq.${memberId}&status=eq.active`,
    { status: 'inactive' },
    'id,status'
  );
  const activeMemberRows = await selectRows(accessToken, 'members', `select=id&tenant_id=eq.${tenantId}&id=eq.${memberId}&status=eq.active`);
  const retainedPurchases = await selectRows(accessToken, 'member_purchases', `select=id&tenant_id=eq.${tenantId}&member_id=eq.${memberId}`);
  const retainedAttendance = await selectRows(accessToken, 'attendance_log', `select=id&tenant_id=eq.${tenantId}&member_id=eq.${memberId}`);
  assertStep('members.deactivate_preserves_history', Boolean(
    inactiveMember?.status === 'inactive' &&
    activeMemberRows.length === 0 &&
    retainedPurchases.length >= 2 &&
    retainedAttendance.length >= 1
  ), {
    status: inactiveMember?.status || null,
    activeRows: activeMemberRows.length,
    retainedPurchases: retainedPurchases.length,
    retainedAttendance: retainedAttendance.length,
  });

  return {
    email: TEST_EMAIL,
    tenantId,
    memberId,
    productId: product.id,
    startedAt,
    results,
  };
}

run()
  .then(report => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch(error => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      status: error.status,
      results,
    }, null, 2));
    process.exit(1);
  });
