import { useContext, useMemo, useState } from 'react';
import { Building2, Dumbbell, Loader2, Lock, Mail } from 'lucide-react';
import { GymContext } from '../context/GymContext';

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function AuthGate() {
  const {
    createTenant,
    error,
    session,
    signIn,
    signOut,
    signUp,
    workspaceLoading,
  } = useContext(GymContext);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gymName, setGymName] = useState('');
  const [slug, setSlug] = useState('');
  const [licenseType, setLicenseType] = useState('annual');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const computedSlug = useMemo(() => slug || slugify(gymName), [gymName, slug]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const result = mode === 'signin'
      ? await signIn({ email, password })
      : await signUp({ email, password });

    if (!result.error && result.needsConfirmation) {
      setNotice('Revisa tu correo para confirmar la cuenta antes de ingresar.');
    }
    setBusy(false);
  };

  const handleCreateTenant = async (event) => {
    event.preventDefault();
    setBusy(true);
    const created = await createTenant({
      name: gymName.trim(),
      slug: computedSlug,
      licenseType,
    });
    if (!created) setBusy(false);
  };

  if (session) {
    return (
      <div data-theme="office" className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </span>
              <div>
                <p className="text-xs font-black text-white">Configurar gimnasio</p>
                <p className="text-[10px] text-slate-500 truncate max-w-[190px]">{session.user.email}</p>
              </div>
            </div>
            <button onClick={signOut} className="text-[10px] font-bold text-slate-400 hover:text-white">
              Salir
            </button>
          </div>

          <form onSubmit={handleCreateTenant} className="p-5 space-y-4">
            {workspaceLoading ? (
              <div className="py-8 flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                <p className="text-xs font-bold">Cargando cuenta…</p>
              </div>
            ) : (
              <>
                {error && (
                  <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-300">
                    {error}
                  </p>
                )}
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Nombre del gimnasio</label>
                  <input
                    value={gymName}
                    onChange={event => setGymName(event.target.value)}
                    required
                    minLength={2}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Ej. Titanes Gym"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Identificador</label>
                  <input
                    value={computedSlug}
                    onChange={event => setSlug(slugify(event.target.value))}
                    required
                    minLength={3}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="titanes-gym"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Licencia</label>
                  <select
                    value={licenseType}
                    onChange={event => setLicenseType(event.target.value)}
                    className="w-full h-11 px-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
                  >
                    <option value="annual">Suscripción anual</option>
                    <option value="one_time">Pago único</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={busy || !computedSlug}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-lg text-xs shadow-lg shadow-indigo-600/10 active:scale-95 transition-all"
                >
                  {busy ? 'Creando…' : 'Crear cuenta'}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="office" className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Dumbbell className="w-5 h-5 text-white" />
          </span>
          <div>
            <p className="text-sm font-black text-white">Syncro-Gym</p>
            <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Acceso seguro</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-2 bg-slate-950/60">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`h-9 rounded-lg text-[10px] font-black transition-all ${mode === 'signin' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-200'}`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`h-9 rounded-lg text-[10px] font-black transition-all ${mode === 'signup' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-200'}`}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleAuth} className="p-5 space-y-4">
          {(error || notice) && (
            <p className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${
              error
                ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            }`}>
              {error || notice}
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Correo</span>
            <span className="relative block">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                type="email"
                required
                className="w-full h-11 pl-10 pr-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="admin@gimnasio.com"
              />
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Contraseña</span>
            <span className="relative block">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type="password"
                required
                minLength={6}
                className="w-full h-11 pl-10 pr-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Minimo 6 caracteres"
              />
            </span>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-lg text-xs shadow-lg shadow-indigo-600/10 active:scale-95 transition-all"
          >
            {busy ? 'Procesando…' : mode === 'signin' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthGate;
