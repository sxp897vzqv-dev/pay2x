import { lazy } from 'react';

// Lazy load Recharts components - only load when needed
export const LazyLineChart = lazy(() => 
  import('recharts').then(m => ({ default: m.LineChart }))
);

export const LazyBarChart = lazy(() => 
  import('recharts').then(m => ({ default: m.BarChart }))
);

export const LazyAreaChart = lazy(() => 
  import('recharts').then(m => ({ default: m.AreaChart }))
);

export const LazyPieChart = lazy(() => 
  import('recharts').then(m => ({ default: m.PieChart }))
);

export const LazyResponsiveContainer = lazy(() => 
  import('recharts').then(m => ({ default: m.ResponsiveContainer }))
);

// Export XLSX functionality as dynamic import function
export const exportToExcel = async (data, filename = 'export') => {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

// Export to CSV (lighter alternative)
export const exportToCSV = (data, filename = 'export') => {
  if (!data || !data.length) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(h => {
        const val = row[h];
        // Escape quotes and wrap in quotes if contains comma
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val ?? '';
      }).join(',')
    )
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};
