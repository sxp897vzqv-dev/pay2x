// src/components/ui/LoadingSpinner.jsx
// Modern, consistent loading spinner for all pages

import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ 
  message = 'Loading…', 
  size = 'default',
  color = 'purple' 
}) {
  const sizes = {
    small: { spinner: 'w-6 h-6', text: 'text-xs' },
    default: { spinner: 'w-10 h-10', text: 'text-sm' },
    large: { spinner: 'w-14 h-14', text: 'text-base' },
  };

  const colors = {
    purple: 'text-purple-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    orange: 'text-orange-500',
    red: 'text-red-500',
    slate: 'text-slate-500',
  };

  const s = sizes[size] || sizes.default;
  const c = colors[color] || colors.purple;

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        {/* Modern gradient spinner */}
        <div className="relative mx-auto mb-4" style={{ width: 'fit-content' }}>
          {/* Glow effect */}
          <div className={`absolute inset-0 ${s.spinner} rounded-full bg-gradient-to-r from-purple-400 to-blue-400 opacity-20 blur-lg animate-pulse`} />
          
          {/* Main spinner */}
          <Loader2 className={`${s.spinner} ${c} animate-spin relative`} />
        </div>
        
        {/* Loading text with subtle animation */}
        <p className={`text-slate-500 ${s.text} font-medium animate-pulse`}>
          {message}
        </p>
      </div>
    </div>
  );
}

/* Alternative pulsing dots spinner */
export function LoadingDots({ message = 'Loading' }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="flex items-center justify-center gap-1 mb-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <p className="text-slate-500 text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}

/* Skeleton loader for cards/content */
export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-200 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
            <div className="w-20 h-6 bg-slate-200 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
