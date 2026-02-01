import React from 'react';
import { theme } from '../../Theme';

/**
 * Production-Grade Button Component
 * Mobile-first, accessible, with multiple variants
 */
export const Button = React.forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  onClick,
  type = 'button',
  className = '',
  ...props
}, ref) => {
  
  // Variant Styles
  const variants = {
    primary: `
      bg-gradient-to-r from-green-600 to-green-700 
      text-white font-semibold
      hover:from-green-700 hover:to-green-800 
      active:scale-[0.98]
      shadow-md hover:shadow-lg
      disabled:from-slate-300 disabled:to-slate-400
      disabled:cursor-not-allowed disabled:shadow-none
    `,
    
    secondary: `
      bg-white text-navy-800 font-semibold
      border-2 border-navy-200
      hover:bg-navy-50 hover:border-navy-300
      active:scale-[0.98]
      shadow-sm hover:shadow-md
      disabled:bg-slate-100 disabled:text-slate-400
      disabled:border-slate-200 disabled:cursor-not-allowed
    `,
    
    danger: `
      bg-gradient-to-r from-red-500 to-red-600
      text-white font-semibold
      hover:from-red-600 hover:to-red-700
      active:scale-[0.98]
      shadow-md hover:shadow-lg
      disabled:from-slate-300 disabled:to-slate-400
      disabled:cursor-not-allowed disabled:shadow-none
    `,
    
    ghost: `
      bg-transparent text-navy-700 font-medium
      hover:bg-navy-50
      active:bg-navy-100
      disabled:text-slate-400 disabled:cursor-not-allowed
    `,
    
    success: `
      bg-green-100 text-green-800 font-semibold
      border-2 border-green-200
      hover:bg-green-200 hover:border-green-300
      active:scale-[0.98]
      disabled:bg-slate-100 disabled:text-slate-400
      disabled:border-slate-200 disabled:cursor-not-allowed
    `,
  };
  
  // Size Styles
  const sizes = {
    sm: 'px-3 py-2 text-sm min-h-[36px] gap-1.5 rounded-lg',
    md: 'px-4 py-2.5 text-base min-h-[44px] gap-2 rounded-xl',
    lg: 'px-6 py-3 text-lg min-h-[52px] gap-2.5 rounded-xl',
  };
  
  const baseStyles = `
    inline-flex items-center justify-center
    font-sans transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
    select-none touch-manipulation
    ${fullWidth ? 'w-full' : ''}
    ${variants[variant]}
    ${sizes[size]}
    ${className}
  `;
  
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={baseStyles}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-5 h-5 flex-shrink-0" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="w-5 h-5 flex-shrink-0" />}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;