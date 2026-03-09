// background.js - Service worker for RND Upwork Profile Optimizer

import { createProvider } from './api-handler.js';
import {
  signInWithGoogle,
  signOut,
  getValidSession,
  getSession,
  saveAnalysisToFirestore,
  getUserAnalyses,
  updateUserAnalysisCount
} from '../firebase/firebase-auth.js';

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
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'activeProvider', 'selectedModel'], sendResponse);
    return true;
  }
  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(message.settings, () => sendResponse({ success: true }));
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
  if (message.type === 'GET_API_KEY') {
    chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'activeProvider'], result => {
      const provider = result.activeProvider || 'gemini';
      const apiKey = provider === 'openai' ? result.openaiApiKey : result.geminiApiKey;
      sendResponse({ apiKey: apiKey || null, provider });
    });
    return true;
  }
});

// ─── Analysis Handler ─────────────────────────────────────────────────────────
async function handleAnalysis(profileData, sendResponse) {
  try {
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

    const ai     = createProvider(provider, settings.selectedModel);
    const result = await ai.analyze(profileData, apiKey);

    // Save to Firestore (non-blocking)
    saveAnalysisToFirestore(session.uid, session.idToken, result, profileData.profileUrl)
      .catch(e => console.warn('Firestore save failed:', e));
    updateUserAnalysisCount(session.uid, session.idToken)
      .catch(e => console.warn('Count update failed:', e));

    // Local history fallback
    await saveToLocalHistory(result, profileData.profileUrl);

    sendResponse({ success: true, data: result, user: session });
  } catch (error) {
    console.error('Analysis error:', error);
    sendResponse({ error: 'ANALYSIS_FAILED', message: error.message });
  }
}

async function handleGetHistory(sendResponse) {
  try {
    const session = await getValidSession();
    if (session) {
      const cloudHistory = await getUserAnalyses(session.uid, session.idToken, 20);
      if (cloudHistory.length > 0) {
        sendResponse({ history: cloudHistory, source: 'cloud' });
        return;
      }
    }
  } catch (_) {}
  chrome.storage.local.get(['analysisHistory'], r => {
    sendResponse({ history: r.analysisHistory || [], source: 'local' });
  });
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['geminiApiKey', 'openaiApiKey', 'activeProvider', 'selectedModel'], resolve);
  });
}

async function saveToLocalHistory(result, profileUrl) {
  return new Promise(resolve => {
    chrome.storage.local.get(['analysisHistory'], data => {
      const history = data.analysisHistory || [];
      history.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        profileUrl,
        overallScore: result.overallScore,
        category: result.category
      });
      chrome.storage.local.set({ analysisHistory: history.slice(0, 20) }, resolve);
    });
  });
}
