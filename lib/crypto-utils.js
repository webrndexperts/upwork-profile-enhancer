/**
 * lib/crypto-utils.js
 * Browser-native AES-GCM encryption/decryption utils using Web Crypto API.
 */

/**
 * Derives a cryptographic key from a simple string (like a UID).
 * @param {string} secret - The string to derive from
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(secret) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("rnd-profile-optimizer-salt"), // Constant salt for consistency
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a string using AES-GCM.
 * @param {string} text - Plain text to encrypt
 * @param {string} secret - Secret string to derive key from
 * @returns {Promise<object>} { iv: hex, data: hex }
 */
export async function encryptData(text, secret) {
  if (!text || !secret) return text;

  const enc = new TextEncoder();
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );

  return {
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    data: Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
  };
}

/**
 * Decrypts an object using AES-GCM.
 * @param {object} encryptedObj - { iv: hex, data: hex }
 * @param {string} secret - Secret string to derive key from
 * @returns {Promise<string|null>} Decrypted plain text
 */
export async function decryptData(encryptedObj, secret) {
  if (!encryptedObj || typeof encryptedObj !== 'object' || !secret) return encryptedObj;
  if (!encryptedObj.iv || !encryptedObj.data) return null;

  try {
    const key = await deriveKey(secret);
    const iv = new Uint8Array(encryptedObj.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const data = new Uint8Array(encryptedObj.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return null;
  }
}
