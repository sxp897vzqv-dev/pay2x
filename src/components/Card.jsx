import React from 'react';

/**
 * Production-Grade Card Component System
 * Mobile-optimized with consistent spacing and shadows
 */

export const Card = ({ 
  children, 
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
  ...props 
}) => {
  const variants = {
    default: 'bg-white border border-slate-200 shadow-sm',
    elevated: 'bg-white border border-slate-200 shadow-md hover:shadow-lg',
    flat: 'bg-slate-50 border border-slate-200',
    success: 'bg-green-50 border-2 border-green-200',
    warning: 'bg-amber-50 border-2 border-amber-200',
    danger: 'bg-red-50 border-2 border-red-200',
    info: 'bg-blue-50 border-2 border-blue-200',
  };
  
  const paddings = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8',
  };
  
  const baseStyles = `
    rounded-xl sm:rounded-2xl
    transition-all duration-200
    ${variants[variant]}
    ${paddings[padding]}
    ${onClick ? 'cursor-pointer hover:scale-[1.01]' : ''}
    ${className}
  `;
  
  return (
    <div 
      className={baseStyles}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }) => (
  <div className={`mb-4 sm:mb-6 ${className}`}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '' }) => (
  <h3 className={`text-xl sm:text-2xl font-bold text-navy-900 ${className}`}>
    {children}
  </h3>
);

export const CardDescription = ({ children, className = '' }) => (
  <p className={`text-sm sm:text-base text-slate-600 mt-1 ${className}`}>
    {children}
  </p>
);

export const CardContent = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

export const CardFooter = ({ children, className = '' }) => (
  <div className={`mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-200 ${className}`}>
    {children}
  </div>
);

// Stat Card - Specialized for metrics
export const StatCard = ({ 
  title, 
  value, 
  change, 
  trend = 'neutral',
  icon: Icon,
  color = 'blue',
  loading = false 
}) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
  };
  
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-slate-600',
  };
  
  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-600 mb-1 uppercase tracking-wide">
            {title}
          </p>
          {loading ? (
            <div className="h-8 sm:h-10 w-32 bg-slate-200 animate-pulse rounded" />
          ) : (
            <>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-navy-900 mb-2 truncate">
                {value}
              </h3>
              {change && (
                <p className={`text-xs sm:text-sm font-semibold ${trendColors[trend]}`}>
                  {change}
                </p>
              )}
            </>
          )}
        </div>
        {Icon && (
          <div className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg flex-shrink-0`}>
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
        )}
      </div>
    </Card>
  );
};

export default Card;