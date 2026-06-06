import { useContext, useEffect, useId, useRef } from 'react';
import { CheckCircle, Fingerprint, RadioTower, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { getBiometricProviders } from '../lib/biometrics/biometricRegistry';

function BiometricSettingsModal({ onClose }) {
  const {
    biometricDeviceStatus,
    biometricProvider,
    refreshBiometricDeviceStatus,
    setBiometricProvider,
  } = useContext(GymContext);
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const providers = getBiometricProviders();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    void refreshBiometricDeviceStatus();
  }, [biometricProvider, refreshBiometricDeviceStatus]);

  return (
    <div className="app-modal-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="app-modal-card app-biometric-modal"
      >
        <div className="app-biometric-header">
          <div className="app-biometric-title">
            <span className="app-biometric-icon" aria-hidden="true">
              <Fingerprint className="w-4 h-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId}>Lector de huellas</h2>
              <p>Proveedor activo y estado del dispositivo.</p>
            </div>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="app-icon-button"
            aria-label="Cerrar configuración biométrica"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="app-biometric-body">
          <div className="app-biometric-status">
            <RadioTower className="w-4 h-4" aria-hidden="true" />
            <div>
              <strong>{biometricDeviceStatus?.available ? 'Lector disponible' : 'Lector pendiente'}</strong>
              <span>{biometricDeviceStatus?.message || 'Validando dispositivo.'}</span>
            </div>
          </div>

          <div className="app-biometric-provider-list" role="radiogroup" aria-label="Proveedor biométrico">
            {providers.map(provider => {
              const selected = biometricProvider === provider.id;

              return (
                <button
                  key={provider.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setBiometricProvider(provider.id)}
                  className={`app-biometric-provider ${selected ? 'app-biometric-provider--selected' : ''}`}
                >
                  <span className="app-biometric-provider__check" aria-hidden="true">
                    {selected && <CheckCircle className="w-4 h-4" aria-hidden="true" />}
                  </span>
                  <span className="app-biometric-provider__content">
                    <strong>{provider.name}</strong>
                    <span>{provider.hardware}</span>
                    <small>{provider.platform}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={refreshBiometricDeviceStatus}
            className="app-button app-button--secondary app-biometric-test"
          >
            Probar lector
          </button>
        </div>
      </section>
    </div>
  );
}

export default BiometricSettingsModal;
