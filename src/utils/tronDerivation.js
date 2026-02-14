/**
 * Derive TRON addresses from XPUB (client-side, no API needed)
 */
import HDKey from 'hdkey';
import { keccak_256 } from '@noble/hashes/sha3';
import bs58check from 'bs58check';

// TRON address prefix (0x41)
const TRON_ADDRESS_PREFIX = 0x41;

/**
 * Convert public key to TRON address
 */
function publicKeyToAddress(publicKeyHex) {
  // Remove '04' prefix if present (uncompressed public key marker)
  let pubKey = publicKeyHex;
  if (pubKey.startsWith('04')) {
    pubKey = pubKey.slice(2);
  }
  
  // Keccak256 hash of public key
  const pubKeyBytes = Buffer.from(pubKey, 'hex');
  const hash = keccak_256(pubKeyBytes);
  
  // Take last 20 bytes
  const addressBytes = hash.slice(-20);
  
  // Add TRON prefix (0x41)
  const addressWithPrefix = Buffer.concat([
    Buffer.from([TRON_ADDRESS_PREFIX]),
    Buffer.from(addressBytes)
  ]);
  
  // Base58Check encode
  return bs58check.encode(addressWithPrefix);
}

/**
 * Derive a single address from XPUB at given index
 */
export function deriveAddressFromXpub(xpub, index) {
  try {
    // Parse XPUB
    const hdkey = HDKey.fromExtendedKey(xpub);
    
    // Derive child at index (m/0/index for receiving addresses)
    const child = hdkey.derive(`m/0/${index}`);
    
    // Get uncompressed public key
    const publicKey = child.publicKey.toString('hex');
    
    // Convert to TRON address
    const address = publicKeyToAddress(publicKey);
    
    return address;
  } catch (error) {
    console.error('Derivation error:', error);
    throw new Error(`Failed to derive address: ${error.message}`);
  }
}

/**
 * Derive multiple addresses from XPUB
 */
export function deriveMultipleAddresses(xpub, fromIndex, toIndex) {
  const addresses = [];
  for (let i = fromIndex; i <= toIndex; i++) {
    const address = deriveAddressFromXpub(xpub, i);
    addresses.push({ index: i, address });
  }
  return addresses;
}

export default { deriveAddressFromXpub, deriveMultipleAddresses };
