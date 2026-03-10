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

  // Go button
  $('goBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_SIDEBAR' });
      window.close();
    });
  });
});

// CSP-safe replacement for inline onerror handlers
window.addEventListener('error', e => {
  if (e.target.tagName === 'IMG') {
    e.target.style.display = 'none';
  }
}, true);
