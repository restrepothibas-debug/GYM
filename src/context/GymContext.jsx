/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeProductMethod } from '../lib/accounting';
import { addDaysToDateString, getTodayDateString } from '../lib/dateUtils';
import { DEFAULT_CASH_FLOW, DEFAULT_MEMBERS, DEFAULT_PRODUCTS, getDefaultCheckinsToday } from '../lib/seedData';
import { hasSupabaseConfig, supabase } from '../lib/supabase';

export const GymContext = createContext();

const ACTIVE_TENANT_KEY = 'gym_active_tenant_id';
const REMOTE_REQUEST_TIMEOUT_MS = 15000;
const ENABLE_REMOTE_SUPABASE = import.meta.env.MODE !== 'test' && hasSupabaseConfig;
const USE_SEED_DATA = import.meta.env.MODE !== 'test';
const LOCAL_MEMBER_FALLBACK = USE_SEED_DATA ? DEFAULT_MEMBERS : [];
const LOCAL_PRODUCT_FALLBACK = USE_SEED_DATA ? DEFAULT_PRODUCTS : [];
const LOCAL_CASH_FALLBACK = USE_SEED_DATA ? DEFAULT_CASH_FLOW : [];

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

export function GymProvider({ children }) {
  const isRemoteEnabled = ENABLE_REMOTE_SUPABASE;
  const [members, setMembers] = useState(() => (
    isRemoteEnabled ? [] : readStorageArray('gym_members', LOCAL_MEMBER_FALLBACK)
  ));
  const [products, setProducts] = useState(() => (
    isRemoteEnabled ? [] : readStorageArray('gym_products', LOCAL_PRODUCT_FALLBACK)
  ));
  const [cashFlow, setCashFlow] = useState(() => (
    isRemoteEnabled ? [] : readStorageArray('gym_cashflow', LOCAL_CASH_FALLBACK)
  ));
  const [checkinsToday, setCheckinsToday] = useState(() => (
    isRemoteEnabled ? [] : getTodaysCheckinsFromStorage()
  ));

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isRemoteEnabled);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenants, setTenants] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState(null);
  const sessionUserId = session?.user?.id || null;
  const workspaceLoadRef = useRef(0);

  const resetRemoteState = useCallback(() => {
    workspaceLoadRef.current += 1;
    setWorkspaceLoading(false);
    setWorkspaceLoaded(false);
    setDataLoading(false);
    setTenants([]);
    setActiveTenantId(null);
    setStoredActiveTenantId(null);
    setMembers([]);
    setProducts([]);
    setCashFlow([]);
    setCheckinsToday([]);
  }, []);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray('gym_members', members);
  }, [isRemoteEnabled, members]);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray('gym_products', products);
  }, [isRemoteEnabled, products]);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray('gym_cashflow', cashFlow);
  }, [cashFlow, isRemoteEnabled]);

  useEffect(() => {
    if (isRemoteEnabled) return;
    writeStorageArray('gym_checkins', checkinsToday);
  }, [checkinsToday, isRemoteEnabled]);

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

  const activeTenant = useMemo(
    () => tenants.find(tenant => tenant.id === activeTenantId) || null,
    [activeTenantId, tenants]
  );
  const activeLicense = activeTenant?.license || null;

  const loadTenantData = useCallback(async (tenantId) => {
    if (!isRemoteEnabled || !supabase || !tenantId) return;

    setDataLoading(true);
    setError('');
    try {
      const [
        membersResult,
        productsResult,
        cashFlowResult,
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
            .from('cash_flow')
            .select('id,member_id,type,amount,description,date,created_at')
            .eq('tenant_id', tenantId)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false }),
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
        cashFlowResult,
        attendanceResult,
        purchasesResult,
      ].find(result => result.error)?.error;
      if (requestError) throw requestError;

      const attendanceRows = attendanceResult.data || [];
      const memberRows = membersResult.data || [];
      const activeMemberIds = new Set(memberRows.map(member => member.id));
      setMembers(buildMembers(memberRows, attendanceRows, purchasesResult.data || []));
      setProducts((productsResult.data || []).map(mapProduct));
      setCashFlow((cashFlowResult.data || []).map(mapCashFlow));
      setCheckinsToday(buildTodayCheckins(attendanceRows, activeMemberIds));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDataLoading(false);
    }
  }, [isRemoteEnabled]);

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
        setWorkspaceLoaded(true);
        return;
      }

      const [tenantsResult, licensesResult] = await withRemoteTimeout(
        Promise.all([
          supabase
            .from('tenants')
            .select('id,name,slug,status,created_at')
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

      if (tenantsResult.error) throw tenantsResult.error;
      if (licensesResult.error) throw licensesResult.error;

      const licensesByTenant = new Map((licensesResult.data || []).map(license => [license.tenant_id, license]));
      const membershipsByTenant = new Map((memberships || []).map(membership => [membership.tenant_id, membership]));
      const mappedTenants = (tenantsResult.data || []).map(tenant => ({
        ...tenant,
        role: membershipsByTenant.get(tenant.id)?.role,
        license: licensesByTenant.get(tenant.id) || null,
      }));

      const storedTenantId = preferredTenantId || getStoredActiveTenantId();
      const nextTenant = mappedTenants.find(tenant => tenant.id === storedTenantId) || mappedTenants[0];
      setTenants(mappedTenants);
      setActiveTenantId(nextTenant?.id || null);
      setStoredActiveTenantId(nextTenant?.id || null);
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
        'Crear usuario'
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
    if (!supabase) return;
    setError('');
    await supabase.auth.signOut();
  }, []);

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
    if (!isRemoteEnabled) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const todayStr = date || getTodayDateString();

      setCheckinsToday(prev => {
        if (todayStr !== getTodayDateString()) return prev;
        if (prev.some(c => c.memberId === memberId && c.date === todayStr)) return prev;
        return [{ memberId, time, date: todayStr }, ...prev];
      });

      setMembers(prev => prev.map(m => {
        const attendance = Array.isArray(m.attendance) ? m.attendance : [];
        if (m.id === memberId && !attendance.includes(todayStr)) {
          return { ...m, attendance: [todayStr, ...attendance] };
        }
        return m;
      }));
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('record_checkin', {
        p_tenant_id: activeTenantId,
        p_member_id: memberId,
        p_checkin_date: date || getTodayDateString(),
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, isRemoteEnabled, loadTenantData]);

  const payMemberBalance = useCallback((memberId, amount) => {
    if (!isRemoteEnabled) {
      setMembers(prev => prev.map(m => (
        m.id === memberId ? { ...m, balance: (Number(m.balance) || 0) + amount } : m
      )));
      const memberName = members.find(m => m.id === memberId)?.name || 'Cliente';
      addCashFlowEntry('ingreso', amount, `Abono/Pago registrado a favor de ${memberName}`);
      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('record_payment', {
        p_tenant_id: activeTenantId,
        p_member_id: memberId,
        p_amount: amount,
        p_description: null,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, addCashFlowEntry, isRemoteEnabled, loadTenantData, members]);

  const renewMemberPlan = useCallback((memberId, planKey, plan) => {
    if (!isRemoteEnabled) {
      const today = getTodayDateString();
      setMembers(prev => prev.map(member => {
        if (member.id !== memberId) return member;
        const baseDate = member.expiryDate > today ? member.expiryDate : today;
        return {
          ...member,
          plan: planKey,
          expiryDate: addDaysToDateString(baseDate, plan.durationDays),
          balance: (Number(member.balance) || 0) - plan.price,
        };
      }));
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

  const sellProduct = useCallback((productId, memberId, paymentMethod) => {
    if (!isRemoteEnabled) {
      const product = products.find(p => p.id === productId);
      const member = members.find(m => m.id === memberId);
      if (!product || !member || product.stock <= 0) return false;
      const normalizedMethod = normalizeProductMethod(paymentMethod);

      setProducts(prev => prev.map(p => (
        p.id === productId ? { ...p, stock: p.stock - 1 } : p
      )));

      setMembers(prev => prev.map(m => {
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
      }));

      // Product credit/sale is tracked in purchase history and stock movement.
      // It never changes members.balance; only immediate cash/card payment enters cash flow.
      if (['efectivo', 'tarjeta'].includes(normalizedMethod)) {
        addCashFlowEntry('ingreso', product.price, `Venta directa de ${product.name} a ${member.name} (${normalizedMethod})`);
      }

      return true;
    }

    return (async () => {
      if (!supabase || !activeTenantId) return false;
      setError('');
      const { error: rpcError } = await supabase.rpc('sell_product', {
        p_tenant_id: activeTenantId,
        p_member_id: memberId,
        p_product_id: productId,
        p_payment_method: paymentMethod,
        p_quantity: 1,
      });

      if (rpcError) {
        setError(getErrorMessage(rpcError));
        return false;
      }

      await loadTenantData(activeTenantId);
      return true;
    })();
  }, [activeTenantId, addCashFlowEntry, isRemoteEnabled, loadTenantData, members, products]);

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
    addCashFlowEntry,
    addCheckin,
    addMember,
    addProduct,
    authLoading,
    cashFlow,
    checkinsToday,
    clearCashFlow,
    clearError: () => setError(''),
    createTenant,
    dataLoading,
    deleteMember,
    error,
    isRemoteEnabled,
    members,
    payMemberBalance,
    products,
    recordCashMovement,
    refreshData,
    refreshWorkspace,
    renewMemberPlan,
    session,
    setCashFlow,
    setCheckinsToday,
    setMembers,
    setProducts,
    signIn,
    signOut,
    signUp,
    sellProduct,
    switchTenant,
    tenants,
    workspaceLoaded,
    workspaceLoading,
  }), [
    activeLicense,
    activeTenant,
    activeTenantId,
    addCashFlowEntry,
    addCheckin,
    addMember,
    addProduct,
    authLoading,
    cashFlow,
    checkinsToday,
    clearCashFlow,
    createTenant,
    dataLoading,
    deleteMember,
    error,
    isRemoteEnabled,
    members,
    payMemberBalance,
    products,
    recordCashMovement,
    refreshData,
    refreshWorkspace,
    renewMemberPlan,
    session,
    signIn,
    signOut,
    signUp,
    sellProduct,
    switchTenant,
    tenants,
    workspaceLoaded,
    workspaceLoading,
  ]);

  return (
    <GymContext.Provider value={value}>
      {children}
    </GymContext.Provider>
  );
}
