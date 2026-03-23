// content.js - Main content script for Upwork Profile Optimizer - Upliftio

(function () {
  'use strict';

  // Prevent double injection
  if (window.__upliftioUpworkOptimizer) return;
  window.__upliftioUpworkOptimizer = true;

  let floatingBtn = null;
  let sidebarFrame = null;
  let isLoggedIn = false;
  let isProfilePage = false;

  // Initialize
  init();

  /**
   * Entry point: detect login state, page type, and set up listeners.
   */
  function init() {
    checkLoginAndPage();
    observeDOMChanges();
    setupMessageListener();
  }

  /**
   * Checks login state and profile page detection, toggles floating button.
   */
  function checkLoginAndPage() {
    isLoggedIn = detectLogin();
    isProfilePage = detectProfilePage();

    if (isLoggedIn && isProfilePage) {
      showFloatingButton();
    } else {
      hideFloatingButton();
    }
  }

  /**
   * Detects if the user is logged in on Upwork using multiple selector strategies.
   *
   * @returns {boolean}
   */
  function detectLogin() {
    const selectors = [
      '[data-test="nav-user-menu"]',
      '.nav-user-menu',
      '[data-test="up-avatar"]',
      '.up-avatar',
      'header [href*="/freelancers/"]',
      'nav [class*="user"]',
      '[data-test="header-logged-in"]',
      '.header-logged-in'
    ];
    return selectors.some(sel => document.querySelector(sel) !== null);
  }

  /**
   * Detects if the current page is a freelancer profile page.
   *
   * @returns {boolean}
   */
  function detectProfilePage() {
    const url = window.location.href;
    return (
      url.includes('/freelancers/') ||
      url.includes('/profile/') ||
      url.includes('upwork.com/freelancers/~') ||
      document.querySelector('[data-test="freelancer-profile"]') !== null ||
      document.querySelector('.freelancer-profile') !== null ||
      document.querySelector('[class*="profile-header"]') !== null
    );
  }

  /**
   * Creates and shows the floating "Upliftio Profile Scoring" button.
   */
  function showFloatingButton() {
    if (floatingBtn) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'upliftio-optimizer-btn';
    
    try {
      const iconUrl = chrome.runtime.getURL('assets/icons/icon32.png');
      floatingBtn.innerHTML = `
        <div class="upliftio-btn-inner">
          <img class="upliftio-btn-icon" src="${iconUrl}" alt="Upliftio"/>
          <span>Upliftio Profile Scoring</span>
        </div>
      `;
    } catch (error) {
      if (error.message.includes('Extension context invalidated')) {
        // Fallback to text-only button if extension context is invalidated
        floatingBtn.innerHTML = `
          <div class="upliftio-btn-inner">
            <span>🔍 Upliftio Profile Scoring</span>
          </div>
        `;
      } else {
        console.error('Error getting extension URL:', error);
        return;
      }
    }
    
    floatingBtn.addEventListener('click', handleButtonClick);
    document.body.appendChild(floatingBtn);

    // Fade in
    requestAnimationFrame(() => {
      floatingBtn.classList.add('upliftio-btn-visible');
    });
  }

  /**
   * Hides and removes the floating button with a fade-out animation.
   */
  function hideFloatingButton() {
    if (!floatingBtn) return;
    floatingBtn.classList.remove('upliftio-btn-visible');
    setTimeout(() => {
      if (floatingBtn && floatingBtn.parentNode) {
        floatingBtn.parentNode.removeChild(floatingBtn);
        floatingBtn = null;
      }
    }, 300);
  }

  /**
   * Handles click on the floating button — toggles or opens sidebar.
   */
  function handleButtonClick() {
    if (sidebarFrame) {
      toggleSidebar();
      return;
    }
    openSidebar();
  }

  /**
   * Opens the sidebar iframe with an overlay backdrop.
   */
  function openSidebar() {
    try {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.id = 'upliftio-overlay';
      overlay.addEventListener('click', closeSidebar);
      document.body.appendChild(overlay);

      // Create sidebar iframe
      sidebarFrame = document.createElement('iframe');
      sidebarFrame.id = 'upliftio-sidebar-frame';
      sidebarFrame.src = chrome.runtime.getURL('sidebar/sidebar.html');
      sidebarFrame.setAttribute('allowtransparency', 'true');
      sidebarFrame.setAttribute('allow', 'clipboard-write');
      document.body.appendChild(sidebarFrame);

      // Collect profile data and send to iframe when ready
      sidebarFrame.addEventListener('load', () => {
        const profileData = extractProfileData();
        setTimeout(() => {
          sidebarFrame.contentWindow.postMessage({
            type: 'PROFILE_DATA',
            data: profileData
          }, '*');
        }, 300);
      });

      requestAnimationFrame(() => {
        overlay.classList.add('upliftio-overlay-visible');
        sidebarFrame.classList.add('upliftio-sidebar-visible');
      });

      // Hide floating button while sidebar is open
      if (floatingBtn) floatingBtn.style.display = 'none';

      document.body.classList.add('upliftio-sidebar-open');
    } catch (error) {
      if (error.message.includes('Extension context invalidated')) {
        console.warn('Upliftio Profile Optimizer: Extension was updated/reloaded. Please refresh the page to continue using the extension.');
        // Clean up any partially created elements
        const overlay = document.getElementById('upliftio-overlay');
        if (overlay) overlay.remove();
        if (sidebarFrame) {
          sidebarFrame.remove();
          sidebarFrame = null;
        }
      } else {
        console.error('Error opening sidebar:', error);
      }
    }
  }

  /**
   * Closes the sidebar iframe and removes the overlay.
   */
  function closeSidebar() {
    const overlay = document.getElementById('upliftio-overlay');
    if (overlay) {
      overlay.classList.remove('upliftio-overlay-visible');
      setTimeout(() => overlay.remove(), 300);
    }
    if (sidebarFrame) {
      sidebarFrame.classList.remove('upliftio-sidebar-visible');
      setTimeout(() => {
        if (sidebarFrame) {
          sidebarFrame.remove();
          sidebarFrame = null;
        }
      }, 350);
    }
    document.body.classList.remove('upliftio-sidebar-open');

    // Show floating button again
    if (floatingBtn) floatingBtn.style.display = '';
  }

  /**
   * Toggles the sidebar open/closed.
   */
  function toggleSidebar() {
    if (sidebarFrame) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  /**
   * Extracts profile data from the Upwork DOM.
   *
   * @returns {object} Extracted profile data
   */
  function extractProfileData() {
    const data = {
      profileUrl: window.location.href,
      extractedAt: new Date().toISOString()
    };

    // Profile photo
    const photoSelectors = [
      '[data-test="up-avatar"] img',
      '.up-avatar img',
      '.profile-photo img',
      '[class*="avatar"] img',
      'img[class*="portrait"]'
    ];
    data.hasProfilePhoto = photoSelectors.some(sel => document.querySelector(sel) !== null);
    const photoEl = photoSelectors.map(s => document.querySelector(s)).find(Boolean);
    data.profilePhotoUrl = photoEl?.src || null;

    // Professional title
    const titleSelectors = [
      '[data-test="freelancer-title"]',
      '.freelancer-title',
      'h2[class*="title"]',
      '[class*="profile-title"]',
      'h1 + p',
      '[class*="professional-role"]'
    ];
    const titleEl = titleSelectors.map(s => document.querySelector(s)).find(Boolean);
    data.professionalTitle = titleEl?.textContent?.trim() || extractByPattern('title');

    // Overview
    const overviewSelectors = [
      '[data-test="about-me-overview"]',
      '[data-test="freelancer-overview"]',
      '.freelancer-overview',
      '[class*="overview"]',
      '[class*="description"]',
      'section[class*="about"] p'
    ];
    const overviewEl = overviewSelectors.map(s => document.querySelector(s)).find(Boolean);
    data.overview = overviewEl?.textContent?.trim() || '';
    data.overviewWordCount = data.overview.split(/\s+/).filter(Boolean).length;

    // Skills
    const skillsSelectors = [
      '[data-test="up-skills"] [data-test="skill"]',
      '[data-test="freelancer-profile-skills"] span',
      '.skills-section [class*="skill"]',
      '[class*="skill-badge"]',
      'section[class*="skills"] span'
    ];
    let skills = [];
    for (const sel of skillsSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        skills = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
        break;
      }
    }
    data.skills = skills;
    data.skillsCount = skills.length;

    // Portfolio
    const portfolioSelectors = [
      '[data-test="portfolio-item"]',
      '[class*="portfolio-item"]',
      '[class*="portfolio"] li',
      'section[class*="portfolio"] [class*="item"]'
    ];
    let portfolioCount = 0;
    for (const sel of portfolioSelectors) {
      const items = document.querySelectorAll(sel);
      if (items.length > 0) {
        portfolioCount = items.length;
        break;
      }
    }
    data.portfolioCount = portfolioCount;

    // Work history / job success
    const jsSelectors = [
      '[data-test="job-success-score"]',
      '[class*="job-success"]',
      '[class*="success-score"]',
      'span[class*="percent"]'
    ];
    const jsEl = jsSelectors.map(s => document.querySelector(s)).find(Boolean);
    data.jobSuccessScore = jsEl?.textContent?.trim() || null;

    // Earnings / total jobs
    const earningsEl = document.querySelector('[data-test="total-earnings"], [class*="total-earnings"], [class*="earnings"]');
    data.totalEarnings = earningsEl?.textContent?.trim() || null;

    const jobsEl = document.querySelector('[data-test="total-jobs"], [class*="total-jobs"]');
    data.totalJobs = jobsEl?.textContent?.trim() || null;

    // Rate
    const rateSelectors = [
      '[data-test="hourly-rate"]',
      '[class*="hourly-rate"]',
      '[class*="rate"]',
      'span[class*="price"]'
    ];
    const rateEl = rateSelectors.map(s => document.querySelector(s)).find(Boolean);
    data.hourlyRate = rateEl?.textContent?.trim() || null;

    // Availability
    const availEl = document.querySelector('[data-test="availability-status"], [class*="availability"]');
    data.availability = availEl?.textContent?.trim() || null;

    // Profile completeness indicator
    const completeEl = document.querySelector('[data-test="profile-completeness"], [class*="completeness"], [class*="profile-strength"]');
    data.profileCompleteness = completeEl?.textContent?.trim() || null;

    // Reviews
    const reviewEls = document.querySelectorAll('[data-test="review-text"], [class*="review-text"]');
    data.reviewCount = reviewEls.length;
    data.recentReviews = Array.from(reviewEls).slice(0, 3).map(el => el.textContent.trim());

    // Name
    const nameEl = document.querySelector('h1, [class*="profile-name"], [data-test="freelancer-name"]');
    data.freelancerName = nameEl?.textContent?.trim() || 'Freelancer';

    // Full page text for AI context
    data.pageText = document.body.innerText.substring(0, 5000);

    return data;
  }

  /**
   * Fallback extraction using page text patterns.
   *
   * @param {string} type - The data type to extract
   * @returns {string} Extracted text
   */
  function extractByPattern(type) {
    const text = document.body.innerText;
    if (type === 'title') {
      const match = text.match(/^(.{10,80})\n/m);
      return match ? match[1].trim() : '';
    }
    return '';
  }

  /**
   * Sets up message listeners for communication between content script,
   * sidebar iframe, and background script.
   */
  function setupMessageListener() {
    // Handle messages from popup (chrome.tabs.sendMessage)
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'OPEN_SIDEBAR') {
        openSidebar();
      }
    });

    // Cache extension origin at script load to avoid hitting chrome.runtime
    // when the extension context is invalidated (e.g. extension updated/reloaded).
    let extensionOrigin = '';
    try {
      extensionOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
    } catch(e) { /* ignore */ }

    window.addEventListener('message', (event) => {
      try {
        // Origin validation — only accept from our extension
        if (event.origin !== extensionOrigin && event.origin !== window.location.origin) {
          return;
        }

        if (event.data?.type === 'CLOSE_SIDEBAR') {
          closeSidebar();
        }
        if (event.data?.type === 'ANALYZE_REQUEST') {
          const profileData = extractProfileData();

          // Pass along any document texts and skills from the sidebar
          if (event.data.resumeText) {
            profileData.resumeText = event.data.resumeText;
          }
          if (event.data.linkedinText) {
            profileData.linkedinText = event.data.linkedinText;
          }
          if (event.data.topSkills) {
            profileData.topSkills = event.data.topSkills;
          }

          try {
            chrome.runtime.sendMessage({
              type: 'ANALYZE_PROFILE',
              data: profileData
            }, (response) => {
              if (chrome.runtime.lastError) {
                 console.warn('Analysis message failed:', chrome.runtime.lastError);
                 if (sidebarFrame) {
                   sidebarFrame.contentWindow.postMessage({ type: 'ANALYSIS_ERROR', error: 'Connection failed' }, '*');
                 }
                 return;
              }
              if (sidebarFrame) {
                sidebarFrame.contentWindow.postMessage({
                  type: 'ANALYSIS_RESULT',
                  data: response
                }, '*');
              }
            });
          } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
              console.warn('Upliftio Profile Optimizer: Extension was updated/reloaded. Please refresh the page to continue using the extension.');
              if (sidebarFrame) {
                sidebarFrame.contentWindow.postMessage({ type: 'ANALYSIS_ERROR', error: 'Extension updated. Please refresh the page.' }, '*');
              }
            } else {
              console.error('Error sending analysis request:', error);
              if (sidebarFrame) {
                sidebarFrame.contentWindow.postMessage({ type: 'ANALYSIS_ERROR', error: 'Failed to send request' }, '*');
              }
            }
          }
        }
      } catch (err) {
        if (err.message && err.message.includes('Extension context invalidated')) {
          console.warn('Upliftio Profile Optimizer: Extension was updated/reloaded. Please refresh the page to continue using the extension.');
          if (sidebarFrame && sidebarFrame.contentWindow) {
            sidebarFrame.contentWindow.postMessage({ type: 'ANALYSIS_ERROR', error: 'Extension updated. Please refresh the page.' }, '*');
          }
        }
      }
    });
  }

  /**
   * Observes DOM changes to detect login/logout and page navigation.
   */
  function observeDOMChanges() {
    const observer = new MutationObserver(() => {
      const newLoginState = detectLogin();
      const newPageState = detectProfilePage();

      if (newLoginState !== isLoggedIn || newPageState !== isProfilePage) {
        isLoggedIn = newLoginState;
        isProfilePage = newPageState;

        if (isLoggedIn && isProfilePage) {
          showFloatingButton();
        } else {
          hideFloatingButton();
          closeSidebar();
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });

    // Also listen for URL changes (SPA navigation)
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(checkLoginAndPage, 500);
      }
    }, 500);
  }

})();
