import { useContext, useState } from 'react';
import { Trash2, ArrowDownLeft, ArrowUpRight, PlusCircle } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';

function Payments() {
  const { cashFlow, clearCashFlow, isRemoteEnabled, recordCashMovement } = useContext(GymContext);
  const { confirm, notify } = useUi();
  const [movementType, setMovementType] = useState('ingreso');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const sortedCash = cashFlow;

  const totalIngreso = cashFlow.filter(c => c.type === 'ingreso').reduce((s, c) => s + c.amount, 0);
  const totalEgreso  = cashFlow.filter(c => c.type === 'egreso').reduce((s, c) => s + c.amount, 0);

  const handleClearCashFlow = async () => {
    const confirmed = await confirm({
      title: 'Limpiar flujo de caja',
      message: '¿Estás seguro de que quieres limpiar todo el flujo de caja local? Esta acción no afecta datos remotos.',
      confirmLabel: 'Limpiar caja',
    });
    if (confirmed) {
      const cleared = clearCashFlow();
      if (cleared) {
        notify({
          title: 'Caja limpiada',
          message: 'El flujo de caja local quedó vacío.',
          tone: 'success',
        });
      }
    }
  };

  const handleCreateMovement = async (event) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0 || !description.trim()) return;

    setSaving(true);
    const saved = await recordCashMovement(movementType, parsedAmount, description.trim());
    setSaving(false);

    if (saved) {
      setAmount('');
      setDescription('');
      setMovementType('ingreso');
    }
  };

  return (
    <div className="payments-view space-y-3 animate-fadeIn">
      <div className="payments-toolbar flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Flujo de Caja</h3>
        {!isRemoteEnabled && (
          <button
            type="button"
            onClick={handleClearCashFlow}
            className="app-toolbar-button app-toolbar-button--danger px-2.5 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" /> Limpiar Caja
          </button>
        )}
      </div>

      {/* Resumen rápido */}
      <div className="payments-summary grid grid-cols-2 gap-2">
        <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl">
          <span className="text-[8px] text-emerald-400 font-bold block uppercase tracking-wider">Total Ingresos</span>
          <span className="text-sm font-black text-emerald-400 mt-1 block">${totalIngreso.toLocaleString()}</span>
        </div>
        <div className="bg-rose-950/30 border border-rose-500/20 p-3 rounded-xl">
          <span className="text-[8px] text-rose-400 font-bold block uppercase tracking-wider">Total Egresos</span>
          <span className="text-sm font-black text-rose-400 mt-1 block">${totalEgreso.toLocaleString()}</span>
        </div>
      </div>

      <form onSubmit={handleCreateMovement} className="payments-form bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Movimiento Contable</h4>
          <span className="text-[9px] text-slate-500 font-bold">{isRemoteEnabled ? 'Doble partida' : 'Modo local'}</span>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <label htmlFor="cash-movement-type" className="sr-only">Tipo de movimiento</label>
          <select
            id="cash-movement-type"
            name="movementType"
            value={movementType}
            onChange={event => setMovementType(event.target.value)}
            className="h-10 px-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
          >
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
          <label htmlFor="cash-movement-amount" className="sr-only">Monto del movimiento</label>
          <input
            id="cash-movement-amount"
            name="amount"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            type="number"
            min="1"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Monto…"
            className="h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <label htmlFor="cash-movement-description" className="sr-only">Descripción del movimiento</label>
          <input
            id="cash-movement-description"
            name="description"
            value={description}
            onChange={event => setDescription(event.target.value)}
            autoComplete="off"
            placeholder="Descripción del movimiento…"
            className="min-w-0 flex-1 h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={saving || !amount || !description.trim()}
            className="app-primary-action h-10 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[10px] font-black flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </form>

      <div className="payments-list space-y-2 max-h-[52vh] overflow-y-auto pr-1">
        {sortedCash.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-6 text-center">No hay transacciones registradas.</p>
        ) : (
          sortedCash.map(item => {
            const isIngreso = item.type === 'ingreso';
            return (
              <div key={item.id} className="payment-row p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 max-w-[70%]">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isIngreso ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {isIngreso ? <ArrowDownLeft className="w-4 h-4" aria-hidden="true" /> : <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
                  </div>
                  <div className="payment-row__identity truncate">
                    <p className="font-bold text-slate-200 truncate text-[11px]">{item.description}</p>
                    <p className="text-[8px] text-slate-500">{item.date}</p>
                  </div>
                </div>
                <span className={`text-[11px] font-black shrink-0 ${isIngreso ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isIngreso ? '+' : '-'} ${item.amount.toLocaleString()}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Payments;
