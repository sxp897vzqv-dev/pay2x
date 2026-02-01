import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

/**
 * Toast Notification System
 * Production-grade with auto-dismiss and stacking
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  
  const addToast = useCallback((toast) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = {
      id,
      duration: 3000,
      ...toast,
    };
    
    setToasts((prev) => [...prev, newToast]);
    
    // Auto-dismiss
    if (newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }
    
    return id;
  }, []);
  
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);
  
  // Convenience methods
  const toast = {
    success: (message, options = {}) => addToast({ type: 'success', message, ...options }),
    error: (message, options = {}) => addToast({ type: 'error', message, ...options }),
    warning: (message, options = {}) => addToast({ type: 'warning', message, ...options }),
    info: (message, options = {}) => addToast({ type: 'info', message, ...options }),
  };
  
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onRemove }) => {
  return (
    <div 
      className="fixed top-4 right-4 z-[200] flex flex-col gap-3 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <Toast 
          key={toast.id} 
          toast={toast} 
          onClose={() => onRemove(toast.id)} 
        />
      ))}
    </div>
  );
};

const Toast = ({ toast, onClose }) => {
  const { type, message, title } = toast;
  
  const config = {
    success: {
      icon: CheckCircle,
      className: 'bg-green-50 border-green-200 text-green-900',
      iconColor: 'text-green-600',
    },
    error: {
      icon: AlertCircle,
      className: 'bg-red-50 border-red-200 text-red-900',
      iconColor: 'text-red-600',
    },
    warning: {
      icon: AlertTriangle,
      className: 'bg-amber-50 border-amber-200 text-amber-900',
      iconColor: 'text-amber-600',
    },
    info: {
      icon: Info,
      className: 'bg-blue-50 border-blue-200 text-blue-900',
      iconColor: 'text-blue-600',
    },
  };
  
  const { icon: Icon, className, iconColor } = config[type] || config.info;
  
  return (
    <div 
      className={`
        pointer-events-auto
        flex items-start gap-3 p-4
        rounded-xl border-2 shadow-lg
        backdrop-blur-sm
        animate-slide-in-right
        ${className}
      `}
      role="alert"
    >
      <Icon className={`w-5 h-5 flex-shrink-0 ${iconColor}`} />
      
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold text-sm sm:text-base mb-1">
            {title}
          </p>
        )}
        <p className="text-sm">
          {message}
        </p>
      </div>
      
      <button
        onClick={onClose}
        className="p-1 hover:bg-black/5 rounded transition-colors flex-shrink-0"
        aria-label="Close notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// Add animation to global CSS
const toastAnimations = `
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
`;

export default ToastProvider;