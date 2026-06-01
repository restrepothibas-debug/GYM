import { useContext } from 'react';
import { Trash2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { GymContext } from '../context/GymContext';

function Payments() {
  const { cashFlow, setCashFlow } = useContext(GymContext);
  const sortedCash = cashFlow;

  const totalIngreso = cashFlow.filter(c => c.type === 'ingreso').reduce((s, c) => s + c.amount, 0);
  const totalEgreso  = cashFlow.filter(c => c.type === 'egreso').reduce((s, c) => s + c.amount, 0);

  const clearCashFlow = () => {
    if (window.confirm('¿Estás seguro de que quieres limpiar todo el flujo de caja?')) {
      setCashFlow([]);
    }
  };

  return (
    <div className="space-y-3 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Flujo de Caja</h3>
        <button
          onClick={clearCashFlow}
          className="px-2.5 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
        >
          <Trash2 className="w-3 h-3" /> Limpiar Caja
        </button>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl">
          <span className="text-[8px] text-emerald-400 font-bold block uppercase tracking-wider">Total Ingresos</span>
          <span className="text-sm font-black text-emerald-400 mt-1 block">${totalIngreso.toLocaleString()}</span>
        </div>
        <div className="bg-rose-950/30 border border-rose-500/20 p-3 rounded-xl">
          <span className="text-[8px] text-rose-400 font-bold block uppercase tracking-wider">Total Egresos</span>
          <span className="text-sm font-black text-rose-400 mt-1 block">${totalEgreso.toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
        {sortedCash.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-6 text-center">No hay transacciones registradas.</p>
        ) : (
          sortedCash.map(item => {
            const isIngreso = item.type === 'ingreso';
            return (
              <div key={item.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 max-w-[70%]">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isIngreso ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {isIngreso ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </div>
                  <div className="truncate">
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
