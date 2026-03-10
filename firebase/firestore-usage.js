// firebase/firestore-usage.js
// ─────────────────────────────────────────────────────────────
// Firestore-backed usage tracking for scan count (tamper-proof)
// Uses Firestore REST API — no client SDK required
// ─────────────────────────────────────────────────────────────

import { FIREBASE_CONFIG } from './firebase-config.js';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/**
 * Gets the analysis count for a user from Firestore.
 *
 * @param {string} uid - Firebase user ID
 * @param {string} idToken - Firebase ID token for auth
 * @returns {Promise<number>} The current scan count
 */
export async function getFirestoreUsageCount(uid, idToken) {
  try {
    const url = `${FIRESTORE_BASE}/usage/${uid}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    if (res.status === 404) {
      // Document doesn't exist yet — first-time user
      return 0;
    }

    if (!res.ok) {
      console.error('Firestore read failed:', res.status, await res.text());
      // Fallback: allow usage to prevent false lockouts
      return 0;
    }

    const doc = await res.json();
    const count = doc.fields?.analysisCount?.integerValue || 0;
    return parseInt(count);
  } catch (error) {
    console.error('Firestore usage read error:', error);
    return 0; // Fallback: don't block on network errors
  }
}

/**
 * Increments the analysis count for a user in Firestore.
 * Uses PATCH to create or update the document.
 *
 * @param {string} uid - Firebase user ID
 * @param {string} idToken - Firebase ID token for auth
 * @param {number} currentCount - Current count to increment from
 * @returns {Promise<number>} The new count after increment
 */
export async function incrementFirestoreUsageCount(uid, idToken, currentCount) {
  try {
    const newCount = currentCount + 1;
    const url = `${FIRESTORE_BASE}/usage/${uid}?updateMask.fieldPaths=analysisCount&updateMask.fieldPaths=lastAnalysisAt&updateMask.fieldPaths=updatedAt`;

    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          analysisCount: { integerValue: newCount },
          lastAnalysisAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      })
    });

    if (!res.ok) {
      console.error('Firestore write failed:', res.status, await res.text());
      return currentCount; // Don't increment on failure
    }

    return newCount;
  } catch (error) {
    console.error('Firestore usage write error:', error);
    return currentCount;
  }
}
