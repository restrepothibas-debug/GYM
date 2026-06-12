/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeProductMethod } from '../lib/accounting';
import { getBiometricAdapter, getBiometricDeviceStatus as detectBiometricDeviceStatus } from '../lib/biometrics/biometricRegistry';
import { BIOMETRIC_ENROLLMENT_STATUS, BIOMETRIC_PROVIDER_IDS, getBiometricProvider } from '../lib/biometrics/biometricTypes';
import { addDaysToDateString, getTodayDateString } from '../lib/dateUtils';
import { DEFAULT_MEMBERSHIP_PLANS, mapMembershipPlanRow, sortMembershipPlans, toMembershipPlanPayload } from '../lib/membershipPlans';
import { DEFAULT_CASH_FLOW, DEFAULT_MEMBERS, DEFAULT_PRODUCTS, getDefaultCheckinsToday } from '../lib/seedData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export const GymContext = createContext();

const ACTIVE_TENANT_KEY = 'gym_active_tenant_id';
const LOCAL_TENANT_ID = 'local-gym';
const LOCAL_TENANT_IDENTITY_KEY = 'gym_tenant_identity';
const LOCAL_MEMBERSHIP_PLANS_KEY = 'gym_membership_plans';
const LOCAL_BIOMETRICS_KEY = 'gym_member_biometrics';
const BIOMETRIC_PROVIDER_KEY = 'gym_biometric_provider';
const REMOTE_REQUEST_TIMEOUT_MS = 15000;
const BUTTON_REPEAT_GUARD_MS = 1200;
const ENABLE_REMOTE_SUPABASE = import.meta.env.MODE !== 'test' && hasSupabaseConfig;
const USE_SEED_DATA = import.meta.env.MODE !== 'test';
const LOCAL_MEMBER_FALLBACK = USE_SEED_DATA ? DEFAULT_MEMBERS : [];
const LOCAL_PRODUCT_FALLBACK = USE_SEED_DATA ? DEFAULT_PRODUCTS : [];
const LOCAL_CASH_FALLBACK = USE_SEED_DATA ? DEFAULT_CASH_FLOW : [];
const TENANT_BASE_FIELDS = [
  'id',
  'name',
  'slug',
  'status',
  'created_at',
];
const TENANT_IDENTITY_FIELDS = [
  'legal_name',
  'tax_id',
  'phone',
  'email',
  'address',
  'city',
  'logo_url',
  'brand_color',
  'receipt_footer',
];
const TENANT_BASE_SELECT = TENANT_BASE_FIELDS.join(',');
const TENANT_IDENTITY_SELECT = [
  ...TENANT_BASE_FIELDS,
  ...TENANT_IDENTITY_FIELDS,
].join(',');
const DEFAULT_TENANT_IDENTITY_FIELDS = {
  legal_name: '',
  tax_id: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  logo_url: '',
  brand_color: null,
  receipt_footer: '',
};
const BIOMETRIC_METADATA_SELECT = [
  'id',
  'member_id',
  'provider',
  'device_model',
  'template_format',
  'finger_label',
  'status',
  'consent_at',
  'revoked_at',
  'created_at',
  'updated_at',
].join(',');
const DEFAULT_LOCAL_TENANT = {
  id: LOCAL_TENANT_ID,
  name: 'Gimnasio local',
  slug: LOCAL_TENANT_ID,
  status: 'active',
  created_at: null,
  ...DEFAULT_TENANT_IDENTITY_FIELDS,
};

function readStorageArray(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can be unavailable in private/browser test contexts.
  }
}

function readStorageObject(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage failures must not block the app; remote mode remains RLS-bound.
  }
}

function readStorageText(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorageText(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Workstation-level preferences are optional; app logic keeps running.
  }
}

function getStoredActiveTenantId() {
  try {
    return localStorage.getItem(ACTIVE_TENANT_KEY);
  } catch {
    return null;
  }
}

function setStoredActiveTenantId(tenantId) {
  try {
    if (tenantId) localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    else localStorage.removeItem(ACTIVE_TENANT_KEY);
  } catch {
    // Ignore storage failures; RLS still controls access server-side.
  }
}

function getTodaysCheckinsFromStorage() {
  const today = getTodayDateString();
  const fallback = USE_SEED_DATA ? getDefaultCheckinsToday() : [];
  return readStorageArray('gym_checkins', fallback)
    .filter(checkin => (checkin.date || today) === today)
    .map(checkin => ({ ...checkin, date: checkin.date || today }));
}

function normalizeAmount(value) {
  return Number(value || 0);
}

function formatCheckinTime(value) {
  if (!value) return '';
  const [hourValue = '0', minute = '00'] = String(value).split(':');
  const hour = Number(hourValue);
  if (Number.isNaN(hour)) return String(value).slice(0, 5);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, '0')}:${minute.padStart(2, '0')} ${suffix}`;
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: normalizeAmount(row.price),
    stock: Number(row.stock || 0),
    status: row.status,
  };
}

function mapCashFlow(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    amount: normalizeAmount(row.amount),
    description: row.description || '',
    date: row.date,
  };
}

function mapLedgerEntry(row) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    memberId: row.member_id,
    debit: normalizeAmount(row.debit),
    credit: normalizeAmount(row.credit),
    memo: row.memo || '',
    createdAt: row.created_at,
    accountKey: row.ledger_accounts?.system_key || '',
    accountName: row.ledger_accounts?.name || '',
    accountType: row.ledger_accounts?.account_type || '',
    transactionDescription: row.ledger_transactions?.description || '',
    occurredOn: row.ledger_transactions?.occurred_on || null,
    sourceTable: row.ledger_transactions?.source_table || '',
    transactionCreatedAt: row.ledger_transactions?.created_at || row.created_at,
  };
}

function mapMembershipEvent(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    eventType: row.event_type,
    planKey: row.plan_key,
    previousExpiryDate: row.previous_expiry_date,
    newExpiryDate: row.new_expiry_date,
    durationDays: Number(row.duration_days || 0),
    amount: normalizeAmount(row.amount),
    note: row.note || '',
    createdAt: row.created_at,
  };
}

function buildMembers(memberRows, attendanceRows, purchaseRows) {
  const attendanceByMember = new Map();
  const purchasesByMember = new Map();

  attendanceRows.forEach(row => {
    const existing = attendanceByMember.get(row.member_id) || [];
    existing.push(row.checkin_date);
    attendanceByMember.set(row.member_id, existing);
  });

  purchaseRows.forEach(row => {
    const existing = purchasesByMember.get(row.member_id) || [];
    existing.push({
      name: row.product_name,
      price: normalizeAmount(row.sale_total || row.total_paid || row.unit_price),
      saleTotal: normalizeAmount(row.sale_total || row.total_paid || row.unit_price),
      amountPaid: normalizeAmount(row.amount_paid),
      method: normalizeProductMethod(row.payment_method),
      status: row.payment_status || (
        ['credito', 'asignado'].includes(row.payment_method)
          ? 'credit'
          : row.payment_method === 'monedero'
            ? 'legacy_balance_charge'
            : 'paid'
      ),
      date: row.purchased_at?.slice(0, 10),
    });
    purchasesByMember.set(row.member_id, existing);
  });

  return memberRows.map(row => ({
    id: row.id,
    name: row.name,
    doc: row.doc,
    phone: row.phone || '',
    balance: normalizeAmount(row.balance),
    plan: row.plan,
    expiryDate: row.expiry_date,
    status: row.status,
    attendance: attendanceByMember.get(row.id) || [],
    products: purchasesByMember.get(row.id) || [],
  }));
}

function buildTodayCheckins(attendanceRows, activeMemberIds = null) {
  const today = getTodayDateString();
  return attendanceRows
    .filter(row => (
      row.checkin_date === today &&
      (!activeMemberIds || activeMemberIds.has(row.member_id))
    ))
    .map(row => ({
      memberId: row.member_id,
      time: formatCheckinTime(row.checkin_time),
      date: row.checkin_date,
    }));
}

function getErrorMessage(error) {
  return error?.message || 'No se pudo completar la operacion.';
}

function withRemoteTimeout(promise, label) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(new Error(`${label} tardo mas de ${REMOTE_REQUEST_TIMEOUT_MS / 1000} segundos. Reintenta o valida la conexion con Supabase.`));
    }, REMOTE_REQUEST_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timerId));
}

function normalizeSlug(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function normalizeIdentityText(value) {
  return String(value || '').trim();
}

function normalizeBrandColor(value) {
  const color = normalizeIdentityText(value);
  if (!color) return null;
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

function normalizeTenantIdentityPayload(identity = {}, fallbackName = DEFAULT_LOCAL_TENANT.name) {
  /*
   * Tenant identity is presentation/contact metadata only. It is intentionally
   * kept separate from tenant routing (`slug`), membership roles and licenses so
   * future agents cannot accidentally turn a branding edit into an access change.
   */
  return {
    name: normalizeIdentityText(identity.name) || fallbackName,
    legal_name: normalizeIdentityText(identity.legal_name),
    tax_id: normalizeIdentityText(identity.tax_id),
    phone: normalizeIdentityText(identity.phone),
    email: normalizeIdentityText(identity.email),
    address: normalizeIdentityText(identity.address),
    city: normalizeIdentityText(identity.city),
    logo_url: normalizeIdentityText(identity.logo_url),
    brand_color: normalizeBrandColor(identity.brand_color),
    receipt_footer: normalizeIdentityText(identity.receipt_footer),
  };
}

function buildLocalTenant(storedTenant = DEFAULT_LOCAL_TENANT) {
  const identity = normalizeTenantIdentityPayload(
    storedTenant,
    storedTenant?.name || DEFAULT_LOCAL_TENANT.name,
  );

  return {
    ...DEFAULT_LOCAL_TENANT,
    ...storedTenant,
    ...identity,
    id: storedTenant?.id || DEFAULT_LOCAL_TENANT.id,
    slug: storedTenant?.slug || DEFAULT_LOCAL_TENANT.slug,
    status: storedTenant?.status || DEFAULT_LOCAL_TENANT.status,
  };
}

function withDefaultTenantIdentityFields(tenant) {
  return {
    ...DEFAULT_TENANT_IDENTITY_FIELDS,
    ...tenant,
    brand_color: tenant?.brand_color || null,
  };
}

function mapBiometricRow(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    provider: row.provider,
    deviceModel: row.device_model || '',
    templateFormat: row.template_format || '',
    fingerLabel: row.finger_label || 'right_index',
    status: row.status || BIOMETRIC_ENROLLMENT_STATUS.active,
    consentAt: row.consent_at || null,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeStoredBiometricEnrollment(enrollment) {
  const fallbackId = globalThis.crypto?.randomUUID?.() || `biometric-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: enrollment.id || fallbackId,
    memberId: enrollment.memberId,
    provider: enrollment.provider || BIOMETRIC_PROVIDER_IDS.mock,
    deviceModel: enrollment.deviceModel || '',
    templateFormat: enrollment.templateFormat || 'mock-v1',
    templateEncrypted: enrollment.templateEncrypted || null,
    fingerLabel: enrollment.fingerLabel || 'right_index',
    status: enrollment.status || BIOMETRIC_ENROLLMENT_STATUS.active,
    consentAt: enrollment.consentAt || new Date().toISOString(),
    revokedAt: enrollment.revokedAt || null,
    createdAt: enrollment.createdAt || new Date().toISOString(),
    updatedAt: enrollment.updatedAt || new Date().toISOString(),
  };
}

function isMissingBiometricsTableError(error) {
  return ['42P01', 'PGRST205'].includes(error?.code);
}

function isMissingTenantIdentityColumnError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const mentionsIdentityField = TENANT_IDENTITY_FIELDS.some(field => message.includes(field));
  return (
    ['42703', 'PGRST204'].includes(error?.code) &&
    (
      mentionsIdentityField ||
      (message.includes('tenants') && /column|schema cache/.test(message))
    )
  );
}

function createClientId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCheckinKey(memberId, date) {
  return `${memberId}:${date || getTodayDateString()}`;
}

function collectKnownCheckinKeys(members = [], checkins = []) {
  const keys = new Set();

  checkins.forEach(checkin => {
    if (checkin.memberId && checkin.date) keys.add(getCheckinKey(checkin.memberId, checkin.date));
  });

  members.forEach(member => {
    const attendance = Array.isArray(member.attendance) ? member.attendance : [];
    attendance.forEach(date => keys.add(getCheckinKey(member.id, date)));
  });

  return keys;
}

export function GymProvider({ children }) {
  const isRemoteEnabled = ENABLE_REMOTE_SUPABASE;
  const [localTenant, setLocalTenant] = useState(() => (
    isRemoteEnabled
      ? null
      : buildLocalTenant(readStorageObject(LOCAL_TENANT_IDENTITY_KEY, DEFAULT_LOCAL_TENANT))
  ));
  const [members, setMembers] = useState(() => (
    isRemoteEnabled ? [] : readStorageArray('gym_members', LOCAL_MEMBER_FALLBACK)
  ));
  const [products, setProducts] = useState(() => (
    isRemoteEnabled ? [] : readStorageArray('gym_products', LOCAL_PRODUCT_FALLBACK)
  ));
  const [membershipPlans, setMembershipPlans] = useState(() => (
    isRemoteEnabled
      ? []
      : sortMembershipPlans(readStorageArray(LOCAL_MEMBERSHIP_PLANS_KEY, DEFAULT_MEMBERSHIP_PLANS))
  ));
  const [cashFlow, setCashFlow] = useState(() => (
    isRemoteEnabled ? [] : readStorageArray('gym_cashflow', LOCAL_CASH_FALLBACK)
  ));
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [membershipEvents, setMembershipEvents] = useState([]);
  const [checkinsToday, setCheckinsToday] = useState(() => (
    isRemoteEnabled ? [] : getTodaysCheckinsFromStorage()
  ));
  const [memberBiometrics, setMemberBiometrics] = useState(() => (
    isRemoteEnabled
      ? []
      : readStorageArray(LOCAL_BIOMETRICS_KEY, []).map(normalizeStoredBiometricEnrollment)
  ));
  const [biometricProvider, setBiometricProviderState] = useState(() => (
    getBiometricProvider(readStorageText(BIOMETRIC_PROVIDER_KEY, BIOMETRIC_PROVIDER_IDS.mock)).id
  ));
  const [biometricDeviceStatus, setBiometricDeviceStatus] = useState(null);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isRemoteEnabled);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState(null);
  const [tenantIdentitySchemaReady, setTenantIdentitySchemaReady] = useState(!isRemoteEnabled);
  const sessionUserId = session?.user?.id || null;
  const workspaceLoadRef = useRef(0);
  const membersRef = useRef(members);
  const productsRef = useRef(products);
  const checkinsTodayRef = useRef(checkinsToday);
  const knownCheckinKeysRef = useRef(collectKnownCheckinKeys(members, checkinsToday));
  const pendingCheckinKeysRef = useRef(new Set());
  const pendingProductSaleKeysRef = useRef(new Set());
  const recentProductSaleKeysRef = useRef(new Map());

  const resetRemoteState = useCallback(() => {
    workspaceLoadRef.current += 1;
    pendingCheckinKeysRef.current.clear();
    pendingProductSaleKeysRef.current.clear();
    recentProductSaleKeysRef.current.clear();
    knownCheckinKeysRef.current.clear();
    setWorkspaceLoading(false);
    setWorkspaceLoaded(false);
    setDataLoading(false);
    setTenants([]);
    setActiveTenantId(null);
    setStoredActiveTenantId(null);
    setMembers([]);
    setProducts([]);
    setMembershipPlans([]);
    setCashFlow([]);
    setLedgerEntries([]);
    setMembershipEvents([]);
    setCheckinsToday([]);
    setMemberBiometrics([]);
    setTenantIdentitySchemaReady(true);
  }, []);

  useEffect(() => {
    membersRef.current = members;
    knownCheckinKeysRef.current = collectKnownCheckinKeys(members, checkinsTodayRef.current);
    if (isRemoteEnabled) return;
    writeStorageArray('gym_members', members);
  }, [isRemoteEnabled, members]);

  useEffect(() => {
    productsRef.current = products;
    if (isRemoteEnabled) return;
    writeStorageArray('gym_products', products);
  }, [isRemoteEnabled, products]);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray(LOCAL_MEMBERSHIP_PLANS_KEY, membershipPlans);
  }, [isRemoteEnabled, membershipPlans]);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray('gym_cashflow', cashFlow);
  }, [cashFlow, isRemoteEnabled]);

  useEffect(() => {
    checkinsTodayRef.current = checkinsToday;
    knownCheckinKeysRef.current = collectKnownCheckinKeys(membersRef.current, checkinsToday);
    if (isRemoteEnabled) return;
    writeStorageArray('gym_checkins', checkinsToday);
  }, [checkinsToday, isRemoteEnabled]);

  useEffect(() => {
    if (isRemoteEnabled || !localTenant) return;
    writeStorageObject(LOCAL_TENANT_IDENTITY_KEY, localTenant);
  }, [isRemoteEnabled, localTenant]);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray(LOCAL_BIOMETRICS_KEY, memberBiometrics);
  }, [isRemoteEnabled, memberBiometrics]);

  useEffect(() => {
    /*
     * Reader choice is a workstation preference, not tenant data. A gym can use
     * SecuGen at reception and another provider on a desktop package without
     * changing the shared database state.
     */
    writeStorageText(BIOMETRIC_PROVIDER_KEY, biometricProvider);
  }, [biometricProvider]);

  useEffect(() => {
    if (!isRemoteEnabled || !supabase) return undefined;

    let mounted = true;
    withRemoteTimeout(supabase.auth.getSession(), 'Validar sesion')
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        if (!data.session) resetRemoteState();
      })
      .catch((sessionError) => {
        if (!mounted) return;
        setError(getErrorMessage(sessionError));
        resetRemoteState();
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) resetRemoteState();
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [isRemoteEnabled, resetRemoteState]);

  const activeTenant = useMemo(() => {
    if (!isRemoteEnabled) return localTenant;
    return tenants.find(tenant => tenant.id === activeTenantId) || null;
  }, [activeTenantId, isRemoteEnabled, localTenant, tenants]);
  const activeLicense = activeTenant?.license || null;

  const loadBiometricEnrollments = useCallback(async (tenantId) => {
    if (!isRemoteEnabled || !supabase || !tenantId) return;

    try {
      const { data, error: biometricsError } = await withRemoteTimeout(
        supabase
          .from('member_biometrics')
          .select(BIOMETRIC_METADATA_SELECT)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        'Cargar datos biométricos',
      );

      if (biometricsError) {
        if (isMissingBiometricsTableError(biometricsError)) {
          setMemberBiometrics([]);
          return;
        }
        throw biometricsError;
      }

      setMemberBiometrics((data || []).map(mapBiometricRow));
    } catch (requestError) {
      if (!isMissingBiometricsTableError(requestError)) {
        setError(getErrorMessage(requestError));
      }
      setMemberBiometrics([]);
    }
  }, [isRemoteEnabled]);

  const loadTenantData = useCallback(async (tenantId) => {
    if (!isRemoteEnabled || !supabase || !tenantId) return;

    setDataLoading(true);
    setError('');
    try {
      const [
        membersResult,
        productsResult,
        membershipPlansResult,
        cashFlowResult,
        ledgerResult,
        membershipEventsResult,
        attendanceResult,
        purchasesResult,
      ] = await withRemoteTimeout(
        Promise.all([
          supabase
            .from('members')
            .select('id,name,doc,phone,balance,plan,expiry_date,status,created_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
          supabase
            .from('products')
            .select('id,name,price,stock,status,created_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
          supabase
            .from('membership_plans')
            .select('id,tenant_id,plan_key,name,duration_days,price,active,sort_order,created_at')
            .eq('tenant_id', tenantId)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
          supabase
            .from('cash_flow')
            .select('id,member_id,type,amount,description,date,created_at')
            .eq('tenant_id', tenantId)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false }),
          supabase
            .from('ledger_entries')
            .select('id,transaction_id,member_id,debit,credit,memo,created_at,ledger_accounts(system_key,name,account_type),ledger_transactions(description,occurred_on,source_table,created_at)')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(500),
          supabase
            .from('member_membership_events')
            .select('id,member_id,event_type,plan_key,previous_expiry_date,new_expiry_date,duration_days,amount,note,created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(500),
          supabase
            .from('attendance_log')
            .select('member_id,checkin_date,checkin_time,created_at')
            .eq('tenant_id', tenantId)
            .order('checkin_date', { ascending: false }),
          supabase
          .from('member_purchases')
          .select('member_id,product_name,unit_price,total_paid,sale_total,amount_paid,payment_status,quantity,payment_method,purchased_at')
          .eq('tenant_id', tenantId)
          .order('purchased_at', { ascending: false }),
        ]),
        'Cargar datos de la cuenta'
      );

      const requestError = [
        membersResult,
        productsResult,
        membershipPlansResult,
        cashFlowResult,
        ledgerResult,
        membershipEventsResult,
        attendanceResult,
        purchasesResult,
      ].find(result => result.error)?.error;
      if (requestError) throw requestError;

      const attendanceRows = attendanceResult.data || [];
      const memberRows = membersResult.data || [];
      const activeMemberIds = new Set(memberRows.map(member => member.id));
      setMembers(buildMembers(memberRows, attendanceRows, purchasesResult.data || []));
      setProducts((productsResult.data || []).map(mapProduct));
      setMembershipPlans(sortMembershipPlans((membershipPlansResult.data || []).map(mapMembershipPlanRow)));
      setCashFlow((cashFlowResult.data || []).map(mapCashFlow));
      setLedgerEntries((ledgerResult.data || []).map(mapLedgerEntry));
      setMembershipEvents((membershipEventsResult.data || []).map(mapMembershipEvent));
      setCheckinsToday(buildTodayCheckins(attendanceRows, activeMemberIds));
      await loadBiometricEnrollments(tenantId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDataLoading(false);
    }
  }, [isRemoteEnabled, loadBiometricEnrollments]);

  const loadTenants = useCallback(async (preferredTenantId) => {
    if (!isRemoteEnabled || !supabase || !sessionUserId) return;

    const loadId = workspaceLoadRef.current + 1;
    workspaceLoadRef.current = loadId;
    setWorkspaceLoading(true);
    setWorkspaceLoaded(false);
    setError('');
    try {
      // Workspace loading is the critical post-login gate. Keep every remote call bounded
      // and ignore stale responses so future auth changes cannot leave the app spinning.
      const { data: memberships, error: membershipsError } = await withRemoteTimeout(
        supabase
          .from('tenant_memberships')
          .select('tenant_id,role,status,created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: true }),
        'Cargar membresias de la cuenta'
      );

      if (loadId !== workspaceLoadRef.current) return;

      if (membershipsError) throw membershipsError;

      const tenantIds = (memberships || []).map(membership => membership.tenant_id);
      if (tenantIds.length === 0) {
        setTenants([]);
        setActiveTenantId(null);
        setStoredActiveTenantId(null);
        setMembers([]);
        setProducts([]);
        setCashFlow([]);
        setCheckinsToday([]);
        setTenantIdentitySchemaReady(true);
        setWorkspaceLoaded(true);
        return;
      }

      const [tenantsResult, licensesResult] = await withRemoteTimeout(
        Promise.all([
          supabase
            .from('tenants')
            .select(TENANT_IDENTITY_SELECT)
            .in('id', tenantIds)
            .order('created_at', { ascending: true }),
          supabase
            .from('licenses')
            .select('id,tenant_id,license_type,status,seats,starts_on,expires_on')
            .in('tenant_id', tenantIds),
        ]),
        'Cargar tenant y licencia'
      );

      if (loadId !== workspaceLoadRef.current) return;

      if (licensesResult.error) throw licensesResult.error;
      let tenantRows = tenantsResult.data || [];
      let nextTenantIdentitySchemaReady = true;

      if (tenantsResult.error) {
        if (!isMissingTenantIdentityColumnError(tenantsResult.error)) throw tenantsResult.error;

        /*
         * The identity/contact columns are optional until their migration is
         * applied remotely. Workspace loading must still succeed with the stable
         * tenant contract so login, license validation and business operations
         * are not blocked by a presentation-only schema drift.
         */
        nextTenantIdentitySchemaReady = false;
        const { data: baseTenantRows, error: baseTenantError } = await withRemoteTimeout(
          supabase
            .from('tenants')
            .select(TENANT_BASE_SELECT)
            .in('id', tenantIds)
            .order('created_at', { ascending: true }),
          'Cargar tenant base',
        );

        if (loadId !== workspaceLoadRef.current) return;
        if (baseTenantError) throw baseTenantError;
        tenantRows = baseTenantRows || [];
      }

      const licensesByTenant = new Map((licensesResult.data || []).map(license => [license.tenant_id, license]));
      const membershipsByTenant = new Map((memberships || []).map(membership => [membership.tenant_id, membership]));
      const mappedTenants = tenantRows.map(tenant => ({
        ...withDefaultTenantIdentityFields(tenant),
        role: membershipsByTenant.get(tenant.id)?.role,
        license: licensesByTenant.get(tenant.id) || null,
      }));

      const storedTenantId = preferredTenantId || getStoredActiveTenantId();
      const nextTenant = mappedTenants.find(tenant => tenant.id === storedTenantId) || mappedTenants[0];
      setTenants(mappedTenants);
      setActiveTenantId(nextTenant?.id || null);
      setStoredActiveTenantId(nextTenant?.id || null);
      setTenantIdentitySchemaReady(nextTenantIdentitySchemaReady);
      setWorkspaceLoaded(true);
    } catch (requestError) {
      setWorkspaceLoaded(false);
      setError(getErrorMessage(requestError));
    } finally {
      if (loadId === workspaceLoadRef.current) setWorkspaceLoading(false);
    }
  }, [isRemoteEnabled, sessionUserId]);

  useEffect(() => {
    if (!isRemoteEnabled) return;
    if (!sessionUserId) return;
    void Promise.resolve().then(() => loadTenants());
  }, [isRemoteEnabled, loadTenants, sessionUserId]);

  useEffect(() => {
    if (!isRemoteEnabled || !activeTenantId) return;
    setStoredActiveTenantId(activeTenantId);
    void Promise.resolve().then(() => loadTenantData(activeTenantId));
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const refreshData = useCallback(async () => {
    if (!isRemoteEnabled || !activeTenantId) return;
    await loadTenantData(activeTenantId);
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const refreshWorkspace = useCallback(async () => {
    if (!isRemoteEnabled || !sessionUserId) return;
    await loadTenants(activeTenantId);
  }, [activeTenantId, isRemoteEnabled, loadTenants, sessionUserId]);

  const signIn = useCallback(async ({ email, password }) => {
    if (!supabase) return { error: new Error('Supabase no esta configurado.') };
    setError('');
    try {
      const { data, error: authError } = await withRemoteTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        'Iniciar sesion'
      );
      if (authError) setError(getErrorMessage(authError));
      if (data?.session) {
        setWorkspaceLoaded(false);
        setSession(data.session);
      }
      return { data, error: authError };
    } catch (authError) {
      setError(getErrorMessage(authError));
      return { data: null, error: authError };
    }
  }, []);

  const signUp = useCallback(async ({ email, password }) => {
    if (!supabase) return { error: new Error('Supabase no esta configurado.') };
    setError('');
    try {
      const { data, error: authError } = await withRemoteTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        }),
        'Crear cuenta'
      );
      if (authError) setError(getErrorMessage(authError));
      if (data?.session) {
        setWorkspaceLoaded(false);
        setSession(data.session);
      }
      return { data, error: authError, needsConfirmation: Boolean(data?.user && !data?.session) };
    } catch (authError) {
      setError(getErrorMessage(authError));
      return { data: null, error: authError, needsConfirmation: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    resetRemoteState();
    if (!supabase) return;
    setError('');
    try {
      await supabase.auth.signOut();
    } catch (authError) {
      // Background logout failures are ignored as the local state is already cleared.
      console.warn('Sign out error:', authError);
    }
  }, [resetRemoteState]);

  const switchTenant = useCallback((tenantId) => {
    if (!tenants.some(tenant => tenant.id === tenantId)) return;
    setActiveTenantId(tenantId);
  }, [tenants]);

  const createTenant = useCallback(async ({ name, slug, licenseType }) => {
    if (!isRemoteEnabled || !supabase) return false;
    setError('');
    const normalizedSlug = normalizeSlug(slug || name);
    const { data, error: rpcError } = await supabase.rpc('create_tenant_for_current_user', {
      p_name: name,
      p_slug: normalizedSlug,
      p_license_type: licenseType || 'annual',
    });

    if (rpcError) {
      setError(getErrorMessage(rpcError));
      return false;
    }

    await loadTenants(data);
    return true;
  }, [isRemoteEnabled, loadTenants]);

  const updateTenantIdentity = useCallback(async (identity) => {
    const payload = normalizeTenantIdentityPayload(
      identity,
      activeTenant?.name || DEFAULT_LOCAL_TENANT.name,
    );

    if (!payload.name) {
      setError('El nombre del gimnasio es obligatorio.');
      return false;
    }

    if (!isRemoteEnabled) {
      /*
       * Local/demo mode has no tenant_memberships or RLS round-trip. Persist the
       * same tenant-shaped object used by remote mode so UI components do not
       * need separate branding branches.
       */
      setLocalTenant(currentTenant => buildLocalTenant({
        ...currentTenant,
        ...payload,
      }));
      return true;
    }

    if (!supabase || !activeTenantId) return false;

    setError('');
    try {
      /*
       * Identity updates target the current tenant row only. The stable slug,
       * activeTenantId, memberships and license are intentionally excluded so an
       * admin branding edit cannot break tenant routing or authorization state.
       */
      const tenantUpdatePayload = tenantIdentitySchemaReady
        ? payload
        : { name: payload.name };
      const tenantSelect = tenantIdentitySchemaReady
        ? TENANT_IDENTITY_SELECT
        : TENANT_BASE_SELECT;

      const { data, error: updateError } = await withRemoteTimeout(
        supabase
          .from('tenants')
          .update({
            ...tenantUpdatePayload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeTenantId)
          .select(tenantSelect)
          .single(),
        'Actualizar identidad del gimnasio',
      );

      if (updateError) {
        if (isMissingTenantIdentityColumnError(updateError)) {
          setTenantIdentitySchemaReady(false);
          setError('La migracion de identidad del gimnasio no esta aplicada en Supabase. La app puede operar con datos basicos; aplica supabase/migrations/20260605171801_add_gym_identity_fields.sql para editar contacto, logo y recibos.');
          return false;
        }
        throw updateError;
      }

      const normalizedTenantData = withDefaultTenantIdentityFields(data);

      setTenants(currentTenants => currentTenants.map(tenant => (
        tenant.id === data.id
          ? {
              ...tenant,
              ...normalizedTenantData,
              role: tenant.role,
              license: tenant.license,
            }
          : tenant
      )));

      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return false;
    }
  }, [activeTenant?.name, activeTenantId, isRemoteEnabled, tenantIdentitySchemaReady]);

  const setBiometricProvider = useCallback((providerId) => {
    const provider = getBiometricProvider(providerId);
    setBiometricProviderState(provider.id);
    setBiometricDeviceStatus(null);
    return provider.id;
  }, []);

  const refreshBiometricDeviceStatus = useCallback(async () => {
    const status = await detectBiometricDeviceStatus(biometricProvider);
    setBiometricDeviceStatus(status);
    return status;
  }, [biometricProvider]);

  const saveMembershipPlan = useCallback((plan) => {
    const payload = toMembershipPlanPayload(plan);
    if (!payload.plan_key || !payload.name || payload.duration_days <= 0 || payload.price < 0) {
      setError('El plan debe tener nombre, clave, duracion y precio validos.');
      return false;
    }

    if (!isRemoteEnabled) {
      const nextPlan = {
        id: plan.id || createClientId('plan'),
        planKey: payload.plan_key,
        name: payload.name,
        durationDays: payload.duration_days,
        price: payload.price,
        active: payload.active,
        sortOrder: payload.sort_order,
      };

      setMembershipPlans(currentPlans => sortMembershipPlans(
        currentPlans.some(currentPlan => currentPlan.id === nextPlan.id || currentPlan.planKey === nextPlan.planKey)
          ? currentPlans.map(currentPlan => (
              currentPlan.id === nextPlan.id || currentPlan.planKey === nextPlan.planKey
                ? { ...currentPlan, ...nextPlan, id: currentPlan.id || nextPlan.id }
                : currentPlan
            ))
          : [nextPlan, ...currentPlans]
      ));
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');

      const request = plan.id
        ? supabase
            .from('membership_plans')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('tenant_id', activeTenantId)
            .eq('id', plan.id)
            .select('id,tenant_id,plan_key,name,duration_days,price,active,sort_order,created_at')
            .single()
        : supabase
            .from('membership_plans')
            .insert({ ...payload, tenant_id: activeTenantId })
            .select('id,tenant_id,plan_key,name,duration_days,price,active,sort_order,created_at')
            .single();

      const { error: planError } = await request;
      if (planError) {
        setError(getErrorMessage(planError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const deactivateMembershipPlan = useCallback((planIdOrKey) => {
    if (!planIdOrKey) return false;

    if (!isRemoteEnabled) {
      setMembershipPlans(currentPlans => currentPlans.map(plan => (
        plan.id === planIdOrKey || plan.planKey === planIdOrKey
          ? { ...plan, active: false }
          : plan
      )));
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: planError } = await supabase
        .from('membership_plans')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', activeTenantId)
        .eq('id', planIdOrKey);

      if (planError) {
        setError(getErrorMessage(planError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const deleteMembershipPlan = useCallback((planOrId) => {
    const knownPlan = typeof planOrId === 'object'
      ? planOrId
      : membershipPlans.find(plan => plan.id === planOrId || plan.planKey === planOrId);
    const planId = knownPlan?.id || (typeof planOrId === 'object' ? '' : planOrId);
    const planKey = knownPlan?.planKey || (typeof planOrId === 'object' ? '' : planOrId);
    const planInUseMessage = 'Este plan ya tiene socios o historial. Aunque este desactivado, debe conservarse para la auditoria.';

    if (!planId && !planKey) return { ok: false, error: 'No se encontro el plan.' };

    if (membershipPlans.length <= 1) {
      const message = 'Debe quedar al menos un plan en el catalogo.';
      setError(message);
      return { ok: false, error: message };
    }

    if (!isRemoteEnabled) {
      const planIsInUse = members.some(member => member.plan === planKey) ||
        membershipEvents.some(event => event.planKey === planKey);

      if (planIsInUse) {
        setError(planInUseMessage);
        return { ok: false, error: planInUseMessage };
      }

      setMembershipPlans(currentPlans => currentPlans.filter(plan => (
        plan.id !== planId && plan.planKey !== planKey
      )));
      return { ok: true };
    }

    return (async () => {
      if (!supabase || !activeTenantId) return { ok: false, error: 'No hay tenant activo para eliminar el plan.' };
      setError('');

      const [memberUsageResult, eventUsageResult] = await withRemoteTimeout(
        Promise.all([
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', activeTenantId)
            .eq('plan', planKey),
          supabase
            .from('member_membership_events')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', activeTenantId)
            .eq('plan_key', planKey),
        ]),
        'Verificar uso del plan'
      );

      const usageError = memberUsageResult.error || eventUsageResult.error;
      if (usageError) {
        const message = getErrorMessage(usageError);
        setError(message);
        return { ok: false, error: message };
      }

      if ((memberUsageResult.count || 0) > 0 || (eventUsageResult.count || 0) > 0) {
        setError(planInUseMessage);
        return { ok: false, error: planInUseMessage };
      }

      let request = supabase
        .from('membership_plans')
        .delete()
        .eq('tenant_id', activeTenantId);

      request = planId
        ? request.eq('id', planId)
        : request.eq('plan_key', planKey);

      const { data: deletedPlan, error: planError } = await request
        .select('id,plan_key')
        .maybeSingle();

      if (planError) {
        const message = planError.code === '23503'
          ? planInUseMessage
          : getErrorMessage(planError);
        setError(message);
        return { ok: false, error: message };
      }

      if (!deletedPlan) {
        const message = 'No se elimino ningun plan. Aplica la migracion de permisos o confirma que el plan existe en Supabase.';
        setError(message);
        return { ok: false, error: message };
      }

      setMembershipPlans(currentPlans => currentPlans.filter(plan => (
        plan.id !== deletedPlan.id && plan.planKey !== deletedPlan.plan_key
      )));
      await loadTenantData(activeTenantId);
      return { ok: true };
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData, members, membershipEvents, membershipPlans]);

  const getMemberBiometricEnrollment = useCallback((memberId) => (
    memberBiometrics.find(enrollment => (
      enrollment.memberId === memberId &&
      enrollment.provider === biometricProvider &&
      enrollment.status === BIOMETRIC_ENROLLMENT_STATUS.active
    )) || null
  ), [biometricProvider, memberBiometrics]);

  const enrollMemberBiometric = useCallback(async (memberId) => {
    const member = members.find(candidate => candidate.id === memberId);
    if (!member) return { ok: false, error: 'No se encontro el socio.' };

    const adapter = getBiometricAdapter(biometricProvider);
    const status = await adapter.detectDevice();
    setBiometricDeviceStatus({
      provider: getBiometricProvider(biometricProvider),
      ...status,
    });

    if (!status.available) {
      return { ok: false, error: status.message || 'El lector biometrico no esta disponible.' };
    }

    /*
     * Consent is collected by the UI before calling this function. Keep the
     * actual enrollment here so every vendor adapter follows the same tenant,
     * member and revocation rules.
     */
    const sample = await adapter.captureSample({ memberId, member });
    const now = new Date().toISOString();
    const fingerLabel = 'right_index';

    if (!isRemoteEnabled) {
      const enrollment = normalizeStoredBiometricEnrollment({
        id: createClientId('biometric'),
        memberId,
        provider: biometricProvider,
        deviceModel: sample.deviceModel || status.deviceModel || '',
        templateFormat: sample.templateFormat,
        // This is safe only for the mock adapter. Real adapters must provide an
        // encrypted payload or route template storage through a trusted backend.
        templateEncrypted: sample.templateEncrypted,
        fingerLabel,
        status: BIOMETRIC_ENROLLMENT_STATUS.active,
        consentAt: now,
        createdAt: now,
        updatedAt: now,
      });

      setMemberBiometrics(currentEnrollments => [
        enrollment,
        ...currentEnrollments.map(existingEnrollment => (
          existingEnrollment.memberId === memberId &&
          existingEnrollment.provider === biometricProvider &&
          existingEnrollment.fingerLabel === fingerLabel &&
          existingEnrollment.status === BIOMETRIC_ENROLLMENT_STATUS.active
            ? {
                ...existingEnrollment,
                status: BIOMETRIC_ENROLLMENT_STATUS.revoked,
                templateEncrypted: null,
                revokedAt: now,
                updatedAt: now,
              }
            : existingEnrollment
        )),
      ]);

      return { ok: true, member, enrollment };
    }

    if (!supabase || !activeTenantId) return { ok: false, error: 'No hay tenant activo para guardar la huella.' };

    try {
      const { error: revokeError } = await supabase
        .from('member_biometrics')
        .update({
          status: BIOMETRIC_ENROLLMENT_STATUS.revoked,
          template_encrypted: null,
          revoked_at: now,
          updated_at: now,
        })
        .eq('tenant_id', activeTenantId)
        .eq('member_id', memberId)
        .eq('provider', biometricProvider)
        .eq('finger_label', fingerLabel)
        .eq('status', BIOMETRIC_ENROLLMENT_STATUS.active);

      if (revokeError && !isMissingBiometricsTableError(revokeError)) throw revokeError;

      const { data, error: insertError } = await supabase
        .from('member_biometrics')
        .insert({
          tenant_id: activeTenantId,
          member_id: memberId,
          provider: biometricProvider,
          device_model: sample.deviceModel || status.deviceModel || null,
          template_format: sample.templateFormat,
          template_encrypted: sample.templateEncrypted,
          finger_label: fingerLabel,
          status: BIOMETRIC_ENROLLMENT_STATUS.active,
          consent_at: now,
        })
        .select(BIOMETRIC_METADATA_SELECT)
        .single();

      if (insertError) throw insertError;

      const enrollment = mapBiometricRow(data);
      setMemberBiometrics(currentEnrollments => [
        enrollment,
        ...currentEnrollments.filter(existingEnrollment => existingEnrollment.id !== enrollment.id),
      ]);
      return { ok: true, member, enrollment };
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      return { ok: false, error: message };
    }
  }, [activeTenantId, biometricProvider, isRemoteEnabled, members]);

  const verifyMemberBiometric = useCallback(async (memberId) => {
    const member = members.find(candidate => candidate.id === memberId);
    if (!member) return { ok: false, error: 'No se encontro el socio.' };

    const activeEnrollments = memberBiometrics.filter(enrollment => (
      enrollment.provider === biometricProvider &&
      enrollment.status === BIOMETRIC_ENROLLMENT_STATUS.active
    ));
    const adapter = getBiometricAdapter(biometricProvider);
    const result = await adapter.verify({ memberId, enrollments: activeEnrollments });

    return {
      ok: Boolean(result.matched),
      member,
      score: result.score || 0,
      error: result.matched ? '' : 'La huella no coincide con el socio seleccionado.',
    };
  }, [biometricProvider, memberBiometrics, members]);

  const identifyMemberByBiometric = useCallback(async () => {
    const activeEnrollments = memberBiometrics.filter(enrollment => (
      enrollment.provider === biometricProvider &&
      enrollment.status === BIOMETRIC_ENROLLMENT_STATUS.active &&
      members.some(member => member.id === enrollment.memberId)
    ));

    if (activeEnrollments.length === 0) {
      return { ok: false, error: 'No hay huellas activas para este proveedor.' };
    }

    const adapter = getBiometricAdapter(biometricProvider);
    const status = await adapter.detectDevice();
    setBiometricDeviceStatus({
      provider: getBiometricProvider(biometricProvider),
      ...status,
    });

    if (!status.available) {
      return { ok: false, error: status.message || 'El lector biometrico no esta disponible.' };
    }

    const result = await adapter.identify({ enrollments: activeEnrollments, members });
    const member = members.find(candidate => candidate.id === result.memberId);
    if (!result.matched || !member) {
      return { ok: false, error: 'No se encontro un socio con esa huella.' };
    }

    return { ok: true, member, score: result.score || 0 };
  }, [biometricProvider, memberBiometrics, members]);

  const revokeMemberBiometric = useCallback(async (memberId) => {
    const now = new Date().toISOString();

    if (!isRemoteEnabled) {
      setMemberBiometrics(currentEnrollments => currentEnrollments.map(enrollment => (
        enrollment.memberId === memberId &&
        enrollment.provider === biometricProvider &&
        enrollment.status === BIOMETRIC_ENROLLMENT_STATUS.active
          ? {
              ...enrollment,
              status: BIOMETRIC_ENROLLMENT_STATUS.revoked,
              templateEncrypted: null,
              revokedAt: now,
              updatedAt: now,
            }
          : enrollment
      )));
      return { ok: true };
    }

    if (!supabase || !activeTenantId) return { ok: false, error: 'No hay tenant activo para revocar la huella.' };

    try {
      const { error: revokeError } = await supabase
        .from('member_biometrics')
        .update({
          status: BIOMETRIC_ENROLLMENT_STATUS.revoked,
          template_encrypted: null,
          revoked_at: now,
          updated_at: now,
        })
        .eq('tenant_id', activeTenantId)
        .eq('member_id', memberId)
        .eq('provider', biometricProvider)
        .eq('status', BIOMETRIC_ENROLLMENT_STATUS.active);

      if (revokeError) throw revokeError;
      await loadBiometricEnrollments(activeTenantId);
      return { ok: true };
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      return { ok: false, error: message };
    }
  }, [activeTenantId, biometricProvider, isRemoteEnabled, loadBiometricEnrollments]);

  const addCashFlowEntry = useCallback((type, amount, description) => {
    if (isRemoteEnabled) return false;
    const newEntry = {
      id: crypto.randomUUID(),
      type,
      amount,
      description,
      date: getTodayDateString(),
    };
    setCashFlow(prev => [newEntry, ...prev]);
    return true;
  }, [isRemoteEnabled]);

  const addMember = useCallback((memberData, planPrice, initialPayment) => {
    // Balance contract shared by UI, local mode and Postgres RPC:
    // balance = initial payment received - plan price.
    // Negative balance is accounts receivable; positive balance is customer credit.
    // Do not rename this concept to "wallet" in UI unless product wallet semantics change too.
    if (!isRemoteEnabled) {
      if (members.some(m => m.doc === memberData.doc)) {
        return false;
      }

      const newMember = {
        id: crypto.randomUUID(),
        ...memberData,
        balance: initialPayment - planPrice,
        attendance: [],
        products: [],
      };

      setMembers(prev => [newMember, ...prev]);
      setMembershipEvents(prev => [{
        id: createClientId('membership-event'),
        memberId: newMember.id,
        eventType: 'enrollment',
        planKey: memberData.plan,
        previousExpiryDate: null,
        newExpiryDate: memberData.expiryDate,
        durationDays: 0,
        amount: planPrice,
        note: 'Inscripcion local',
        createdAt: new Date().toISOString(),
      }, ...prev]);

      if (initialPayment > 0) {
        addCashFlowEntry('ingreso', initialPayment, `Abono inicial de ${memberData.name}`);
      }

      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('create_member', {
        p_tenant_id: activeTenantId,
        p_name: memberData.name,
        p_doc: memberData.doc,
        p_phone: memberData.phone || null,
        p_plan: memberData.plan,
        p_expiry_date: memberData.expiryDate,
        p_plan_price: planPrice,
        // Legacy RPC parameter name. It means initial payment received, not wallet balance.
        p_initial_balance: initialPayment,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, addCashFlowEntry, isRemoteEnabled, loadTenantData, members]);

  const addProduct = useCallback((productData) => {
    if (!isRemoteEnabled) {
      const newProduct = {
        id: crypto.randomUUID(),
        ...productData,
      };
      setProducts(prev => [newProduct, ...prev]);
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: insertError } = await supabase.from('products').insert({
        tenant_id: activeTenantId,
        name: productData.name,
        price: productData.price,
        stock: productData.stock,
      });

      if (insertError) {
        setError(getErrorMessage(insertError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const addCheckin = useCallback((memberId, date = getTodayDateString()) => {
    const todayStr = date || getTodayDateString();
    const requestKey = getCheckinKey(memberId, todayStr);

    if (!membersRef.current.some(member => member.id === memberId)) return false;
    if (knownCheckinKeysRef.current.has(requestKey) || pendingCheckinKeysRef.current.has(requestKey)) {
      return false;
    }

    pendingCheckinKeysRef.current.add(requestKey);

    if (!isRemoteEnabled) {
      try {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const today = getTodayDateString();

        if (todayStr === today) {
          const nextCheckins = [{ memberId, time, date: todayStr }, ...checkinsTodayRef.current];
          checkinsTodayRef.current = nextCheckins;
          setCheckinsToday(nextCheckins);
        }

        const nextMembers = membersRef.current.map(member => {
          if (member.id !== memberId) return member;
          const attendance = Array.isArray(member.attendance) ? member.attendance : [];
          const isAlreadyRegistered = attendance.includes(todayStr);

          if (isAlreadyRegistered) return member;

          // Auto-debt logic: if expired, charge daily plan
          const isExpired = (member.expiryDate || '') < todayStr;
          let nextBalance = Number(member.balance) || 0;

          if (isExpired) {
            const dailyPlan = membershipPlans.find(p => p.planKey === 'diario') || { price: 5000 };
            nextBalance -= dailyPlan.price;

            setMembershipEvents(prev => [{
              id: createClientId('membership-event'),
              memberId,
              eventType: 'manual_adjustment',
              planKey: 'diario',
              previousExpiryDate: member.expiryDate,
              newExpiryDate: member.expiryDate,
              durationDays: 0,
              amount: dailyPlan.price,
              note: 'Cargo por ingreso con membresia vencida',
              createdAt: new Date().toISOString(),
            }, ...prev]);
          }

          return { 
            ...member, 
            balance: nextBalance,
            attendance: [todayStr, ...attendance] 
          };
        });
        membersRef.current = nextMembers;
        setMembers(nextMembers);
        knownCheckinKeysRef.current.add(requestKey);
        return true;
      } finally {

        pendingCheckinKeysRef.current.delete(requestKey);
      }
    }

    return (async () => {
      try {
        if (!supabase || !activeTenantId) {
          return false;
        }
        setError('');
        const { error: rpcError } = await supabase.rpc('record_checkin', {
          p_tenant_id: activeTenantId,
          p_member_id: memberId,
          p_checkin_date: todayStr,
        });

        if (rpcError) {
          setError(getErrorMessage(rpcError));
          return false;
        }

        knownCheckinKeysRef.current.add(requestKey);
        await loadTenantData(activeTenantId);
        return true;
      } finally {
        pendingCheckinKeysRef.current.delete(requestKey);
      }
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const payMemberDebt = useCallback((memberId, amount, target = 'auto') => {
    const normalizedAmount = Number(amount || 0);
    const normalizedTarget = ['auto', 'membership', 'products'].includes(target) ? target : 'auto';
    if (!normalizedAmount || normalizedAmount <= 0) return false;

    if (!isRemoteEnabled) {
      let allocation = null;

      setMembers(prev => prev.map(member => {
        if (member.id !== memberId) return member;

        let remaining = normalizedAmount;
        let membershipApplied = 0;
        let productApplied = 0;
        const membershipDebt = Math.max(-(Number(member.balance) || 0), 0);
        const nextProducts = (Array.isArray(member.products) ? member.products : []).map(product => ({ ...product }));

        const applyMembership = () => {
          const applied = Math.min(remaining, membershipDebt - membershipApplied);
          membershipApplied += Math.max(applied, 0);
          remaining -= Math.max(applied, 0);
        };

        const applyProducts = () => {
          nextProducts.forEach(product => {
            if (remaining <= 0) return;
            const saleTotal = Number(product.saleTotal ?? product.price ?? 0);
            const amountPaid = Number(product.amountPaid || 0);
            const due = Math.max(saleTotal - amountPaid, 0);
            if (due <= 0 || product.status === 'legacy_balance_charge') return;
            const applied = Math.min(remaining, due);
            product.amountPaid = amountPaid + applied;
            product.status = product.amountPaid >= saleTotal ? 'paid' : 'credit';
            productApplied += applied;
            remaining -= applied;
          });
        };

        /*
         * Local mode mirrors the remote RPC: automatic payments prioritize
         * membership access, product-targeted payments clear product receivables
         * first, and any excess becomes member credit.
         */
        if (normalizedTarget === 'auto' || normalizedTarget === 'membership') applyMembership();
        if (normalizedTarget === 'auto' || normalizedTarget === 'products') applyProducts();
        if (normalizedTarget === 'products' && remaining > 0) applyMembership();

        const customerCredit = Math.max(remaining, 0);
        allocation = { membershipApplied, productApplied, customerCredit };

        return {
          ...member,
          balance: (Number(member.balance) || 0) + membershipApplied + customerCredit,
          products: nextProducts,
        };
      }));

      const memberName = members.find(m => m.id === memberId)?.name || 'Cliente';
      addCashFlowEntry('ingreso', normalizedAmount, `Pago ${normalizedTarget} registrado a favor de ${memberName}`);
      return allocation || true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { data, error: rpcError } = await supabase.rpc('record_member_payment_allocated', {
        p_tenant_id: activeTenantId,
        p_member_id: memberId,
        p_amount: normalizedAmount,
        p_target: normalizedTarget,
        p_description: null,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return data || true;
    })();
  }, [activeTenantId, addCashFlowEntry, isRemoteEnabled, loadTenantData, members]);

  const payMemberBalance = useCallback((memberId, amount) => (
    payMemberDebt(memberId, amount, 'membership')
  ), [payMemberDebt]);

  const renewMemberPlan = useCallback((memberId, planKey, plan) => {
    if (!isRemoteEnabled) {
      const today = getTodayDateString();
      let renewalEvent = null;
      setMembers(prev => prev.map(member => {
        if (member.id !== memberId) return member;
        const baseDate = member.expiryDate > today ? member.expiryDate : today;
        const nextExpiryDate = addDaysToDateString(baseDate, plan.durationDays);
        renewalEvent = {
          id: createClientId('membership-event'),
          memberId,
          eventType: 'renewal',
          planKey,
          previousExpiryDate: member.expiryDate,
          newExpiryDate: nextExpiryDate,
          durationDays: plan.durationDays,
          amount: plan.price,
          note: 'Renovacion local',
          createdAt: new Date().toISOString(),
        };
        return {
          ...member,
          plan: planKey,
          expiryDate: nextExpiryDate,
          balance: (Number(member.balance) || 0) - plan.price,
        };
      }));
      if (renewalEvent) setMembershipEvents(prev => [renewalEvent, ...prev]);
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('renew_member_plan', {
        p_tenant_id: activeTenantId,
        p_member_id: memberId,
        p_plan: planKey,
        p_duration_days: plan.durationDays,
        p_price: plan.price,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const adjustMemberMembershipDays = useCallback((memberId, dayDelta, reason = '') => {
    const parsedDelta = Number(dayDelta || 0);
    if (!parsedDelta) return false;

    if (!isRemoteEnabled) {
      const today = getTodayDateString();
      let adjustmentEvent = null;
      setMembers(prev => prev.map(member => {
        if (member.id !== memberId) return member;
        const baseDate = parsedDelta > 0 && member.expiryDate < today ? today : member.expiryDate;
        const nextExpiryDate = addDaysToDateString(baseDate, parsedDelta);
        adjustmentEvent = {
          id: createClientId('membership-event'),
          memberId,
          eventType: 'manual_adjustment',
          planKey: null,
          previousExpiryDate: member.expiryDate,
          newExpiryDate: nextExpiryDate,
          durationDays: parsedDelta,
          amount: 0,
          note: reason,
          createdAt: new Date().toISOString(),
        };
        return { ...member, expiryDate: nextExpiryDate };
      }));
      if (adjustmentEvent) setMembershipEvents(prev => [adjustmentEvent, ...prev]);
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('adjust_member_membership_days', {
        p_tenant_id: activeTenantId,
        p_member_id: memberId,
        p_day_delta: parsedDelta,
        p_reason: reason || null,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const sellProduct = useCallback((productId, memberId, paymentMethod) => {
    const normalizedMethod = normalizeProductMethod(paymentMethod);
    const requestKey = `${productId}:${memberId}:${normalizedMethod}`;
    const now = Date.now();
    const lastRequestAt = recentProductSaleKeysRef.current.get(requestKey) || 0;

    if (
      pendingProductSaleKeysRef.current.has(requestKey) ||
      now - lastRequestAt < BUTTON_REPEAT_GUARD_MS
    ) {
      return false;
    }

    pendingProductSaleKeysRef.current.add(requestKey);
    recentProductSaleKeysRef.current.set(requestKey, now);

    if (!isRemoteEnabled) {
      try {
        const product = productsRef.current.find(p => p.id === productId);
        const member = membersRef.current.find(m => m.id === memberId);
        if (!product || !member || product.stock <= 0) {
          recentProductSaleKeysRef.current.delete(requestKey);
          return false;
        }

        const nextProducts = productsRef.current.map(p => (
          p.id === productId ? { ...p, stock: p.stock - 1 } : p
        ));
        productsRef.current = nextProducts;
        setProducts(nextProducts);

        const nextMembers = membersRef.current.map(m => {
          if (m.id !== memberId) return m;
          const memberProducts = Array.isArray(m.products) ? m.products : [];
          const soldItem = {
            name: product.name,
            price: product.price,
            saleTotal: product.price,
            amountPaid: ['efectivo', 'tarjeta'].includes(normalizedMethod) ? product.price : 0,
            method: normalizedMethod,
            status: ['efectivo', 'tarjeta'].includes(normalizedMethod) ? 'paid' : 'credit',
            date: getTodayDateString(),
          };

          return {
            ...m,
            products: [...memberProducts, soldItem],
          };
        });
        membersRef.current = nextMembers;
        setMembers(nextMembers);

        // Product credit/sale is tracked in purchase history and stock movement.
        // It never changes members.balance; only immediate cash/card payment enters cash flow.
        if (['efectivo', 'tarjeta'].includes(normalizedMethod)) {
          addCashFlowEntry('ingreso', product.price, `Venta directa de ${product.name} a ${member.name} (${normalizedMethod})`);
        }

        return true;
      } finally {
        pendingProductSaleKeysRef.current.delete(requestKey);
      }
    }

    return (async () => {
      try {
        if (!supabase || !activeTenantId) {
          recentProductSaleKeysRef.current.delete(requestKey);
          return false;
        }
        setError('');
        const { error: rpcError } = await supabase.rpc('sell_product', {
          p_tenant_id: activeTenantId,
          p_member_id: memberId,
          p_product_id: productId,
          p_payment_method: normalizedMethod,
          p_quantity: 1,
        });

        if (rpcError) {
          setError(getErrorMessage(rpcError));
          recentProductSaleKeysRef.current.delete(requestKey);
          return false;
        }

        await loadTenantData(activeTenantId);
        return true;
      } finally {
        pendingProductSaleKeysRef.current.delete(requestKey);
      }
    })();
  }, [activeTenantId, addCashFlowEntry, isRemoteEnabled, loadTenantData]);

  const deleteMember = useCallback((memberId) => {
    if (!isRemoteEnabled) {
      // Deletion is an operational deactivation, not a destructive purge.
      // Remote mode preserves purchases, attendance and accounting history the same way.
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setCheckinsToday(prev => prev.filter(c => c.memberId !== memberId));
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { data: deactivatedMember, error: deleteError } = await supabase
        .from('members')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('tenant_id', activeTenantId)
        .eq('id', memberId)
        .eq('status', 'active')
        .select('id')
        .maybeSingle();

      if (deleteError) {
        setError(getErrorMessage(deleteError));
        return false;
      }

      if (!deactivatedMember) {
        setError('No se encontro un usuario activo para eliminar.');
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const clearCashFlow = useCallback(() => {
    if (isRemoteEnabled) {
      setError('El flujo de caja remoto es auditable y no se limpia desde la app.');
      return false;
    }
    setCashFlow([]);
    return true;
  }, [isRemoteEnabled]);

  const recordCashMovement = useCallback((type, amount, description) => {
    if (!isRemoteEnabled) {
      return addCashFlowEntry(type, amount, description);
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('record_cash_movement', {
        p_tenant_id: activeTenantId,
        p_type: type,
        p_amount: amount,
        p_description: description,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, addCashFlowEntry, isRemoteEnabled, loadTenantData]);

  const value = useMemo(() => ({
    activeLicense,
    activeTenant,
    activeTenantId,
    adjustMemberMembershipDays,
    addCashFlowEntry,
    addCheckin,
    addMember,
    addProduct,
    authLoading,
    biometricDeviceStatus,
    biometricProvider,
    cashFlow,
    checkinsToday,
    clearCashFlow,
    clearError: () => setError(''),
    createTenant,
    dataLoading,
    deactivateMembershipPlan,
    deleteMembershipPlan,
    deleteMember,
    enrollMemberBiometric,
    error,
    getMemberBiometricEnrollment,
    identifyMemberByBiometric,
    isRemoteEnabled,
    ledgerEntries,
    memberBiometrics,
    membershipEvents,
    membershipPlans,
    members,
    payMemberBalance,
    payMemberDebt,
    products,
    recordCashMovement,
    refreshData,
    refreshBiometricDeviceStatus,
    refreshWorkspace,
    renewMemberPlan,
    revokeMemberBiometric,
    saveMembershipPlan,
    session,
    setCashFlow,
    setBiometricProvider,
    setCheckinsToday,
    setMembers,
    setProducts,
    signIn,
    signOut,
    signUp,
    sellProduct,
    switchTenant,
    tenants,
    tenantIdentitySchemaReady,
    updateTenantIdentity,
    verifyMemberBiometric,
    workspaceLoaded,
    workspaceLoading,
  }), [
    activeLicense,
    activeTenant,
    activeTenantId,
    adjustMemberMembershipDays,
    addCashFlowEntry,
    addCheckin,
    addMember,
    addProduct,
    authLoading,
    biometricDeviceStatus,
    biometricProvider,
    cashFlow,
    checkinsToday,
    clearCashFlow,
    createTenant,
    dataLoading,
    deactivateMembershipPlan,
    deleteMembershipPlan,
    deleteMember,
    enrollMemberBiometric,
    error,
    getMemberBiometricEnrollment,
    identifyMemberByBiometric,
    isRemoteEnabled,
    ledgerEntries,
    memberBiometrics,
    membershipEvents,
    membershipPlans,
    members,
    payMemberBalance,
    payMemberDebt,
    products,
    recordCashMovement,
    refreshData,
    refreshBiometricDeviceStatus,
    refreshWorkspace,
    renewMemberPlan,
    revokeMemberBiometric,
    saveMembershipPlan,
    session,
    setBiometricProvider,
    signIn,
    signOut,
    signUp,
    sellProduct,
    switchTenant,
    tenants,
    tenantIdentitySchemaReady,
    updateTenantIdentity,
    verifyMemberBiometric,
    workspaceLoaded,
    workspaceLoading,
  ]);

  return (
    <GymContext.Provider value={value}>
      {children}
    </GymContext.Provider>
  );
}
