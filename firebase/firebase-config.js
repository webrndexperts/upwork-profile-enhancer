// firebase/firebase-config.js
// ─────────────────────────────────────────────────────────────
// Configuration loader for Firebase and OAuth
// ─────────────────────────────────────────────────────────────

import { CONFIG } from '../config/config.js';

// Firebase configuration
export const FIREBASE_CONFIG = CONFIG.FIREBASE;

// Google OAuth Client ID
export const GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;

// Firestore collection names
export const COLLECTIONS = {
  USERS:    'users',
  ANALYSES: 'analyses'
};
