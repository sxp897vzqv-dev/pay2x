// ═══════════════════════════════════════════════════════════════════
// FORMATTING UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Format number as Indian Rupees (₹1,23,456)
 */
export function formatINR(amount, showSymbol = true) {
  const num = Number(amount) || 0;
  const formatted = num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return showSymbol ? `₹${formatted}` : formatted;
}

/**
 * Relative time display ("2 min ago", "1 hour ago", etc.)
 */
export function timeAgo(date) {
  if (!date) return '';
  
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  
  // For older dates, show the date
  return past.toLocaleDateString('en-IN', { 
    day: '2-digit', 
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format date for display
 */
export function formatDate(date, options = {}) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: options.year ? 'numeric' : undefined,
    hour: options.time ? '2-digit' : undefined,
    minute: options.time ? '2-digit' : undefined,
    ...options
  });
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str, length = 20) {
  if (!str) return '';
  return str.length > length ? str.slice(0, length) + '...' : str;
}
