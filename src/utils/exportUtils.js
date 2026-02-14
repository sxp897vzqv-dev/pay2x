/**
 * Export Utilities - CSV and Excel export for all data tables
 */

/**
 * Export data to CSV file
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions [{key: 'field', header: 'Display Name', format: (val) => val}]
 * @param {string} filename - Output filename (without extension)
 */
export function exportToCSV(data, columns, filename = 'export') {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Build header row
  const headers = columns.map(col => `"${col.header || col.key}"`).join(',');
  
  // Build data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col.key];
      
      // Apply formatter if provided
      if (col.format && typeof col.format === 'function') {
        value = col.format(value, row);
      }
      
      // Handle special types
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      
      // Escape quotes and wrap in quotes
      value = String(value).replace(/"/g, '""');
      return `"${value}"`;
    }).join(',');
  });

  // Combine and create blob
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  
  // Download
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Export data to Excel file (XLSX)
 * Uses simple XML-based format that Excel can open
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions
 * @param {string} filename - Output filename
 * @param {string} sheetName - Excel sheet name
 */
export function exportToExcel(data, columns, filename = 'export', sheetName = 'Sheet1') {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Build XML spreadsheet
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
  xml += `  <Worksheet ss:Name="${sheetName}">\n`;
  xml += '    <Table>\n';

  // Header row
  xml += '      <Row>\n';
  columns.forEach(col => {
    xml += `        <Cell><Data ss:Type="String">${escapeXml(col.header || col.key)}</Data></Cell>\n`;
  });
  xml += '      </Row>\n';

  // Data rows
  data.forEach(row => {
    xml += '      <Row>\n';
    columns.forEach(col => {
      let value = row[col.key];
      
      if (col.format && typeof col.format === 'function') {
        value = col.format(value, row);
      }
      
      if (value === null || value === undefined) value = '';
      
      const type = typeof value === 'number' ? 'Number' : 'String';
      xml += `        <Cell><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>\n`;
    });
    xml += '      </Row>\n';
  });

  xml += '    </Table>\n';
  xml += '  </Worksheet>\n';
  xml += '</Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  downloadBlob(blob, `${filename}.xls`);
}

/**
 * Export multiple sheets to Excel
 * @param {Object} sheets - {sheetName: {data, columns}}
 * @param {string} filename - Output filename
 */
export function exportMultiSheetExcel(sheets, filename = 'export') {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';

  Object.entries(sheets).forEach(([sheetName, { data, columns }]) => {
    xml += `  <Worksheet ss:Name="${escapeXml(sheetName)}">\n`;
    xml += '    <Table>\n';

    // Header
    xml += '      <Row>\n';
    columns.forEach(col => {
      xml += `        <Cell><Data ss:Type="String">${escapeXml(col.header || col.key)}</Data></Cell>\n`;
    });
    xml += '      </Row>\n';

    // Data
    (data || []).forEach(row => {
      xml += '      <Row>\n';
      columns.forEach(col => {
        let value = row[col.key];
        if (col.format) value = col.format(value, row);
        if (value === null || value === undefined) value = '';
        const type = typeof value === 'number' ? 'Number' : 'String';
        xml += `        <Cell><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>\n`;
      });
      xml += '      </Row>\n';
    });

    xml += '    </Table>\n';
    xml += '  </Worksheet>\n';
  });

  xml += '</Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  downloadBlob(blob, `${filename}.xls`);
}

/**
 * Common column definitions for different entity types
 */
export const EXPORT_COLUMNS = {
  payins: [
    { key: 'txn_id', header: 'Transaction ID' },
    { key: 'order_id', header: 'Order ID' },
    { key: 'amount', header: 'Amount', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'commission', header: 'Commission', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'status', header: 'Status', format: v => v?.toUpperCase() },
    { key: 'upi_id', header: 'UPI ID' },
    { key: 'utr', header: 'UTR' },
    { key: 'created_at', header: 'Created', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
    { key: 'completed_at', header: 'Completed', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
  ],
  
  payouts: [
    { key: 'txn_id', header: 'Transaction ID' },
    { key: 'amount', header: 'Amount', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'commission', header: 'Commission', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'status', header: 'Status', format: v => v?.toUpperCase() },
    { key: 'account_name', header: 'Account Name' },
    { key: 'account_number', header: 'Account Number' },
    { key: 'ifsc', header: 'IFSC' },
    { key: 'utr', header: 'UTR' },
    { key: 'created_at', header: 'Created', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
    { key: 'completed_at', header: 'Completed', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
  ],
  
  disputes: [
    { key: 'id', header: 'Dispute ID' },
    { key: 'type', header: 'Type', format: v => v?.toUpperCase() },
    { key: 'amount', header: 'Amount', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'status', header: 'Status', format: v => v?.toUpperCase() },
    { key: 'reason', header: 'Reason' },
    { key: 'upi_id', header: 'UPI ID' },
    { key: 'created_at', header: 'Created', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
    { key: 'admin_resolved_at', header: 'Resolved', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
  ],
  
  balanceHistory: [
    { key: 'created_at', header: 'Date', format: v => v ? new Date(v).toLocaleString('en-IN') : '' },
    { key: 'entity_type', header: 'Type', format: v => v?.toUpperCase() },
    { key: 'entity_name', header: 'Name' },
    { key: 'reason', header: 'Reason' },
    { key: 'amount', header: 'Amount', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'balance_before', header: 'Before', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'balance_after', header: 'After', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'reference_type', header: 'Ref Type' },
    { key: 'note', header: 'Note' },
  ],
  
  traders: [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'balance', header: 'Balance', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'overall_commission', header: 'Total Commission', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'payin_commission', header: 'Payin Rate %' },
    { key: 'payout_commission', header: 'Payout Rate %' },
    { key: 'is_active', header: 'Active', format: v => v ? 'Yes' : 'No' },
    { key: 'is_online', header: 'Online', format: v => v ? 'Yes' : 'No' },
    { key: 'created_at', header: 'Joined', format: v => v ? new Date(v).toLocaleDateString('en-IN') : '' },
  ],
  
  merchants: [
    { key: 'business_name', header: 'Business Name' },
    { key: 'name', header: 'Contact Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'balance', header: 'Balance', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'available_balance', header: 'Available', format: v => `₹${Number(v || 0).toLocaleString()}` },
    { key: 'payin_commission', header: 'Payin Rate %' },
    { key: 'payout_commission', header: 'Payout Rate %' },
    { key: 'is_active', header: 'Active', format: v => v ? 'Yes' : 'No' },
    { key: 'created_at', header: 'Joined', format: v => v ? new Date(v).toLocaleDateString('en-IN') : '' },
  ],
};

/**
 * Generate filename with date
 */
export function generateFilename(prefix, dateRange = null) {
  const date = new Date().toISOString().split('T')[0];
  if (dateRange) {
    return `${prefix}_${dateRange.from}_to_${dateRange.to}`;
  }
  return `${prefix}_${date}`;
}

// Helper functions
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
