import React from 'react';

/**
 * Filter pills/chips component
 * @param {Array} pills - Array of pill objects: { label, value, key, activeBg, activeText }
 * @param {string} activeKey - Currently active pill key
 * @param {function} onChange - Callback when pill is clicked (receives key)
 * @param {string} className - Additional container classes
 */
export default function FilterPills({ pills, activeKey, onChange, className = '' }) {
  return (
    <div 
      className={`flex gap-2 overflow-x-auto px-1 py-1 -mx-1 ${className}`} 
      style={{ scrollbarWidth: 'none' }}
    >
      {pills.map(pill => {
        const isActive = activeKey === pill.key;
        return (
          <button
            key={pill.key}
            onClick={() => onChange(pill.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isActive 
                ? `${pill.activeBg || 'bg-slate-200'} ${pill.activeText || 'text-slate-800'} shadow-sm` 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {pill.label}
            {pill.value !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                isActive ? 'bg-white/70' : 'bg-slate-200 text-slate-600'
              }`}>
                {pill.value}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Date preset pills component
 * @param {string} activePreset - 'all' | 'today' | 'week' | 'month'
 * @param {function} onChange - Callback with preset key
 */
export function DatePresetPills({ activePreset, onChange, className = '' }) {
  const presets = [
    { label: 'All Time', key: 'all' },
    { label: 'Today', key: 'today' },
    { label: 'Week', key: 'week' },
    { label: 'Month', key: 'month' },
  ];

  return (
    <div className={`flex flex-wrap gap-2 items-center ${className}`}>
      <span className="text-xs font-bold text-slate-500">Period:</span>
      {presets.map(preset => {
        const isActive = activePreset === preset.key;
        return (
          <button
            key={preset.key}
            onClick={() => onChange(preset.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-green-100 text-green-700 shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
