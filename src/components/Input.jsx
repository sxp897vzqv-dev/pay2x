import React, { forwardRef } from 'react';
import { AlertCircle, Check } from 'lucide-react';

/**
 * Production-Grade Input Component
 * Accessible, mobile-friendly with validation states
 */
export const Input = forwardRef(({
  label,
  error,
  success,
  helperText,
  icon: Icon,
  iconPosition = 'left',
  type = 'text',
  disabled = false,
  required = false,
  fullWidth = false,
  className = '',
  ...props
}, ref) => {
  const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  const hasError = Boolean(error);
  const hasSuccess = Boolean(success);
  
  const inputClasses = `
    w-full px-3 sm:px-4 py-2.5 sm:py-3
    bg-white border-2 rounded-lg sm:rounded-xl
    font-sans text-sm sm:text-base
    transition-all duration-200
    placeholder:text-slate-400
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500
    ${Icon && iconPosition === 'left' ? 'pl-10 sm:pl-11' : ''}
    ${Icon && iconPosition === 'right' ? 'pr-10 sm:pr-11' : ''}
    ${hasError ? 
      'border-red-300 focus:border-red-500 focus:ring-red-500' : 
      hasSuccess ?
      'border-green-300 focus:border-green-500 focus:ring-green-500' :
      'border-slate-300 focus:border-green-500 focus:ring-green-500'
    }
    ${className}
  `;
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {/* Label */}
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm sm:text-base font-semibold text-navy-900 mb-2"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {/* Input Container */}
      <div className="relative">
        {/* Left Icon */}
        {Icon && iconPosition === 'left' && (
          <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          </div>
        )}
        
        {/* Input Field */}
        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={disabled}
          required={required}
          className={inputClasses}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${inputId}-error` :
            helperText ? `${inputId}-helper` :
            undefined
          }
          {...props}
        />
        
        {/* Right Icon or Status Icon */}
        {(Icon && iconPosition === 'right') || hasError || hasSuccess ? (
          <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            {hasError ? (
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
            ) : hasSuccess ? (
              <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
            ) : Icon && iconPosition === 'right' ? (
              <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
            ) : null}
          </div>
        ) : null}
      </div>
      
      {/* Error Message */}
      {hasError && (
        <p 
          id={`${inputId}-error`}
          className="mt-2 text-xs sm:text-sm text-red-600 flex items-center gap-1"
        >
          <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          {error}
        </p>
      )}
      
      {/* Success Message */}
      {hasSuccess && !hasError && (
        <p className="mt-2 text-xs sm:text-sm text-green-600 flex items-center gap-1">
          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          {success}
        </p>
      )}
      
      {/* Helper Text */}
      {helperText && !hasError && !hasSuccess && (
        <p 
          id={`${inputId}-helper`}
          className="mt-2 text-xs sm:text-sm text-slate-600"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

// Textarea variant
export const Textarea = forwardRef(({
  label,
  error,
  helperText,
  disabled = false,
  required = false,
  fullWidth = false,
  rows = 4,
  className = '',
  ...props
}, ref) => {
  const textareaId = props.id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = Boolean(error);
  
  const textareaClasses = `
    w-full px-3 sm:px-4 py-2.5 sm:py-3
    bg-white border-2 rounded-lg sm:rounded-xl
    font-sans text-sm sm:text-base
    transition-all duration-200
    placeholder:text-slate-400
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500
    resize-none
    ${hasError ? 
      'border-red-300 focus:border-red-500 focus:ring-red-500' : 
      'border-slate-300 focus:border-green-500 focus:ring-green-500'
    }
    ${className}
  `;
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label 
          htmlFor={textareaId}
          className="block text-sm sm:text-base font-semibold text-navy-900 mb-2"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        disabled={disabled}
        required={required}
        className={textareaClasses}
        aria-invalid={hasError}
        aria-describedby={
          hasError ? `${textareaId}-error` :
          helperText ? `${textareaId}-helper` :
          undefined
        }
        {...props}
      />
      
      {hasError && (
        <p 
          id={`${textareaId}-error`}
          className="mt-2 text-xs sm:text-sm text-red-600 flex items-center gap-1"
        >
          <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          {error}
        </p>
      )}
      
      {helperText && !hasError && (
        <p 
          id={`${textareaId}-helper`}
          className="mt-2 text-xs sm:text-sm text-slate-600"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

// Select variant
export const Select = forwardRef(({
  label,
  error,
  helperText,
  options = [],
  disabled = false,
  required = false,
  fullWidth = false,
  placeholder = 'Select an option',
  className = '',
  ...props
}, ref) => {
  const selectId = props.id || `select-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = Boolean(error);
  
  const selectClasses = `
    w-full px-3 sm:px-4 py-2.5 sm:py-3
    bg-white border-2 rounded-lg sm:rounded-xl
    font-sans text-sm sm:text-base
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-1
    disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500
    appearance-none
    ${hasError ? 
      'border-red-300 focus:border-red-500 focus:ring-red-500' : 
      'border-slate-300 focus:border-green-500 focus:ring-green-500'
    }
    ${className}
  `;
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label 
          htmlFor={selectId}
          className="block text-sm sm:text-base font-semibold text-navy-900 mb-2"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          className={selectClasses}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${selectId}-error` :
            helperText ? `${selectId}-helper` :
            undefined
          }
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option 
              key={option.value} 
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        
        {/* Dropdown Arrow */}
        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg 
            className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {hasError && (
        <p 
          id={`${selectId}-error`}
          className="mt-2 text-xs sm:text-sm text-red-600 flex items-center gap-1"
        >
          <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          {error}
        </p>
      )}
      
      {helperText && !hasError && (
        <p 
          id={`${selectId}-helper`}
          className="mt-2 text-xs sm:text-sm text-slate-600"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Input;