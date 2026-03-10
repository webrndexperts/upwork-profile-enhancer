import { createProvider, checkRateLimit } from './api-handler.js';
import {
  signInWithGoogle,
  signOut,
  getValidSession,
  getSession,
  deleteAccount
} from '../firebase/firebase-auth.js';
import { getFirestoreUsageCount, incrementFirestoreUsageCount } from '../firebase/firestore-usage.js';
import { encryptData, decryptData } from '../lib/crypto-utils.js';
import { CONFIG } from '../config/config.js';

let activeAbortController = null;

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'SIGN_IN') {
    signInWithGoogle().then(sendResponse);
    return true;
  }
  if (message.type === 'SIGN_OUT') {
    signOut().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_SESSION') {
    getValidSession().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_USER') {
    getSession().then(user => sendResponse({ user }));
    return true;
  }
  if (message.type === 'ANALYZE_PROFILE') {
    handleAnalysis(message.data, sendResponse);
    return true;
  }
  if (message.type === 'ABORT_ANALYSIS') {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    sendResponse({ success: true, aborted: true });
    return true;
  }
  if (message.type === 'GET_SETTINGS') {
    handleGetSettings(sendResponse);
    return true;
  }
  if (message.type === 'SAVE_SETTINGS') {
    handleSaveSettings(message.settings, sendResponse);
    return true;
  }
  if (message.type === 'GET_HISTORY') {
    handleGetHistory(sendResponse);
    return true;
  }
  if (message.type === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ analysisHistory: [] }, () => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'CLEAR_ALL_DATA') {
    handleClearAllData(sendResponse);
    return true;
  }
  if (message.type === 'DELETE_ACCOUNT') {
    handleDeleteAccount(sendResponse);
    return true;
  }
  if (message.type === 'GET_PROFILE_HISTORY') {
    handleGetProfileHistory(message.profileUrl, sendResponse);
    return true;
  }
});

// ─── Analysis Handler ─────────────────────────────────────────────────────────
/**
 * Handles the profile analysis request, including optional resume/LinkedIn data.
 *
 * @param {object} profileData - Profile data including optional resumeText and linkedinText
 * @param {function} sendResponse - Chrome message response callback
 */
async function handleAnalysis(profileData, sendResponse) {
  try {
    // Rate limit check
    if (checkRateLimit()) {
      sendResponse({ error: 'RATE_LIMITED', message: 'You have reached the maximum of 10 analyses per hour. Please wait before trying again.' });
      return;
    }

    const session = await getValidSession();
    if (!session) {
      sendResponse({ error: 'NOT_AUTHENTICATED', message: 'Please sign in to analyze profiles.' });
      return;
    }

    // Free trial check (Firestore-backed)
    if (!CONFIG.DEV_UNLIMITED_SCANS) {
      const count = await getFirestoreUsageCount(session.uid, session.idToken);
      if (count >= CONFIG.FREE_SCAN_LIMIT) {
        sendResponse({
          error: 'LIMIT_REACHED',
          message: `You have used all ${CONFIG.FREE_SCAN_LIMIT} free scans. Upgrade to continue.`,
          upgradeUrl: CONFIG.UPGRADE_URL
        });
        return;
      }
    }

    const settings = await getSettings();
    const provider = settings.activeProvider || 'gemini';
    const apiKey   = provider === 'openai' ? CONFIG.OPENAI_API_KEY : CONFIG.GEMINI_API_KEY;

    if (!apiKey) {
      sendResponse({ error: 'NO_API_KEY', message: 'Please add your API key in Settings.' });
      return;
    }

    // Extract document texts and top skills (sent from sidebar via content script)
    const resumeText   = profileData.resumeText || null;
    const linkedinText = profileData.linkedinText || null;
    const topSkills    = profileData.topSkills || null;

    // Remove extra fields from profileData to keep it clean for the DOM data
    const cleanProfileData = { ...profileData };
    delete cleanProfileData.resumeText;
    delete cleanProfileData.linkedinText;
    delete cleanProfileData.topSkills;

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    const ai     = createProvider(provider, settings.selectedModel);
    const result = await ai.analyze(cleanProfileData, apiKey, resumeText, linkedinText, signal, 0, topSkills);

    // Local history fallback
    await saveToLocalHistory(result, profileData.profileUrl);

    // Increment usage count in Firestore on success
    const currentCount = await getFirestoreUsageCount(session.uid, session.idToken);
    const updatedCount = await incrementFirestoreUsageCount(session.uid, session.idToken, currentCount);

    activeAbortController = null;
    sendResponse({ success: true, data: result, user: session, analysisCount: updatedCount });
  } catch (error) {
    activeAbortController = null;
    if (error.name === 'AbortError') {
      console.log('Analysis gracefully aborted.');
      sendResponse({ error: 'ANALYSIS_ABORTED', message: 'Analysis cancelled by user.' });
      return;
    }
    console.error('Analysis error:', error);
    sendResponse({ error: 'ANALYSIS_FAILED', message: error.message });
  }
}

/**
 * Handles fetching analysis history from local storage.
 *
 * @param {function} sendResponse - Chrome message response callback
 */
async function handleGetHistory(sendResponse) {
  try {
    const session = await getValidSession();
    chrome.storage.local.get(['analysisHistory'], async r => {
      let history = r.analysisHistory || [];
      
      // If encrypted (stored as object {iv, data}), decrypt it
      if (session && history && !Array.isArray(history) && history.iv) {
        try {
          const decrypted = await decryptData(history, session.uid);
          history = JSON.parse(decrypted || '[]');
        } catch (e) {
          console.error("Failed to decrypt history:", e);
        }
      }

      // Ensure we have an array before sending response
      if (!Array.isArray(history)) {
        history = [];
      }
      
      sendResponse({ history, source: 'local' });
    });
  } catch (e) {
    sendResponse({ history: [], error: e.message });
  }
}

/**
 * Retrieves settings from Chrome local storage.
 * API keys are provided from config, not user storage.
 *
 * @returns {Promise<object>}
 */
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['activeProvider', 'selectedModel'], result => {
      resolve({
        activeProvider: result.activeProvider || 'gemini',
        selectedModel: result.selectedModel || null
      });
    });
  });
}

/**
 * Handles saving settings (provider and model selection only).
 *
 * @param {object} settings - Settings to save
 * @param {function} sendResponse - Chrome message response callback
 */
async function handleSaveSettings(settings, sendResponse) {
  try {
    const toSave = {};
    if (settings.activeProvider) toSave.activeProvider = settings.activeProvider;
    if (settings.selectedModel) toSave.selectedModel = settings.selectedModel;

    chrome.storage.local.set(toSave, () => sendResponse({ success: true }));
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Handles getting settings — includes usage count for sidebar.
 */
async function handleGetSettings(sendResponse) {
  const settings = await getSettings();
  const session = await getValidSession();
  let analysisCount = 0;
  if (session) {
    analysisCount = await getFirestoreUsageCount(session.uid, session.idToken);
  }
  sendResponse({
    ...settings,
    analysisCount,
    freeScanLimit: CONFIG.FREE_SCAN_LIMIT,
    upgradeUrl: CONFIG.UPGRADE_URL,
    devUnlimited: !!CONFIG.DEV_UNLIMITED_SCANS
  });
}



/**
 * Saves analysis result to local history.
 *
 * @param {object} result - The analysis result
 * @param {string} profileUrl - The analyzed profile URL
 * @returns {Promise<void>}
 */
async function saveToLocalHistory(result, profileUrl) {
  const session = await getValidSession();
  
  return new Promise(resolve => {
    chrome.storage.local.get(['analysisHistory'], async data => {
      let history = data.analysisHistory || [];
      
      // If it's currently encrypted (object {iv, data}), decrypt it first to work with it
      if (session && history && !Array.isArray(history) && history.iv) {
        try {
          const decrypted = await decryptData(history, session.uid);
          history = JSON.parse(decrypted || '[]');
        } catch (e) {
          console.error("Decrypt failed during save:", e);
          history = [];
        }
      }
      
      // Safety: If for any reason history is not an array (e.g. decryption failed), reset it
      if (!Array.isArray(history)) {
        history = [];
      }

      history.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        profileUrl,
        overallScore: result.overallScore,
        category: result.category
      });

      const limitedHistory = history.slice(0, 20);
      let toSave = limitedHistory;

      // Encrypt the entire history array if user is logged in
      if (session) {
        toSave = await encryptData(JSON.stringify(limitedHistory), session.uid);
      }

      chrome.storage.local.set({ analysisHistory: toSave }, resolve);
    });
  });
}

/**
 * Handles fetching analysis history for a specific profile URL.
 *
 * @param {string} profileUrl - The profile URL to query
 * @param {function} sendResponse - Chrome message response callback
 */
async function handleGetProfileHistory(profileUrl, sendResponse) {
  const session = await getValidSession();
  
  // Fallback to local history filtered by profile URL
  chrome.storage.local.get(['analysisHistory'], async r => {
    let all = r.analysisHistory || [];
    
    // Decrypt if it's an encrypted object {iv, data}
    if (session && all && !Array.isArray(all) && all.iv) {
      try {
        const decrypted = await decryptData(all, session.uid);
        all = JSON.parse(decrypted || '[]');
      } catch (e) {
        console.error("Profile history decrypt failed:", e);
        all = [];
      }
    }
    
    // Safety check: ensure 'all' is an array before filtering
    if (!Array.isArray(all)) {
      all = [];
    }
    
    const filtered = all.filter(a => a.profileUrl === profileUrl);
    sendResponse({ history: filtered, source: 'local' });
  });
}

/**
 * Handles clearing all user data locally.
 *
 * @param {function} sendResponse
 */
async function handleClearAllData(sendResponse) {
  chrome.storage.local.clear(() => {
    sendResponse({ success: true });
  });
}

/**
 * Handles permanent account deletion.
 *
 * @param {function} sendResponse
 */
async function handleDeleteAccount(sendResponse) {
  let serverDeleted = false;
  try {
    const session = await getValidSession();
    if (session && session.idToken) {
      console.log('Attempting to delete Firebase account...');
      // 1. Delete Auth record from Firebase servers
      serverDeleted = await deleteAccount(session.idToken);
      
      if (serverDeleted) {
        console.log('Firebase account successfully deleted.');
      } else {
        console.warn('Firebase account deletion returned failure (possibly already deleted or requires recent login).');
      }

      // 2. Sign out/Revoke local session
      await signOut();
    }
  } catch (e) {
    console.error('Critical failure during account deletion process:', e);
  }

  // 3. Always clear local storage to ensure "Forget Me" intent is honored locally
  chrome.storage.local.clear(() => {
    sendResponse({ success: true, serverDeleted });
  });
}


