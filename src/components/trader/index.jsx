import React from 'react';
import { CheckCircle } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// STATUS BADGE - Consistent pill styling
// ═══════════════════════════════════════════════════════════════════

const statusStyles = {
  // Success states
  completed: 'bg-green-100 text-green-700 border-green-200',
  verified: 'bg-green-100 text-green-700 border-green-200',
  success: 'bg-green-100 text-green-700 border-green-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  
  // Warning states
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  assigned: 'bg-blue-100 text-blue-700 border-blue-200',
  processing: 'bg-blue-100 text-blue-700 border-blue-200',
  pending_verification: 'bg-amber-100 text-amber-700 border-amber-200',
  
  // Error states
  failed: 'bg-red-100 text-red-700 border-red-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  
  // Neutral
  default: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function StatusBadge({ status, size = 'sm', className = '' }) {
  const style = statusStyles[status?.toLowerCase()] || statusStyles.default;
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };
  
  const label = status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
  
  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${style} ${sizeClasses[size]} ${className}`}>
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SKELETON LOADERS
// ═══════════════════════════════════════════════════════════════════

export function Skeleton({ className = '', variant = 'text' }) {
  const baseClass = 'animate-pulse bg-slate-200 rounded';
  const variants = {
    text: 'h-4 w-full',
    title: 'h-6 w-3/4',
    avatar: 'h-10 w-10 rounded-full',
    card: 'h-32 w-full rounded-xl',
    stat: 'h-20 w-full rounded-xl',
  };
  
  return <div className={`${baseClass} ${variants[variant]} ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="h-5 w-16 bg-slate-200 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-16 bg-slate-100 rounded-lg" />
        <div className="h-16 bg-slate-100 rounded-lg" />
        <div className="h-16 bg-slate-100 rounded-lg" />
        <div className="h-16 bg-slate-100 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 flex-1 bg-slate-200 rounded-xl" />
        <div className="h-10 flex-1 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 3 }) {
  return (
    <div className={`grid grid-cols-${count} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
          <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
          <div className="h-7 w-24 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUCCESS ANIMATION - Animated checkmark
// ═══════════════════════════════════════════════════════════════════

export function SuccessAnimation({ size = 'md', onComplete }) {
  const sizes = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };
  
  React.useEffect(() => {
    if (onComplete) {
      const timer = setTimeout(onComplete, 1500);
      return () => clearTimeout(timer);
    }
  }, [onComplete]);
  
  return (
    <div className={`${sizes[size]} relative`}>
      <svg viewBox="0 0 52 52" className="w-full h-full">
        <circle
          className="stroke-green-500 fill-none animate-[circle_0.6s_ease-in-out_forwards]"
          cx="26" cy="26" r="25"
          strokeWidth="2"
          style={{
            strokeDasharray: 166,
            strokeDashoffset: 166,
            animation: 'circle 0.6s ease-in-out forwards',
          }}
        />
        <path
          className="stroke-green-500 fill-none animate-[check_0.3s_0.6s_ease-in-out_forwards]"
          d="M14.1 27.2l7.1 7.2 16.7-16.8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 48,
            strokeDashoffset: 48,
            animation: 'check 0.3s 0.6s ease-in-out forwards',
          }}
        />
      </svg>
      <style>{`
        @keyframes circle {
          to { stroke-dashoffset: 0; }
        }
        @keyframes check {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CARD WITH HOVER EFFECT
// ═══════════════════════════════════════════════════════════════════

export function Card({ children, className = '', hover = true, onClick }) {
  return (
    <div 
      className={`
        bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden
        ${hover ? 'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STICKY TAB HEADER
// ═══════════════════════════════════════════════════════════════════

export function StickyTabs({ tabs, activeTab, onChange, className = '' }) {
  return (
    <div className={`sticky top-0 z-10 bg-slate-50 -mx-3 px-3 py-2 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 ${className}`}>
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`
                flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all
                ${isActive 
                  ? 'bg-green-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }
              `}
            >
              {Icon && <Icon className="w-4 h-4" />}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
              {tab.badge > 0 && (
                <span className={`
                  px-1.5 py-0.5 text-xs font-bold rounded-full min-w-[20px] text-center
                  ${isActive ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}
                `}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RELATIVE TIME COMPONENT
// ═══════════════════════════════════════════════════════════════════

export function RelativeTime({ date, className = '' }) {
  const [display, setDisplay] = React.useState('');
  
  React.useEffect(() => {
    if (!date) return;
    
    const update = () => {
      const now = new Date();
      const past = new Date(date);
      const diffMs = now - past;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      
      if (diffSec < 30) setDisplay('Just now');
      else if (diffSec < 60) setDisplay(`${diffSec}s ago`);
      else if (diffMin < 60) setDisplay(`${diffMin}m ago`);
      else if (diffHour < 24) setDisplay(`${diffHour}h ago`);
      else if (diffDay < 7) setDisplay(`${diffDay}d ago`);
      else setDisplay(past.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
    };
    
    update();
    const interval = setInterval(update, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [date]);
  
  if (!date) return null;
  
  return (
    <time 
      dateTime={new Date(date).toISOString()} 
      title={new Date(date).toLocaleString('en-IN')}
      className={`text-slate-500 ${className}`}
    >
      {display}
    </time>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AMOUNT DISPLAY (Indian format)
// ═══════════════════════════════════════════════════════════════════

export function Amount({ value, size = 'md', color = 'default', className = '' }) {
  const num = Number(value) || 0;
  const formatted = num.toLocaleString('en-IN');
  
  const sizes = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
  };
  
  const colors = {
    default: 'text-slate-900',
    green: 'text-green-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
    muted: 'text-slate-500',
  };
  
  return (
    <span className={`font-bold ${sizes[size]} ${colors[color]} ${className}`}>
      ₹{formatted}
    </span>
  );
}

// Export all
export default {
  StatusBadge,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonStats,
  SuccessAnimation,
  Card,
  StickyTabs,
  RelativeTime,
  Amount,
};
