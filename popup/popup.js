document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  // Check tab
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const url = tabs[0]?.url || '';
    const isProfile = url.includes('/freelancers/') || url.includes('/profile/');
    const isUpwork  = url.includes('upwork.com');

    if (isProfile) {
      $('statusBox').classList.add('ready');
      $('statusIconWrap').innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
      $('statusMsg').textContent = 'Profile detected! Open the analyzer.';
      $('goBtn').disabled = false;
    } else if (isUpwork) {
      $('statusMsg').textContent = 'Go to a freelancer profile page to analyze.';
    }
  });

  // History
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, res => {
    if (res?.history?.length) {
      $('historySection').style.display = 'block';
      $('historyList').innerHTML = res.history.slice(0, 3).map(h => `
        <div class="history-item">
          <div><div class="hist-score">${h.overallScore}/10</div><div class="hist-cat">${h.category}</div></div>
          <div class="hist-date">${new Date(h.timestamp).toLocaleDateString()}</div>
        </div>`).join('');
    }
  });

  // Load key
  chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, res => {
    if (res?.apiKey) $('apiInput').value = res.apiKey;
  });

  // Go button
  $('goBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_SIDEBAR' });
      window.close();
    });
  });

  // Nav
  $('gearBtn').addEventListener('click', () => { $('mainView').style.display='none'; $('settingsView').style.display='block'; });
  $('backBtn').addEventListener('click', () => { $('settingsView').style.display='none'; $('mainView').style.display='block'; });

  // Toggle key
  let shown = false;
  $('toggleBtn').addEventListener('click', () => { shown=!shown; $('apiInput').type = shown?'text':'password'; });

  // Save
  $('saveBtn').addEventListener('click', () => {
    const k = $('apiInput').value.trim();
    if (!k) { msg('Enter a key first', 'err'); return; }
    chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey: k }, () => msg('✓ Saved!', 'ok'));
  });

  // Clear
  $('clearBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
      $('clearBtn').textContent = '✓ Cleared';
      setTimeout(() => $('clearBtn').textContent = 'Clear Analysis History', 2000);
    });
  });

  function msg(text, type) {
    const el = $('saveMsg');
    el.textContent = text; el.className = `s-msg ${type}`;
    setTimeout(() => { el.textContent=''; el.className='s-msg'; }, 3000);
  }
});

// CSP-safe replacement for inline onerror handlers
window.addEventListener('error', e => {
  if (e.target.tagName === 'IMG') {
    e.target.style.display = 'none';
  }
}, true);
