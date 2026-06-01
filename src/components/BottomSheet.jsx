import { useState, useContext } from 'react';
import { X, Check, Wallet, Trash2, Plus } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { addDaysToDateString, getDaysRemaining, getTodayDateFormatted, getTodayDateString } from '../lib/dateUtils';

const PRESETS_PLANES = {
  diario:     { name: 'Pase Diario',       durationDays: 1,   price: 5000 },
  semanal:    { name: 'Plan Semanal',       durationDays: 7,   price: 20000 },
  mensual:    { name: 'Mensualidad',        durationDays: 30,  price: 60000 },
  trimestral: { name: 'Plan Trimestral',    durationDays: 90,  price: 150000 },
  anual:      { name: 'Plan Anual',         durationDays: 365, price: 500000 },
};

function BottomSheet({ memberId, onClose }) {
  const { members, setMembers, addCheckin, payMemberBalance, products, sellProduct, checkinsToday, setCheckinsToday } = useContext(GymContext);
  const initialMember = members.find(m => m.id === memberId);
  const [paymentAmount, setPaymentAmount] = useState(() => (
    initialMember?.balance < 0 ? String(Math.abs(initialMember.balance)) : ''
  ));
  const [manualDate, setManualDate] = useState(getTodayDateString());
  const [productPayMethod, setProductPayMethod] = useState('monedero');

  const member = initialMember;
  if (!member) return null;

  const today = getTodayDateString();
  const alreadyCheckedIn = checkinsToday.some(c => c.memberId === memberId && c.date === today);
  const daysLeft = getDaysRemaining(member.expiryDate);

  // ── Asistencia en 1 clic ──
  const handleTodayCheckin = () => {
    if (alreadyCheckedIn) return;
    addCheckin(memberId);
  };

  // ── Asistencia manual ──
  const handleManualCheckin = () => {
    const attendance = Array.isArray(member.attendance) ? member.attendance : [];
    if (!manualDate || attendance.includes(manualDate)) return;
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, attendance: [manualDate, ...(Array.isArray(m.attendance) ? m.attendance : [])] } : m
    ));
    if (manualDate === today) {
      addCheckin(memberId);
    }
  };

  // ── Registrar pago / abono ──
  const handlePayment = () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;
    payMemberBalance(memberId, amount);
    setPaymentAmount('');
  };

  // ── Renovar plan ──
  const handleRenew = (planKey) => {
    const plan = PRESETS_PLANES[planKey];
    const baseDate = daysLeft > 0 ? member.expiryDate : today;
    const newExpiry = addDaysToDateString(baseDate, plan.durationDays);
    const nextBalance = member.balance - plan.price;

    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, plan: planKey, expiryDate: newExpiry, balance: m.balance - plan.price } : m
    ));
    setPaymentAmount(nextBalance < 0 ? String(Math.abs(nextBalance)) : '');
  };

  // ── Vender producto desde el panel ──
  const handleSellProduct = (productId) => {
    const product = products.find(p => p.id === productId);
    const sold = sellProduct(productId, memberId, productPayMethod);
    if (sold && productPayMethod === 'monedero' && product) {
      const nextBalance = member.balance - product.price;
      setPaymentAmount(nextBalance < 0 ? String(Math.abs(nextBalance)) : '');
    }
  };

  // ── Dar de baja ──
  const handleDelete = () => {
    if (window.confirm(`¿Eliminar definitivamente a ${member.name}?`)) {
      setMembers(prev => prev.filter(m => m.id !== memberId));
      setCheckinsToday(prev => prev.filter(c => c.memberId !== memberId));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end justify-center p-0">
      <div className="bg-slate-900 border-t border-slate-800 rounded-t-3xl w-full max-w-md p-5 pb-8 space-y-4 max-h-[90vh] overflow-y-auto animate-slideUp">

        {/* ── Cabecera ── */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[8px] font-black bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full uppercase tracking-widest">Panel del Atleta</span>
            <h3 className="text-sm font-black text-white mt-1">{member.name}</h3>
            <p className="text-[10px] text-slate-500">C.C. {member.doc} · {member.phone || 'Sin teléfono'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-950 rounded-full flex items-center justify-center text-slate-400 hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Balance / Expiración ── */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
          <div>
            <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Monedero</span>
            <span className={`text-sm font-black ${member.balance < 0 ? 'text-rose-400' : member.balance > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {member.balance < 0 ? `-$${Math.abs(member.balance).toLocaleString()}` : `$${member.balance.toLocaleString()}`}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Plan / Expiración</span>
            <span className={`text-xs font-semibold capitalize ${daysLeft < 0 ? 'text-rose-400' : daysLeft <= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {member.plan} · {daysLeft < 0 ? 'Vencido' : `${daysLeft}d`}
            </span>
          </div>
        </div>

        {/* ── Asistencia ── */}
        <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-indigo-400 font-black uppercase tracking-widest">Registro de Asistencia</span>
            <span className="text-[8px] text-slate-500 font-bold">Hoy: {getTodayDateFormatted()}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleTodayCheckin}
              disabled={alreadyCheckedIn}
              className={`h-10 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                alreadyCheckedIn
                  ? 'bg-emerald-600/30 text-emerald-400 cursor-default border border-emerald-500/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/10'
              }`}
            >
              <Check className="w-4 h-4" />
              {alreadyCheckedIn ? 'Ya registrado' : 'Asistir Hoy (1-Clic)'}
            </button>
            <div className="flex border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
              <input
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                className="bg-transparent text-slate-200 text-[10px] px-2 py-1 focus:outline-none w-full cursor-pointer"
              />
              <button
                onClick={handleManualCheckin}
                className="px-2.5 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold border-l border-slate-700 active:scale-95 transition-all"
              >
                Añadir
              </button>
            </div>
          </div>
          <div className="pt-1">
            <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider mb-1">Historial:</span>
            <div className="max-h-20 overflow-y-auto bg-slate-900/60 rounded-lg p-2 space-y-1">
              {!Array.isArray(member.attendance) || member.attendance.length === 0
                ? <p className="text-[9px] text-slate-600">Sin registros aún</p>
                : member.attendance.map((d, i) => (
                    <p key={i} className="text-[9px] text-slate-400 font-mono">{d}</p>
                  ))
              }
            </div>
          </div>
        </div>

        {/* ── Liquidar / Abonar ── */}
        <div className="space-y-2 bg-slate-950 border border-indigo-500/20 rounded-xl p-3.5">
          <div className="flex justify-between items-center">
            <span className="text-[8px] text-indigo-400 font-black uppercase tracking-widest">Liquidar Saldo o Compras</span>
            <span className={`text-[9px] font-bold ${member.balance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {member.balance < 0 ? `Debe $${Math.abs(member.balance).toLocaleString()}` : 'Al día'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <span className="text-slate-400 block text-[9px] mb-1">Total a Pagar / Abonar:</span>
              <input
                type="number"
                placeholder="Monto $"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                className="w-full h-8 px-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={handlePayment}
              className="h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-emerald-600/20"
            >
              <Wallet className="w-4 h-4" />Registrar
            </button>
          </div>
          {/* Abonos rápidos */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[5000, 20000, 50000].map(v => (
              <button key={v} onClick={() => setPaymentAmount(String((parseFloat(paymentAmount) || 0) + v))}
                className="h-8 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-extrabold text-[10px] rounded-lg active:scale-95 transition-all">
                + ${v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Renovaciones ── */}
        <div className="space-y-1.5">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Renovación de Membresías</span>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(PRESETS_PLANES).filter(([k]) => k !== 'anual').map(([key, plan]) => (
              <button key={key} onClick={() => handleRenew(key)}
                className="h-12 bg-slate-950 hover:bg-indigo-950/30 border border-slate-800 hover:border-indigo-500/30 rounded-xl p-1 flex flex-col justify-center items-center transition-all active:scale-95">
                <span className="font-bold text-slate-300 text-[9px] text-center capitalize leading-tight">{plan.name.split(' ')[1] || plan.name}</span>
                <span className="font-black text-indigo-400 text-[9px] mt-0.5">${(plan.price/1000).toFixed(0)}k</span>
              </button>
            ))}
            <button onClick={() => handleRenew('anual')}
              className="h-12 bg-slate-950 hover:bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-1 flex flex-col justify-center items-center transition-all active:scale-95">
              <span className="font-bold text-indigo-300 text-[9px] text-center">Anual ⚡</span>
              <span className="font-black text-indigo-400 text-[9px] mt-0.5">$500k</span>
            </button>
          </div>
        </div>

        {/* ── Historial de Compras ── */}
        <div className="space-y-1.5">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Historial de Compras</span>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-24 overflow-y-auto space-y-2 text-xs text-slate-400">
            {!Array.isArray(member.products) || member.products.length === 0 ? (
              <span className="text-[10px] text-slate-500">Sin compras cargadas.</span>
            ) : (
              [...member.products].reverse().map((product, index) => (
                <div key={`${product.name}-${index}`} className="flex items-center justify-between gap-3 py-1 text-[11px] border-b border-slate-900 last:border-b-0">
                  <span className="truncate">{product.name}</span>
                  <span className="font-bold text-indigo-400 shrink-0">${product.price.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Venta de Productos ── */}
        <div className="space-y-2">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Vender Producto al Socio</span>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer">
              <input type="radio" name="ppm" value="monedero" checked={productPayMethod === 'monedero'} onChange={() => setProductPayMethod('monedero')} className="accent-indigo-500" />
              <span className="text-[10px] font-bold text-slate-300">Cargar a Monedero</span>
            </label>
            <label className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer">
              <input type="radio" name="ppm" value="efectivo" checked={productPayMethod === 'efectivo'} onChange={() => setProductPayMethod('efectivo')} className="accent-indigo-500" />
              <span className="text-[10px] font-bold text-slate-300">Pago Directo (Caja)</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {products.length === 0
              ? <p className="col-span-2 text-[9px] text-slate-500">Sin productos en tienda.</p>
              : products.map(p => (
                  <button key={p.id} onClick={() => handleSellProduct(p.id)} disabled={p.stock === 0}
                    className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-between gap-2 text-left transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                    <div className="truncate">
                      <p className="text-[10px] font-bold text-slate-200 truncate">{p.name}</p>
                      <p className="text-[9px] text-indigo-400 font-black">${p.price.toLocaleString()}</p>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                ))
            }
          </div>
        </div>

        {/* ── Dar de baja ── */}
        <button onClick={handleDelete}
          className="w-full h-10 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" /> Dar de baja membresía
        </button>

      </div>
    </div>
  );
}

export default BottomSheet;
