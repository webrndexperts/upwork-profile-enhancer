// config/config.template.js
// TEMPLATE FILE - Copy to config.js and add your credentials
// ─────────────────────────────────────────────────────────────
// SETUP:
// 1. Copy this file: cp config.template.js config.js
// 2. Replace all YOUR_* placeholders with actual values
// 3. config.js will be ignored by git (see .gitignore)
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Firebase configuration
  FIREBASE: {
    apiKey: "YOUR_FIREBASE_API_KEY_HERE",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.firebasestorage.app",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id",
    measurementId: "your-measurement-id"
  },
  
  // Google OAuth Client ID
  GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com",
  
  // AI Provider API Keys (service-provided, not user-managed)
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",
  OPENAI_API_KEY: "YOUR_OPENAI_API_KEY_HERE",

  // API endpoints
  APIS: {
    GEMINI: "https://generativelanguage.googleapis.com/v1beta",
    OPENAI: "https://api.openai.com/v1"
  },

  // Trial / Subscription
  FREE_SCAN_LIMIT: 5,
  UPGRADE_URL: "https://rndexperts.com/upgrade",
  DEV_UNLIMITED_SCANS: false  // Set to true to bypass free scan limit in development
};
