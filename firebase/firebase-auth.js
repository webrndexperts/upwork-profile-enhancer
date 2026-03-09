import { FIREBASE_CONFIG, GOOGLE_CLIENT_ID } from './firebase-config.js';
import { encryptData, decryptData } from '../lib/crypto-utils.js';

const FIREBASE_AUTH_URL  = `https://identitytoolkit.googleapis.com/v1`;

// ─── GOOGLE SIGN IN ──────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  try {
    // Step 1: Get Google OAuth token via chrome.identity
    const token = await getChromeIdentityToken();

    // Step 2: Exchange Google token for Firebase ID token
    const firebaseUser = await exchangeTokenWithFirebase(token);

    // Step 3: Store session locally
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

export async function storeSession(user) {
  const encryptedPayload = await encryptData(JSON.stringify({
    email:       user.email,
    displayName: user.displayName,
    photoURL:    user.photoURL,
    idToken:     user.idToken,
    refreshToken:user.refreshToken,
    expiresAt:   user.expiresAt
  }), user.uid);

  return new Promise(resolve => {
    chrome.storage.local.set({
      rnd_user: {
        uid: user.uid,
        session: encryptedPayload
      }
    }, resolve);
  });
}

export function getSession() {
  return new Promise(resolve => {
    chrome.storage.local.get(['rnd_user'], async result => {
      const data = result.rnd_user;
      if (!data || !data.session) {
        resolve(data || null);
        return;
      }

      try {
        const decrypted = await decryptData(data.session, data.uid);
        if (!decrypted) {
          resolve(null);
          return;
        }
        const parsed = JSON.parse(decrypted);
        resolve({
          uid: data.uid,
          ...parsed
        });
      } catch (e) {
        console.error("Session decryption failed:", e);
        resolve(null);
      }
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

/**
 * Permanently deletes the user's Firebase Auth account.
 */
export async function deleteAccount(idToken) {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_CONFIG.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to delete account', e);
    return false;
  }
}

