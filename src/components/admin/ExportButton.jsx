import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { exportToCSV, exportToExcel, generateFilename } from '../../utils/exportUtils';

/**
 * Reusable Export Button with CSV/Excel options
 * 
 * Usage:
 * <ExportButton 
 *   data={filteredData} 
 *   columns={EXPORT_COLUMNS.payins} 
 *   filename="payins" 
 * />
 */
export default function ExportButton({ 
  data, 
  columns, 
  filename = 'export',
  dateRange = null,
  disabled = false,
  size = 'md', // 'sm', 'md', 'lg'
  variant = 'primary', // 'primary', 'secondary', 'ghost'
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  const handleExport = (format) => {
    const finalFilename = generateFilename(filename, dateRange);
    
    if (format === 'csv') {
      exportToCSV(data, columns, finalFilename);
    } else {
      exportToExcel(data, columns, finalFilename);
    }
    
    setShowDropdown(false);
  };

  const sizeClasses = {
    sm: 'px-2 py-1.5 text-xs gap-1',
    md: 'px-3 py-2 text-sm gap-1.5',
    lg: 'px-4 py-2.5 text-base gap-2',
  };

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled || !data?.length}
        className={`
          inline-flex items-center font-semibold rounded-xl border transition-all
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeClasses[size]}
          ${variantClasses[variant]}
        `}
      >
        <Download size={iconSize} />
        Export
        <ChevronDown size={iconSize - 2} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)} 
          />
          <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
            <button
              onClick={() => handleExport('csv')}
              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FileText size={16} className="text-green-600" />
              Export CSV
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <FileSpreadsheet size={16} className="text-blue-600" />
              Export Excel
            </button>
          </div>
        </>
      )}

      {data?.length === 0 && (
        <span className="ml-2 text-xs text-slate-400">No data</span>
      )}
    </div>
  );
}
