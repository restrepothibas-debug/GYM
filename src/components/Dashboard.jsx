import { useContext } from 'react';
import { CheckCircle, History, Zap } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { formatCurrency, getMemberDebtBreakdown } from '../lib/accounting';
import { getDaysRemaining } from '../lib/dateUtils';
import { ATTENDANCE_COPY } from '../lib/uiLabels';

function Dashboard({ openBottomSheet, onCheckinFeedback }) {
  const { addCheckin, cashFlow, checkinsToday, members } = useContext(GymContext);

  const activeCount = members.filter(member => getDaysRemaining(member.expiryDate) >= 0).length;
  const totalDebt = members.reduce((sum, member) => sum + getMemberDebtBreakdown(member).totalDebt, 0);
  const totalIncome = cashFlow
    .filter(entry => entry.type === 'ingreso')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const frequentMembers = members.slice(0, 4);
  const recentCheckins = [...checkinsToday].reverse().slice(0, 6);

  const metrics = [
    { label: 'Ingreso total', tone: 'text-emerald-400', value: formatCurrency(totalIncome) },
    { label: ATTENDANCE_COPY.kpiLabel, tone: 'text-indigo-400', value: checkinsToday.length },
    { label: 'Atletas activos', tone: 'text-indigo-400', value: activeCount },
    { label: 'Por cobrar', tone: 'text-rose-400', value: formatCurrency(totalDebt) },
  ];

  const openMemberDetails = (memberId) => {
    openBottomSheet?.(memberId);
  };

  const handleCardKeyDown = (event, memberId) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openMemberDetails(memberId);
  };

  const handleExpressCheckin = (event, member) => {
    event.stopPropagation();
    const isCheckedIn = checkinsToday.some(checkin => checkin.memberId === member.id);
    const isExpired = getDaysRemaining(member.expiryDate) < 0;
    if (isCheckedIn || isExpired) return;

    const result = addCheckin(member.id);
    Promise.resolve(result).then(success => {
      if (success !== false) onCheckinFeedback?.(member);
    });
  };

  return (
    <div className="dashboard-view space-y-4 animate-fadeIn">
      <section className="dashboard-express space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="dashboard-section-title text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            {ATTENDANCE_COPY.quickTitle}
          </h3>
          <span className="dashboard-section-pill text-[9px] text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded-full">
            Frecuentes
          </span>
        </div>

        {frequentMembers.length === 0 ? (
          <p className="dashboard-empty text-[10px] text-slate-500 py-4 text-center bg-slate-900 rounded-2xl border border-slate-800">
            No hay atletas registrados.
          </p>
        ) : (
          <div className="dashboard-express-grid grid grid-cols-2 gap-2">
            {frequentMembers.map(member => {
              const isCheckedIn = checkinsToday.some(checkin => checkin.memberId === member.id);
              const daysLeft = getDaysRemaining(member.expiryDate);
              const isExpired = daysLeft < 0;

              let cardClass = 'bg-slate-900 border-slate-800 hover:border-slate-700';
              if (isCheckedIn) cardClass = 'bg-emerald-950/25 border-emerald-500/30';
              else if (isExpired) cardClass = 'bg-rose-950/20 border-rose-500/20';

              return (
                <div
                  key={member.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMemberDetails(member.id)}
                  onKeyDown={(event) => handleCardKeyDown(event, member.id)}
                  className={`dashboard-express-card p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-24 ${cardClass}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="dashboard-card-name min-w-0 text-[10px] font-bold text-white truncate">
                      {member.name}
                    </span>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isCheckedIn ? 'bg-emerald-400' : isExpired ? 'bg-rose-400' : 'bg-slate-600'}`} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <span className="dashboard-card-label text-[8px] text-slate-500 block uppercase font-bold">
                        Vence
                      </span>
                      <span className={`dashboard-card-value text-[9px] font-bold ${isExpired ? 'text-rose-400' : 'text-slate-300'}`}>
                        {isExpired ? 'Vencido' : `${daysLeft} días`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => handleExpressCheckin(event, member)}
                      disabled={isCheckedIn || isExpired}
                      className={`dashboard-action-button rounded-lg text-[9px] font-bold uppercase flex items-center justify-center transition-all ${
                        isCheckedIn
                          ? 'dashboard-action-button--checked bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                          : isExpired
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'dashboard-action-button--primary bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'
                      }`}
                    >
                      {isCheckedIn ? ATTENDANCE_COPY.registered : isExpired ? 'Vencido' : ATTENDANCE_COPY.action}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-metrics grid grid-cols-2 gap-2">
        {metrics.map(metric => (
          <div key={metric.label} className="dashboard-metric-card bg-slate-900 border border-slate-800/60 p-3 rounded-2xl">
            <span className="dashboard-metric-label text-[8px] text-slate-500 font-bold block uppercase tracking-wider">
              {metric.label}
            </span>
            <span className={`dashboard-metric-value text-sm font-bold mt-1 block truncate ${metric.tone}`}>
              {metric.value}
            </span>
          </div>
        ))}
      </section>

      <section className="dashboard-recent space-y-2">
        <h3 className="dashboard-section-title text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
          {ATTENDANCE_COPY.recentTitle}
        </h3>
        <div className="dashboard-recent-list space-y-2 max-h-48 overflow-y-auto rounded-xl">
          {recentCheckins.length === 0 ? (
            <p className="dashboard-empty text-[10px] text-slate-500 py-4 text-center">
              {ATTENDANCE_COPY.recentEmpty}
            </p>
          ) : (
            recentCheckins.map((checkin, index) => {
              const member = members.find(item => item.id === checkin.memberId);
              if (!member) return null;
              return (
                <button
                  key={`${checkin.memberId}-${checkin.time}-${index}`}
                  type="button"
                  onClick={() => openMemberDetails(member.id)}
                  className="dashboard-recent-row p-2.5 bg-slate-900 border border-slate-800/60 rounded-xl flex items-center justify-between text-xs"
                >
                  <span className="dashboard-recent-member flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="dashboard-card-name font-bold text-slate-200 text-[11px] truncate block">
                        {member.name}
                      </span>
                      <span className="dashboard-card-label text-[8px] text-slate-500 block">
                        C.C. {member.doc}
                      </span>
                    </span>
                  </span>
                  <span className="dashboard-card-label text-[10px] text-slate-400 font-medium">
                    {checkin.time}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
