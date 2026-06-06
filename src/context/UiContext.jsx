/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

const UiContext = createContext(null);

const TOAST_TTL_MS = 4200;
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getToastIcon(tone) {
  if (tone === 'success') return CheckCircle;
  if (tone === 'danger' || tone === 'warning') return AlertTriangle;
  return Info;
}

function ConfirmDialog({ state, onResolve }) {
  const confirmButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!state) return undefined;
    const previousActiveElement = document.activeElement;
    confirmButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onResolve(false);
        return;
      }

      if (event.key !== 'Tab') return;

      // Confirmation modals are blocking decisions; keep keyboard focus inside
      // the dialog until the user confirms, cancels or presses Escape.
      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (typeof previousActiveElement?.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [onResolve, state]);

  if (!state) return null;

  const toneClass = state.tone === 'danger'
    ? 'app-confirm-dialog--danger'
    : 'app-confirm-dialog--default';
  const confirmClass = state.tone === 'danger'
    ? 'app-button app-button--danger'
    : 'app-button app-button--primary';

  return (
    <div
      data-theme="office"
      className="app-modal-overlay app-confirm-dialog__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(false);
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className={`app-modal-card app-confirm-dialog ${toneClass}`}
      >
        <div className="app-confirm-dialog__icon" aria-hidden="true">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="app-confirm-dialog__content">
          <h2 id={titleId}>{state.title}</h2>
          <p id={messageId}>{state.message}</p>
        </div>
        <div className="app-confirm-dialog__actions">
          <button type="button" className="app-button app-button--secondary" onClick={() => onResolve(false)}>
            {state.cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmButtonRef}
            className={confirmClass}
            onClick={() => onResolve(true)}
          >
            {state.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div data-theme="office" className="app-toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const ToastIcon = getToastIcon(toast.tone);
        return (
          <article key={toast.id} role="status" className={`app-toast app-toast--${toast.tone || 'info'}`}>
            <ToastIcon className="app-toast__icon" aria-hidden="true" />
            <div className="app-toast__body">
              <strong>{toast.title}</strong>
              {toast.message && <span>{toast.message}</span>}
            </div>
            <button
              type="button"
              className="app-toast__close"
              aria-label="Cerrar notificación"
              onClick={() => onDismiss(toast.id)}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function UiProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const confirmResolverRef = useRef(null);

  const dismissToast = useCallback((toastId) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const notify = useCallback(({ title, message = '', tone = 'info' }) => {
    const toastId = globalThis.crypto?.randomUUID?.() || `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((currentToasts) => [
      ...currentToasts,
      { id: toastId, title, message, tone },
    ]);
    window.setTimeout(() => dismissToast(toastId), TOAST_TTL_MS);
    return toastId;
  }, [dismissToast]);

  const confirm = useCallback((options) => new Promise((resolve) => {
    confirmResolverRef.current?.(false);
    confirmResolverRef.current = resolve;
    setConfirmState({
      title: 'Confirmar acción',
      message: '',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      tone: 'danger',
      ...options,
    });
  }), []);

  const resolveConfirm = useCallback((confirmed) => {
    confirmResolverRef.current?.(confirmed);
    confirmResolverRef.current = null;
    setConfirmState(null);
  }, []);

  const value = useMemo(() => ({
    confirm,
    notify,
  }), [confirm, notify]);

  return (
    <UiContext.Provider value={value}>
      {children}
      <ConfirmDialog state={confirmState} onResolve={resolveConfirm} />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </UiContext.Provider>
  );
}

export function useUi() {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used within UiProvider');
  return value;
}
