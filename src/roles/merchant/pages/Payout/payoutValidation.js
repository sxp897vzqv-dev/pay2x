// Validation Functions for Payout System

export const validateUPI = (upi) => {
  if (!upi) return null;
  const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
  return upiRegex.test(upi) ? null : 'Invalid UPI format (e.g., user@paytm)';
};

export const validateIFSC = (ifsc) => {
  if (!ifsc) return null;
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return ifscRegex.test(ifsc) ? null : 'Invalid IFSC format (e.g., SBIN0001234)';
};

export const validateAccountNumber = (acc) => {
  if (!acc) return null;
  const accRegex = /^\d{9,18}$/;
  return accRegex.test(acc) ? null : 'Account number must be 9-18 digits';
};

export const validateAmount = (amount) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) return 'Amount must be greater than 0';
  if (amt < 100) return 'Minimum amount is Rs.100';
  if (amt > 50000) return 'Maximum amount is Rs.50,000';
  return null;
};

export const validatePayoutRow = (row) => {
  const errors = [];
  
  if (!row.userId?.trim()) errors.push('User ID is required');
  if (!row.merchantId?.trim()) errors.push('Merchant ID is required');
  if (!row.accountHolderName?.trim()) errors.push('Account Holder Name is required');
  
  const amountError = validateAmount(row.amount);
  if (amountError) errors.push(amountError);
  
  // Check if either UPI or Bank details provided
  const hasUPI = row.upiId?.trim();
  const hasBankDetails = row.accountNumber?.trim() || row.ifscCode?.trim();
  
  if (!hasUPI && !hasBankDetails) {
    errors.push('Either UPI ID or Bank Account details required');
  }
  
  if (hasUPI) {
    const upiError = validateUPI(row.upiId);
    if (upiError) errors.push(upiError);
  }
  
  if (hasBankDetails) {
    if (row.accountNumber) {
      const accError = validateAccountNumber(row.accountNumber);
      if (accError) errors.push(accError);
    }
    if (row.ifscCode) {
      const ifscError = validateIFSC(row.ifscCode);
      if (ifscError) errors.push(ifscError);
    }
    if (!row.bankName?.trim()) errors.push('Bank name required for bank transfers');
  }
  
  return errors;
};