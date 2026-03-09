// firebase/firebase-auth.js
// Handles Google Sign-In via chrome.identity + Firebase REST API + Firestore

import { FIREBASE_CONFIG, GOOGLE_CLIENT_ID, COLLECTIONS } from './firebase-config.js';

const FIREBASE_AUTH_URL  = `https://identitytoolkit.googleapis.com/v1`;
const FIRESTORE_URL      = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// ─── GOOGLE SIGN IN ──────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  try {
    // Step 1: Get Google OAuth token via chrome.identity
    const token = await getChromeIdentityToken();

    // Step 2: Exchange Google token for Firebase ID token
    const firebaseUser = await exchangeTokenWithFirebase(token);

    // Step 3: Save/update user in Firestore
    await saveUserToFirestore(firebaseUser);

    // Step 4: Store session locally
    await storeSession(firebaseUser);

    return { success: true, user: firebaseUser };
  } catch (error) {
    console.error('Sign-in error:', error);
    return { success: false, error: error.message };
  }
}

function getChromeIdentityToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true, scopes: ['openid', 'email', 'profile'] }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error('No token received from Google'));
        return;
      }
      resolve(token);
    });
  });
}

async function exchangeTokenWithFirebase(googleToken) {
  // Sign in to Firebase with Google credential
  const res = await fetch(
    `${FIREBASE_AUTH_URL}/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody:          `access_token=${googleToken}&providerId=google.com`,
        requestUri:        'http://localhost',
        returnIdpCredential: true,
        returnSecureToken: true
      })
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Firebase auth failed');
  }

  const data = await res.json();
  return {
    uid:          data.localId,
    email:        data.email,
    displayName:  data.displayName || data.email.split('@')[0],
    photoURL:     data.photoUrl || null,
    idToken:      data.idToken,
    refreshToken: data.refreshToken,
    expiresIn:    data.expiresIn,
    expiresAt:    Date.now() + parseInt(data.expiresIn) * 1000
  };
}

// ─── SIGN OUT ─────────────────────────────────────────────────────────────────

export async function signOut() {
  // Revoke Chrome identity token
  const session = await getSession();
  if (session?.idToken) {
    try {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${session.idToken}`);
    } catch (_) {}
  }

  // Remove cached Chrome token
  chrome.identity.clearAllCachedAuthTokens(() => {});

  // Clear local session
  await clearSession();
  return { success: true };
}

// ─── SESSION MANAGEMENT ───────────────────────────────────────────────────────

export function storeSession(user) {
  return new Promise(resolve => {
    chrome.storage.local.set({
      rnd_user: {
        uid:         user.uid,
        email:       user.email,
        displayName: user.displayName,
        photoURL:    user.photoURL,
        idToken:     user.idToken,
        refreshToken:user.refreshToken,
        expiresAt:   user.expiresAt
      }
    }, resolve);
  });
}

export function getSession() {
  return new Promise(resolve => {
    chrome.storage.local.get(['rnd_user'], result => {
      resolve(result.rnd_user || null);
    });
  });
}

export function clearSession() {
  return new Promise(resolve => {
    chrome.storage.local.remove(['rnd_user'], resolve);
  });
}

export async function getValidSession() {
  const session = await getSession();
  if (!session) return null;

  // Check if token is expired (with 5 min buffer)
  if (Date.now() > session.expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshIdToken(session.refreshToken);
    if (!refreshed) return null;
    return refreshed;
  }
  return session;
}

async function refreshIdToken(refreshToken) {
  try {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
      }
    );

    if (!res.ok) {
      await clearSession();
      return null;
    }

    const data = await res.json();
    const existing = await getSession();
    const updated = {
      ...existing,
      idToken:     data.id_token,
      refreshToken:data.refresh_token,
      expiresAt:   Date.now() + parseInt(data.expires_in) * 1000
    };
    await storeSession(updated);
    return updated;
  } catch {
    await clearSession();
    return null;
  }
}

// ─── FIRESTORE OPERATIONS ─────────────────────────────────────────────────────

export async function saveUserToFirestore(user) {
  const docUrl = `${FIRESTORE_URL}/${COLLECTIONS.USERS}/${user.uid}`;

  const payload = {
    fields: {
      uid:         { stringValue: user.uid },
      email:       { stringValue: user.email },
      displayName: { stringValue: user.displayName },
      photoURL:    { stringValue: user.photoURL || '' },
      lastLoginAt: { timestampValue: new Date().toISOString() },
      createdAt:   { timestampValue: new Date().toISOString() }
    }
  };

  // Use PATCH with updateMask so we don't overwrite createdAt on existing users
  await fetch(`${docUrl}?updateMask.fieldPaths=uid&updateMask.fieldPaths=email&updateMask.fieldPaths=displayName&updateMask.fieldPaths=photoURL&updateMask.fieldPaths=lastLoginAt`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.idToken}`
    },
    body: JSON.stringify(payload)
  });
}

export async function saveAnalysisToFirestore(uid, idToken, analysisData, profileUrl) {
  const colUrl = `${FIRESTORE_URL}/${COLLECTIONS.USERS}/${uid}/${COLLECTIONS.ANALYSES}`;

  const payload = {
    fields: {
      profileUrl:    { stringValue: profileUrl || '' },
      overallScore:  { doubleValue: parseFloat(analysisData.overallScore) || 0 },
      category:      { stringValue: analysisData.category || '' },
      totalPoints:   { doubleValue: parseFloat(analysisData.totalPoints) || 0 },
      maxPoints:     { doubleValue: parseFloat(analysisData.maxPoints) || 9 },
      analysisData:  { stringValue: JSON.stringify(analysisData) },
      createdAt:     { timestampValue: new Date().toISOString() }
    }
  };

  const res = await fetch(colUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Firestore save error:', err);
    // Non-fatal — analysis still worked, just didn't save to cloud
  }

  return res.ok;
}

export async function getUserAnalyses(uid, idToken, limit = 10) {
  const url = `${FIRESTORE_URL}/${COLLECTIONS.USERS}/${uid}/${COLLECTIONS.ANALYSES}?pageSize=${limit}&orderBy=createdAt+desc`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${idToken}` }
  });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.documents) return [];

  return data.documents.map(doc => {
    const f = doc.fields;
    return {
      id:           doc.name.split('/').pop(),
      profileUrl:   f.profileUrl?.stringValue || '',
      overallScore: f.overallScore?.doubleValue || 0,
      category:     f.category?.stringValue || '',
      createdAt:    f.createdAt?.timestampValue || ''
    };
  });
}

export async function updateUserAnalysisCount(uid, idToken) {
  // Increment total analyses counter on user document
  const docUrl = `${FIRESTORE_URL}/${COLLECTIONS.USERS}/${uid}`;
  const doc = await fetch(docUrl, {
    headers: { 'Authorization': `Bearer ${idToken}` }
  }).then(r => r.json()).catch(() => null);

  const current = doc?.fields?.totalAnalyses?.integerValue || 0;

  await fetch(`${docUrl}?updateMask.fieldPaths=totalAnalyses`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      fields: {
        totalAnalyses: { integerValue: parseInt(current) + 1 }
      }
    })
  });
}
