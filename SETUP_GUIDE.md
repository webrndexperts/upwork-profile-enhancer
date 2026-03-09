# 🔧 Firebase + Google Auth Setup Guide

Follow these steps **once** to enable Google login and database for RND Upwork Profile Optimizer.

---

## Step 1 — Create Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it: `rnd-upwork-optimizer`
4. Disable Google Analytics (optional)
5. Click **"Create project"**

---

## Step 2 — Enable Google Sign-In

1. In Firebase Console → **Authentication** (left sidebar)
2. Click **"Get started"**
3. Click **"Google"** under Sign-in providers
4. Toggle **Enable** → ON
5. Set your project support email
6. Click **Save**

---

## Step 3 — Create Firestore Database

1. In Firebase Console → **Firestore Database** (left sidebar)
2. Click **"Create database"**
3. Choose **"Start in test mode"** (for now)
4. Select your region → **"Enable"**

### Firestore Security Rules (set after testing):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /analyses/{analysisId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## Step 4 — Get Firebase Config

1. In Firebase Console → **Project Settings** (gear icon)
2. Scroll to **"Your apps"** → Click **"Add app"** → Web `</>`
3. Register app name: `rnd-extension`
4. Copy the **firebaseConfig** object

---

## Step 5 — Create Google OAuth Client ID

1. Go to **https://console.cloud.google.com**
2. Select your Firebase project
3. Navigate to **APIs & Services → Credentials**
4. Click **"+ Create Credentials"** → **"OAuth 2.0 Client ID"**
5. Application type: **"Chrome Extension"**
6. Load your extension in Chrome (`chrome://extensions` → Load unpacked)
7. Copy the **Extension ID** shown on that page
8. Paste it in the "Application ID" field
9. Click **Create** → Copy the **Client ID**

---

## Step 6 — Add Your Config to the Extension

Open `firebase/firebase-config.js` and fill in your values:

```javascript
export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",           // from Step 4
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};

export const GOOGLE_CLIENT_ID = "123456789-abc.apps.googleusercontent.com"; // from Step 5
```

Also update `manifest.json` — replace `YOUR_GOOGLE_OAUTH_CLIENT_ID`:
```json
"oauth2": {
  "client_id": "123456789-abc.apps.googleusercontent.com",
  "scopes": ["openid", "email", "profile"]
}
```

---

## Step 7 — Add Extension to Firebase Auth Domains

1. Firebase Console → **Authentication → Settings → Authorized domains**
2. Click **"Add domain"**
3. Add: `chrome-extension://YOUR_EXTENSION_ID`
   (Replace with your actual Extension ID from Step 5)

---

## Step 8 — Reload & Test

1. Go to `chrome://extensions`
2. Click the **refresh icon** on your extension
3. Open any Upwork freelancer profile
4. Click the **"Analyze Profile"** floating button
5. You should see the **Google Sign In** screen
6. Sign in → you're redirected to the analyzer
7. Run an analysis → check **Firebase Console → Firestore** to see your data saved!

---

## What Gets Saved to Firestore

### `users/{uid}` document:
```json
{
  "uid": "google_uid",
  "email": "user@gmail.com",
  "displayName": "John Doe",
  "photoURL": "https://...",
  "lastLoginAt": "2025-01-01T00:00:00Z",
  "totalAnalyses": 5
}
```

### `users/{uid}/analyses/{analysisId}` documents:
```json
{
  "profileUrl": "https://www.upwork.com/freelancers/~...",
  "overallScore": 7.7,
  "category": "Excellent",
  "totalPoints": 6.9,
  "maxPoints": 9.0,
  "analysisData": "{...full JSON...}",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

## Firestore Data View

To view all users and their analyses:
1. Firebase Console → **Firestore Database**
2. Browse `users` collection
3. Click any user document to see their profile info
4. Expand `analyses` subcollection to see all their analyses

---

## Free Tier Limits (Firebase Spark Plan)

| Feature | Free Limit |
|---|---|
| Authentication | Unlimited |
| Firestore reads | 50,000/day |
| Firestore writes | 20,000/day |
| Firestore storage | 1 GB |

More than enough for thousands of users at no cost.
