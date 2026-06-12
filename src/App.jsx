import { useState, useContext, useEffect } from 'react';
import { BarChart3, Building2, Dumbbell, Fingerprint, Settings, UserPlus, CheckCircle, Users, ShoppingBag, CreditCard, Search, X, Sparkles, ChevronRight, LogOut, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';
import { GymContext } from './context/GymContext';
import Dashboard from './components/Dashboard';
import Members from './components/Members';
import Store from './components/Store';
import Payments from './components/Payments';
import Accounting from './components/Accounting';
import BottomSheet from './components/BottomSheet';
import AddMemberModal from './components/AddMemberModal';
import AuthGate from './components/AuthGate';
import BiometricCheckinModal from './components/BiometricCheckinModal';
import BiometricSettingsModal from './components/BiometricSettingsModal';
import GymIdentityModal from './components/GymIdentityModal';
import MembershipPlans from './components/MembershipPlans';
import { formatCurrency, getMemberDebtBreakdown } from './lib/accounting';
import { getDaysRemaining, getTodayDateString } from './lib/dateUtils';
import { ATHLETE_COPY } from './lib/uiLabels';

const MAIN_NAV_ITEMS = [
  { key: 'dashboard', label: 'Inicio', icon: CheckCircle },
  { key: 'members', label: ATHLETE_COPY.menuLabel, icon: Users },
  { key: 'biometrics', label: 'Huella', icon: Fingerprint },
  { key: 'plans', label: 'Planes', icon: Dumbbell },
  { key: 'store', label: 'Tienda', icon: ShoppingBag },
  { key: 'payments', label: 'Caja', icon: CreditCard },
  { key: 'accounting', label: 'Contab.', icon: BarChart3 },
  { key: 'settings', label: 'Ajustes', icon: Settings },
];

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
              Validando sesión, tenant, licencia y permisos de acceso.
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
              className="app-primary-action h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={onSignOut}
              disabled={!canSignOut}
              className="h-10 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 rounded-lg text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsModuleButton({ actionLabel = 'Abrir', detail, icon: Icon, meta, onClick, title, tone = 'default' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`settings-module-card settings-module-card--${tone}`}
    >
      <span className="settings-module-card__icon" aria-hidden="true">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <span className="settings-module-card__content">
        <strong>{title}</strong>
        <span>{detail}</span>
        {meta && <small>{meta}</small>}
      </span>
      <span className="settings-module-card__action">{actionLabel}</span>
    </button>
  );
}

function SettingsView({
  activeTenant,
  isRemoteEnabled,
  onOpenGymIdentity,
  onSignOut,
}) {
  return (
    <section className="settings-view animate-fadeIn" aria-labelledby="settings-title">
      <div className="settings-header">
        <div>
          <span className="settings-eyebrow">Menu principal</span>
          <h3 id="settings-title">Ajustes</h3>
          <p>{activeTenant?.name || 'Gimnasio local'}</p>
        </div>
      </div>

      <div className="settings-module-grid">
        <SettingsModuleButton
          icon={Building2}
          title="Identidad del gimnasio"
          detail="Perfil, contacto, logo y recibos"
          meta={activeTenant?.city || activeTenant?.phone || activeTenant?.email || 'Sin datos de contacto'}
          onClick={onOpenGymIdentity}
        />
        <SettingsModuleButton
          actionLabel="Salir"
          icon={LogOut}
          title="Cerrar sesión"
          detail={isRemoteEnabled ? "Cuenta remota activa" : "Modo local"}
          meta={activeTenant?.role ? `Rol: ${activeTenant.role}` : 'Sesion autenticada'}
          onClick={onSignOut}
          tone="danger"
        />
      </div>
    </section>
  );
}

function BiometricView({
  activeTenant,
  biometricDeviceStatus,
  biometricProvider,
  memberBiometrics = [],
  onOpenBiometricCheckin,
  onOpenBiometricSettings,
  onOpenMembers,
}) {
  const activeBiometricCount = memberBiometrics.filter(enrollment => enrollment.status === 'active').length;
  const deviceStatus = biometricDeviceStatus?.available ? 'Disponible' : 'Pendiente';

  return (
    <section className="biometric-view animate-fadeIn" aria-labelledby="biometric-title">
      <div className="biometric-header">
        <div>
          <span className="biometric-eyebrow">Control biométrico</span>
          <h3 id="biometric-title">
            <Fingerprint className="w-4 h-4" aria-hidden="true" />
            Huella dactilar
          </h3>
          <p>{activeTenant?.name || 'Gimnasio local'}</p>
        </div>
      </div>

      <div className="settings-module-grid">
        <SettingsModuleButton
          icon={Fingerprint}
          title="Ingreso por huella"
          detail="Registro por huella"
          meta={`Proveedor: ${biometricProvider}`}
          onClick={onOpenBiometricCheckin}
        />
        <SettingsModuleButton
          icon={Settings}
          title="Lector de huellas"
          detail="Proveedor y estado del dispositivo"
          meta={`Estado: ${deviceStatus}`}
          onClick={onOpenBiometricSettings}
        />
        <SettingsModuleButton
          icon={Users}
          title="Huellas de atletas"
          detail="Enrolar, verificar y revocar"
          meta={`${activeBiometricCount} huellas activas`}
          onClick={onOpenMembers}
        />
      </div>
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isBiometricCheckinModalOpen, setIsBiometricCheckinModalOpen] = useState(false);
  const [isBiometricSettingsModalOpen, setIsBiometricSettingsModalOpen] = useState(false);
  const [isGymIdentityModalOpen, setIsGymIdentityModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFeedback, setQuickFeedback] = useState(null);

  const {
    activeLicense,
    activeTenant,
    authLoading,
    biometricDeviceStatus,
    biometricProvider,
    cashFlow,
    checkinsToday,
    clearError,
    dataLoading,
    error,
    isRemoteEnabled,
    memberBiometrics,
    members,
    products,
    refreshWorkspace,
    session,
    signOut,
    workspaceLoaded,
    workspaceLoading,
  } = useContext(GymContext);

  useEffect(() => {
    if (activeTenant?.brand_color) {
      document.documentElement.style.setProperty('--app-primary', activeTenant.brand_color);
      document.documentElement.style.setProperty('--app-brand-primary', activeTenant.brand_color);
    } else {
      document.documentElement.style.removeProperty('--app-primary');
      document.documentElement.style.removeProperty('--app-brand-primary');
    }
  }, [activeTenant?.brand_color]);

  const cleanSearch = searchQuery.trim().toLowerCase();
  const tenantDisplayName = activeTenant?.name && activeTenant.name !== 'GYM-FLOW'
    ? activeTenant.name
    : 'Gimnasio local';
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

  const openGymIdentityModal = () => {
    setIsGymIdentityModalOpen(true);
  };

  const openMembersModule = () => {
    setActiveTab('members');
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

  return (
    <div data-theme="office" className="app-shell">
      <a href="#main-content" className="app-skip-link">Saltar al contenido</a>

      {/* HEADER */}
      <header className="app-header">
        <div className="app-brand">
          {activeTenant?.logo_url ? (
            <img src={activeTenant.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-slate-800/50 p-1" />
          ) : (
            <Dumbbell className="app-brand__icon" aria-hidden="true" />
          )}
          <div className="app-brand__copy">
            <span className="app-brand__product">Syncro-Gym</span>
            <strong className="app-brand__tenant">
              {tenantDisplayName}
            </strong>
          </div>
        </div>

        <div className="app-header-actions">
          <button
            type="button"
            onClick={signOut}
            className="h-9 px-4 bg-rose-600 hover:bg-rose-500 text-white transition-all flex items-center gap-2 text-xs font-black rounded-xl shadow-lg shadow-rose-600/20 active:scale-95"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddMemberModalOpen(true)}
            className="app-primary-action h-9 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-2 text-xs font-black shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>Inscribir</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main id="main-content" className="app-main">
        {error && (
          <div className="bg-rose-950/40 border border-rose-500/20 text-rose-200 rounded-xl p-3 flex items-start justify-between gap-3 text-[10px] font-bold">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="app-icon-button text-rose-300 hover:text-white" aria-label="Cerrar error">
              <X className="w-4 h-4" aria-hidden="true" />
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

        <section className="app-search space-y-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={ATHLETE_COPY.searchPlaceholder}
              className="w-full h-11 pl-10 pr-10 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="app-icon-button app-search-clear absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                aria-label="Limpiar busqueda"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {cleanSearch && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-800/60 shadow-2xl animate-fadeIn">
              {searchResults.length === 0 ? (
                <p className="p-3 text-[10px] text-slate-500 text-center">{ATHLETE_COPY.searchEmpty}</p>
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
        {activeTab === 'biometrics' && (
          <BiometricView
            activeTenant={activeTenant}
            biometricDeviceStatus={biometricDeviceStatus}
            biometricProvider={biometricProvider}
            memberBiometrics={memberBiometrics}
            onOpenBiometricCheckin={() => setIsBiometricCheckinModalOpen(true)}
            onOpenBiometricSettings={() => setIsBiometricSettingsModalOpen(true)}
            onOpenMembers={openMembersModule}
          />
        )}
        {activeTab === 'plans' && (
          <MembershipPlans />
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
        {activeTab === 'accounting' && (
          <Accounting />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            activeTenant={activeTenant}
            isRemoteEnabled={isRemoteEnabled}
            onOpenGymIdentity={openGymIdentityModal}
            onSignOut={signOut}
          />
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="app-nav" aria-label="Menu principal">
        {MAIN_NAV_ITEMS.map(({ icon: Icon, key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            aria-current={activeTab === key ? 'page' : undefined}
            className={`app-nav__item flex flex-col items-center gap-1 py-1.5 transition-all ${activeTab === key ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className="app-nav__label">{label}</span>
          </button>
        ))}
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

      {isBiometricCheckinModalOpen && (
        <BiometricCheckinModal
          onCheckinFeedback={handleCheckinFeedback}
          onOpenSettings={() => {
            setIsBiometricCheckinModalOpen(false);
            setIsBiometricSettingsModalOpen(true);
          }}
          onClose={() => setIsBiometricCheckinModalOpen(false)}
        />
      )}

      {isBiometricSettingsModalOpen && (
        <BiometricSettingsModal
          onClose={() => setIsBiometricSettingsModalOpen(false)}
        />
      )}

      {/* Tenant identity edits are presentation/contact-only. The modal never mutates slug, license or membership state. */}
      {isGymIdentityModalOpen && (
        <GymIdentityModal
          onClose={() => setIsGymIdentityModalOpen(false)}
        />
      )}

    </div>
  );
}

export default App;
