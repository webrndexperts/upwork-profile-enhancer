// auth.js — Login screen logic

// CSP-safe replacement for inline onerror handlers
window.addEventListener('error', e => {
  if (e.target.tagName === 'IMG') {
    e.target.style.display = 'none';
  }
}, true);

document.getElementById('closeBtn').addEventListener('click', () => {
  window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
});

document.getElementById('signInBtn').addEventListener('click', handleSignIn);

async function handleSignIn() {
  const btn     = document.getElementById('signInBtn');
  const loading = document.getElementById('signinLoading');
  const error   = document.getElementById('signinError');

  // Show loading
  btn.style.display     = 'none';
  loading.style.display = 'flex';
  error.style.display   = 'none';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'SIGN_IN' });

    if (response?.success) {
      // Tell parent (sidebar iframe container / content script) user is logged in
      window.parent.postMessage({
        type: 'AUTH_SUCCESS',
        user: response.user
      }, '*');
    } else {
      showError(response?.error || 'Sign in failed. Please try again.');
      btn.style.display     = 'flex';
      loading.style.display = 'none';
    }
  } catch (err) {
    showError('Could not connect. Please try again.');
    btn.style.display     = 'flex';
    loading.style.display = 'none';
  }
}

function showError(msg) {
  const el = document.getElementById('signinError');
  document.getElementById('signinErrorText').textContent = msg;
  el.style.display = 'flex';
}
