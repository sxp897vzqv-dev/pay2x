import * as XLSX from 'xlsx';

// Excel Template Generator Function
export const generateExcelTemplate = () => {
  // Define template data with headers and example rows
  const template = [
    // Header row
    [
      'User ID', 
      'Merchant ID', 
      'UPI ID', 
      'Account Number', 
      'IFSC Code', 
      'Bank Name', 
      'Account Holder Name', 
      'Amount'
    ],
    // Example row 1 - UPI payment
    [
      'user123', 
      'merchant456', 
      'user@paytm', 
      '', 
      '', 
      '', 
      'John Doe', 
      '5000'
    ],
    // Example row 2 - Bank payment
    [
      'user456', 
      'merchant456', 
      '', 
      '1234567890123', 
      'SBIN0001234', 
      'State Bank of India', 
      'Jane Smith', 
      '10000'
    ],
    // Info row
    [
      '', 
      '', 
      'Example: Either UPI ID OR Bank Details required', 
      '', 
      '', 
      '', 
      '', 
      ''
    ]
  ];

  // Create worksheet from array of arrays
  const ws = XLSX.utils.aoa_to_sheet(template);
  
  // Create new workbook
  const wb = XLSX.utils.book_new();
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Payout Template');
  
  // Set column widths for better readability
  ws['!cols'] = [
    { wch: 15 },  // User ID
    { wch: 15 },  // Merchant ID
    { wch: 20 },  // UPI ID
    { wch: 18 },  // Account Number
    { wch: 15 },  // IFSC Code
    { wch: 25 },  // Bank Name
    { wch: 25 },  // Account Holder Name
    { wch: 10 }   // Amount
  ];

  // Generate filename with timestamp
  const filename = `payout-template-${Date.now()}.xlsx`;
  
  // Write file and trigger download
  XLSX.writeFile(wb, filename);
};