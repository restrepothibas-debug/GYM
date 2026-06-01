import { useState, useContext } from 'react';
import { User } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { getDaysRemaining } from '../lib/dateUtils';

function Members({ openBottomSheet }) {
  const { members } = useContext(GymContext);
  const [filter, setFilter] = useState('all');

  const filteredMembers = members.filter(m => {
    const d = getDaysRemaining(m.expiryDate);
    if (filter === 'active') return d >= 0;
    if (filter === 'warning') return d >= 0 && d <= 5;
    if (filter === 'expired') return d < 0;
    if (filter === 'debts') return m.balance < 0;
    return true;
  });

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'warning', label: 'Por Vencer' },
    { key: 'expired', label: 'Vencidos' },
    { key: 'debts', label: 'Deuda' },
  ];

  return (
    <div className="space-y-3 animate-fadeIn">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Base de Datos de Miembros</h3>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all ${filter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto rounded-xl pr-1">
        {filteredMembers.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-6 text-center">Ningún miembro coincide con este filtro.</p>
        ) : (
          filteredMembers.map(m => {
            const daysLeft = getDaysRemaining(m.expiryDate);
            const isExpired = daysLeft < 0;
            const statusColor = isExpired ? 'text-rose-400' : daysLeft <= 5 ? 'text-amber-400' : 'text-emerald-400';
            const balanceColor = m.balance < 0 ? 'text-rose-400' : m.balance > 0 ? 'text-emerald-400' : 'text-slate-400';

            return (
              <div
                key={m.id}
                onClick={() => openBottomSheet(m.id)}
                className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-3 max-w-[65%]">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="truncate">
                    <h4 className="font-bold text-xs text-slate-200 truncate">{m.name}</h4>
                    <p className="text-[9px] text-slate-500">C.C. {m.doc}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-[10px] font-black ${statusColor}`}>
                    {isExpired ? 'Vencido' : `${daysLeft} días`}
                  </p>
                  <p className={`text-[9px] font-semibold ${balanceColor} mt-0.5`}>
                    {m.balance < 0 ? `Debe $${Math.abs(m.balance).toLocaleString()}` : m.balance > 0 ? `Crédito $${m.balance.toLocaleString()}` : 'Al día'}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Members;
