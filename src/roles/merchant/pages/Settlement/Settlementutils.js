// Settlement Utility Functions

// Convert INR to USDT
export const convertToUSDT = (inr, exchangeRate = 80) => {
  return Number((inr / exchangeRate).toFixed(2));
};

// Convert USDT to INR
export const convertToINR = (usdt, exchangeRate = 80) => {
  return Number((usdt * exchangeRate).toFixed(2));
};

// Calculate payin commission in INR
export const calculatePayinCommission = (amount, rate) => {
  return Number(((amount * rate) / 100).toFixed(2));
};

// Calculate payout commission in INR
export const calculatePayoutCommission = (amount, rate) => {
  return Number(((amount * rate) / 100).toFixed(2));
};

// Calculate total commission in INR
export const calculateTotalCommission = (payins, payouts, payinRate, payoutRate) => {
  const payinCommission = calculatePayinCommission(payins, payinRate);
  const payoutCommission = calculatePayoutCommission(payouts, payoutRate);
  return payinCommission + payoutCommission;
};

// Calculate balance after payin commission deduction
export const deductPayinCommission = (balance, amountINR, rate, exchangeRate = 80) => {
  const commissionINR = calculatePayinCommission(amountINR, rate);
  const commissionUSDT = convertToUSDT(commissionINR, exchangeRate);
  return Number((balance - commissionUSDT).toFixed(2));
};

// Calculate balance after payout commission deduction
export const deductPayoutCommission = (balance, amountINR, rate, exchangeRate = 80) => {
  const commissionINR = calculatePayoutCommission(amountINR, rate);
  const commissionUSDT = convertToUSDT(commissionINR, exchangeRate);
  return Number((balance - commissionUSDT).toFixed(2));
};

// Calculate balance after USDT withdrawal
export const deductWithdrawal = (balance, amountUSDT) => {
  return Number((balance - amountUSDT).toFixed(2));
};

// Check if withdrawal is allowed
export const canWithdraw = (balance, requestAmount) => {
  if (!requestAmount || requestAmount <= 0) {
    return { allowed: false, reason: 'Amount must be greater than 0' };
  }
  
  if (requestAmount < 10) {
    return { allowed: false, reason: 'Minimum withdrawal is 10 USDT' };
  }
  
  if (requestAmount > balance) {
    return { allowed: false, reason: 'Insufficient balance' };
  }
  
  return { allowed: true };
};

// Validate TRC-20 address
export const validateTRCAddress = (address) => {
  if (!address) return 'TRC-20 address is required';
  
  if (!address.startsWith('T')) {
    return 'TRC-20 address must start with T';
  }
  
  if (address.length !== 34) {
    return 'TRC-20 address must be exactly 34 characters';
  }
  
  // Basic base58 validation
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (!base58Regex.test(address)) {
    return 'Invalid TRC-20 address format';
  }
  
  return null;
};

// Validate transaction hash
export const validateTxHash = (hash) => {
  if (!hash) return 'Transaction hash is required';
  
  // TRC-20 tx hash is typically 64 characters hexadecimal
  const hexRegex = /^[a-fA-F0-9]{64}$/;
  if (!hexRegex.test(hash)) {
    return 'Invalid transaction hash format (must be 64 hex characters)';
  }
  
  return null;
};

// Format USDT amount with proper decimals
export const formatUSDT = (amount) => {
  return Number(amount).toFixed(2);
};

// Format INR amount
export const formatINR = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

// Check if merchant has low balance
export const hasLowBalance = (balance, threshold = 500) => {
  return balance < threshold;
};

// Calculate estimated commission for amount
export const estimateCommission = (amount, rate, exchangeRate = 80) => {
  const commissionINR = (amount * rate) / 100;
  const commissionUSDT = convertToUSDT(commissionINR, exchangeRate);
  return {
    inr: commissionINR,
    usdt: commissionUSDT
  };
};

// Get balance status
export const getBalanceStatus = (balance) => {
  if (balance >= 1000) return { status: 'healthy', color: 'green', message: 'Healthy Balance' };
  if (balance >= 500) return { status: 'warning', color: 'yellow', message: 'Low Balance' };
  return { status: 'critical', color: 'red', message: 'Critical Balance' };
};

// Calculate days until balance depletes (estimate)
export const estimateBalanceDepletion = (balance, avgDailyCommission, exchangeRate = 80) => {
  if (avgDailyCommission <= 0) return null;
  
  const avgDailyCommissionUSDT = convertToUSDT(avgDailyCommission, exchangeRate);
  const daysRemaining = Math.floor(balance / avgDailyCommissionUSDT);
  
  return daysRemaining;
};

// Generate withdrawal reference ID
export const generateWithdrawalRef = () => {
  return `WD${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
};

// Parse merchant balance data
export const parseBalanceData = (merchant) => {
  return {
    currentBalance: merchant.currentBalance || 0,
    initialCredit: merchant.initialCredit || 0,
    totalPayins: merchant.totalPayinsProcessed || 0,
    totalPayouts: merchant.totalPayoutsProcessed || 0,
    totalCommissionINR: merchant.totalCommissionPaidINR || 0,
    totalCommissionUSDT: merchant.totalCommissionPaidUSDT || 0,
    totalWithdrawn: merchant.totalUSDTWithdrawn || 0,
    payinRate: merchant.payinCommissionRate || 5,
    payoutRate: merchant.payoutCommissionRate || 2
  };
};