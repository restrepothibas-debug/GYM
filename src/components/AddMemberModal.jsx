import { useState, useRef, useContext, useEffect, useId } from 'react';
import { UserPlus, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { addDaysToDateString, getTodayDateString } from '../lib/dateUtils';
import { DEFAULT_MEMBERSHIP_PLANS, getActiveMembershipPlans } from '../lib/membershipPlans';

function AddMemberModal({ onClose }) {
  const { addMember, members, membershipPlans } = useContext(GymContext);
  const activePlans = getActiveMembershipPlans(membershipPlans.length ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const nameRef    = useRef();
  const docRef     = useRef();
  const phoneRef   = useRef();
  const planRef    = useRef();
  const initialPaymentRef = useRef();
  const modalTitleId = useId();
  const nameInputId = useId();
  const docInputId = useId();
  const phoneInputId = useId();
  const planInputId = useId();
  const initialPaymentInputId = useId();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);

    // Desktop/tablet forms receive initial focus for keyboard workflows. Mobile
    // keeps the current behavior to avoid opening the virtual keyboard.
    if (window.matchMedia?.('(min-width: 48rem)').matches) {
      nameRef.current?.focus();
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const plan = planRef.current.value;
    const preset = activePlans.find(candidate => candidate.planKey === plan) || activePlans[0];

    const expiryDate = addDaysToDateString(getTodayDateString(), preset.durationDays);
    const doc = docRef.current.value.trim();

    if (members.some(member => member.doc === doc)) {
      setError('La identificacion ya se encuentra registrada.');
      setSaving(false);
      return;
    }

    const memberData = {
      name:       nameRef.current.value.trim(),
      doc,
      phone:      phoneRef.current.value.trim(),
      plan,
      expiryDate,
    };

    // Enrollment money contract:
    // `initialPayment` is cash/card received at signup, not wallet credit.
    // Member balance is computed as payment minus plan price:
    //   0 = paid in full, negative = receivable/debt, positive = credit in favor.
    const initialPayment = parseFloat(initialPaymentRef.current.value) || 0;
    const saved = await addMember(memberData, preset.price, initialPayment);
    if (saved) {
      onClose();
    } else {
      setError('No se pudo registrar el socio.');
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        className="app-modal-card"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="text-indigo-400 w-4 h-4" aria-hidden="true" />
            <h3 id={modalTitleId} className="font-extrabold text-xs text-slate-100">Nueva Inscripción</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-icon-button p-1 text-slate-400 hover:text-white"
            aria-label="Cerrar inscripción"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3.5">
          {error && (
            <p role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-300">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label htmlFor={nameInputId} className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Nombre del Atleta *</label>
            <input id={nameInputId} ref={nameRef} name="memberName" type="text" required autoComplete="name" placeholder="Ej. Ricardo Pérez…"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="space-y-1">
            <label htmlFor={docInputId} className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Cédula / Identificación *</label>
            <input id={docInputId} ref={docRef} name="memberDocument" type="text" required autoComplete="off" inputMode="numeric" placeholder="Ej. 11025489…"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="space-y-1">
            <label htmlFor={phoneInputId} className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Teléfono de contacto</label>
            <input id={phoneInputId} ref={phoneRef} name="memberPhone" type="tel" autoComplete="tel" inputMode="tel" placeholder="Ej. 3012345678…"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor={planInputId} className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Plan Inicial</label>
              <select id={planInputId} ref={planRef} name="initialPlan" defaultValue={activePlans[0]?.planKey}
                className="w-full h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
                {activePlans.map(planOption => (
                  <option key={planOption.planKey} value={planOption.planKey}>
                    {planOption.name} — ${planOption.price.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={initialPaymentInputId} className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Pago Inicial Recibido ($)</label>
              <input id={initialPaymentInputId} ref={initialPaymentRef} name="initialPayment" type="number" min="0" defaultValue="0" inputMode="numeric" autoComplete="off"
                className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
          <p className="text-[9px] text-slate-500 leading-relaxed">
            Si el pago es igual al plan, el socio queda al día. Si paga menos, queda saldo por cobrar; si paga de más, queda crédito a favor.
          </p>
          <button type="submit" disabled={saving}
            className="app-primary-action w-full h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs shadow-lg shadow-indigo-600/10 active:scale-95 transition-all">
            {saving ? 'Guardando…' : 'Registrar Socio y Cobrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddMemberModal;
