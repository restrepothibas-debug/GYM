import { useContext, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle, Fingerprint, Loader2, Search, Settings, X } from 'lucide-react';
import { GymContext } from '../context/GymContext';
import { useUi } from '../context/UiContext';
import { getTodayDateString } from '../lib/dateUtils';

function BiometricCheckinModal({ onCheckinFeedback, onClose, onOpenSettings }) {
  const {
    addCheckin,
    biometricProvider,
    checkinsToday,
    identifyMemberByBiometric,
  } = useContext(GymContext);
  const { notify } = useUi();
  const [scanState, setScanState] = useState('idle');
  const [matchedMember, setMatchedMember] = useState(null);
  const [error, setError] = useState('');
  const titleId = useId();
  const scanButtonRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    scanButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const scanFingerprint = async () => {
    setScanState('scanning');
    setMatchedMember(null);
    setError('');

    const result = await identifyMemberByBiometric();
    if (!result.ok) {
      setScanState('error');
      setError(result.error || 'No se encontro un socio con esa huella.');
      return;
    }

    setMatchedMember(result.member);
    setScanState('matched');
  };

  const registerCheckin = async () => {
    if (!matchedMember) return;
    const today = getTodayDateString();
    const alreadyCheckedIn = checkinsToday.some(checkin => (
      checkin.memberId === matchedMember.id && checkin.date === today
    ));

    if (alreadyCheckedIn) {
      notify({
        title: 'Asistencia existente',
        message: `${matchedMember.name} ya registró entrada hoy.`,
        tone: 'info',
      });
      onClose();
      return;
    }

    const saved = await addCheckin(matchedMember.id);
    if (saved) {
      notify({
        title: 'Entrada registrada',
        message: `${matchedMember.name} ingresó por huella.`,
        tone: 'success',
      });
      onCheckinFeedback?.(matchedMember);
      onClose();
    }
  };

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
              <h2 id={titleId}>Ingreso por huella</h2>
              <p>Proveedor activo: {biometricProvider}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-icon-button"
            aria-label="Cerrar ingreso por huella"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="app-biometric-body">
          <div className={`app-biometric-scan app-biometric-scan--${scanState}`}>
            {scanState === 'scanning' ? (
              <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
            ) : scanState === 'matched' ? (
              <CheckCircle className="w-8 h-8" aria-hidden="true" />
            ) : (
              <Fingerprint className="w-8 h-8" aria-hidden="true" />
            )}
          </div>

          {error && (
            <p role="alert" className="app-biometric-error">
              {error}
            </p>
          )}

          {matchedMember && (
            <div className="app-biometric-match">
              <strong>{matchedMember.name}</strong>
              <span>C.C. {matchedMember.doc}</span>
            </div>
          )}

          <div className="app-biometric-actions">
            <button
              type="button"
              onClick={onOpenSettings}
              className="app-button app-button--secondary"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Configurar
            </button>
            <button
              type="button"
              ref={scanButtonRef}
              onClick={scanFingerprint}
              disabled={scanState === 'scanning'}
              className="app-button app-button--secondary"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              {scanState === 'scanning' ? 'Leyendo' : 'Escanear'}
            </button>
            <button
              type="button"
              onClick={registerCheckin}
              disabled={!matchedMember}
              className="app-primary-action app-biometric-submit"
            >
              Registrar entrada
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default BiometricCheckinModal;
