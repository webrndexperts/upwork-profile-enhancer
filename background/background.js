import { createProvider, checkRateLimit } from './api-handler.js';
import {
  signInWithGoogle,
  signOut,
  getValidSession,
  getSession,
  deleteAccount
} from '../firebase/firebase-auth.js';
import { encryptData, decryptData } from '../lib/crypto-utils.js';

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
  if (message.type === 'GET_API_KEY') {
    chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'activeProvider'], result => {
      const provider = result.activeProvider || 'gemini';
      const apiKey = provider === 'openai' ? result.openaiApiKey : result.geminiApiKey;
      sendResponse({ apiKey: apiKey || null, provider });
    });
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

    const settings = await getSettings();
    const provider = settings.activeProvider || 'gemini';
    const apiKey   = provider === 'openai' ? settings.openaiApiKey : settings.geminiApiKey;

    if (!apiKey) {
      sendResponse({ error: 'NO_API_KEY', message: 'Please add your API key in Settings.' });
      return;
    }

    // Extract document texts (sent from sidebar via content script)
    const resumeText   = profileData.resumeText || null;
    const linkedinText = profileData.linkedinText || null;

    // Remove document texts from profileData to keep it clean for the DOM data
    const cleanProfileData = { ...profileData };
    delete cleanProfileData.resumeText;
    delete cleanProfileData.linkedinText;

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    const ai     = createProvider(provider, settings.selectedModel);
    const result = await ai.analyze(cleanProfileData, apiKey, resumeText, linkedinText, signal);

    // Local history fallback
    await saveToLocalHistory(result, profileData.profileUrl);

    activeAbortController = null;
    sendResponse({ success: true, data: result, user: session });
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
      
      // If encrypted, decrypt it
      if (session && history.length > 0 && typeof history[0] !== 'object') {
        try {
          const decrypted = await decryptData(history, session.uid);
          history = JSON.parse(decrypted || '[]');
        } catch (e) {
          console.error("Failed to decrypt history:", e);
        }
      }
      
      sendResponse({ history, source: 'local' });
    });
  } catch (e) {
    sendResponse({ history: [], error: e.message });
  }
}

/**
 * Retrieves settings from Chrome local storage.
 *
 * @returns {Promise<object>}
 */
async function getSettings() {
  const session = await getValidSession();
  return new Promise(resolve => {
    chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'activeProvider', 'selectedModel'], async result => {
      const settings = { ...result };
      
      // Decrypt API keys if they are encrypted objects
      if (session) {
        if (settings.geminiApiKey && typeof settings.geminiApiKey === 'object') {
          settings.geminiApiKey = await decryptData(settings.geminiApiKey, session.uid);
        }
        if (settings.openaiApiKey && typeof settings.openaiApiKey === 'object') {
          settings.openaiApiKey = await decryptData(settings.openaiApiKey, session.uid);
        }
      }
      
      resolve(settings);
    });
  });
}

/**
 * Handles saving settings with encryption for API keys.
 */
async function handleSaveSettings(settings, sendResponse) {
  try {
    const session = await getValidSession();
    const toSave = { ...settings };

    if (session) {
      if (toSave.geminiApiKey && typeof toSave.geminiApiKey === 'string') {
        toSave.geminiApiKey = await encryptData(toSave.geminiApiKey, session.uid);
      }
      if (toSave.openaiApiKey && typeof toSave.openaiApiKey === 'string') {
        toSave.openaiApiKey = await encryptData(toSave.openaiApiKey, session.uid);
      }
    }

    chrome.storage.local.set(toSave, () => sendResponse({ success: true }));
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Handles getting settings with decryption.
 */
async function handleGetSettings(sendResponse) {
  const settings = await getSettings();
  sendResponse(settings);
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
      
      // If it's currently encrypted, decrypt it first to work with it
      if (session && history.length > 0 && typeof history[0] !== 'object') {
        try {
          const decrypted = await decryptData(history, session.uid);
          history = JSON.parse(decrypted || '[]');
        } catch (e) {
          console.error("Decrypt failed during save:", e);
          history = [];
        }
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
    
    // Decrypt if necessary
    if (session && all.length > 0 && typeof all[0] !== 'object') {
      try {
        const decrypted = await decryptData(all, session.uid);
        all = JSON.parse(decrypted || '[]');
      } catch (e) {
        console.error("Profile history decrypt failed:", e);
        all = [];
      }
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


