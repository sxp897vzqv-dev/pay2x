import React from 'react';

/* ─── Color maps ─── */
const BG_MAP = {
  blue: '#eff6ff', green: '#f0fdf4', purple: '#faf5ff',
  orange: '#fff7ed', emerald: '#ecfdf5', yellow: '#fefce8',
  red: '#fef2f2', indigo: '#eef2ff', cyan: '#ecfeff',
  slate: '#f8fafc', amber: '#fffbeb',
};

const ICON_BG_MAP = {
  blue: { bg: '#dbeafe', text: '#2563eb' },
  green: { bg: '#bbf7d0', text: '#16a34a' },
  purple: { bg: '#e9d5ff', text: '#9333ea' },
  orange: { bg: '#fed7aa', text: '#ea580c' },
  emerald: { bg: '#a7f3d0', text: '#059669' },
  yellow: { bg: '#fde047', text: '#ca8a04' },
  red: { bg: '#fecaca', text: '#dc2626' },
  indigo: { bg: '#c7d2fe', text: '#4f46e5' },
  cyan: { bg: '#a5f3fc', text: '#0891b2' },
  slate: { bg: '#e2e8f0', text: '#475569' },
  amber: { bg: '#fde68a', text: '#d97706' },
};

const TEXT_MAP = {
  blue: '#1d4ed8', green: '#15803d', purple: '#7e22ce',
  orange: '#c2410c', emerald: '#047857', yellow: '#a16207',
  red: '#b91c1c', indigo: '#4338ca', cyan: '#0e7490',
  slate: '#334155', amber: '#b45309',
};

const BORDER_MAP = {
  blue: '#bfdbfe', green: '#86efac', purple: '#c4b5fd',
  orange: '#fdba74', emerald: '#6ee7b7', yellow: '#fcd34d',
  red: '#fca5a5', indigo: '#a5b4fc', cyan: '#67e8f9',
  slate: '#cbd5e1', amber: '#fcd34d',
};

/**
 * Stat Card component for dashboards
 * @param {string} title - Card title
 * @param {string|number} value - Main value to display
 * @param {React.Component} icon - Lucide icon component
 * @param {string} color - Color theme (blue, green, purple, etc.)
 * @param {boolean} loading - Show loading skeleton
 * @param {string} subtitle - Secondary text below value
 * @param {number} trend - Percentage change (positive/negative)
 * @param {string} className - Additional CSS classes
 */
export default function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color = 'blue', 
  loading = false, 
  subtitle, 
  trend, 
  className = '' 
}) {
  return (
    <div
      className={`rounded-xl p-3 sm:p-4 ${className}`}
      style={{ backgroundColor: BG_MAP[color], border: `1px solid ${BORDER_MAP[color]}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate pr-2">
          {title}
        </p>
        {Icon && (
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: ICON_BG_MAP[color]?.bg }}
          >
            <Icon className="w-3.5 h-3.5" style={{ color: ICON_BG_MAP[color]?.text }} />
          </div>
        )}
      </div>
      
      {loading ? (
        <div className="h-6 w-20 bg-slate-200 animate-pulse rounded" />
      ) : (
        <>
          <h3 
            className="text-xl sm:text-2xl font-bold leading-tight" 
            style={{ color: TEXT_MAP[color] }}
          >
            {value}
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
          {trend !== undefined && (
            <p className={`text-xs font-semibold mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs yesterday
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Gradient stat card for hero sections
 */
export function GradientStatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  gradient = 'from-indigo-500 to-indigo-600',
  className = '' 
}) {
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-xl p-3 text-white ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs font-semibold">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {subtitle && <p className="text-white/60 text-xs">{subtitle}</p>}
        </div>
        {Icon && <Icon className="w-8 h-8 text-white/30" />}
      </div>
    </div>
  );
}

// Export color maps for external use
export { BG_MAP, ICON_BG_MAP, TEXT_MAP, BORDER_MAP };
