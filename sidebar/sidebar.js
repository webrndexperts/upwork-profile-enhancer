// sidebar.js — RND Upwork Profile Optimizer (with Google Auth)

const ICONS = {
  photo: '📷', title: '✍️', overview: '📝',
  portfolio: '🗂️', skills: '⚡', workHistory: '⭐',
  rates: '💰', compliance: '✅'
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

let profileData    = null;
let loadingTimer   = null;
let activeProvider = 'gemini';
let currentUser    = null;
let authFrame      = null;

const $ = id => document.getElementById(id);

const views = {
  ready:    $('readyView'),
  settings: $('settingsView'),
  loading:  $('loadingView'),
  error:    $('errorView'),
  results:  $('resultsView')
};

function show(name) {
  Object.values(views).forEach(v => { v.style.display = 'none'; });
  if (views[name]) views[name].style.display = 'block';
}

// ── Boot: check auth first ─────────────────────────────────────────────────
async function init() {
  show('loading');
  // Quick single loading step — just checking auth
  const session = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_SESSION' }, resolve)
  );

  if (session && session.uid) {
    currentUser = session;
    renderUserBar(session);
    show('ready');
    loadSettings();
  } else {
    // Not logged in → show auth screen
    openAuthScreen();
  }
}

// ── Auth screen (iframe overlay) ──────────────────────────────────────────
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

function closeAuthScreen() {
  if (authFrame) {
    authFrame.remove();
    authFrame = null;
  }
}

// ── Listen for auth result from auth iframe ────────────────────────────────
window.addEventListener('message', ({ data }) => {
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
    checkApiKey();
  }
  if (data?.type === 'ANALYSIS_RESULT') {
    handleResult(data.data);
  }
});

// ── User bar ───────────────────────────────────────────────────────────────
function renderUserBar(user) {
  $('userBar').style.display = 'flex';
  $('userName').textContent  = user.displayName || 'User';
  $('userEmail').textContent = user.email || '';

  // Avatar
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
  openAuthScreen();
});

// ── Header buttons ─────────────────────────────────────────────────────────
$('closeBtn').addEventListener('click', () =>
  window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*'));

$('settingsBtn').addEventListener('click', () => show('settings'));
$('backBtn').addEventListener('click', () => { show('ready'); checkApiKey(); });
$('goToSettingsLink')?.addEventListener('click', e => { e.preventDefault(); show('settings'); });

// ── Analysis ───────────────────────────────────────────────────────────────
$('analyzeBtn').addEventListener('click', triggerAnalysis);
$('retryBtn').addEventListener('click', triggerAnalysis);
$('reanalyzeBtn').addEventListener('click', triggerAnalysis);

// Copy URL
$('copyUrlBtn').addEventListener('click', () => {
  const url = $('profileUrl').href;
  if (url && url !== '#') {
    navigator.clipboard.writeText(url).then(() => {
      $('copyUrlBtn').classList.add('copied');
      setTimeout(() => $('copyUrlBtn').classList.remove('copied'), 1500);
    });
  }
});

// ── Provider + Model selects ───────────────────────────────────────────────
$('providerSelect').addEventListener('change', function () {
  activeProvider = this.value;
  updateModelOptions(activeProvider);
  updateProviderNote(activeProvider);
  saveProviderChoice();
  checkApiKey();
});

// Provider tabs in settings
document.querySelectorAll('.provider-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    const p = this.dataset.provider;
    $('geminiSettings').style.display = p === 'gemini' ? 'block' : 'none';
    $('openaiSettings').style.display = p === 'openai' ? 'block' : 'none';
  });
});

// Key toggles
makeToggle('toggleGeminiBtn', 'geminiKeyInput');
makeToggle('toggleOpenAIBtn', 'openaiKeyInput');
function makeToggle(btnId, inputId) {
  let shown = false;
  $(btnId).addEventListener('click', () => {
    shown = !shown;
    $(inputId).type = shown ? 'text' : 'password';
  });
}

$('saveApiBtn').addEventListener('click', saveAllSettings);

$('clearHistoryBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
    $('clearHistoryBtn').textContent = '✓ Cleared';
    setTimeout(() => $('clearHistoryBtn').textContent = 'Clear Analysis History', 2000);
  });
});

// ── Settings ───────────────────────────────────────────────────────────────
function loadSettings() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
    if (!res) return;
    activeProvider = res.activeProvider || 'gemini';
    $('providerSelect').value = activeProvider;
    updateModelOptions(activeProvider);
    updateProviderNote(activeProvider);
    if (res.selectedModel) $('modelSelect').value = res.selectedModel;
    if (res.geminiApiKey) $('geminiKeyInput').value = res.geminiApiKey;
    if (res.openaiApiKey) $('openaiKeyInput').value = res.openaiApiKey;
    checkApiKey();
  });
}

function saveAllSettings() {
  const settings = {
    activeProvider,
    selectedModel: $('modelSelect').value,
    geminiApiKey:  $('geminiKeyInput').value.trim(),
    openaiApiKey:  $('openaiKeyInput').value.trim()
  };
  const keyField = activeProvider === 'openai' ? settings.openaiApiKey : settings.geminiApiKey;
  if (!keyField) { showSaveMsg('Enter a key for the active provider', 'err'); return; }
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, () => {
    showSaveMsg('✓ Settings saved!', 'ok');
    checkApiKey();
  });
}

function saveProviderChoice() {
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { activeProvider, selectedModel: $('modelSelect').value } });
}

function updateModelOptions(provider) {
  const models = provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
  const sel    = $('modelSelect');
  const cur    = sel.value;
  sel.innerHTML = models.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  const match  = models.find(m => m.value === cur);
  if (match) sel.value = match.value;
}

function updateProviderNote(provider) {
  const note = $('providerNote');
  note.textContent = provider === 'openai'
    ? 'Requires OpenAI credits · platform.openai.com'
    : 'Free via Google AI Studio';
  note.style.color = provider === 'openai' ? '#f0b942' : '';
}

function checkApiKey() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
    const warn     = $('apiKeyWarning');
    const btn      = $('analyzeBtn');
    const provider = res?.activeProvider || 'gemini';
    const key      = provider === 'openai' ? res?.openaiApiKey : res?.geminiApiKey;
    if (!key) {
      warn.style.display = 'flex';
      const txt = $('apiKeyWarningText');
      if (txt) {
        txt.innerHTML = `Add your ${provider === 'openai' ? 'OpenAI' : 'Gemini'} key in <a href="#" id="goToSettingsLink">Settings</a>.`;
        document.getElementById('goToSettingsLink')?.addEventListener('click', e => { e.preventDefault(); show('settings'); });
      }
      btn.disabled = true;
    } else {
      warn.style.display = 'none';
      btn.disabled = false;
    }
  });
}

// ── Profile card ───────────────────────────────────────────────────────────
function renderProfileCard(data) {
  if (!data) return;
  $('profileName').textContent = data.freelancerName || 'Unknown Freelancer';
  const url = data.profileUrl || window.location.href;
  const urlEl = $('profileUrl');
  urlEl.textContent = url.length > 52 ? url.substring(0, 52) + '…' : url;
  urlEl.href = url;
}

function triggerAnalysis() {
  // Guard: must be logged in
  if (!currentUser) {
    openAuthScreen();
    return;
  }
  show('loading');
  startLoadingSteps();
  window.parent.postMessage({ type: 'ANALYZE_REQUEST' }, '*');
}

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
function handleResult(response) {
  if (loadingTimer) clearInterval(loadingTimer);

  // Auth error — re-prompt login
  if (response?.error === 'NOT_AUTHENTICATED') {
    currentUser = null;
    $('userBar').style.display = 'none';
    openAuthScreen();
    return;
  }

  if (!response || response.error) {
    $('errorMsg').textContent = response?.message || 'Analysis failed. Please try again.';
    show('error');
    return;
  }

  if (response.success && response.data) {
    renderResults(response.data);
  } else {
    $('errorMsg').textContent = 'Unexpected response. Please try again.';
    show('error');
  }
}

function renderResults(data) {
  show('results');
  const score  = parseFloat(data.overallScore) || 0;
  const cat    = data.category || scoreToCategory(score);

  document.querySelector('.score-card').className = `score-card cat-${cat.toLowerCase()}`;
  $('scoreNum').textContent      = score.toFixed(1);
  $('scoreCat').textContent      = cat;
  $('scoreDescText').textContent = data.categoryDescription || '';
  $('scorePts').textContent      = data.totalPoints && data.maxPoints
    ? `${parseFloat(data.totalPoints).toFixed(2)} / ${data.maxPoints} pts` : '';

  const circ = 263.9;
  setTimeout(() => {
    $('scoreArc').style.strokeDashoffset = circ - (score / 10) * circ;
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
          <div class="section-header" onclick="toggle(${i})">
            <span class="sec-icon">${ICONS[s.id] || '📊'}</span>
            <div class="sec-name-wrap">
              <div class="sec-name">${esc(s.name)}</div>
              <div class="sec-pts">${(s.earnedPoints||0).toFixed(1)} / ${s.maxPoints} pts</div>
            </div>
            <div class="sec-bar-wrap"><div class="sec-bar ${cls}" data-pct="${pct}" style="width:0%"></div></div>
            <div class="sec-score ${cls}">${(s.score||0).toFixed(1)}</div>
            <svg class="sec-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="section-body">
            ${s.strengths?.length ? `<div class="list-group"><div class="list-group-title s">✅ Strengths</div><ul>${s.strengths.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${s.improvements?.length ? `<div class="list-group"><div class="list-group-title i">⚠️ Improvements</div><ul>${s.improvements.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${s.quickWin ? `<div class="quick-win-block"><div class="qw-label">🎯 Quick Win</div><div class="qw-text">${esc(s.quickWin)}</div></div>` : ''}
          </div>
        </div>`;
    }).join('');

    setTimeout(() => {
      document.querySelectorAll('.sec-bar[data-pct]').forEach(b => { b.style.width = b.dataset.pct + '%'; });
    }, 150);
  }
}

function toggle(i) { document.getElementById(`sc${i}`)?.classList.toggle('open'); }

function scoreToCategory(s) {
  if (s <= 3) return 'Critical';
  if (s <= 6) return 'Good';
  if (s <= 8) return 'Excellent';
  return 'Elite';
}
function scoreClass(s) {
  if (s <= 3) return 'c-critical';
  if (s <= 6) return 'c-good';
  if (s <= 8) return 'c-excellent';
  return 'c-elite';
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showSaveMsg(text, type) {
  const el = $('saveMsg');
  el.textContent = text; el.className = `save-msg ${type}`;
  setTimeout(() => { el.textContent=''; el.className='save-msg'; }, 3000);
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
