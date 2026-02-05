import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

/**
 * Toast notification component
 * @param {string} msg - Message to display
 * @param {boolean} success - Success or error state
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {function} onClose - Callback when toast closes
 * @param {number} duration - Auto-close duration in ms (default 3000)
 */
export default function Toast({ msg, success, type, onClose, duration = 3000 }) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  // Determine type from success prop if type not provided
  const toastType = type || (success ? 'success' : 'error');

  const styles = {
    success: { bg: 'bg-green-600', icon: CheckCircle },
    error: { bg: 'bg-red-600', icon: AlertTriangle },
    warning: { bg: 'bg-amber-500', icon: AlertCircle },
    info: { bg: 'bg-blue-600', icon: Info },
  };

  const { bg, icon: Icon } = styles[toastType] || styles.info;

  return (
    <div 
      className={`fixed left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 ${bg} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium animate-slide-in`}
      style={{ top: 60 }}
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="flex-1">{msg}</span>
    </div>
  );
}
