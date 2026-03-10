// sidebar.js — RND Upwork Profile Optimizer
// Features: Auth, Uploads, Suggestions, State Persistence, Score History

const ICONS = {
  photo: '[Photo]', title: '[Title]', overview: '[Overview]',
  portfolio: '[Portfolio]', skills: '[Skills]', workHistory: '[History]',
  rates: '[Rates]', compliance: '[Compliance]'
};

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro'   }
];

const OPENAI_MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast & cheap)' },
  { value: 'gpt-4o',      label: 'GPT-4o (best quality)'      },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo'                }
];

const ANALYSIS_TIMEOUT_MS = 90000; // 90 seconds

let profileData    = null;
let loadingTimer   = null;
let analysisTimeout = null;
let activeProvider = 'gemini';
let currentUser    = null;
let authFrame      = null;
let resumeText     = null;
let linkedinText   = null;
let isAnalyzing    = false;
let lastResultData = null;
let topSkills      = '';
let analysisCount  = 0;
let freeScanLimit  = 5;
let upgradeUrl     = 'https://rndexperts.com/upgrade';
let devUnlimited   = false;

const $ = id => document.getElementById(id);

const views = {
  ready:    $('readyView'),
  settings: $('settingsView'),
  loading:  $('loadingView'),
  error:    $('errorView'),
  results:  $('resultsView')
};

/**
 * Switches visible view in the sidebar body.
 *
 * @param {string} name - The view key to display
 */
function show(name) {
  Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });
  if (views[name]) views[name].style.display = 'block';
  
  // If showing the ready view, reset uploads and refresh last scan card
  if (name === 'ready') {
    resetUploadZones();

    const card = $('lastScanCard');
    if (card) {
      if (lastResultData) {
        // Re-render the card to ensure score/category are populated
        restoreState().then(saved => {
          if (saved && saved.lastResults) {
            showLastScanCard(saved.lastResults, saved.savedAt);
          } else {
            showLastScanCard(lastResultData, Date.now());
          }
        });
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    }
  }

  // Save current view to session storage for persistence
  saveState({ currentView: name });
}

/**
 * Resets both upload zones to their default empty state.
 */
function resetUploadZones() {
  ['resume', 'linkedin'].forEach(prefix => {
    const dropZone    = $(`${prefix}DropZone`);
    const zoneContent = $(`${prefix}ZoneContent`);
    const preview     = $(`${prefix}Preview`);
    const fileInput   = $(`${prefix}FileInput`);
    const errorEl     = $(`${prefix}Error`);
    if (!dropZone) return;

    dropZone.classList.remove('has-file');
    if (zoneContent) {
      zoneContent.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span>Drop PDF here or <strong>browse</strong></span>
      `;
      zoneContent.style.display = 'flex';
    }
    if (preview) preview.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (errorEl) errorEl.style.display = 'none';
  });

  // Clear stored text data
  resumeText = null;
  linkedinText = null;
  updateSourcesIndicator();
}

// ── Boot: check auth, restore state ───────────────────────────────────────
/**
 * Initializes the sidebar by checking auth session, restoring state, and loading settings.
 */
async function init() {
  const session = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_SESSION' }, resolve)
  );

  if (session && session.uid) {
    currentUser = session;
    renderUserBar(session);

    // Try to load state for the current user environment
    const saved = await restoreState();

    if (saved && saved.lastResults && saved.profileUrl) {
      // We have previous results saved locally. Let's see if it matches current page URL?
      // Actually, we'll just check if it matches later when PROFILE_DATA arrives.
      // For now, save it in globally accessible variables
      lastResultData = saved.lastResults;
      showLastScanCard(saved.lastResults, saved.savedAt);
    }
    
    if (saved && saved.currentView === 'loading') {
      // Analysis was in progress — show ready view so user can re-trigger
      show('ready');
    } else {
      show('ready');
    }
    loadSettings();
  } else {
    openAuthScreen();
  }

  initUploadHandlers();
  initSectionToggleHandler();
  initImageErrorHandlers();
}

/**
 * CSP-safe replacement for inline onerror handlers.
 */
function initImageErrorHandlers() {
  window.addEventListener('error', e => {
    if (e.target.tagName === 'IMG') {
      e.target.style.display = 'none';
    }
  }, true);
}

// ── Auth screen (iframe overlay) ──────────────────────────────────────────
/**
 * Opens the authentication screen as an overlay iframe.
 */
function openAuthScreen() {
  if (authFrame) return;
  authFrame = document.createElement('iframe');
  authFrame.src = chrome.runtime.getURL('auth/auth.html');
  authFrame.style.cssText = `
    position: fixed; inset: 0; width: 100%; height: 100%;
    border: none; z-index: 9999; background: #111418;
  `;
  document.body.appendChild(authFrame);
}

/**
 * Closes and removes the authentication overlay iframe.
 */
function closeAuthScreen() {
  if (authFrame) {
    authFrame.remove();
    authFrame = null;
  }
}

// ── Listen for messages (with origin validation) ──────────────────────────
const EXTENSION_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');

window.addEventListener('message', ({ data, origin }) => {
  if (origin !== EXTENSION_ORIGIN && !origin.startsWith('https://www.upwork.com')) {
    return;
  }

  if (data?.type === 'AUTH_SUCCESS') {
    currentUser = data.user;
    closeAuthScreen();
    renderUserBar(data.user);
    show('ready');
    loadSettings();
  }
  if (data?.type === 'CLOSE_SIDEBAR') {
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
  }
  if (data?.type === 'PROFILE_DATA') {
    profileData = data.data;
    renderProfileCard(data.data);
    // Upload card is always enabled since API keys are config-provided
    $('uploadCard')?.classList.remove('disabled');
    // If we have saved results, we check if they belong to this profile
    restoreState().then(saved => {
      if (saved && saved.lastResults && saved.profileUrl === data.data.profileUrl) {
        lastResultData = saved.lastResults;
        showLastScanCard(saved.lastResults, saved.savedAt);
      } else {
        $('lastScanCard').style.display = 'none';
      }
    });
  }
  if (data?.type === 'ANALYSIS_RESULT') {
    handleResult(data.data);
  }
});

// Trigger abort if sidebar is closed mid-scan
window.addEventListener('unload', () => {
  if (isAnalyzing) {
    chrome.runtime.sendMessage({ type: 'ABORT_ANALYSIS' });
  }
});

// ── User bar ───────────────────────────────────────────────────────────────
/**
 * Renders the user info bar.
 *
 * @param {object} user - The authenticated user object
 */
function renderUserBar(user) {
  $('userBar').style.display = 'flex';
  $('userName').textContent  = user.displayName || 'User';
  $('userEmail').textContent = user.email || '';

  if (user.photoURL) {
    $('userAvatarImg').src = user.photoURL;
    $('userAvatarImg').style.display = 'block';
    $('userAvatarInitial').style.display = 'none';
  } else {
    $('userAvatarInitial').textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
  }
}

// Sign out
$('signOutBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
  currentUser = null;
  $('userBar').style.display = 'none';
  clearState();
  openAuthScreen();
});

// ── Top Navigation ─────────────────────────────────────────────────────────
$('homeBtnSettings')?.addEventListener('click', () => show('ready'));
$('homeBtnResults')?.addEventListener('click', () => show('ready'));
$('closeBtn').addEventListener('click', () =>
  window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*'));

$('settingsBtn').addEventListener('click', () => show('settings'));
$('backBtn')?.addEventListener('click', () => show('ready'));


// ── View Last Report ───────────────────────────────────────────────────
$('viewLastReportBtn').addEventListener('click', () => {
  if (lastResultData) {
    renderResults(lastResultData);
    if (lastResultData.suggestions) {
      renderSuggestions(lastResultData.suggestions);
    }
  }
});

// ── Analysis (debounced) ───────────────────────────────────────────────────
$('analyzeBtn').addEventListener('click', triggerAnalysis);
$('retryBtn').addEventListener('click', triggerAnalysis);
$('reanalyzeBtn').addEventListener('click', () => {
  // Force re-analysis: clear cached hash so triggerAnalysis doesn't skip
  if (lastResultData) delete lastResultData._hash;
  triggerAnalysis();
});

// Copy URL
$('copyUrlBtn').addEventListener('click', () => {
  const url = $('profileUrl').href;
  if (url && url !== '#') {
    navigator.clipboard.writeText(url).then(() => {
      showCopyFeedback($('copyUrlBtn'));
    });
  }
});

// ── Provider + Model selects ───────────────────────────────────────────────
$('providerSelect').addEventListener('change', function () {
  activeProvider = this.value;
  updateModelOptions(activeProvider);
  saveProviderChoice();
});

// Model select change handler
$('modelSelect')?.addEventListener('change', saveProviderChoice);

// Top skills — save on blur
$('topSkillsInput')?.addEventListener('blur', () => {
  const sanitized = sanitizeSkills($('topSkillsInput').value);
  $('topSkillsInput').value = sanitized;
  topSkills = sanitized;
  chrome.storage.local.set({ topSkills: sanitized });
});

// ── Settings & Account ─────────────────────────────────────────────────────

// Confirmation Modal State Helper
let pendingAction = null;
function showConfirm(title, message, onConfirm) {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent = message;
  $('confirmModal').style.display = 'flex';
  pendingAction = onConfirm;
}
$('confirmCancelBtn').addEventListener('click', () => {
  $('confirmModal').style.display = 'none';
  pendingAction = null;
});
$('confirmActionBtn').addEventListener('click', () => {
  if (pendingAction) pendingAction();
  $('confirmModal').style.display = 'none';
  pendingAction = null;
});

// Account Actions
$('clearHistoryBtn').addEventListener('click', () => {
  showConfirm('Clear History?', 'This will permanently delete your analysis history. Your settings and API keys will be kept.', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
      showSaveMsg('History cleared successfully', 'ok');
    });
  });
});

$('clearAllDataBtn').addEventListener('click', () => {
  showConfirm('Clear All Saved Data?', 'This deletes EVERYTHING (API keys, model settings, and analysis history). This resets the extension to a fresh state.', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' }, () => {
      clearState();
      lastResultData = null;
      $('lastScanCard').style.display = 'none';
      showSaveMsg('All data cleared', 'ok');
    });
  });
});

$('deleteAccountBtn').addEventListener('click', () => {
  showConfirm('Delete Account & Data?', 'This will permanently delete your authentication account and all data stored locally on this device. This action cannot be undone.', () => {
    chrome.runtime.sendMessage({ type: 'DELETE_ACCOUNT' }, () => {
      currentUser = null;
      clearState();
      $('userBar').style.display = 'none';
      openAuthScreen();
    });
  });
});

// ── Settings ───────────────────────────────────────────────────────────────
/**
 * Loads saved settings from Chrome storage and updates UI controls.
 */
function loadSettings() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
    if (!res) return;
    activeProvider = res.activeProvider || 'gemini';
    $('providerSelect').value = activeProvider;
    updateModelOptions(activeProvider);
    if (res.selectedModel) $('modelSelect').value = res.selectedModel;

    // Usage tracking
    analysisCount = res.analysisCount || 0;
    freeScanLimit = res.freeScanLimit || 5;
    upgradeUrl = res.upgradeUrl || 'https://rndexperts.com/upgrade';
    devUnlimited = !!res.devUnlimited;
    updateUsageBar();

    // Set footer upgrade URL
    const upgradeBtn = $('footerUpgradeBtn');
    if (upgradeBtn) upgradeBtn.href = upgradeUrl;
  });

  // Restore saved top skills
  chrome.storage.local.get(['topSkills'], r => {
    if (r.topSkills) {
      topSkills = r.topSkills;
      $('topSkillsInput').value = topSkills;
    }
  });
}

/**
 * Updates the usage bar UI with current scan count.
 */
function updateUsageBar() {
  const bar = $('usageBar');
  if (!bar) return;

  // Hide for dev unlimited mode
  if (devUnlimited) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const remaining = Math.max(0, freeScanLimit - analysisCount);
  const usageText = $('usageText');
  const dotsEl = $('usageDots');

  // Action buttons
  const analyzeBtn = $('analyzeBtn');

  // Text
  if (remaining === 0) {
    usageText.textContent = 'No free scans remaining';
    usageText.className = 'usage-text usage-exhausted';
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Limit Reached`;
      analyzeBtn.style.opacity = '0.7';
      analyzeBtn.style.cursor = 'not-allowed';
    }
  } else {
    if (remaining <= 2) {
      usageText.textContent = `${remaining} of ${freeScanLimit} free scans remaining`;
      usageText.className = 'usage-text usage-low';
    } else {
      usageText.textContent = `${remaining} of ${freeScanLimit} free scans remaining`;
      usageText.className = 'usage-text';
    }
    
    // Ensure button is enabled if not analyzing
    if (analyzeBtn && !isAnalyzing) {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg> Analyze This Profile`;
      analyzeBtn.style.opacity = '1';
      analyzeBtn.style.cursor = 'pointer';
    }
  }

  // Dots
  let dotsHtml = '';
  const state = remaining === 0 ? 'usage-exhausted' : (remaining <= 2 ? 'usage-low' : '');
  for (let i = 0; i < freeScanLimit; i++) {
    const used = i < analysisCount;
    dotsHtml += `<span class="usage-dot${used ? ` used ${state}` : ''}"></span>`;
  }
  dotsEl.innerHTML = dotsHtml;
}

/**
 * Saves Gemini API key independently.
 * @deprecated API keys are now config-provided.
 */

/**
 * Saves OpenAI API key independently.
 * @deprecated API keys are now config-provided.
 */

/**
 * Saves just the provider and model selection.
 */
function saveProviderChoice() {
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { activeProvider, selectedModel: $('modelSelect').value } });
}

/**
 * Updates the model dropdown options based on selected provider.
 *
 * @param {string} provider - 'gemini' or 'openai'
 */
function updateModelOptions(provider) {
  const models = provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
  const sel    = $('modelSelect');
  const cur    = sel.value;
  sel.innerHTML = models.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  const match  = models.find(m => m.value === cur);
  if (match) sel.value = match.value;
}

/**
 * @deprecated API keys are now config-provided. No need to check.
 */

// ── Profile card ───────────────────────────────────────────────────────────
/**
 * Renders the profile card with freelancer name and URL.
 *
 * @param {object} data - The extracted profile data
 */
function renderProfileCard(data) {
  if (!data) return;
  $('profileName').textContent = data.freelancerName || 'Unknown Freelancer';
  const url = data.profileUrl || window.location.href;
  const urlEl = $('profileUrl');
  urlEl.textContent = url.length > 52 ? url.substring(0, 52) + '...' : url;
  urlEl.href = url;
}

// ── Upload Handlers ────────────────────────────────────────────────────────

/**
 * Initializes all upload-related event handlers.
 */
function initUploadHandlers() {
  setupUploadZone('resume', (text) => {
    resumeText = text;
    updateSourcesIndicator();
  }, () => {
    resumeText = null;
    updateSourcesIndicator();
  });

  setupUploadZone('linkedin', (text) => {
    linkedinText = text;
    updateSourcesIndicator();
  }, () => {
    linkedinText = null;
    updateSourcesIndicator();
  });

  setupTooltip('resumeInfoBtn', 'resumeTooltip');
  setupTooltip('linkedinInfoBtn', 'linkedinTooltip');
  setupTooltip('usageTooltipTrigger', 'usageTooltip');
}

/**
 * Sets up a file upload zone with drag-drop and click-to-browse.
 *
 * @param {string} prefix - 'resume' or 'linkedin'
 * @param {function} onSuccess - Callback with extracted text
 * @param {function} onRemove - Callback when file is removed
 */
function setupUploadZone(prefix, onSuccess, onRemove) {
  const dropZone   = $(`${prefix}DropZone`);
  const fileInput   = $(`${prefix}FileInput`);
  const zoneContent = $(`${prefix}ZoneContent`);
  const preview     = $(`${prefix}Preview`);
  const removeBtn   = $(`${prefix}RemoveBtn`);
  const errorEl     = $(`${prefix}Error`);

  if (!dropZone) return;

  dropZone.addEventListener('click', (e) => {
    if (dropZone.classList.contains('has-file')) return;
    if (e.target.closest('.file-remove')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0], prefix, onSuccess);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dropZone.classList.contains('has-file')) {
      dropZone.classList.add('dragover');
    }
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
    if (dropZone.classList.contains('has-file')) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0], prefix, onSuccess);
    }
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropZone.classList.remove('has-file');
    // Reset zone content back to default (clears any stuck spinner)
    zoneContent.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>Drop PDF here or <strong>browse</strong></span>
    `;
    zoneContent.style.display = 'flex';
    preview.style.display = 'none';
    errorEl.style.display = 'none';
    fileInput.value = '';
    onRemove();
  });
}

/**
 * Handles a selected/dropped file: validates, extracts text, updates UI.
 *
 * @param {File} file - The uploaded file
 * @param {string} prefix - 'resume' or 'linkedin'
 * @param {function} onSuccess - Callback with extracted text
 */
async function handleFile(file, prefix, onSuccess) {
  const dropZone   = $(`${prefix}DropZone`);
  const zoneContent = $(`${prefix}ZoneContent`);
  const preview     = $(`${prefix}Preview`);
  const fileName    = $(`${prefix}FileName`);
  const errorEl     = $(`${prefix}Error`);

  errorEl.style.display = 'none';

  try {
    const { validatePDFFile, extractTextFromPDF } = await import(chrome.runtime.getURL('lib/pdf-parser.js'));

    const validation = validatePDFFile(file);
    if (!validation.valid) {
      errorEl.textContent = validation.error;
      errorEl.style.display = 'block';
      return;
    }

    zoneContent.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="animation: spin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="28" stroke-dashoffset="7"/></svg>
      <span>Extracting text...</span>
    `;

    const text = await extractTextFromPDF(file);

    dropZone.classList.add('has-file');
    zoneContent.style.display = 'none';
    preview.style.display = 'flex';
    fileName.textContent = file.name;
    onSuccess(text);
  } catch (err) {
    zoneContent.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>Drop PDF here or <strong>browse</strong></span>
    `;
    errorEl.textContent = err.message || 'Failed to process file.';
    errorEl.style.display = 'block';
  }
}

/**
 * Sets up tooltip toggle behavior for info buttons.
 *
 * @param {string} btnId - Info button element ID
 * @param {string} tooltipId - Tooltip element ID
 */
function setupTooltip(btnId, tooltipId) {
  const btn = $(btnId);
  const tooltip = $(tooltipId);
  if (!btn || !tooltip) return;
  let visible = false;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    visible = !visible;
    document.querySelectorAll('.info-tooltip').forEach(t => t.classList.remove('visible'));
    if (visible) {
      tooltip.classList.add('visible');
    }
  });

  document.addEventListener('click', () => {
    tooltip.classList.remove('visible');
    visible = false;
  });
}

/**
 * Updates the analysis sources indicator text.
 */
function updateSourcesIndicator() {
  const sources = ['Upwork profile'];
  if (resumeText) sources.push('Resume');
  if (linkedinText) sources.push('LinkedIn');
  const el = $('sourcesText');
  if (el) el.textContent = `Analyzing: ${sources.join(' + ')}`;
}

/**
 * Shows the last scan card on the ready screen.
 *
 * @param {object} results - The saved result data
 * @param {number} timestamp - When it was saved
 */
function showLastScanCard(results, timestamp) {
  const card = $('lastScanCard');
  if (!card) return;
  const score = parseFloat(results.overallScore) || 0;
  
  // Format date nicely (e.g. "Today, 10:30 AM" or "Mar 9, 2026")
  const then = new Date(timestamp);
  const now = new Date();
  const isToday = then.toDateString() === now.toDateString();
  const dateStr = isToday 
    ? `Today, ${then.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
    : then.toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});

  $('lastScanDate').textContent = dateStr;
  $('lastScanScore').textContent = score.toFixed(1);
  $('lastScanCategory').textContent = results.category || scoreToCategory(score);

  // Set the ring dashoffset
  const arc = $('lastScanArc');
  if (arc) {
    const circ = 263.9;
    arc.style.strokeDashoffset = circ - (score / 10) * circ;
    // Set color based on score class
    const cls = scoreClass(score);
    if (cls === 'c-critical') arc.style.stroke = '#ef4444';
    if (cls === 'c-good') arc.style.stroke = '#f59e0b';
    if (cls === 'c-excellent') arc.style.stroke = '#22c55e';
    if (cls === 'c-elite') arc.style.stroke = '#3b82f6';
  }

  card.style.display = 'block';
}

// ── Section Toggle (event delegation — CSP safe) ──────────────────────────
/**
 * Sets up event delegation for section card expand/collapse.
 * Uses event delegation instead of inline onclick to comply with Chrome Extension CSP.
 */
function initSectionToggleHandler() {
  const sectionsList = $('sectionsList');
  if (!sectionsList) return;

  sectionsList.addEventListener('click', (e) => {
    const header = e.target.closest('.section-header');
    if (!header) return;
    const card = header.closest('.section-card');
    if (card) {
      card.classList.toggle('open');
    }
  });
}

// ── Trigger Analysis (debounced) ───────────────────────────────────────────
/**
 * Triggers profile analysis with debounce to prevent double-clicks.
 */
function triggerAnalysis() {
  if (isAnalyzing) return; // Debounce
  if (!currentUser) {
    openAuthScreen();
    return;
  }

  // Check if anything changed since last analysis
  const currentHash = getInputHash();
  if (lastResultData && lastResultData._hash === currentHash) {
    renderResults(lastResultData, true);
    if (lastResultData.suggestions) {
      renderSuggestions(lastResultData.suggestions);
    }
    return;
  }

  isAnalyzing = true;
  show('loading');
  
  // ... rest as before
  const providerText = $('loadingProviderText');
  if (providerText) {
    providerText.textContent = 'Processing with AI';
  }

  startLoadingSteps();

  if (analysisTimeout) clearTimeout(analysisTimeout);
  analysisTimeout = setTimeout(() => {
    if (isAnalyzing) {
      isAnalyzing = false;
      if (loadingTimer) clearInterval(loadingTimer);
      $('errorMsg').textContent = 'Analysis is taking longer than expected. Please try again.';
      show('error');
    }
  }, ANALYSIS_TIMEOUT_MS);

  window.parent.postMessage({
    type: 'ANALYZE_REQUEST',
    resumeText: resumeText || null,
    linkedinText: linkedinText || null,
    topSkills: sanitizeSkills($('topSkillsInput')?.value || '') || null
  }, '*');
}

/**
 * Sanitizes and validates the top skills input.
 * Strips HTML, limits to 5 skills, 30 chars each, alphanumeric + common chars only.
 *
 * @param {string} raw - Raw input value
 * @returns {string} Cleaned comma-separated skills string
 */
function sanitizeSkills(raw) {
  if (!raw || typeof raw !== 'string') return '';

  // Strip HTML tags
  let clean = raw.replace(/<[^>]*>/g, '');

  // Split by comma, trim, filter empties
  let skills = clean
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Limit to 5 skills
  skills = skills.slice(0, 5);

  // Per-skill: max 30 chars, only alphanumeric + spaces + dots + hyphens + plus + hash + slash
  skills = skills.map(s => {
    s = s.substring(0, 30);
    s = s.replace(/[^a-zA-Z0-9\s.\-+#/]/g, '');
    return s.trim();
  }).filter(s => s.length > 0);

  return skills.join(', ');
}

/**
 * Animates the loading step indicators.
 */
function startLoadingSteps() {
  const steps = document.querySelectorAll('.step-item');
  let i = 0;
  steps.forEach(s => s.classList.remove('active', 'done'));
  steps[0]?.classList.add('active');
  if (loadingTimer) clearInterval(loadingTimer);
  loadingTimer = setInterval(() => {
    if (i < steps.length - 1) {
      steps[i].classList.remove('active');
      steps[i].classList.add('done');
      i++;
      steps[i].classList.add('active');
    }
  }, 1600);
}

// ── Results ────────────────────────────────────────────────────────────────
/**
 * Handles the analysis result response.
 *
 * @param {object} response - The response from the background script
 */
function handleResult(response) {
  isAnalyzing = false;
  if (analysisTimeout) clearTimeout(analysisTimeout);
  if (loadingTimer) clearInterval(loadingTimer);

  if (response?.error === 'NOT_AUTHENTICATED') {
    currentUser = null;
    $('userBar').style.display = 'none';
    openAuthScreen();
    return;
  }

  // Update usage count if provided
  if (response.analysisCount !== undefined) {
    analysisCount = response.analysisCount;
    updateUsageBar();
  }

  if (!response || response.error) {
    if (response.error === 'LIMIT_REACHED') {
      $('errorMsg').innerHTML = `
        <div style="margin-bottom: 12px"><strong>Scan Limit Reached.</strong></div>
        You have used all ${freeScanLimit} free scans. Upgrade your account to continue optimizing profiles.
        <div style="margin-top: 16px;">
          <a href="${upgradeUrl}" target="_blank" rel="noopener" class="primary-btn" style="text-decoration:none; display:inline-block; width:auto; padding:8px 16px;">Upgrade Now</a>
        </div>
      `;
    } else {
      $('errorMsg').textContent = response?.message || 'Analysis failed. Please try again.';
    }
    show('error');
    return;
  }

  if (response.success && response.data) {
    const currentHash = getInputHash();
    response.data._hash = currentHash;
    lastResultData = response.data;
    renderResults(response.data);
    if (response.data.suggestions) {
      renderSuggestions(response.data.suggestions);
    }
    // Save state for persistence
    saveState({
      currentView: 'results',
      lastResults: response.data,
      profileUrl: profileData?.profileUrl
    });
  } else {
    $('errorMsg').textContent = 'Unexpected response. Please try again.';
    show('error');
  }
}

/**
 * Renders the profile analysis results (score card, priorities, sections).
 *
 * @param {object} data - The analysis data object
 */
function renderResults(data, isCached = false) {
  show('results');
  const score  = parseFloat(data.overallScore) || 0;
  const cat    = data.category || scoreToCategory(score);

  const scoreCard = document.querySelector('.score-card');
  if (scoreCard) scoreCard.className = `score-card cat-${cat.toLowerCase()}`;
  $('scoreNum').textContent      = score.toFixed(1);
  $('scoreCat').textContent      = cat;
  
  // Update header title if cached
  const titleEl = document.querySelector('.results-nav-title');
  if (titleEl) {
    titleEl.textContent = isCached ? 'Analysis Results (No changes detected)' : 'Analysis Results';
  }

  $('scoreDescText').textContent = data.categoryDescription || '';
  
  if ($('scorePts')) $('scorePts').style.display = 'none';

  const circ = 263.9;
  setTimeout(() => {
    const arc = $('scoreArc');
    if (arc) arc.style.strokeDashoffset = circ - (score / 10) * circ;
  }, 80);

  if (data.top3Priorities?.length) {
    $('prioritiesBlock').style.display = 'block';
    $('prioritiesList').innerHTML = data.top3Priorities.map(p => `
      <div class="priority-item">
        <div class="p-rank rank-${p.rank}">${p.rank}</div>
        <div class="p-content">
          <div class="p-section">${esc(p.section)}</div>
          <div class="p-action">${esc(p.action)}</div>
          ${p.potentialGain ? `<span class="p-gain">${esc(p.potentialGain)}</span>` : ''}
        </div>
      </div>`).join('');
  }

  if (data.sections?.length) {
    $('sectionsList').innerHTML = data.sections.map((s, i) => {
      const pct = s.maxPoints > 0 ? Math.round((s.earnedPoints / s.maxPoints) * 100) : Math.round(s.score * 10);
      const cls = scoreClass(s.score);
      return `
        <div class="section-card" id="sc${i}">
          <div class="section-header">
            <span class="sec-icon">${ICONS[s.id] || '[--]'}</span>
            <div class="sec-name-wrap">
              <div class="sec-name">${esc(s.name)}</div>
              <div class="sec-pts">${(s.earnedPoints||0).toFixed(1)} / ${s.maxPoints} pts</div>
            </div>
            <div class="sec-bar-wrap"><div class="sec-bar ${cls}" data-pct="${pct}" style="width:0%"></div></div>
            <div class="sec-score ${cls}">${(s.score||0).toFixed(1)}</div>
            <svg class="sec-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="section-body">
            ${s.strengths?.length ? `<div class="list-group"><div class="list-group-title s">Strengths</div><ul>${s.strengths.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${s.improvements?.length ? `<div class="list-group"><div class="list-group-title i">Improvements</div><ul>${s.improvements.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${s.quickWin ? `<div class="quick-win-block"><div class="qw-label">Quick Win</div><div class="qw-text">${esc(s.quickWin)}</div></div>` : ''}
          </div>
        </div>`;
    }).join('');

    setTimeout(() => {
      document.querySelectorAll('.sec-bar[data-pct]').forEach(b => { b.style.width = b.dataset.pct + '%'; });
    }, 150);
  }
}

/**
 * Renders the title and description suggestions in the results view.
 *
 * @param {object} data - The suggestions data
 */
function renderSuggestions(data) {
  const block = $('suggestionsBlock');
  if (!block) return;
  block.style.display = 'block';

  // Upwork-only titles
  if (data.upworkOnlyTitles?.length) {
    $('upworkTitlesGroup').style.display = 'block';
    $('upworkTitlesList').innerHTML = data.upworkOnlyTitles.map((t, i) =>
      renderSuggestionItem(i + 1, t.title, t.rationale)
    ).join('');
  }

  // Combined titles
  if (data.combinedTitles?.length) {
    $('combinedTitlesGroup').style.display = 'block';
    $('combinedTitlesList').innerHTML = data.combinedTitles.map((t, i) =>
      renderSuggestionItem(i + 1, t.title, t.rationale)
    ).join('');
  } else {
    $('combinedTitlesGroup').style.display = 'none';
  }

  // Description (rendered as structured HTML)
  if (data.description) {
    $('descriptionGroup').style.display = 'block';
    const formattedDesc = formatDescription(data.description);
    $('suggestedDescription').innerHTML = `
      <div class="suggestion-desc-text">
        ${formattedDesc}
        <button class="suggestion-copy-btn suggestion-desc-copy" data-text="${escAttr(data.description)}" title="Copy raw text">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>`;
  }

  // Attach copy handlers via event delegation
  block.addEventListener('click', (e) => {
    const btn = e.target.closest('.suggestion-copy-btn');
    if (!btn) return;
    const text = btn.dataset.text;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback(btn);
      });
    }
  });
}

/**
 * Formats the description from markdown-style bold headings into HTML.
 *
 * @param {string} text - The raw description text
 * @returns {string} HTML formatted description
 */
function formatDescription(text) {
  if (!text) return '';
  // Convert **Heading** to <strong>Heading</strong>
  let html = esc(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Convert newlines to <br>
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/**
 * Generates HTML for a single suggestion item.
 *
 * @param {number} rank - The suggestion rank
 * @param {string} text - The suggestion text
 * @param {string} rationale - The rationale/reasoning
 * @returns {string} HTML string
 */
function renderSuggestionItem(rank, text, rationale) {
  return `
    <div class="suggestion-item">
      <div class="suggestion-rank">${rank}</div>
      <div class="suggestion-content">
        <div class="suggestion-text">${esc(text)}</div>
        ${rationale ? `<div class="suggestion-rationale">${esc(rationale)}</div>` : ''}
      </div>
      <button class="suggestion-copy-btn" data-text="${escAttr(text)}" title="Copy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
    </div>`;
}

// ── Score History / Delta ──────────────────────────────────────────────────
/**
 * Fetches previous analyses for this profile URL and shows score delta.
 *
 * @param {number} currentScore - The current analysis score
 */
function fetchAndShowScoreDelta(currentScore) {
  if (!currentUser || !profileData?.profileUrl) return;

  chrome.runtime.sendMessage({
    type: 'GET_PROFILE_HISTORY',
    profileUrl: profileData.profileUrl
  }, (response) => {
    const bar = $('scoreDeltaBar');
    if (!bar) return;

    if (!response || !response.history || response.history.length < 2) {
      // No previous analysis to compare
      if (response?.history?.length === 1) {
        bar.style.display = 'flex';
        bar.className = 'score-delta-bar unchanged';
        $('scoreDeltaIcon').textContent = '--';
        $('scoreDeltaText').textContent = 'First analysis for this profile';
      }
      return;
    }

    // Compare with the second most recent (first is the current one we just saved)
    const previousScore = response.history[1].overallScore;
    const delta = (currentScore - previousScore).toFixed(1);

    bar.style.display = 'flex';

    if (delta > 0) {
      bar.className = 'score-delta-bar improved';
      $('scoreDeltaIcon').textContent = '+' + delta;
      $('scoreDeltaText').textContent = `Improved from ${previousScore.toFixed(1)} (previous analysis)`;
    } else if (delta < 0) {
      bar.className = 'score-delta-bar declined';
      $('scoreDeltaIcon').textContent = delta;
      $('scoreDeltaText').textContent = `Declined from ${previousScore.toFixed(1)} (previous analysis)`;
    } else {
      bar.className = 'score-delta-bar unchanged';
      $('scoreDeltaIcon').textContent = '0';
      $('scoreDeltaText').textContent = `Same score as previous analysis (${previousScore.toFixed(1)})`;
    }
  });
}

// ── State Persistence ──────────────────────────────────────────────────────
/**
 * Saves sidebar state to chrome.storage.local for persistence across close/reopen and sessions.
 *
 * @param {object} stateUpdate - Partial state to merge
 */
function saveState(stateUpdate) {
  try {
    chrome.storage.local.get(['sidebarState'], (r) => {
      const current = r?.sidebarState || {};
      const merged = { ...current, ...stateUpdate, savedAt: Date.now() };
      chrome.storage.local.set({ sidebarState: merged });
    });
  } catch (_) {}
}

/**
 * Restores saved sidebar state from chrome.storage.local.
 *
 * @returns {Promise<object|null>} Saved state or null
 */
function restoreState() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['sidebarState'], (r) => {
        resolve(r?.sidebarState || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Clears all saved sidebar state.
 */
function clearState() {
  try {
    chrome.storage.local.remove(['sidebarState']);
  } catch (_) {}
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Converts a numeric score to a category label.
 *
 * @param {number} s - The score value
 * @returns {string} Category name
 */
function scoreToCategory(s) {
  if (s <= 3) return 'Critical';
  if (s <= 6) return 'Good';
  if (s <= 8) return 'Excellent';
  return 'Elite';
}

/**
 * Returns CSS class for a score value.
 *
 * @param {number} s - The score value
 * @returns {string} CSS class
 */
function scoreClass(s) {
  if (s <= 3) return 'c-critical';
  if (s <= 6) return 'c-good';
  if (s <= 8) return 'c-excellent';
  return 'c-elite';
}

/**
 * Escapes HTML special characters in a string.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Escapes a string for use in HTML attributes.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for attributes
 */
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,' ');
}

/**
 * Shows a temporary message in the settings save area.
 *
 * @param {string} text - Message text
 * @param {string} type - 'ok' or 'err'
 */
/**
 * Shows a message in the settings view.
 * @param {string} text - Message text
 * @param {string} type - 'ok' or 'err'
 */
function showSaveMsg(text, type) {
  const el = $('saveMsg');
  if (!el) return;
  el.textContent = text; el.className = `save-msg ${type}`;
  setTimeout(() => { if ($('saveMsg')) { el.textContent=''; el.className='save-msg'; } }, 3000);
}

/**
 * Shows visual feedback after copying text.
 * Swaps icon for a checkmark temporarily.
 * @param {HTMLElement} btn - The button element
 */
function showCopyFeedback(btn) {
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = originalHtml;
  }, 1500);
}

/**
 * Simple hash function for string comparison.
 */
function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; 
  }
  return hash.toString();
}

/**
 * Generates a unique hash for the current analysis inputs.
 */
function getInputHash() {
  const inputs = {
    p: profileData,
    r: resumeText,
    l: linkedinText,
    provider: activeProvider
  };
  return hashStr(JSON.stringify(inputs));
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
