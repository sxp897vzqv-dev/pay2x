/**
 * Geo utilities for IP geolocation and IFSC lookup
 */

export interface GeoLocation {
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
}

export interface IFSCBranch {
  bank: string;
  branch: string;
  city: string;
  state: string;
  address: string;
}

/**
 * Get location from IP address using ip-api.com (free, no key needed)
 * Rate limit: 45 requests/minute
 */
export async function getLocationFromIP(ip: string): Promise<GeoLocation> {
  try {
    // Skip private/local IPs
    if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return { city: null, state: null, country: null, lat: null, lon: null };
    }

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,lat,lon`);
    const data = await res.json();

    if (data.status === 'success') {
      return {
        city: data.city || null,
        state: data.regionName || null,
        country: data.country || null,
        lat: data.lat || null,
        lon: data.lon || null,
      };
    }

    return { city: null, state: null, country: null, lat: null, lon: null };
  } catch (e) {
    console.error('IP geolocation failed:', e);
    return { city: null, state: null, country: null, lat: null, lon: null };
  }
}

/**
 * Get branch location from IFSC code using Razorpay API (free)
 */
export async function getBranchFromIFSC(ifsc: string): Promise<IFSCBranch | null> {
  try {
    if (!ifsc || ifsc.length !== 11) return null;

    const res = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
    
    if (!res.ok) return null;

    const data = await res.json();

    return {
      bank: data.BANK || '',
      branch: data.BRANCH || '',
      city: data.CITY || '',
      state: data.STATE || '',
      address: data.ADDRESS || '',
    };
  } catch (e) {
    console.error('IFSC lookup failed:', e);
    return null;
  }
}

/**
 * Calculate geo match level between user and UPI
 */
export function getGeoMatch(
  userCity: string | null,
  userState: string | null,
  upiCity: string | null,
  upiState: string | null
): { match: 'city' | 'state' | 'none'; boost: number } {
  // Normalize for comparison
  const normalize = (s: string | null) => s?.toLowerCase().trim() || '';

  const uCity = normalize(userCity);
  const uState = normalize(userState);
  const bCity = normalize(upiCity);
  const bState = normalize(upiState);

  // City match (highest boost)
  if (uCity && bCity && uCity === bCity) {
    return { match: 'city', boost: 15 };
  }

  // State match
  if (uState && bState && uState === bState) {
    return { match: 'state', boost: 8 };
  }

  return { match: 'none', boost: 0 };
}

/**
 * Get client IP from request headers
 */
export function getClientIP(req: Request): string {
  // Try various headers (Cloudflare, proxy, etc.)
  const headers = [
    'x-real-ip',             // Vercel/Nginx (most reliable)
    'x-client-ip',           // Our proxy
    'true-client-ip',        // Akamai
    'cf-connecting-ip',      // Cloudflare
    'x-forwarded-for',       // Standard proxy (may be chained)
  ];

  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      // x-forwarded-for can be comma-separated, take first
      return value.split(',')[0].trim();
    }
  }

  return '';
}

/**
 * Get geo data from Vercel headers (faster than IP lookup)
 * Returns null if headers not present
 */
export function getGeoFromVercelHeaders(req: Request): GeoLocation | null {
  const city = req.headers.get('x-vercel-ip-city');
  const region = req.headers.get('x-vercel-ip-region');
  const country = req.headers.get('x-vercel-ip-country');
  
  // If we have Vercel geo headers, use them (faster)
  if (city || region || country) {
    return {
      city: city ? decodeURIComponent(city) : null,
      state: region || null,
      country: country || null,
      lat: null,  // Vercel doesn't provide lat/lon
      lon: null,
    };
  }
  
  return null;
}

/**
 * Get location - tries Vercel headers first, falls back to IP lookup
 */
export async function getLocation(req: Request): Promise<GeoLocation> {
  // Try Vercel headers first (instant, no API call)
  const vercelGeo = getGeoFromVercelHeaders(req);
  if (vercelGeo && (vercelGeo.city || vercelGeo.state)) {
    return vercelGeo;
  }
  
  // Fall back to IP lookup
  const clientIP = getClientIP(req);
  if (clientIP) {
    return getLocationFromIP(clientIP);
  }
  
  return { city: null, state: null, country: null, lat: null, lon: null };
}
