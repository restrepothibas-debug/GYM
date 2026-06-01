import { useContext } from 'react';
import { Zap, History, CheckCircle } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { getDaysRemaining } from '../lib/dateUtils';

function Dashboard({ openBottomSheet, onCheckinFeedback }) {
  const { members, checkinsToday, addCheckin } = useContext(GymContext);

  const activeCount = members.filter(m => getDaysRemaining(m.expiryDate) >= 0).length;
  const totalDebt = members.reduce((sum, m) => m.balance < 0 ? sum + Math.abs(m.balance) : sum, 0);
  const frequentMembers = members.slice(0, 4);

  const handleExpressCheckin = (e, member) => {
    e.stopPropagation();
    if (checkinsToday.some(c => c.memberId === member.id)) return;
    addCheckin(member.id);
    onCheckinFeedback?.(member);
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* ENTRADAS FRECUENTES */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-indigo-400" /> Registro de Asistencia Express (1-Clic)
          </h3>
          <span className="text-[9px] text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded-full">Frecuentes</span>
        </div>

        {frequentMembers.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-4 text-center bg-slate-900 rounded-2xl border border-slate-800">
            Sin socios aún. ¡Inscribe el primero!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {frequentMembers.map(m => {
              const isCheckedIn = checkinsToday.some(c => c.memberId === m.id);
              const daysLeft = getDaysRemaining(m.expiryDate);
              const isExpired = daysLeft < 0;

              let cardClass = 'bg-slate-900 border-slate-800 hover:border-slate-700';
              if (isCheckedIn) cardClass = 'bg-emerald-950/25 border-emerald-500/30';
              else if (isExpired) cardClass = 'bg-rose-950/20 border-rose-500/20';

              return (
                <div
                  key={m.id}
                  onClick={() => openBottomSheet(m.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-24 ${cardClass}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white truncate max-w-[80%]">{m.name}</span>
                    <div className={`w-2 h-2 rounded-full ${isCheckedIn ? 'bg-emerald-400' : isExpired ? 'bg-rose-400' : 'bg-slate-600'}`}></div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-[8px] text-slate-500 block uppercase font-bold">Vence</span>
                      <span className={`text-[9px] font-black ${isExpired ? 'text-rose-400' : 'text-slate-300'}`}>
                        {isExpired ? 'Vencido' : `${daysLeft} días`}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleExpressCheckin(e, m)}
                      disabled={isCheckedIn}
                      className={`h-6 w-12 rounded-lg text-[9px] font-black uppercase flex items-center justify-center transition-all ${
                        isCheckedIn
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/10 active:scale-95'
                      }`}
                    >
                      {isCheckedIn ? 'Listo' : 'Entrar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MÉTRICAS RÁPIDAS */}
      <section className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Hoy Ingresaron</span>
          <span className="text-xl font-black text-emerald-400 mt-1">{checkinsToday.length}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Activos Totales</span>
          <span className="text-xl font-black text-indigo-400 mt-1">{activeCount}</span>
        </div>
        <div className="bg-slate-900 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-[8px] text-slate-500 font-bold block uppercase tracking-wider">Por Cobrar</span>
          <span className="text-xs font-black text-rose-400 mt-2 block truncate">${totalDebt.toLocaleString()}</span>
        </div>
      </section>

      {/* RECIENTES */}
      <section className="space-y-2">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-indigo-400" /> Flujo de Ingresos Recientes
        </h3>
        <div className="space-y-2 max-h-48 overflow-y-auto rounded-xl">
          {checkinsToday.length === 0 ? (
            <p className="text-[10px] text-slate-500 py-4 text-center">No hay registros de asistencia hoy.</p>
          ) : (
            [...checkinsToday].reverse().map((c, idx) => {
              const member = members.find(m => m.id === c.memberId);
              if (!member) return null;
              return (
                <div key={idx} className="p-2.5 bg-slate-900 border border-slate-800/60 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-200 text-[11px]">{member.name}</p>
                      <p className="text-[8px] text-slate-500">C.C. {member.doc}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono font-medium">{c.time}</span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
