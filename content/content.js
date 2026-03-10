// content.js - Main content script for RND Upwork Profile Optimizer

(function () {
  'use strict';

  // Prevent double injection
  if (window.__rndUpworkOptimizer) return;
  window.__rndUpworkOptimizer = true;

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
   * Creates and shows the floating "Analyze Profile Score" button.
   */
  function showFloatingButton() {
    if (floatingBtn) return;

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'rnd-optimizer-btn';
    floatingBtn.innerHTML = `
      <div class="rnd-btn-inner">
        <svg xmlns="http://www.w3.org/2000/svg" version="1.1" style="display: block;" viewBox="0 0 1144 1024" width="22" height="22" preserveAspectRatio="none">
          <path transform="translate(0,0)" fill="rgb(47,179,227)" d="M 495.896 4.18053 C 579.063 6.78987 670.578 5.06808 754.141 5.07827 L 889.431 5.06796 C 919.621 5.04785 951.22 5.40516 981.306 4.17469 C 991.674 20.229 1141.67 344.662 1142.33 351 C 1129.93 373.699 1117.34 399.928 1105.53 423.198 L 1024.22 583.554 C 1009.34 612.792 993.177 645.656 977.45 674.241 C 957.993 656.782 944.837 640.713 927.113 622.365 C 887.86 581.73 850.126 539.558 811.428 498.481 L 710.048 389.799 C 701.148 380.081 681.587 361.06 675.082 351.143 C 672.733 349.961 667.848 350.012 665.099 349.991 L 294.787 349.867 L 207.782 349.833 C 200.873 349.835 170.014 349.302 165.239 350.751 L 164.334 349.871 C 172.52 337.79 201.427 309.3 212.796 297.508 L 292.517 214.037 L 418.087 82.5294 C 431.727 68.1855 482.201 12.1417 495.896 4.18053 z"/>
          <path transform="translate(0,0)" fill="rgb(95,192,73)" d="M 675.082 351.143 C 692.945 352.174 716.15 351.686 734.29 351.704 L 835.931 351.751 C 938.065 352.127 1040.2 351.876 1142.33 351 C 1129.93 373.699 1117.34 399.928 1105.53 423.198 L 1024.22 583.554 C 1009.34 612.792 993.177 645.656 977.45 674.241 C 957.993 656.782 944.837 640.713 927.113 622.365 C 887.86 581.73 850.126 539.558 811.428 498.481 L 710.048 389.799 C 701.148 380.081 681.587 361.06 675.082 351.143 z"/>
          <path transform="translate(0,0)" fill="rgb(149,41,135)" d="M 164.334 349.871 L 165.239 350.751 C 166.797 355.89 184.936 373.438 189.586 378.368 L 237.593 429.624 L 370.886 572.976 C 400.953 605.046 437.772 642.53 465.829 675.791 L 466.256 675.878 C 475.836 677.771 512.726 677.063 524.099 677.055 L 641.954 676.968 L 861.038 676.837 L 933.988 676.783 C 946.909 676.769 962.369 677.281 974.986 676.434 C 973.518 682.119 680.062 992.783 651.833 1024 L 165.243 1024 C 160.004 1015.07 149.92 991.622 145.128 981.322 L 105.847 897.108 C 73.9566 828.065 41.1836 759.143 9.12808 690.158 C 7.49564 686.645 4.59166 680.367 4.22759 676.621 C 8.95554 661.766 18.8957 642.554 25.6018 628.231 C 39.7648 597.98 55.2585 568.164 69.995 538.185 L 127.246 420.761 C 135.052 404.719 153.903 361.519 164.334 349.871 z"/>
          <path transform="translate(0,0)" fill="rgb(254,150,65)" d="M 164.334 349.871 L 165.239 350.751 C 166.797 355.89 184.936 373.438 189.586 378.368 L 237.593 429.624 L 370.886 572.976 C 400.953 605.046 437.772 642.53 465.829 675.791 C 458.61 678.022 396.598 676.272 384.38 676.256 L 122.851 676.338 L 42.8673 676.341 C 33.9246 676.339 12.3989 675.717 4.22759 676.621 C 8.95554 661.766 18.8957 642.554 25.6018 628.231 C 39.7648 597.98 55.2585 568.164 69.995 538.185 L 127.246 420.761 C 135.052 404.719 153.903 361.519 164.334 349.871 z"/>
        </svg>
        <span>Analyze Profile Score</span>
      </div>
    `;
    floatingBtn.addEventListener('click', handleButtonClick);
    document.body.appendChild(floatingBtn);

    // Fade in
    requestAnimationFrame(() => {
      floatingBtn.classList.add('rnd-btn-visible');
    });
  }

  /**
   * Hides and removes the floating button with a fade-out animation.
   */
  function hideFloatingButton() {
    if (!floatingBtn) return;
    floatingBtn.classList.remove('rnd-btn-visible');
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
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'rnd-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);

    // Create sidebar iframe
    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'rnd-sidebar-frame';
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
      overlay.classList.add('rnd-overlay-visible');
      sidebarFrame.classList.add('rnd-sidebar-visible');
    });

    // Hide floating button while sidebar is open
    if (floatingBtn) floatingBtn.style.display = 'none';

    document.body.classList.add('rnd-sidebar-open');
  }

  /**
   * Closes the sidebar iframe and removes the overlay.
   */
  function closeSidebar() {
    const overlay = document.getElementById('rnd-overlay');
    if (overlay) {
      overlay.classList.remove('rnd-overlay-visible');
      setTimeout(() => overlay.remove(), 300);
    }
    if (sidebarFrame) {
      sidebarFrame.classList.remove('rnd-sidebar-visible');
      setTimeout(() => {
        if (sidebarFrame) {
          sidebarFrame.remove();
          sidebarFrame = null;
        }
      }, 350);
    }
    document.body.classList.remove('rnd-sidebar-open');

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
        }
      } catch (err) {
        if (err.message && err.message.includes('Extension context invalidated')) {
          console.warn('RND Profile Optimizer: Extension was updated/reloaded. Please refresh the page to continue using the extension.');
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
