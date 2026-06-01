import { useState, useRef, useContext } from 'react';
import { UserPlus, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { addDaysToDateString, getTodayDateString } from '../lib/dateUtils';

const PRESETS_PLANES = {
  diario:     { durationDays: 1,   price: 5000 },
  semanal:    { durationDays: 7,   price: 20000 },
  mensual:    { durationDays: 30,  price: 60000 },
  trimestral: { durationDays: 90,  price: 150000 },
  anual:      { durationDays: 365, price: 500000 },
};

function AddMemberModal({ onClose }) {
  const { addMember, members } = useContext(GymContext);
  const [error, setError] = useState('');

  const nameRef    = useRef();
  const docRef     = useRef();
  const phoneRef   = useRef();
  const planRef    = useRef();
  const balanceRef = useRef();

  const handleSave = (e) => {
    e.preventDefault();
    const plan = planRef.current.value;
    const preset = PRESETS_PLANES[plan];

    const expiryDate = addDaysToDateString(getTodayDateString(), preset.durationDays);
    const doc = docRef.current.value.trim();

    if (members.some(member => member.doc === doc)) {
      setError('La identificacion ya se encuentra registrada.');
      return;
    }

    const memberData = {
      name:       nameRef.current.value.trim(),
      doc,
      phone:      phoneRef.current.value.trim(),
      plan,
      expiryDate,
    };

    const initialBalance = parseFloat(balanceRef.current.value) || 0;
    const saved = addMember(memberData, preset.price, initialBalance);
    if (saved) {
      onClose();
    } else {
      setError('No se pudo registrar el socio.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="text-indigo-400 w-4 h-4" />
            <h3 className="font-extrabold text-xs text-slate-100">Nueva Inscripción</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-3.5">
          {error && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-300">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Nombre del Atleta *</label>
            <input ref={nameRef} type="text" required placeholder="Ej. Ricardo Pérez"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Cédula / Identificación *</label>
            <input ref={docRef} type="text" required placeholder="Ej. 11025489"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Teléfono de contacto</label>
            <input ref={phoneRef} type="text" placeholder="Ej. 3012345678"
              className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Plan Inicial</label>
              <select ref={planRef} defaultValue="semanal"
                className="w-full h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200">
                <option value="diario">Pase Diario — $5.000</option>
                <option value="semanal">Plan Semanal — $20.000 ⚡</option>
                <option value="mensual">Mensualidad — $60.000</option>
                <option value="trimestral">Plan Trimestral — $150.000</option>
                <option value="anual">Plan Anual — $500.000</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Monedero Inicial ($)</label>
              <input ref={balanceRef} type="number" defaultValue="0"
                className="w-full h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
          <button type="submit"
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs shadow-lg shadow-indigo-600/10 active:scale-95 transition-all">
            Registrar Socio y Cobrar
          </button>
        </form>
      </div>
    </div>
  );
}

export default AddMemberModal;
