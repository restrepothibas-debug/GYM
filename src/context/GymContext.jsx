/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect } from 'react';
import { getTodayDateString } from '../lib/dateUtils';
import { DEFAULT_CASH_FLOW, DEFAULT_MEMBERS, DEFAULT_PRODUCTS, getDefaultCheckinsToday } from '../lib/seedData';

export const GymContext = createContext();

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

function getTodaysCheckinsFromStorage() {
  const today = getTodayDateString();
  return readStorageArray('gym_checkins', getDefaultCheckinsToday())
    .filter(checkin => (checkin.date || today) === today)
    .map(checkin => ({ ...checkin, date: checkin.date || today }));
}

export function GymProvider({ children }) {
  // Inicialización temprana desde LocalStorage para evitar parpadeos
  const [members, setMembers] = useState(() => readStorageArray('gym_members', DEFAULT_MEMBERS));
  const [products, setProducts] = useState(() => readStorageArray('gym_products', DEFAULT_PRODUCTS));
  const [cashFlow, setCashFlow] = useState(() => readStorageArray('gym_cashflow', DEFAULT_CASH_FLOW));
  const [checkinsToday, setCheckinsToday] = useState(getTodaysCheckinsFromStorage);

  // Sincronización continua a LocalStorage (Fase 2)
  useEffect(() => {
    localStorage.setItem('gym_members', JSON.stringify(members));
  }, [members]);

  useEffect(() => {
    localStorage.setItem('gym_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('gym_cashflow', JSON.stringify(cashFlow));
  }, [cashFlow]);

  useEffect(() => {
    localStorage.setItem('gym_checkins', JSON.stringify(checkinsToday));
  }, [checkinsToday]);

  // ==========================================
  // LOGICA DE NEGOCIO (CRUD LOCAL)
  // ==========================================

  const addCashFlowEntry = (type, amount, description) => {
    const newEntry = {
      id: crypto.randomUUID(),
      type, // 'ingreso' | 'egreso'
      amount,
      description,
      date: getTodayDateString()
    };
    setCashFlow(prev => [newEntry, ...prev]);
  };

  const addMember = (memberData, planPrice, initialBalance) => {
    if (members.some(m => m.doc === memberData.doc)) {
      return false;
    }

    const newMember = {
      id: crypto.randomUUID(),
      ...memberData,
      balance: initialBalance - planPrice,
      attendance: [],
      products: []
    };
    
    setMembers(prev => [newMember, ...prev]);

    if (initialBalance > 0) {
      addCashFlowEntry('ingreso', initialBalance, `Abono inicial de ${memberData.name}`);
    }

    return true;
  };

  const addCheckin = (memberId) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const todayStr = getTodayDateString();

    // Registrar asistencia en el global de hoy
    setCheckinsToday(prev => {
      // Evitar duplicados
      if (prev.some(c => c.memberId === memberId && c.date === todayStr)) return prev;
      return [{ memberId, time, date: todayStr }, ...prev];
    });

    // Registrar en el historial del socio
    setMembers(prev => prev.map(m => {
      const attendance = Array.isArray(m.attendance) ? m.attendance : [];
      if (m.id === memberId && !attendance.includes(todayStr)) {
        return { ...m, attendance: [todayStr, ...attendance] };
      }
      return m;
    }));
  };

  const sellProduct = (productId, memberId, paymentMethod) => {
    const product = products.find(p => p.id === productId);
    const member = members.find(m => m.id === memberId);
    if (!product || !member || product.stock <= 0) return false;

    // Descontar stock
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: p.stock - 1 } : p));

    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const memberProducts = Array.isArray(m.products) ? m.products : [];
      const soldItem = {
        name: product.name,
        price: product.price,
        method: paymentMethod,
        date: getTodayDateString(),
      };

      return {
        ...m,
        balance: paymentMethod === 'monedero' ? (Number(m.balance) || 0) - product.price : (Number(m.balance) || 0),
        products: [...memberProducts, soldItem],
      };
    }));

    if (paymentMethod !== 'monedero') {
      // Efectivo o Tarjeta -> Ingreso a caja directo
      addCashFlowEntry('ingreso', product.price, `Venta directa de ${product.name} a ${member.name} (${paymentMethod})`);
    }

    return true;
  };

  const payMemberBalance = (memberId, amount) => {
    // Abonar saldo o pagar deuda
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, balance: (Number(m.balance) || 0) + amount } : m));
    const memberName = members.find(m => m.id === memberId)?.name || 'Cliente';
    addCashFlowEntry('ingreso', amount, `Abono/Pago registrado a favor de ${memberName}`);
  };

  return (
    <GymContext.Provider value={{
      members, setMembers, addMember, addCheckin, payMemberBalance,
      products, setProducts, sellProduct,
      cashFlow, setCashFlow, addCashFlowEntry,
      checkinsToday, setCheckinsToday
    }}>
      {children}
    </GymContext.Provider>
  );
}
