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
  
  // API endpoints
  APIS: {
    GEMINI: "https://generativelanguage.googleapis.com/v1beta",
    OPENAI: "https://api.openai.com/v1"
  }
};
