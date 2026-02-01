import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

/**
 * Production-Grade Modal Component
 * Bottom sheet on mobile, centered modal on desktop
 */
export const Modal = ({ 
  isOpen, 
  onClose, 
  children,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  className = '',
}) => {
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);
  
  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  const sizes = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
    full: 'sm:max-w-6xl',
  };
  
  return (
    <div 
      className="fixed inset-0 z-[100] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-navy-900/60 backdrop-blur-sm transition-opacity"
        onClick={closeOnOverlayClick ? onClose : undefined}
        aria-hidden="true"
      />
      
      {/* Modal Container */}
      <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div 
          className={`
            relative w-full bg-white
            rounded-t-3xl sm:rounded-2xl
            shadow-2xl
            max-h-[90vh] sm:max-h-[85vh]
            overflow-hidden
            transform transition-all
            ${sizes[size]}
            ${className}
          `}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="sticky top-0 z-10 bg-white px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {title && (
                    <h2 
                      id="modal-title"
                      className="text-lg sm:text-xl lg:text-2xl font-bold text-navy-900"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-sm sm:text-base text-slate-600 mt-1">
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="flex-shrink-0 p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] sm:max-h-[calc(85vh-100px)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ModalContent = ({ children, className = '' }) => (
  <div className={`px-4 sm:px-6 py-4 sm:py-6 ${className}`}>
    {children}
  </div>
);

export const ModalFooter = ({ children, className = '' }) => (
  <div className={`sticky bottom-0 bg-white px-4 sm:px-6 py-4 sm:py-5 border-t border-slate-200 flex flex-col sm:flex-row gap-3 ${className}`}>
    {children}
  </div>
);

// Confirmation Modal
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      title={title}
      size="sm"
    >
      <ModalContent>
        <p className="text-sm sm:text-base text-slate-700">
          {message}
        </p>
      </ModalContent>
      <ModalFooter>
        <Button
          variant="secondary"
          onClick={onClose}
          fullWidth
          disabled={loading}
        >
          {cancelText}
        </Button>
        <Button
          variant={variant}
          onClick={onConfirm}
          fullWidth
          loading={loading}
        >
          {confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default Modal;