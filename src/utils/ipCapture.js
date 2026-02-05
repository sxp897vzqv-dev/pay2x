/**
 * IP Address Capture Utility
 * Fetches the user's public IP address for audit logging
 */

let cachedIP = null;
let fetchPromise = null;

/**
 * Get the user's public IP address
 * Caches the result to avoid repeated API calls
 * @returns {Promise<string>} IP address or 'unknown' if fetch fails
 */
export async function getClientIP() {
  // Return cached IP if available
  if (cachedIP) return cachedIP;
  
  // If already fetching, wait for that promise
  if (fetchPromise) return fetchPromise;
  
  // Fetch IP from ipify (free, no API key needed)
  fetchPromise = (async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json', {
        timeout: 5000, // 5 second timeout
      });
      if (!response.ok) throw new Error('IP fetch failed');
      const data = await response.json();
      cachedIP = data.ip || 'unknown';
      return cachedIP;
    } catch (error) {
      console.warn('Failed to fetch IP address:', error.message);
      cachedIP = 'unknown';
      return cachedIP;
    } finally {
      fetchPromise = null;
    }
  })();
  
  return fetchPromise;
}

/**
 * Initialize IP capture on app load
 * Call this in your App.jsx or index.jsx
 */
export function initIPCapture() {
  getClientIP().then(ip => {
    console.log('📍 Client IP captured:', ip);
  });
}

/**
 * Get cached IP synchronously (returns 'unknown' if not yet fetched)
 */
export function getCachedIP() {
  return cachedIP || 'unknown';
}

/**
 * Clear cached IP (useful for testing or after logout)
 */
export function clearCachedIP() {
  cachedIP = null;
}
