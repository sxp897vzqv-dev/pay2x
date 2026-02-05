import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * Search input with clear button
 * @param {string} value - Current search value
 * @param {function} onChange - Callback when value changes
 * @param {string} placeholder - Placeholder text
 * @param {string} className - Additional classes
 * @param {string} accentColor - Focus ring color (green, indigo, amber, etc.)
 */
export default function SearchInput({ 
  value, 
  onChange, 
  placeholder = 'Search...', 
  className = '',
  accentColor = 'indigo'
}) {
  const ringColors = {
    green: 'focus:ring-green-400',
    indigo: 'focus:ring-indigo-400',
    amber: 'focus:ring-amber-400',
    orange: 'focus:ring-orange-400',
    blue: 'focus:ring-blue-400',
    purple: 'focus:ring-purple-400',
    red: 'focus:ring-red-400',
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 ${ringColors[accentColor] || ringColors.indigo} bg-white`}
      />
      {value && (
        <button 
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
