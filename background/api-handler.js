// api-handler.js - Secure Backend Proxy Communications
// ─────────────────────────────────────────────────────────────────────────────────────

import { CONFIG } from '../config/config.js';

/**
 * Analyzes profile data by proxying the request through the secure PHP backend.
 * The backend handles assembling the massive AI prompt, enforcing usage limits,
 * and securely holding the OpenAI/Gemini API keys.
 *
 * @param {object} profileData - Extracted profile data from the DOM
 * @param {string|null} resumeText - Text from uploaded resume PDF
 * @param {string|null} linkedinText - Text from uploaded LinkedIn PDF
 * @param {string|null} topSkills - User-entered top skills
 * @param {string} provider - 'openai' or 'gemini'
 * @param {string} model - Specific model string (e.g., 'gpt-4o-mini')
 * @param {string} idToken - Firebase Auth JWT Token
 * @returns {Promise<object>} The scored analysis result
 */
export async function analyzeProfile(profileData, resumeText, linkedinText, topSkills, provider = 'gemini', model = 'gemini-2.0-flash', idToken) {
  if (!idToken) {
    throw new Error('Authentication required for analysis.');
  }

  // Ensure trailing slash or format matches
  const endpoint = CONFIG.BACKEND_URL.endsWith('/') 
    ? `${CONFIG.BACKEND_URL}index.php` 
    : `${CONFIG.BACKEND_URL}/index.php`;

  const payload = {
    action: 'analyze',
    provider,
    model,
    profileData,
    resumeText,
    linkedinText,
    topSkills
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await response.text();
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch(e) {
      console.error("Failed to parse backend response as JSON:", bodyText);
      throw new Error("Invalid response from analysis server.");
    }

    if (!response.ok || !data.success) {
      // Backend handles limiting and returns 403 LIMIT_REACHED
      if (response.status === 403 || data.error === 'LIMIT_REACHED') {
        const err = new Error('Scan Limit Reached.');
        err.name = 'LIMIT_REACHED';
        throw err;
      }
      throw new Error(data.message || 'Analysis failed on the server.');
    }

    return data.data; // The actual JSON response built by the LLM
  } catch (error) {
    console.error('Backend Proxy Analysis Error:', error);
    throw error;
  }
}

/**
 * Retrieves the current usage count securely from the backend proxy.
 *
 * @param {string} idToken - Firebase Auth JWT Token
 * @returns {Promise<number>} The current count of successful scans
 */
export async function getBackendUsageCount(idToken) {
  if (!idToken) return 0;

  const endpoint = CONFIG.BACKEND_URL.endsWith('/') 
    ? `${CONFIG.BACKEND_URL}index.php` 
    : `${CONFIG.BACKEND_URL}/index.php`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ action: 'get_usage' })
    });

    const data = await response.json();
    if (data.success && typeof data.analysisCount === 'number') {
      return data.analysisCount;
    }
  } catch (e) {
    console.error('Failed to get usage count from backend proxy', e);
  }
  return 0;
}
