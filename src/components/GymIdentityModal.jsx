import { useContext, useEffect, useId, useRef, useState } from 'react';
import { Building2, Palette, Save, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';

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

function GymIdentityModal({ onClose }) {
  const {
    activeTenant,
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
