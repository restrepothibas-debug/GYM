import { useState, useContext, useEffect, useId, useRef } from 'react';
import { X, Check, Wallet, Trash2, Plus, Fingerprint } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';
import { formatCurrency, getMemberDebtBreakdown, PRODUCT_PAYMENT_METHOD_LABELS } from '../lib/accounting';
import { formatMembershipStatus, getTodayDateFormatted, getTodayDateString } from '../lib/dateUtils';
import { DEFAULT_MEMBERSHIP_PLANS, getActiveMembershipPlans } from '../lib/membershipPlans';

function BottomSheet({ memberId, onClose }) {
  const { confirm, notify } = useUi();
  const {
    addCheckin,
    adjustMemberMembershipDays,
    checkinsToday,
    deleteMember,
    enrollMemberBiometric,
    getMemberBiometricEnrollment,
    members,
    membershipEvents,
    membershipPlans,
    payMemberDebt,
    products,
    renewMemberPlan,
    revokeMemberBiometric,
    sellProduct,
    verifyMemberBiometric,
  } = useContext(GymContext);
  const initialMember = members.find(m => m.id === memberId);
  const [paymentAmount, setPaymentAmount] = useState(() => (
    initialMember?.balance < 0 ? String(Math.abs(initialMember.balance)) : ''
  ));
  const [paymentTarget, setPaymentTarget] = useState('auto');
  const [dayAdjustment, setDayAdjustment] = useState('');
  const [dayAdjustmentReason, setDayAdjustmentReason] = useState('');
  const [manualDate, setManualDate] = useState(getTodayDateString());
  const [productPayMethod, setProductPayMethod] = useState('credito');
  const panelTitleId = useId();
  const closeButtonRef = useRef(null);

  const member = initialMember;

  useEffect(() => {
    if (!member) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);

    // Desktop/tablet users should land inside the dialog immediately. Mobile
    // keeps focus unchanged to avoid unnecessary viewport jumps.
    if (window.matchMedia?.('(min-width: 48rem)').matches) {
      closeButtonRef.current?.focus();
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [member, onClose]);

  if (!member) return null;

  const today = getTodayDateString();
  const alreadyCheckedIn = checkinsToday.some(c => c.memberId === memberId && c.date === today);
  const membershipStatus = formatMembershipStatus(member.expiryDate);
  const debtBreakdown = getMemberDebtBreakdown(member);
  const activePlans = getActiveMembershipPlans(membershipPlans.length ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS);
  const memberMembershipEvents = membershipEvents.filter(event => event.memberId === memberId).slice(0, 5);
  const biometricEnrollment = getMemberBiometricEnrollment(memberId);

  // ── Asistencia en 1 clic ──
  const handleTodayCheckin = () => {
    if (alreadyCheckedIn) return;
    void addCheckin(memberId);
  };

  // ── Asistencia manual ──
  const handleManualCheckin = async () => {
    const attendance = Array.isArray(member.attendance) ? member.attendance : [];
    if (!manualDate || attendance.includes(manualDate)) return;
    await addCheckin(memberId, manualDate);
  };

  const handleEnrollBiometric = async () => {
    const confirmed = await confirm({
      title: 'Registrar huella',
      message: `${member.name} debe aceptar el registro biométrico. No se guardan imágenes de huella; solo el template del proveedor configurado.`,
      confirmLabel: 'Registrar huella',
      tone: 'default',
    });
    if (!confirmed) return;

    const result = await enrollMemberBiometric(memberId);
    notify({
      title: result.ok ? 'Huella registrada' : 'No se registró la huella',
      message: result.ok ? `${member.name} ya puede ingresar por huella.` : result.error,
      tone: result.ok ? 'success' : 'warning',
    });
  };

  const handleVerifyBiometric = async () => {
    const result = await verifyMemberBiometric(memberId);
    notify({
      title: result.ok ? 'Huella verificada' : 'Verificación fallida',
      message: result.ok ? `${member.name} coincide con el lector activo.` : result.error,
      tone: result.ok ? 'success' : 'warning',
    });
  };

  const handleRevokeBiometric = async () => {
    const confirmed = await confirm({
      title: 'Revocar huella',
      message: `¿Revocar la huella activa de ${member.name}? El acceso biométrico se desactiva y el template se limpia.`,
      confirmLabel: 'Revocar huella',
    });
    if (!confirmed) return;

    const result = await revokeMemberBiometric(memberId);
    notify({
      title: result.ok ? 'Huella revocada' : 'No se pudo revocar',
      message: result.ok ? `${member.name} ya no tiene huella activa.` : result.error,
      tone: result.ok ? 'success' : 'warning',
    });
  };

  // ── Registrar pago / abono ──
  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;
    const paid = await payMemberDebt(memberId, amount, paymentTarget);
    if (paid) setPaymentAmount('');
  };

  // ── Renovar plan ──
  const handleRenew = async (plan) => {
    const planKey = plan.planKey;
    const nextBalance = member.balance - plan.price;
    const renewed = await renewMemberPlan(memberId, planKey, plan);
    if (renewed) setPaymentAmount(nextBalance < 0 ? String(Math.abs(nextBalance)) : '');
  };

  const handleAdjustDays = async () => {
    const parsedDays = Number(dayAdjustment);
    if (!parsedDays) return;
    const adjusted = await adjustMemberMembershipDays(memberId, parsedDays, dayAdjustmentReason.trim());
    if (adjusted) {
      setDayAdjustment('');
      setDayAdjustmentReason('');
    }
  };

  // ── Vender producto desde el panel ──
  const handleSellProduct = async (productId) => {
    await sellProduct(productId, memberId, productPayMethod);
  };

  // ── Eliminar usuario activo ──
  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Eliminar usuario activo',
      message: `¿Eliminar a ${member.name} de los usuarios activos? Su historial contable, compras y asistencias se conserva.`,
      confirmLabel: 'Eliminar usuario',
    });
    if (confirmed) {
      const removed = await deleteMember(memberId);
      if (removed) {
        notify({
          title: 'Usuario eliminado',
          message: `${member.name} ya no aparece en usuarios activos.`,
          tone: 'success',
        });
        onClose();
      }
    }
  };

  return (
    <div className="member-panel-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={panelTitleId}
        className="member-panel animate-slideUp"
      >

        {/* ── Cabecera ── */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[8px] font-black bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full uppercase tracking-widest">Panel del Atleta</span>
            <h3 id={panelTitleId} className="text-sm font-black text-white mt-1">{member.name}</h3>
            <p className="text-[10px] text-slate-500">C.C. {member.doc} · {member.phone || 'Sin teléfono'}</p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="app-icon-button w-8 h-8 bg-slate-950 rounded-full flex items-center justify-center text-slate-400 hover:text-white shrink-0"
            aria-label="Cerrar panel del socio"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Membership balance is intentionally separate from product credit debt.
            The total debt card below combines both sources for operational clarity. */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
          <div>
            <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Saldo Membresia</span>
            <span className={`text-sm font-black ${member.balance < 0 ? 'text-rose-400' : member.balance > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {member.balance < 0 ? `-$${Math.abs(member.balance).toLocaleString()}` : `$${member.balance.toLocaleString()}`}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Plan / Expiración</span>
            <span className={`text-xs font-semibold capitalize ${membershipStatus.tone === 'danger' ? 'text-rose-400' : membershipStatus.tone === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
              {member.plan} · {membershipStatus.label}
            </span>
            <small className="text-[8px] text-slate-500 block mt-0.5">Vence: {member.expiryDate}</small>
          </div>
        </div>

        <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Detalle de Deuda</span>
            <span className={`text-xs font-black ${debtBreakdown.totalDebt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {debtBreakdown.totalDebt > 0 ? formatCurrency(debtBreakdown.totalDebt) : 'Al dia'}
            </span>
          </div>
          {debtBreakdown.totalDebt === 0 ? (
            <p className="text-[10px] text-slate-500">Sin deudas de membresia ni productos a credito.</p>
          ) : (
            <div className="space-y-1.5">
              {debtBreakdown.membershipDebt > 0 && (
                <div className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="text-slate-400">Membresia / plan pendiente</span>
                  <strong className="text-rose-400 shrink-0">{formatCurrency(debtBreakdown.membershipDebt)}</strong>
                </div>
              )}
              {debtBreakdown.productItems.map((product, index) => (
                <div key={`${product.name}-${product.date || 'producto'}-${index}`} className="flex items-center justify-between gap-3 text-[10px]">
                  <span className="text-slate-400 truncate">Producto a credito: {product.name}</span>
                  <strong className="text-rose-400 shrink-0">{formatCurrency(product.due)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Asistencia ── */}
        <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-indigo-400 font-black uppercase tracking-widest">Registro de Asistencia</span>
            <span className="text-[8px] text-slate-500 font-bold">Hoy: {getTodayDateFormatted()}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleTodayCheckin}
              disabled={alreadyCheckedIn}
              className={`app-control h-10 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                alreadyCheckedIn
                  ? 'bg-emerald-600/30 text-emerald-400 cursor-default border border-emerald-500/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/10'
              }`}
            >
              <Check className="w-4 h-4" aria-hidden="true" />
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
                type="button"
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

        <div className="member-biometric-card">
          <div className="member-biometric-card__header">
            <span className="member-biometric-card__title">
              <Fingerprint className="w-3.5 h-3.5" aria-hidden="true" />
              Huella digital
            </span>
            <span className={`member-biometric-card__status ${biometricEnrollment ? 'member-biometric-card__status--active' : ''}`}>
              {biometricEnrollment ? 'Activa' : 'Sin registro'}
            </span>
          </div>
          <div className="member-biometric-card__actions">
            <button
              type="button"
              onClick={handleEnrollBiometric}
              className="app-button app-button--secondary"
            >
              {biometricEnrollment ? 'Reenrolar' : 'Enrolar'}
            </button>
            <button
              type="button"
              onClick={handleVerifyBiometric}
              disabled={!biometricEnrollment}
              className="app-button app-button--secondary"
            >
              Verificar
            </button>
            <button
              type="button"
              onClick={handleRevokeBiometric}
              disabled={!biometricEnrollment}
              className="app-button app-button--secondary app-button--biometric-danger"
            >
              Revocar
            </button>
          </div>
        </div>

        {/* ── Liquidar / Abonar ── */}
        <div className="member-payment-card">
          <div className="flex justify-between items-center">
            <span className="text-[8px] text-indigo-400 font-black uppercase tracking-widest">Registrar pago</span>
            <span className={`text-[9px] font-bold ${debtBreakdown.totalDebt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {debtBreakdown.totalDebt > 0 ? `Debe ${formatCurrency(debtBreakdown.totalDebt)}` : 'Al día'}
            </span>
          </div>
          <div className="member-payment-targets" role="radiogroup" aria-label="Destino del pago">
            {[
              { key: 'auto', label: 'Auto', detail: 'Membresia y productos' },
              { key: 'membership', label: 'Membresia', detail: formatCurrency(debtBreakdown.membershipDebt) },
              { key: 'products', label: 'Productos', detail: formatCurrency(debtBreakdown.productDebt) },
            ].map(option => (
              <label key={option.key} className={`member-payment-target ${paymentTarget === option.key ? 'member-payment-target--selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentTarget"
                  value={option.key}
                  checked={paymentTarget === option.key}
                  onChange={() => setPaymentTarget(option.key)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
              </label>
            ))}
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
              type="button"
              onClick={handlePayment}
              className="app-control h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-emerald-600/20"
            >
              <Wallet className="w-4 h-4" aria-hidden="true" />Registrar
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[5000, 20000, 50000].map(v => (
              <button key={v} type="button" onClick={() => setPaymentAmount(String((parseFloat(paymentAmount) || 0) + v))}
                className="app-control h-8 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-extrabold text-[10px] rounded-lg active:scale-95 transition-all">
                + ${v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Renovaciones ── */}
        <div className="member-renewal-section">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Renovación de Membresías</span>
          <div className="member-renewal-grid">
            {activePlans.map(plan => (
              <button key={plan.planKey} type="button" onClick={() => handleRenew(plan)}
                className="member-renewal-option">
                <span className="font-bold text-slate-300 text-[9px] text-center capitalize leading-tight">{plan.name}</span>
                <span className="font-black text-indigo-400 text-[9px] mt-0.5">${(plan.price / 1000).toFixed(0)}k</span>
              </button>
            ))}
          </div>
        </div>

        <div className="member-adjustment-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Ajuste auditado de días</span>
            <span className="text-[8px] text-slate-500 font-bold">Actual: {member.expiryDate}</span>
          </div>
          <div className="member-adjustment-row">
            <input
              type="number"
              value={dayAdjustment}
              onChange={event => setDayAdjustment(event.target.value)}
              placeholder="+7 / -1"
              className="member-adjustment-days"
            />
            <input
              type="text"
              value={dayAdjustmentReason}
              onChange={event => setDayAdjustmentReason(event.target.value)}
              placeholder="Motivo operativo"
              className="member-adjustment-reason"
            />
            <button
              type="button"
              onClick={handleAdjustDays}
              disabled={!dayAdjustment}
              className="app-button app-button--secondary member-adjustment-save"
            >
              Ajustar
            </button>
          </div>
        </div>

        <div className="member-history-section">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Historial de membresía</span>
          <div className="member-history-list">
            {memberMembershipEvents.length === 0 ? (
              <span className="text-[10px] text-slate-500">Sin eventos de membresía registrados.</span>
            ) : (
              memberMembershipEvents.map(event => (
                <div key={event.id} className="flex items-center justify-between gap-3 py-1 text-[10px] border-b border-slate-900 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block text-slate-300 font-bold truncate">
                      {event.eventType === 'manual_adjustment' ? 'Ajuste manual' : event.eventType === 'renewal' ? 'Renovación' : 'Inscripción'}
                    </span>
                    <span className="block text-[8px] text-slate-500 truncate">
                      {event.previousExpiryDate || 'Inicio'} → {event.newExpiryDate}
                    </span>
                  </span>
                  <strong className={`shrink-0 ${event.durationDays < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {event.durationDays > 0 ? '+' : ''}{event.durationDays || 0}d
                  </strong>
                </div>
              ))
            )}
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
                  <span className="min-w-0">
                    <span className="block truncate">{product.name}</span>
                    <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                      {PRODUCT_PAYMENT_METHOD_LABELS[product.method] || product.method}
                    </span>
                  </span>
                  <span className="font-bold text-indigo-400 shrink-0">${product.price.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Productos del Socio ── */}
        <div className="space-y-2">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest block">Producto al Socio</span>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <label className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer">
              <input type="radio" name="ppm" value="credito" checked={productPayMethod === 'credito'} onChange={() => setProductPayMethod('credito')} className="accent-indigo-500" />
              <span className="text-[10px] font-bold text-slate-300">Credito</span>
            </label>
            <label className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer">
              <input type="radio" name="ppm" value="efectivo" checked={productPayMethod === 'efectivo'} onChange={() => setProductPayMethod('efectivo')} className="accent-indigo-500" />
              <span className="text-[10px] font-bold text-slate-300">Efectivo</span>
            </label>
            <label className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer">
              <input type="radio" name="ppm" value="tarjeta" checked={productPayMethod === 'tarjeta'} onChange={() => setProductPayMethod('tarjeta')} className="accent-indigo-500" />
              <span className="text-[10px] font-bold text-slate-300">Tarjeta</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {products.length === 0
              ? <p className="col-span-2 text-[9px] text-slate-500">Sin productos en tienda.</p>
              : products.map(p => (
                  <button key={p.id} type="button" onClick={() => handleSellProduct(p.id)} disabled={p.stock === 0}
                    className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-between gap-2 text-left transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                    <div className="truncate">
                      <p className="text-[10px] font-bold text-slate-200 truncate">{p.name}</p>
                      <p className="text-[9px] text-indigo-400 font-black">${p.price.toLocaleString()}</p>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  </button>
                ))
            }
          </div>
        </div>

        {/* ── Eliminar usuario ── */}
        <button type="button" onClick={handleDelete}
          className="w-full h-10 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5">
          <Trash2 className="w-4 h-4" aria-hidden="true" /> Eliminar usuario
        </button>

      </div>
    </div>
  );
}

export default BottomSheet;
