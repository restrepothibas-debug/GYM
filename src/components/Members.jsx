import { useState, useContext } from 'react';
import { Trash2, User } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';
import { formatCurrency, getMemberDebtBreakdown } from '../lib/accounting';
import { formatMembershipStatus, getDaysRemaining } from '../lib/dateUtils';
import { ATHLETE_COPY } from '../lib/uiLabels';

function Members({ openBottomSheet }) {
  const { deleteMember, members } = useContext(GymContext);
  const { confirm, notify } = useUi();
  const [filter, setFilter] = useState('all');

  // Balance display contract:
  // negative = debt, zero = paid, positive = credit in favor.
  // It is not labeled as wallet because enrollment payments also affect it.
  const filteredMembers = members.filter(m => {
    const d = getDaysRemaining(m.expiryDate);
    if (filter === 'active') return d >= 0;
    if (filter === 'warning') return d >= 0 && d <= 5;
    if (filter === 'expired') return d < 0;
    if (filter === 'debts') return getMemberDebtBreakdown(m).totalDebt > 0;
    return true;
  });

  const handleDelete = async (event, member) => {
    event.stopPropagation();
    const confirmed = await confirm({
      title: ATHLETE_COPY.deleteConfirmTitle,
      message: `¿Eliminar a ${member.name} de los atletas activos? Su historial contable, compras y asistencias se conserva.`,
      confirmLabel: ATHLETE_COPY.deleteAction,
    });
    if (!confirmed) return;

    const removed = await deleteMember(member.id);
    if (removed) {
      notify({
        title: ATHLETE_COPY.deleteSuccessTitle,
        message: `${member.name} ya no aparece en atletas activos.`,
        tone: 'success',
      });
    }
  };

  const openMemberDetails = (memberId) => {
    openBottomSheet(memberId);
  };

  const handleRowKeyDown = (event, memberId) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openMemberDetails(memberId);
  };

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'warning', label: 'Por Vencer' },
    { key: 'expired', label: 'Vencidos' },
    { key: 'debts', label: 'Deuda' },
  ];

  return (
    <div className="members-view space-y-3 animate-fadeIn">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{ATHLETE_COPY.moduleTitle}</h3>
        <div className="members-filters flex gap-1 overflow-x-auto pb-1">
          {filters.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`app-filter-chip px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all ${filter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="members-list space-y-2 max-h-[55vh] overflow-y-auto rounded-xl pr-1">
        {filteredMembers.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-6 text-center">{ATHLETE_COPY.listEmpty}</p>
        ) : (
          filteredMembers.map(m => {
            const membershipStatus = formatMembershipStatus(m.expiryDate);
            const debtBreakdown = getMemberDebtBreakdown(m);
            const statusColor = membershipStatus.tone === 'danger' ? 'text-rose-400' : membershipStatus.tone === 'warning' ? 'text-amber-400' : 'text-emerald-400';
            const balanceColor = debtBreakdown.totalDebt > 0 ? 'text-rose-400' : m.balance > 0 ? 'text-emerald-400' : 'text-slate-400';

            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => openMemberDetails(m.id)}
                onKeyDown={(event) => handleRowKeyDown(event, m.id)}
                className="member-row p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-2xl flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all"
              >
                <div className="member-row__identity flex items-center gap-3 max-w-[65%]">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 truncate">
                    <h4 className="font-bold text-xs text-slate-200 truncate">{m.name}</h4>
                    <p className="text-[9px] text-slate-500">C.C. {m.doc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={`text-[10px] font-black ${statusColor}`}>
                      {membershipStatus.label}
                    </p>
                    <p className="text-[8px] text-slate-500 font-semibold mt-0.5">Vence {m.expiryDate}</p>
                    <p className={`text-[9px] font-semibold ${balanceColor} mt-0.5`}>
                      {debtBreakdown.totalDebt > 0
                        ? `Debe ${formatCurrency(debtBreakdown.totalDebt)}`
                        : m.balance > 0
                          ? `Crédito ${formatCurrency(m.balance)}`
                          : 'Al día'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => handleDelete(event, m)}
                    aria-label={`Eliminar atleta ${m.name}`}
                    className="app-icon-button app-icon-button--danger w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
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
