import { useState, useContext, useEffect } from 'react';
import { Dumbbell, UserPlus, CheckCircle, Users, ShoppingBag, CreditCard, Search, X, Sparkles, ChevronRight, LogOut, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';
import { GymContext } from './context/GymContext';
import Dashboard from './components/Dashboard';
import Members from './components/Members';
import Store from './components/Store';
import Payments from './components/Payments';
import BottomSheet from './components/BottomSheet';
import AddMemberModal from './components/AddMemberModal';
import AuthGate from './components/AuthGate';
import { formatCurrency, getMemberDebtBreakdown } from './lib/accounting';
import { getDaysRemaining, getTodayDateString } from './lib/dateUtils';

function isLicenseUsable(license) {
  if (!license) return false;
  if (!['active', 'trial'].includes(license.status)) return false;
  if (license.expires_on && license.expires_on < getTodayDateString()) return false;
  return true;
}

function AccountLoadingScreen({ canSignOut, error, onRetry, onSignOut }) {
  return (
    <div data-theme="office" className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <Loader2 className={`w-6 h-6 ${error ? '' : 'animate-spin'}`} />
          </span>
          <div>
            <h1 className="text-sm font-black text-white">Preparando cuenta</h1>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Validando sesion, tenant, licencia y permisos de acceso.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-300 leading-relaxed">
            {error}
          </div>
        )}

        {error && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={onSignOut}
              disabled={!canSignOut}
              className="h-10 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cerrar sesion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFeedback, setQuickFeedback] = useState(null);

  const {
    activeLicense,
    activeTenant,
    authLoading,
    cashFlow,
    checkinsToday,
    clearError,
    dataLoading,
    error,
    isRemoteEnabled,
    members,
    products,
    refreshWorkspace,
    session,
    signOut,
    workspaceLoaded,
    workspaceLoading,
  } = useContext(GymContext);
  const cleanSearch = searchQuery.trim().toLowerCase();
  const searchResults = cleanSearch
    ? members.filter(member =>
        member.name.toLowerCase().includes(cleanSearch) ||
        String(member.doc || '').includes(cleanSearch)
      )
    : [];

  useEffect(() => {
    if (!quickFeedback) return undefined;
    const timer = window.setTimeout(() => setQuickFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [quickFeedback]);

  const openMemberFromSearch = (memberId) => {
    setSelectedMemberId(memberId);
    setSearchQuery('');
  };

  const handleCheckinFeedback = (member) => {
    setQuickFeedback({
      member,
      debtBreakdown: getMemberDebtBreakdown(member),
      daysLeft: getDaysRemaining(member.expiryDate),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  };

  if (isRemoteEnabled && (authLoading || workspaceLoading || (session && !workspaceLoaded))) {
    // Post-login loading must always be recoverable. If Supabase/Auth/RLS fails,
    // show the captured error here instead of sending users to tenant creation.
    return (
      <AccountLoadingScreen
        canSignOut={Boolean(session)}
        error={error}
        onRetry={session ? refreshWorkspace : () => window.location.reload()}
        onSignOut={signOut}
      />
    );
  }

  if (isRemoteEnabled && (!session || !activeTenant)) {
    return <AuthGate />;
  }

  if (isRemoteEnabled && activeTenant && !isLicenseUsable(activeLicense)) {
    return (
      <div data-theme="office" className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-sm font-black text-white">Licencia no activa</h1>
              <p className="text-[10px] text-slate-500">{activeTenant.name}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Estado actual: <strong className="text-rose-300">{activeLicense?.status || 'sin licencia'}</strong>
          </p>
          <button
            onClick={signOut}
            className="w-full h-10 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-xs font-black"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="office" className="bg-slate-950 text-slate-100 font-sans antialiased h-full min-h-screen flex flex-col select-none">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-600/30">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-sm tracking-tight block bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">GYM-FLOW</span>
            <span className="text-[8px] text-indigo-400 tracking-widest font-black uppercase block truncate max-w-[150px]">
              {activeTenant?.name || 'Gestión Inteligente'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRemoteEnabled && (
            <button
              onClick={signOut}
              aria-label="Cerrar sesión"
              className="h-9 w-9 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsAddMemberModalOpen(true)}
            className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-2 text-xs font-black shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Inscribir</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-4 max-w-md mx-auto w-full flex-1 pb-28 space-y-4 overflow-y-auto">
        {error && (
          <div className="bg-rose-950/40 border border-rose-500/20 text-rose-200 rounded-xl p-3 flex items-start justify-between gap-3 text-[10px] font-bold">
            <span>{error}</span>
            <button onClick={clearError} className="text-rose-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {dataLoading && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            Sincronizando datos
          </div>
        )}

        {quickFeedback && (
          <div className="bg-slate-900 border border-emerald-500/30 p-4 rounded-2xl shadow-2xl space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-emerald-400 font-extrabold tracking-widest uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 animate-glow text-emerald-400" /> Acceso Registrado
              </span>
              <span className="text-[9px] text-slate-500 font-medium">{quickFeedback.time}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-white truncate">{quickFeedback.member.name}</h3>
                <p className="text-[10px] text-slate-400">
                  Vence en: <strong className="text-slate-200">{quickFeedback.daysLeft} dias</strong> · Saldo:{' '}
                  <strong className={quickFeedback.debtBreakdown.totalDebt > 0 ? 'text-rose-400 font-extrabold' : 'text-slate-200'}>
                    {quickFeedback.debtBreakdown.totalDebt > 0
                      ? `Debe ${formatCurrency(quickFeedback.debtBreakdown.totalDebt)}`
                      : `Saldo ${formatCurrency(quickFeedback.member.balance)}`}
                  </strong>
                </p>
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 ${
                quickFeedback.daysLeft < 0
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {quickFeedback.daysLeft < 0 ? 'Vencido' : 'Activo'}
              </span>
            </div>
          </div>
        )}

        <section className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar socio por nombre o CC..."
              className="w-full h-11 pl-10 pr-10 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                aria-label="Limpiar busqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {cleanSearch && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-800/60 shadow-2xl animate-fadeIn">
              {searchResults.length === 0 ? (
                <p className="p-3 text-[10px] text-slate-500 text-center">Ningun socio coincide.</p>
              ) : (
                searchResults.map(member => (
                  <button
                    key={member.id}
                    onClick={() => openMemberFromSearch(member.id)}
                    className="w-full p-3 hover:bg-slate-800 cursor-pointer flex items-center justify-between transition-colors text-left"
                  >
                    <span>
                      <span className="text-xs font-bold text-white block">{member.name}</span>
                      <span className="text-[8px] text-slate-500">C.C. {member.doc}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        {activeTab === 'dashboard' && (
          <Dashboard 
            members={members} 
            checkinsToday={checkinsToday} 
            openBottomSheet={setSelectedMemberId} 
            onCheckinFeedback={handleCheckinFeedback}
          />
        )}
        {activeTab === 'members' && (
          <Members 
            members={members} 
            openBottomSheet={setSelectedMemberId} 
          />
        )}
        {activeTab === 'store' && (
          <Store 
            products={products} 
          />
        )}
        {activeTab === 'payments' && (
          <Payments 
            cashFlow={cashFlow} 
          />
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800/80 px-6 py-2 flex justify-around items-center max-w-md mx-auto z-40 rounded-t-3xl shadow-2xl">
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`flex flex-col items-center gap-1 py-1.5 transition-all ${activeTab === 'dashboard' ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-400'}`}
        >
          <CheckCircle className="w-5 h-5" />
          <span className="text-[8px] tracking-wider uppercase font-extrabold">Inicio</span>
        </button>
        <button 
          onClick={() => setActiveTab('members')} 
          className={`flex flex-col items-center gap-1 py-1.5 transition-all ${activeTab === 'members' ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-400'}`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[8px] tracking-wider uppercase font-extrabold">Socios</span>
        </button>
        <button 
          onClick={() => setActiveTab('store')} 
          className={`flex flex-col items-center gap-1 py-1.5 transition-all ${activeTab === 'store' ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-400'}`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[8px] tracking-wider uppercase font-extrabold">Tienda</span>
        </button>
        <button 
          onClick={() => setActiveTab('payments')} 
          className={`flex flex-col items-center gap-1 py-1.5 transition-all ${activeTab === 'payments' ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-400'}`}
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[8px] tracking-wider uppercase font-extrabold">Caja</span>
        </button>
      </nav>

      {/* MODALS */}
      {selectedMemberId && (
        <BottomSheet 
          key={selectedMemberId}
          memberId={selectedMemberId} 
          onClose={() => setSelectedMemberId(null)} 
        />
      )}
      
      {isAddMemberModalOpen && (
        <AddMemberModal 
          onClose={() => setIsAddMemberModalOpen(false)} 
        />
      )}

    </div>
  );
}

export default App;
