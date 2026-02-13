// ================================================
// Pay2X Enterprise - Standardized Error Handling
// ================================================

export interface Pay2XError {
  code: string;
  message: string;
  httpStatus: number;
  category: 'auth' | 'validation' | 'payment' | 'rate_limit' | 'internal';
  isRetryable: boolean;
  retryAfter?: number;
  details?: Record<string, any>;
}

// Error definitions
export const ERRORS: Record<string, Omit<Pay2XError, 'details'>> = {
  // Authentication (401)
  AUTH_MISSING_KEY: {
    code: 'AUTH_MISSING_KEY',
    message: 'API key is required',
    httpStatus: 401,
    category: 'auth',
    isRetryable: false,
  },
  AUTH_INVALID_KEY: {
    code: 'AUTH_INVALID_KEY',
    message: 'Invalid API key',
    httpStatus: 401,
    category: 'auth',
    isRetryable: false,
  },
  AUTH_EXPIRED_KEY: {
    code: 'AUTH_EXPIRED_KEY',
    message: 'API key has expired',
    httpStatus: 401,
    category: 'auth',
    isRetryable: false,
  },

  // Authorization (403)
  FORBIDDEN_IP: {
    code: 'FORBIDDEN_IP',
    message: 'Request from unauthorized IP address',
    httpStatus: 403,
    category: 'auth',
    isRetryable: false,
  },
  MERCHANT_INACTIVE: {
    code: 'MERCHANT_INACTIVE',
    message: 'Merchant account is inactive',
    httpStatus: 403,
    category: 'auth',
    isRetryable: false,
  },
  MERCHANT_SUSPENDED: {
    code: 'MERCHANT_SUSPENDED',
    message: 'Merchant account is suspended',
    httpStatus: 403,
    category: 'auth',
    isRetryable: false,
  },

  // Rate Limiting (429)
  RATE_LIMIT_MINUTE: {
    code: 'RATE_LIMIT_MINUTE',
    message: 'Rate limit exceeded. Please slow down.',
    httpStatus: 429,
    category: 'rate_limit',
    isRetryable: true,
    retryAfter: 60,
  },
  RATE_LIMIT_HOUR: {
    code: 'RATE_LIMIT_HOUR',
    message: 'Hourly rate limit exceeded',
    httpStatus: 429,
    category: 'rate_limit',
    isRetryable: true,
    retryAfter: 3600,
  },
  RATE_LIMIT_DAY: {
    code: 'RATE_LIMIT_DAY',
    message: 'Daily rate limit exceeded',
    httpStatus: 429,
    category: 'rate_limit',
    isRetryable: true,
    retryAfter: 86400,
  },

  // Validation (400)
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request format',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Validation error',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },
  MISSING_FIELD: {
    code: 'MISSING_FIELD',
    message: 'Required field is missing',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },
  INVALID_AMOUNT: {
    code: 'INVALID_AMOUNT',
    message: 'Amount must be a positive integer in paise',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },
  AMOUNT_TOO_LOW: {
    code: 'AMOUNT_TOO_LOW',
    message: 'Amount is below minimum limit (₹1)',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },
  AMOUNT_TOO_HIGH: {
    code: 'AMOUNT_TOO_HIGH',
    message: 'Amount exceeds maximum limit',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },
  INVALID_UPI: {
    code: 'INVALID_UPI',
    message: 'Invalid UPI ID format',
    httpStatus: 400,
    category: 'validation',
    isRetryable: false,
  },

  // Idempotency (409)
  IDEMPOTENCY_CONFLICT: {
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Request with same idempotency key had different parameters',
    httpStatus: 409,
    category: 'validation',
    isRetryable: false,
  },
  DUPLICATE_REQUEST: {
    code: 'DUPLICATE_REQUEST',
    message: 'Duplicate transaction detected',
    httpStatus: 409,
    category: 'validation',
    isRetryable: false,
  },

  // Payment (402)
  INSUFFICIENT_BALANCE: {
    code: 'INSUFFICIENT_BALANCE',
    message: 'Insufficient merchant balance',
    httpStatus: 402,
    category: 'payment',
    isRetryable: false,
  },
  UPI_UNAVAILABLE: {
    code: 'UPI_UNAVAILABLE',
    message: 'No UPI available for this amount. Try again later.',
    httpStatus: 402,
    category: 'payment',
    isRetryable: true,
    retryAfter: 60,
  },
  BANK_UNAVAILABLE: {
    code: 'BANK_UNAVAILABLE',
    message: 'Bank is temporarily unavailable',
    httpStatus: 402,
    category: 'payment',
    isRetryable: true,
    retryAfter: 300,
  },
  PAYMENT_FAILED: {
    code: 'PAYMENT_FAILED',
    message: 'Payment processing failed',
    httpStatus: 402,
    category: 'payment',
    isRetryable: true,
    retryAfter: 60,
  },
  PAYMENT_TIMEOUT: {
    code: 'PAYMENT_TIMEOUT',
    message: 'Payment request timed out',
    httpStatus: 402,
    category: 'payment',
    isRetryable: true,
    retryAfter: 30,
  },

  // Not Found (404)
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    httpStatus: 404,
    category: 'validation',
    isRetryable: false,
  },
  PAYMENT_NOT_FOUND: {
    code: 'PAYMENT_NOT_FOUND',
    message: 'Payment not found',
    httpStatus: 404,
    category: 'validation',
    isRetryable: false,
  },
  PAYIN_NOT_FOUND: {
    code: 'PAYIN_NOT_FOUND',
    message: 'Payment not found or already processed',
    httpStatus: 404,
    category: 'validation',
    isRetryable: false,
  },

  // Fallback Chain Errors
  PAYIN_EXPIRED: {
    code: 'PAYIN_EXPIRED',
    message: 'Payment has expired',
    httpStatus: 410,
    category: 'payment',
    isRetryable: false,
  },
  MAX_ATTEMPTS_REACHED: {
    code: 'MAX_ATTEMPTS_REACHED',
    message: 'No more UPI options available',
    httpStatus: 400,
    category: 'payment',
    isRetryable: false,
  },
  NO_FALLBACK: {
    code: 'NO_FALLBACK',
    message: 'No fallback UPIs available',
    httpStatus: 400,
    category: 'payment',
    isRetryable: false,
  },
  FALLBACK_MISSING: {
    code: 'FALLBACK_MISSING',
    message: 'Fallback UPI not found in chain',
    httpStatus: 500,
    category: 'internal',
    isRetryable: false,
  },
  UPI_LIMIT_EXCEEDED: {
    code: 'UPI_LIMIT_EXCEEDED',
    message: 'Next UPI has insufficient daily limit',
    httpStatus: 400,
    category: 'payment',
    isRetryable: true,
    retryAfter: 60,
  },
  LIMIT_EXCEEDED: {
    code: 'LIMIT_EXCEEDED',
    message: 'Next UPI has insufficient daily limit',
    httpStatus: 400,
    category: 'payment',
    isRetryable: true,
    retryAfter: 60,
  },
  UPI_UNAVAILABLE_FALLBACK: {
    code: 'UPI_UNAVAILABLE',
    message: 'Next UPI is no longer available',
    httpStatus: 400,
    category: 'payment',
    isRetryable: true,
    retryAfter: 30,
  },
  SWITCH_FAILED: {
    code: 'SWITCH_FAILED',
    message: 'Failed to switch UPI',
    httpStatus: 500,
    category: 'internal',
    isRetryable: true,
    retryAfter: 30,
  },

  // Server (500)
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again.',
    httpStatus: 500,
    category: 'internal',
    isRetryable: true,
    retryAfter: 30,
  },
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Database error. Please try again.',
    httpStatus: 500,
    category: 'internal',
    isRetryable: true,
    retryAfter: 30,
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporarily unavailable',
    httpStatus: 503,
    category: 'internal',
    isRetryable: true,
    retryAfter: 60,
  },
};

// Create error response
export function createError(
  errorCode: keyof typeof ERRORS,
  details?: Record<string, any>
): Pay2XError {
  const error = ERRORS[errorCode];
  if (!error) {
    return {
      ...ERRORS.INTERNAL_ERROR,
      details: { originalCode: errorCode },
    };
  }
  return { ...error, details };
}

// Format error for API response
export function formatErrorResponse(error: Pay2XError, traceId?: string) {
  const response: Record<string, any> = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    },
  };

  if (traceId) {
    response.trace_id = traceId;
  }

  return response;
}

// Create HTTP Response with error
export function errorResponse(
  error: Pay2XError,
  traceId?: string
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Pay2X-Error-Code': error.code,
  };

  if (traceId) {
    headers['X-Trace-Id'] = traceId;
  }

  if (error.retryAfter) {
    headers['Retry-After'] = String(error.retryAfter);
  }

  return new Response(
    JSON.stringify(formatErrorResponse(error, traceId)),
    {
      status: error.httpStatus,
      headers,
    }
  );
}

// Validation helper
export function validateRequired(
  body: Record<string, any>,
  requiredFields: string[]
): Pay2XError | null {
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return createError('MISSING_FIELD', { field });
    }
  }
  return null;
}
