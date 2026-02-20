/**
 * Production Logger
 * Controlled via VITE_DEBUG environment variable
 * Set VITE_DEBUG=true in .env for development logging
 */

const isDev = import.meta.env.DEV;
const debugEnabled = import.meta.env.VITE_DEBUG === 'true';
const shouldLog = isDev || debugEnabled;

// No-op function for production
const noop = () => {};

export const logger = {
  log: shouldLog ? console.log.bind(console) : noop,
  warn: shouldLog ? console.warn.bind(console) : noop,
  error: console.error.bind(console), // Always log errors
  debug: shouldLog ? console.debug.bind(console) : noop,
  info: shouldLog ? console.info.bind(console) : noop,
};

// Shorthand exports
export const log = logger.log;
export const warn = logger.warn;
export const error = logger.error;
export const debug = logger.debug;

export default logger;
