import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type = 'info', message, duration = 4000 }) => {
      const id = Date.now() + Math.random().toString(36).substring(2, 6);
      setToasts(prev => [...prev, { id, type, message }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
      return id;
    },
    [removeToast],
  );

  const toast = {
    success: (message, duration) => showToast({ type: 'success', message, duration }),
    error: (message, duration) => showToast({ type: 'error', message, duration }),
    info: (message, duration) => showToast({ type: 'info', message, duration }),
  };

  return (
    <ToastContext.Provider value={{ showToast, removeToast, toast }}>
      {children}
      {/* Toast Presentation Container */}
      <div
        aria-live="polite"
        role="status"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 1100,
          pointerEvents: 'none',
          maxWidth: '380px',
          width: 'calc(100% - 40px)',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              animation: 'toastIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {t.type === 'success' && (
                <CheckCircle
                  size={18}
                  style={{ color: 'var(--accent-success)', flexShrink: 0 }}
                  aria-hidden="true"
                />
              )}
              {t.type === 'error' && (
                <AlertCircle
                  size={18}
                  style={{ color: 'var(--accent-danger)', flexShrink: 0 }}
                  aria-hidden="true"
                />
              )}
              {t.type === 'info' && (
                <Info
                  size={18}
                  style={{ color: 'var(--accent-primary)', flexShrink: 0 }}
                  aria-hidden="true"
                />
              )}
              <span style={{ fontWeight: 500, lineHeight: 1.4 }}>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              style={{
                color: 'var(--text-muted)',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  const fallback = {
    showToast: () => {},
    removeToast: () => {},
    success: () => {},
    error: () => {},
    info: () => {},
  };
  if (!context) {
    fallback.toast = fallback;
    return fallback;
  }
  return {
    ...context.toast,
    toast: context.toast,
    showToast: context.showToast,
    removeToast: context.removeToast,
  };
}
