import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Palette, Plus, Save, Settings, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';
import { formatCurrency } from '../lib/accounting';
import { DEFAULT_MEMBERSHIP_PLANS, getActiveMembershipPlans, sortMembershipPlans } from '../lib/membershipPlans';

function getIdentityState(activeTenant) {
  return {
    name: activeTenant?.name || '',
    legal_name: activeTenant?.legal_name || '',
    tax_id: activeTenant?.tax_id || '',
    phone: activeTenant?.phone || '',
    email: activeTenant?.email || '',
    address: activeTenant?.address || '',
    city: activeTenant?.city || '',
    logo_url: activeTenant?.logo_url || '',
    brand_color: activeTenant?.brand_color || '',
    receipt_footer: activeTenant?.receipt_footer || '',
  };
}

function getPlanDraft(plan = {}) {
  return {
    id: plan.id || '',
    planKey: plan.planKey || '',
    name: plan.name || '',
    durationDays: String(plan.durationDays ?? 30),
    price: String(plan.price ?? 0),
    active: plan.active !== false,
    sortOrder: String(plan.sortOrder ?? 100),
  };
}

function canManageTenantConfiguration(activeTenant) {
  // Local/demo mode has no tenant role. Remote mode relies on RLS/RPC too, but
  // this UI guard prevents staff users from seeing write actions they cannot use.
  return !activeTenant?.role || ['owner', 'admin'].includes(activeTenant.role);
}

function GymIdentityModal({ onClose }) {
  const {
    activeTenant,
    deactivateMembershipPlan,
    membershipPlans,
    saveMembershipPlan,
    tenantIdentitySchemaReady,
    updateTenantIdentity,
  } = useContext(GymContext);
  const { notify } = useUi();
  /*
   * Initialize once from the active tenant. GymContext remains the source of
   * truth; closing and reopening rehydrates fresh tenant data instead of this
   * form overwriting fields while an admin is editing.
   */
  const [formState, setFormState] = useState(() => getIdentityState(activeTenant));
  const [planDraft, setPlanDraft] = useState(() => getPlanDraft());
  const [editingPlanId, setEditingPlanId] = useState('');
  const [error, setError] = useState('');
  const [planError, setPlanError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const firstInputRef = useRef(null);
  const modalTitleId = useId();
  const nameInputId = useId();
  const legalNameInputId = useId();
  const taxIdInputId = useId();
  const phoneInputId = useId();
  const emailInputId = useId();
  const cityInputId = useId();
  const addressInputId = useId();
  const logoInputId = useId();
  const colorInputId = useId();
  const receiptFooterInputId = useId();
  const planNameInputId = useId();
  const planKeyInputId = useId();
  const planDurationInputId = useId();
  const planPriceInputId = useId();
  const canManagePlans = canManageTenantConfiguration(activeTenant);
  const visiblePlans = useMemo(() => (
    sortMembershipPlans(membershipPlans.length ? membershipPlans : DEFAULT_MEMBERSHIP_PLANS)
  ), [membershipPlans]);
  const activePlanCount = useMemo(() => (
    getActiveMembershipPlans(visiblePlans).length
  ), [visiblePlans]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);

    // Desktop/tablet admins expect immediate keyboard editing. Mobile avoids
    // opening the virtual keyboard as soon as the modal mounts.
    if (window.matchMedia?.('(min-width: 48rem)').matches) {
      firstInputRef.current?.focus();
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const updateField = (field) => (event) => {
    setError('');
    setFormState(currentState => ({
      ...currentState,
      [field]: event.target.value,
    }));
  };

  const handleClearColor = () => {
    setError('');
    setFormState(currentState => ({
      ...currentState,
      brand_color: '',
    }));
  };

  const updatePlanField = (field) => (event) => {
    setPlanError('');
    setPlanDraft(currentDraft => ({
      ...currentDraft,
      [field]: field === 'active' ? event.target.checked : event.target.value,
    }));
  };

  const handleEditPlan = (plan) => {
    setPlanError('');
    setEditingPlanId(plan.id || plan.planKey);
    setPlanDraft(getPlanDraft(plan));
  };

  const handleResetPlanDraft = () => {
    setPlanError('');
    setEditingPlanId('');
    setPlanDraft(getPlanDraft());
  };

  const handleSavePlan = async () => {
    const durationDays = Number(planDraft.durationDays);
    const price = Number(planDraft.price);
    const sortOrder = Number(planDraft.sortOrder || 100);

    if (!canManagePlans) {
      setPlanError('Solo administradores del gimnasio pueden editar planes.');
      return;
    }

    if (!planDraft.name.trim() || !durationDays || durationDays <= 0 || price < 0) {
      setPlanError('El plan necesita nombre, dias positivos y precio valido.');
      return;
    }

    setSavingPlan(true);

    /*
     * Membership plans are tenant operational configuration. The UI keeps this
     * edit separated from identity fields, while GymContext/Supabase enforce the
     * same plan catalog used by enrollment and renewal RPCs.
     */
    const saved = await Promise.resolve(saveMembershipPlan({
      id: planDraft.id || '',
      planKey: planDraft.planKey,
      name: planDraft.name,
      durationDays,
      price,
      active: planDraft.active,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
    }));

    setSavingPlan(false);

    if (!saved) {
      setPlanError('No se pudo guardar el plan de membresia.');
      return;
    }

    notify({
      title: 'Plan guardado',
      message: 'El catalogo de membresias quedo actualizado.',
      tone: 'success',
    });
    handleResetPlanDraft();
  };

  const handleDeactivatePlan = async (plan) => {
    if (!canManagePlans) {
      setPlanError('Solo administradores del gimnasio pueden desactivar planes.');
      return;
    }

    const deactivated = await Promise.resolve(deactivateMembershipPlan(plan.id || plan.planKey));
    if (!deactivated) {
      setPlanError('No se pudo desactivar el plan.');
      return;
    }

    notify({
      title: 'Plan desactivado',
      message: `${plan.name} ya no aparece como opcion activa.`,
      tone: 'success',
    });
    if (editingPlanId === (plan.id || plan.planKey)) handleResetPlanDraft();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = formState.name.trim();
    const trimmedColor = formState.brand_color.trim();
    const trimmedEmail = formState.email.trim();

    if (!trimmedName) {
      setError('El nombre del gimnasio es obligatorio.');
      return;
    }

    if (trimmedColor && !/^#[0-9a-fA-F]{6}$/.test(trimmedColor)) {
      setError('El color debe tener formato hexadecimal completo. Ejemplo: #2563EB.');
      return;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('El correo de contacto no tiene un formato válido.');
      return;
    }

    setSaving(true);

    /*
     * This modal edits tenant identity only. Slug, membership role, license and
     * activeTenantId remain controlled by GymContext so a branding change cannot
     * alter routing, permissions or billing state.
     */
    const saved = await updateTenantIdentity({
      ...formState,
      name: trimmedName,
      brand_color: trimmedColor,
      email: trimmedEmail,
    });

    if (saved) {
      notify({
        title: 'Identidad actualizada',
        message: 'La información del gimnasio quedó guardada.',
        tone: 'success',
      });
      onClose();
      return;
    }

    setSaving(false);
    setError('No se pudo guardar la identidad del gimnasio.');
  };

  const displayName = formState.name.trim() || 'Nombre del gimnasio';
  const displayLocation = [formState.city, formState.address]
    .map(value => value.trim())
    .filter(Boolean)
    .join(' · ');
  const extendedFieldsDisabled = !tenantIdentitySchemaReady;

  return (
    <div className="app-modal-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        className="app-modal-card app-identity-modal"
      >
        <div className="app-identity-header">
          <div className="app-identity-title">
            <span className="app-identity-icon" aria-hidden="true">
              <Building2 className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id={modalTitleId}>Identidad del gimnasio</h2>
              <p>Perfil público, recibos y comunicación operativa.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-icon-button"
            aria-label="Cerrar identidad del gimnasio"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form className="app-identity-form" onSubmit={handleSubmit}>
          <div className="app-identity-scroll">
            {error && (
              <p role="alert" className="app-identity-error">
                {error}
              </p>
            )}
            {extendedFieldsDisabled && (
              <p role="status" className="app-identity-error">
                La app cargo con identidad basica porque la migracion de campos de contacto no esta aplicada en Supabase. Puedes editar el nombre comercial; contacto, logo y recibos se habilitan al aplicar la migracion.
              </p>
            )}

            <div className="app-identity-preview" aria-label="Vista previa de identidad">
              {formState.logo_url.trim() ? (
                <img
                  src={formState.logo_url.trim()}
                  alt=""
                  className="app-identity-logo"
                  loading="lazy"
                />
              ) : (
                <span className="app-identity-logo app-identity-logo--placeholder" aria-hidden="true">
                  <Building2 className="w-5 h-5" aria-hidden="true" />
                </span>
              )}
              <div className="app-identity-summary">
                <strong>{displayName}</strong>
                <span>{formState.phone.trim() || formState.email.trim() || 'Sin contacto configurado'}</span>
                {displayLocation && <small>{displayLocation}</small>}
              </div>
            </div>

            <div className="app-identity-grid">
            <div className="app-identity-field">
              <label className="app-identity-label" htmlFor={nameInputId}>Nombre comercial *</label>
              <input
                id={nameInputId}
                ref={firstInputRef}
                type="text"
                required
                autoComplete="organization"
                value={formState.name}
                onChange={updateField('name')}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field">
              <label className="app-identity-label" htmlFor={legalNameInputId}>Razón social</label>
              <input
                id={legalNameInputId}
                type="text"
                autoComplete="organization"
                value={formState.legal_name}
                onChange={updateField('legal_name')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field">
              <label className="app-identity-label" htmlFor={taxIdInputId}>NIT / Identificación fiscal</label>
              <input
                id={taxIdInputId}
                type="text"
                autoComplete="off"
                value={formState.tax_id}
                onChange={updateField('tax_id')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field">
              <label className="app-identity-label" htmlFor={phoneInputId}>Teléfono / WhatsApp</label>
              <input
                id={phoneInputId}
                type="tel"
                autoComplete="tel"
                value={formState.phone}
                onChange={updateField('phone')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field">
              <label className="app-identity-label" htmlFor={emailInputId}>Correo de contacto</label>
              <input
                id={emailInputId}
                type="email"
                autoComplete="email"
                value={formState.email}
                onChange={updateField('email')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field">
              <label className="app-identity-label" htmlFor={cityInputId}>Ciudad</label>
              <input
                id={cityInputId}
                type="text"
                autoComplete="address-level2"
                value={formState.city}
                onChange={updateField('city')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field app-identity-field--full">
              <label className="app-identity-label" htmlFor={addressInputId}>Dirección</label>
              <input
                id={addressInputId}
                type="text"
                autoComplete="street-address"
                value={formState.address}
                onChange={updateField('address')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field app-identity-field--full">
              <label className="app-identity-label" htmlFor={logoInputId}>URL del logo</label>
              {/* Logo uploads need Supabase Storage policies. Until that exists, store only a URL on the tenant row. */}
              <input
                id={logoInputId}
                type="url"
                autoComplete="off"
                value={formState.logo_url}
                onChange={updateField('logo_url')}
                disabled={extendedFieldsDisabled}
                className="app-identity-input"
              />
            </div>

            <div className="app-identity-field app-identity-color-field">
              <label className="app-identity-label" htmlFor={colorInputId}>
                <Palette className="w-3.5 h-3.5" aria-hidden="true" />
                Color de marca
              </label>
              <div className="app-identity-color-row">
                <input
                  id={colorInputId}
                  type="color"
                  value={formState.brand_color || '#2563eb'}
                  onChange={updateField('brand_color')}
                  disabled={extendedFieldsDisabled}
                  className="app-identity-color-input"
                />
                <button
                  type="button"
                  onClick={handleClearColor}
                  disabled={extendedFieldsDisabled || !formState.brand_color}
                  className="app-button app-button--secondary app-identity-clear-color"
                >
                  Sin color
                </button>
              </div>
            </div>

            <div className="app-identity-field app-identity-field--full">
              <label className="app-identity-label" htmlFor={receiptFooterInputId}>Pie de recibo</label>
              <textarea
                id={receiptFooterInputId}
                rows="3"
                value={formState.receipt_footer}
                onChange={updateField('receipt_footer')}
                disabled={extendedFieldsDisabled}
                className="app-identity-textarea"
              />
            </div>
            </div>

            <section
              className="app-plan-config"
              aria-label="Configuracion de planes de membresia"
              onKeyDown={(event) => {
                /*
                 * Plan inputs live inside the identity modal's scroll area. Stop
                 * Enter from submitting tenant identity while an admin is editing
                 * catalog data; plan saves must go through handleSavePlan only.
                 */
                if (event.key === 'Enter') event.preventDefault();
              }}
            >
              <div className="app-plan-config__header">
                <div>
                  <h3>
                    <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                    Planes de membresia
                  </h3>
                  <p>{activePlanCount} planes activos para inscripcion y renovacion.</p>
                </div>
                {!canManagePlans && (
                  <span className="app-plan-config__role">Solo lectura</span>
                )}
              </div>

              {planError && (
                <p role="alert" className="app-identity-error">
                  {planError}
                </p>
              )}

              <div className="app-plan-list">
                {visiblePlans.map(plan => (
                  <article
                    key={plan.id || plan.planKey}
                    className={`app-plan-card ${plan.active === false ? 'app-plan-card--inactive' : ''}`}
                  >
                    <div className="app-plan-card__main">
                      <strong>{plan.name}</strong>
                      <span>{plan.planKey} · {plan.durationDays} dias</span>
                    </div>
                    <div className="app-plan-card__price">
                      <strong>{formatCurrency(plan.price)}</strong>
                      <span>{plan.active === false ? 'Inactivo' : 'Activo'}</span>
                    </div>
                    {canManagePlans && (
                      <div className="app-plan-card__actions">
                        <button
                          type="button"
                          onClick={() => handleEditPlan(plan)}
                          className="app-button app-button--secondary"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivatePlan(plan)}
                          disabled={plan.active === false}
                          className="app-button app-button--secondary"
                        >
                          Desactivar
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>

              <div className="app-plan-editor">
                <div className="app-identity-field">
                  <label className="app-identity-label" htmlFor={planNameInputId}>Nombre del plan</label>
                  <input
                    id={planNameInputId}
                    type="text"
                    value={planDraft.name}
                    onChange={updatePlanField('name')}
                    disabled={!canManagePlans}
                    className="app-identity-input"
                  />
                </div>
                <div className="app-identity-field">
                  <label className="app-identity-label" htmlFor={planKeyInputId}>Clave interna</label>
                  <input
                    id={planKeyInputId}
                    type="text"
                    value={planDraft.planKey}
                    onChange={updatePlanField('planKey')}
                    disabled={!canManagePlans || Boolean(planDraft.id || editingPlanId)}
                    className="app-identity-input"
                  />
                </div>
                <div className="app-identity-field">
                  <label className="app-identity-label" htmlFor={planDurationInputId}>Dias</label>
                  <input
                    id={planDurationInputId}
                    type="number"
                    min="1"
                    value={planDraft.durationDays}
                    onChange={updatePlanField('durationDays')}
                    disabled={!canManagePlans}
                    className="app-identity-input"
                  />
                </div>
                <div className="app-identity-field">
                  <label className="app-identity-label" htmlFor={planPriceInputId}>Precio</label>
                  <input
                    id={planPriceInputId}
                    type="number"
                    min="0"
                    value={planDraft.price}
                    onChange={updatePlanField('price')}
                    disabled={!canManagePlans}
                    className="app-identity-input"
                  />
                </div>
                <label className="app-plan-editor__active">
                  <input
                    type="checkbox"
                    checked={planDraft.active}
                    onChange={updatePlanField('active')}
                    disabled={!canManagePlans}
                  />
                  <span>Disponible para ventas</span>
                </label>
                <div className="app-plan-editor__actions">
                  <button
                    type="button"
                    onClick={handleResetPlanDraft}
                    className="app-button app-button--secondary"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePlan}
                    disabled={!canManagePlans || savingPlan}
                    className="app-primary-action app-plan-editor__save"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    {savingPlan ? 'Guardando' : editingPlanId ? 'Actualizar plan' : 'Agregar plan'}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="app-identity-actions">
            <button
              type="button"
              onClick={onClose}
              className="app-button app-button--secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="app-primary-action app-identity-save"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              {saving ? 'Guardando' : 'Guardar identidad'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default GymIdentityModal;
