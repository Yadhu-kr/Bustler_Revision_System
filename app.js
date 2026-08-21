// Dynamic API Endpoint (supports file:// and http:// origins)
const API_BASE = window.location.protocol === 'file:' 
  ? 'http://localhost:8080/api/briefs' 
  : '/api/briefs';

// Real-time cross-tab synchronization channel
let syncChannel = null;
try {
  syncChannel = new BroadcastChannel('bustler_sync');
  syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'BRIEF_UPDATED') {
      if (state.currentStep === 3) {
        updateStep3Status();
      }
    }
  };
} catch (_) {}

// Application State Engine
const state = {
  currentStep: 1,
  isSimulated: localStorage.getItem('bustler_simulate') === 'true',
  rawFeedback: '',
  currentBrief: null,
  currentBriefToken: null,
  isRevisionLoop: false,
  selectedCategory: '',
  selectedPriority: '',
  session: {
    currentUserId: '',
    currentUserRole: 'customer',
    assignedProviderId: '',
    productId: ''
  },
  clarification: {
    active: false,
    category: '',
    round: 1,
    questions: [],
    answers: [],
    candidateIssue: ''
  }
};

// Feedback bank mapped to dropdown category values for random generation
const categoryFeedbackBank = {
  '2d modeling': [
    "The illustration style doesn't match the mood we discussed.",
    "Can you adjust the character proportions? The arms look too long relative to the torso.",
    "The vector lines feel inconsistent — some are thick and some are too thin.",
    "Something about the poster doesn't feel right.",
    "I don't like how it looks.",
    "The color palette on the flyer needs to be warmer, and the headline font should be bolder."
  ],
  '3d modeling': [
    "The render lighting feels flat, can we add more dramatic shadows and rim lighting?",
    "The mesh topology around the face has some artifacts — the edge loops need cleanup.",
    "The texture mapping on the object looks stretched on the UV seams.",
    "Something about the 3D model looks off.",
    "It doesn't look right to me.",
    "The rigging on the character's shoulder joint is deforming badly when the arm raises above 90 degrees."
  ],
  'adobe photoshop/after effect': [
    "The color grading on the photos makes everything look too yellow.",
    "The compositing in the After Effects project has visible edges around the masked elements.",
    "Can you fix the skin retouching? It looks too airbrushed and unnatural.",
    "The edit doesn't look good.",
    "I'm not happy with the result.",
    "The motion graphics text animation is too fast and the easing feels robotic — needs smoother bezier curves."
  ],
  'application servicing': [
    "The app crashes every time I try to open the settings page on Android.",
    "The push notifications aren't working since the last update.",
    "The login flow feels broken somehow.",
    "Something is wrong with the app.",
    "It needs to be fixed.",
    "The API response time on the dashboard endpoint is averaging 4 seconds — it was under 500ms before."
  ],
  'application development': [
    "The dashboard loads too slowly on mobile — the charts take forever to render.",
    "The search filter on the product listing page doesn't work when combining multiple tags.",
    "The button on the checkout page doesn't work.",
    "Something is wrong with the feature.",
    "It's not what I wanted.",
    "The user registration form doesn't validate the email field properly and allows submissions without the @ symbol."
  ],
  'cloude support ans system administrate': [
    "The server keeps going down during peak hours around 2-3 PM.",
    "Our SSL certificate expired and the website is showing security warnings.",
    "Something is wrong with the server.",
    "The system isn't working right.",
    "Fix the hosting issue.",
    "The load balancer isn't distributing traffic evenly — server 2 is getting 80% of requests while server 1 sits idle."
  ],
  'craft & art work': [
    "The handmade packaging feels too flimsy — the material quality needs to be sturdier.",
    "The paint finish on the wooden sign is uneven with visible brush strokes.",
    "The craft work doesn't look right.",
    "I'm not satisfied with it.",
    "It needs improvement.",
    "The embroidery on the custom logo is using the wrong thread color — it should be navy blue, not royal blue."
  ],
  'designing': [
    "The banner looks outdated, can we try something more modern with our brand colors?",
    "The logo spacing feels cramped on the business card layout — needs more breathing room.",
    "The design doesn't feel right.",
    "I don't like the design.",
    "Change the design.",
    "The typography hierarchy on the landing page is confusing — the subheading is the same size as the body text."
  ],
  'digital creator': [
    "The Instagram reel thumbnails don't match our brand aesthetic — too much neon.",
    "The content calendar visuals are repetitive — every post uses the same layout template.",
    "The content doesn't look good.",
    "Something about it feels off.",
    "It needs work.",
    "The YouTube thumbnail text is too small to read on mobile and the contrast between the text and background is poor."
  ],
  'digital marketing': [
    "The ad copy for the Facebook campaign doesn't match our target audience tone.",
    "The email newsletter template breaks on Outlook — the images aren't loading.",
    "The campaign isn't performing.",
    "The marketing feels wrong.",
    "I'm not happy with the results.",
    "The Google Ads landing page has a 78% bounce rate — the headline doesn't match the ad promise and the CTA is below the fold."
  ],
  'industrial & metal work': [
    "The welding on the joint has visible porosity and the finish isn't smooth.",
    "The metal bracket dimensions are off by 2mm — it doesn't fit the mounting holes.",
    "The metalwork doesn't look right.",
    "Something is wrong with the fabrication.",
    "It needs to be redone.",
    "The powder coating on the steel frame is chipping at the corners and the color doesn't match the RAL 7016 we specified."
  ],
  'it & networking/system security': [
    "The firewall rules are blocking legitimate traffic from our partner API endpoints.",
    "The VPN connection drops every 15 minutes and users have to re-authenticate.",
    "The network isn't working properly.",
    "Something is wrong with the security setup.",
    "Fix the IT issue.",
    "The intrusion detection system is generating too many false positives on port 443 traffic from our CDN IP ranges."
  ],
  'marketing': [
    "The brochure copy doesn't highlight our unique selling points clearly enough.",
    "The trade show banner dimensions are wrong — it should be 6ft x 3ft, not 4ft x 2ft.",
    "The marketing material doesn't feel right.",
    "I don't like how it turned out.",
    "It needs changes.",
    "The product comparison table in the sales deck is missing our latest features and the competitor data is from Q2 2024."
  ],
  'photography': [
    "The product photos have inconsistent white balance — some look warm and others are too cool.",
    "The headshots need more fill light on the left side to reduce harsh shadows.",
    "The photos don't look right.",
    "I'm not satisfied with the images.",
    "The editing is off.",
    "The food photography has too much depth of field — the garnish in the foreground is completely blurred and we need it sharp."
  ],
  'videography': [
    "The audio and video are out of sync starting around the 2-minute mark.",
    "The color grading makes the outdoor scenes look too desaturated and lifeless.",
    "The video doesn't look right.",
    "I don't like the video.",
    "Something about the edit feels wrong.",
    "The transition between the interview segment and the B-roll at 1:45 is too abrupt — needs a smoother crossfade with an audio dip."
  ],
  'website development': [
    "The landing page is loading too slowly on mobile — the hero image takes ages to render.",
    "The contact form submissions aren't being saved to the database — we lost 3 days of leads.",
    "The website doesn't look right.",
    "Something is wrong with the page.",
    "Fix the website.",
    "The responsive breakpoint at 768px causes the navigation menu to overlap the hero section and the hamburger icon is misaligned."
  ],
  'writing': [
    "The blog post tone is too formal — we need a conversational, friendly voice for our audience.",
    "The product description has grammatical errors in the second paragraph and the CTA is weak.",
    "The writing doesn't feel right.",
    "I don't like the copy.",
    "It needs improvement.",
    "The case study is missing quantitative results — add the 40% conversion increase stat and the client testimonial quote from Sarah."
  ]
};

// Fallback feedback for when no category is selected
const genericFeedbackBank = [
  "Something about the deliverable doesn't feel right.",
  "I'm not happy with how it turned out.",
  "Can we redo this? It's not what I expected.",
  "The quality needs to be better overall.",
  "It needs work — I'll explain more if needed.",
  "The final result doesn't match what we discussed in the brief."
];

// DOM Cache Elements
const elements = {
  feedbackInput: document.getElementById('feedback-input'),
  fieldSelect: document.getElementById('field-select'),
  generateBriefBtn: document.getElementById('generate-brief-btn'),
  regenerateBriefBtn: document.getElementById('regenerate-brief-btn'),
  approveBriefBtn: document.getElementById('approve-brief-btn'),
  backToDashboardBtn: document.getElementById('back-to-dashboard-btn'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  
  // Settings & Theme Elements
  toggleSettings: document.getElementById('toggle-settings'),
  settingsPanel: document.getElementById('settings-panel'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),

  currentUserIdInput: document.getElementById('current-user-id-input'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  sessionUserPill: document.getElementById('session-user-pill'),
  providerIdInput: document.getElementById('provider-id-input'),
  productIdInput: document.getElementById('product-id-input'),
  
  // Step Cards
  steps: {
    1: document.getElementById('step-1'),
    2: document.getElementById('step-2'),
    3: document.getElementById('step-3')
  },
  psteps: {
    1: document.getElementById('pstep-1'),
    2: document.getElementById('pstep-2'),
    3: document.getElementById('pstep-3')
  },
  
  // Step 2 Inner Elements
  loadingCard: document.getElementById('brief-loading-card'),
  errorCard: document.getElementById('brief-error-card'),
  errorMessageText: document.getElementById('error-message-text'),
  errorSimulateBtn: document.getElementById('error-simulate-btn'),
  briefDisplayContainer: document.getElementById('brief-display-container'),
  clarificationFlowContainer: document.getElementById('clarification-flow-container'),
  clarificationQuestionsView: document.getElementById('clarification-questions-view'),
  clarificationConfirmationView: document.getElementById('clarification-confirmation-view'),
  clarificationQuestionList: document.getElementById('clarification-question-list'),
  clarificationRoundLabel: document.getElementById('clarification-round-label'),
  clarificationIntroText: document.getElementById('clarification-intro-text'),
  clarificationProblemPreview: document.getElementById('clarification-problem-preview'),
  clarificationBackLink: document.getElementById('clarification-back-link'),
  clarificationCancelBtn: document.getElementById('clarification-cancel-btn'),
  clarificationSubmitBtn: document.getElementById('clarification-submit-btn'),
  clarificationNoBtn: document.getElementById('clarification-no-btn'),
  clarificationYesBtn: document.getElementById('clarification-yes-btn'),
  clarificationQuestionsActions: document.getElementById('clarification-questions-actions'),
  clarificationConfirmationActions: document.getElementById('clarification-confirmation-actions'),
  
  briefPriority: document.getElementById('brief-priority'),
  briefCategory: document.getElementById('brief-category'),
  categoryBadgeWrapper: document.getElementById('category-badge-wrapper'),
  briefSummaryText: document.getElementById('brief-summary-text'),
  briefChangesList: document.getElementById('brief-changes-list'),
  rawTextBlock: document.getElementById('raw-text-block'),
  rawAccordionToggle: document.getElementById('raw-accordion-toggle'),
  rawAccordionContent: document.getElementById('raw-accordion-content'),
  rawArrow: document.getElementById('raw-arrow'),
  briefTimestamp: document.getElementById('brief-timestamp'),
  successTitle: document.getElementById('success-title'),
  successBody: document.getElementById('success-body'),

  // Back to Edit Links & Buttons
  backToStep1Link: document.getElementById('back-to-step-1-link'),
  backToEditBtn: document.getElementById('back-to-edit-btn'),

  // Step 3 Confirmation & Completion Elements
  step3SentCard: document.getElementById('step3-sent-card'),
  step3CompletedCard: document.getElementById('step3-completed-card'),
  step3ConcludedCard: document.getElementById('step3-concluded-card'),
  providerStatusDot: document.getElementById('provider-status-dot'),
  providerStatusLabel: document.getElementById('provider-status-label'),
  requestFurtherRevisionBtn: document.getElementById('request-further-revision-btn'),
  concludeCloseBtn: document.getElementById('conclude-close-btn'),
  concludedDashboardBtn: document.getElementById('concluded-dashboard-btn')
};

// Initialize UI
function init() {
  hydrateSessionContext();

  // Setup Initial Settings & Theme
  initTheme();
  elements.currentUserIdInput.value = state.session.currentUserId;
  elements.providerIdInput.value = state.session.assignedProviderId;
  elements.productIdInput.value = state.session.productId;
  updateStatusBadge();
  updateSessionPill();

  // Setup Listeners
  elements.feedbackInput.addEventListener('input', handleFeedbackInput);
  elements.generateBriefBtn.addEventListener('click', () => generateBriefFlow());
  elements.currentUserIdInput.addEventListener('input', syncSessionInputs);
  elements.providerIdInput.addEventListener('input', syncSessionInputs);
  elements.productIdInput.addEventListener('input', syncSessionInputs);

  // Custom Select-1 Dropdown Component
  initCustomSelect();

  // Field-select (category) dropdown listener
  elements.fieldSelect.addEventListener('change', () => {
    state.selectedCategory = elements.fieldSelect.value;
    updateGenerateButtonState();
  });

  // Priority buttons listener with animated sliding pill
  initSlidingTabs();
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all priority buttons
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      // Set active on clicked
      btn.classList.add('active');
      state.selectedPriority = btn.getAttribute('data-priority');
      updateSlidingTabs(btn, false);
      updateGenerateButtonState();
    });
  });
  elements.regenerateBriefBtn.addEventListener('click', () => generateBriefFlow(true));
  elements.approveBriefBtn.addEventListener('click', approveBrief);
  elements.backToDashboardBtn.addEventListener('click', resetToStart);
  
  // Random feedback button — generates random feedback based on selected category
  document.getElementById('random-feedback-btn').addEventListener('click', () => {
    const selectedCategory = elements.fieldSelect.value;
    const feedbackList = selectedCategory && categoryFeedbackBank[selectedCategory]
      ? categoryFeedbackBank[selectedCategory]
      : genericFeedbackBank;

    const randomFeedback = feedbackList[Math.floor(Math.random() * feedbackList.length)];
    elements.feedbackInput.value = randomFeedback;
    handleFeedbackInput();

    // Visual flash to confirm the feedback was inserted
    elements.feedbackInput.style.borderColor = 'var(--brand-green)';
    setTimeout(() => {
      elements.feedbackInput.style.borderColor = '';
    }, 500);
  });

  // Settings Drawer toggling
  elements.toggleSettings.addEventListener('click', toggleSettingsDrawer);
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.addEventListener('click', toggleTheme);
  }

  
  // Error recovery helpers
  elements.errorSimulateBtn.addEventListener('click', () => {
    state.isSimulated = true;
    localStorage.setItem('bustler_simulate', 'true');
    updateStatusBadge();
    generateBriefFlow();
  });

  // Raw Accordion
  elements.rawAccordionToggle.addEventListener('click', toggleRawAccordion);

  // Link Back to Edit event handlers
  elements.backToStep1Link.addEventListener('click', (e) => {
    e.preventDefault();
    backToEdit();
  });
  elements.backToEditBtn.addEventListener('click', backToEdit);
  elements.clarificationBackLink.addEventListener('click', (e) => {
    e.preventDefault();
    backToEdit();
  });
  elements.clarificationCancelBtn.addEventListener('click', backToEdit);
  elements.clarificationSubmitBtn.addEventListener('click', handleClarificationSubmit);
  elements.clarificationNoBtn.addEventListener('click', handleClarificationRetry);
  elements.clarificationYesBtn.addEventListener('click', handleClarificationConfirm);

  // Step 3 Completion & Feedback Loop event handlers
  elements.requestFurtherRevisionBtn.addEventListener('click', handleRequestFurtherRevision);
  elements.concludeCloseBtn.addEventListener('click', handleConcludeClose);
  elements.concludedDashboardBtn.addEventListener('click', resetToStart);

  // Restore state if a brief is already in progress/sent
  const storedBrief = localStorage.getItem('bustler_approved_brief');
  if (storedBrief) {
    try {
      const brief = JSON.parse(storedBrief);
      state.currentBrief = brief;
      state.rawFeedback = brief.rawFeedback;
      state.selectedCategory = brief.category;
      state.selectedPriority = brief.priority;
      
      // Update UI elements in case they go back to step 1
      syncStep1UI();
      
      // Move to step 3 and update status display
      changeStep(3);
      updateStep3Status();
    } catch (e) {
      console.error("Failed to parse stored brief:", e);
      syncStep1UI();
    }
  } else {
    // If no brief exists, just make sure step 1 UI is clean
    syncStep1UI();
  }

  // Cross-tab real-time syncing listener
  window.addEventListener('storage', (e) => {
    if (e.key === 'bustler_brief_status' || e.key === 'bustler_completed_indices') {
      updateStep3Status();
    }
    if (e.key === 'bustler_approved_brief') {
      if (!e.newValue) {
        // If the brief was cleared on another tab, reset to start
        state.currentBrief = null;
        state.rawFeedback = '';
        state.selectedCategory = '';
        state.selectedPriority = '';
        elements.feedbackInput.value = '';
        syncStep1UI();
        changeStep(1);
      } else {
        // If brief was created/updated, load it
        try {
          const brief = JSON.parse(e.newValue);
          state.currentBrief = brief;
          state.rawFeedback = brief.rawFeedback;
          state.selectedCategory = brief.category;
          state.selectedPriority = brief.priority;
          syncStep1UI();
          changeStep(3);
          updateStep3Status();
        } catch (err) {
          console.error("Failed to parse storage update brief:", err);
        }
      }
    }
  });
}

function hydrateSessionContext() {
  if (!window.BustlerContext) return;
  state.session = window.BustlerContext.resolveSession('customer');
  state.session.currentUserRole = 'customer';
  window.BustlerContext.persistSession(state.session);
}

function syncSessionInputs() {
  state.session.currentUserId = elements.currentUserIdInput.value.trim();
  state.session.assignedProviderId = elements.providerIdInput.value.trim();
  state.session.productId = elements.productIdInput.value.trim();

  if (window.BustlerContext) {
    window.BustlerContext.persistSession(state.session);
  }

  updateSessionPill();
}

function updateSessionPill() {
  if (!elements.sessionUserPill) return;
  elements.sessionUserPill.innerText = state.session.currentUserId
    ? `Customer: ${state.session.currentUserId}`
    : 'Session user not set';
}

// Check textarea content to toggle generate button
function handleFeedbackInput() {
  updateGenerateButtonState();
}

// Enable Generate button only when category, priority, AND feedback are all provided
function updateGenerateButtonState() {
  const hasFeedback = elements.feedbackInput.value.trim().length >= 5;
  const hasCategory = !!state.selectedCategory;
  const hasPriority = !!state.selectedPriority;
  elements.generateBriefBtn.disabled = !(hasFeedback && hasCategory && hasPriority);
}

// Toggle Settings Panel
function toggleSettingsDrawer() {
  elements.settingsPanel.classList.toggle('open');
}

// ----------------------------------------------------
// Toast Notification Engine
// ----------------------------------------------------
function showToast(message, type = 'success', title = '', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-card toast-${type}`;

  const icons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    copy: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
  };

  const defaultTitles = {
    success: 'Success',
    info: 'Information',
    warning: 'Notice',
    copy: 'Copied to Clipboard'
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title || defaultTitles[type] || 'Notification'}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">&times;</button>
    <div class="toast-progress"></div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const removeToast = () => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', removeToast);
  setTimeout(removeToast, duration);
}

// ----------------------------------------------------
// Dark / Light Mode Theme Management
// ----------------------------------------------------
function initTheme() {
  const saved = localStorage.getItem('bustler_theme');
  const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  updateThemeUI(isDark);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('bustler_theme', newTheme);
  updateThemeUI(newTheme === 'dark');
}

function updateThemeUI(isDark) {

  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function updateStatusBadge() {
  if (state.isSimulated) {
    elements.statusDot.classList.add('simulated');
    elements.statusText.innerText = 'Mock Simulation';
  } else {
    elements.statusDot.classList.remove('simulated');
    elements.statusText.innerText = 'Bustler AI';
  }
}

// Toggle raw accordion open state
function toggleRawAccordion() {
  const isOpen = elements.rawAccordionContent.classList.contains('open');
  if (isOpen) {
    elements.rawAccordionContent.classList.remove('open');
    elements.rawAccordionContent.style.maxHeight = '0px';
    if (elements.rawArrow) {
      elements.rawArrow.style.transform = 'rotate(0deg)';
    }
  } else {
    // Populate text if needed
    const rawContent = state.rawFeedback || (elements.feedbackInput ? elements.feedbackInput.value.trim() : '') || 'No raw feedback available.';
    elements.rawTextBlock.innerText = rawContent;
    elements.rawAccordionContent.classList.add('open');
    const scrollH = elements.rawAccordionContent.scrollHeight;
    elements.rawAccordionContent.style.maxHeight = (scrollH > 0 ? scrollH + 30 : 250) + 'px';
    if (elements.rawArrow) {
      elements.rawArrow.style.transform = 'rotate(180deg)';
    }
  }
}

// Navigates between steps using View Transitions when available
function changeStep(targetStep) {
  state.currentStep = targetStep;

  const updateDOM = () => {
    // Toggle Steps visibility
    Object.keys(elements.steps).forEach(s => {
      const el = elements.steps[s];
      if (parseInt(s) === targetStep) {
        el.classList.add('active');
        el.classList.add('animate-reveal');
      } else {
        el.classList.remove('active');
      }
    });

    // Toggle Progress Indicators
    Object.keys(elements.psteps).forEach(s => {
      const stepNum = parseInt(s);
      const el = elements.psteps[s];
      if (stepNum < targetStep) {
        el.classList.remove('active');
        el.classList.add('completed');
      } else if (stepNum === targetStep) {
        el.classList.add('active');
        el.classList.remove('completed');
      } else {
        el.classList.remove('active');
        el.classList.remove('completed');
      }
    });

    // Update progress bar percentage width
    const widthPercent = (targetStep === 1) ? 33.33 : (targetStep === 2 ? 66.66 : 100);
    elements.progressBarFill.style.width = widthPercent + '%';

    // Smooth scroll down to the current active step container
    setTimeout(() => {
      const activeCard = elements.steps[targetStep];
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 80);
  };

  // Use View Transitions API if supported
  if (document.startViewTransition) {
    document.startViewTransition(updateDOM);
  } else {
    updateDOM();
  }
}

// ----------------------------------------------------
// API Calling & Parsing Engine
// ----------------------------------------------------
async function generateBriefFlow(isRegenerating = false) {
  if (!isRegenerating) {
    state.rawFeedback = elements.feedbackInput.value.trim();
  }
  
  // Open step 2 loading state
  changeStep(2);
  elements.loadingCard.style.display = 'flex';
  elements.errorCard.style.display = 'none';
  elements.briefDisplayContainer.style.display = 'none';

  // Hide active settings to avoid overlap during processing
  elements.settingsPanel.classList.remove('open');

  try {
    let parsedBrief = null;
    const needsClarification = isLowInformationFeedback(state.rawFeedback);
    if (needsClarification) {
      await beginClarificationFlow();
    } else {
      if (state.isSimulated) {
        // Add brief artificial loading delay to feel authentic
        await new Promise(resolve => setTimeout(resolve, 1500));
        parsedBrief = simulateBrief(state.rawFeedback);
      } else {
        parsedBrief = await callBackendGenerateBrief(state.rawFeedback);
      }
      
      // Override category and priority from user selections in Step 1
      if (state.selectedCategory) {
        parsedBrief.category = state.selectedCategory;
      }
      if (state.selectedPriority) {
        parsedBrief.priority = state.selectedPriority;
      }

      // Success rendering
      state.currentBrief = parsedBrief;
      renderBrief(parsedBrief);
      showBriefView();
    }
  } catch (err) {
    console.error(err);
    elements.loadingCard.style.display = 'none';
    elements.errorMessageText.innerText = err.message || "An unknown network error occurred while contacting x.AI endpoint.";
    elements.errorCard.style.display = 'flex';
  }
}

async function callBackendGenerateBrief(feedback) {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback, category: state.selectedCategory, priority: state.selectedPriority })
  });
  if (!response.ok) throw new Error("Failed to communicate with backend service.");
  return await response.json();
}

async function beginClarificationFlow() {
  resetClarificationState();
  // Use the category from the Step 1 dropdown if available, otherwise infer
  const category = state.selectedCategory || inferCategoryFromKeywords(state.rawFeedback.toLowerCase()) || 'Needs Clarification';
  state.clarification.category = category;

  let questions;
  if (state.isSimulated) {
    await new Promise(resolve => setTimeout(resolve, 900));
    questions = generateClarificationQuestions(state.rawFeedback, category, 1);
  } else {
    questions = await fetchClarificationQuestions(state.rawFeedback, category, 1, []);
  }

  state.clarification.questions = questions;
  renderClarificationQuestions();
}

async function fetchClarificationQuestions(feedback, category, round, previousAnswers) {
  const response = await fetch(`${API_BASE}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback, category, round, previousAnswers })
  });
  if (!response.ok) {
    throw new Error('Failed to fetch clarification questions from backend.');
  }
  const data = await response.json();
  return Array.isArray(data.questions) ? data.questions.slice(0, 5) : generateClarificationQuestions(feedback, category, round);
}

async function fetchCandidateIssue(feedback, category, answers) {
  const response = await fetch(`${API_BASE}/candidate-issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback, category, answers })
  });
  if (!response.ok) {
    throw new Error('Failed to fetch candidate issue from backend.');
  }
  const data = await response.json();
  return data.issue || buildCandidateIssue(state.rawFeedback, category, answers);
}

function extractJsonText(text) {
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.substring(7);
  else if (clean.startsWith('```')) clean = clean.substring(3);
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
  return clean.trim();
}

// ----------------------------------------------------
// JSON & Markdown Parsing Engine
// ----------------------------------------------------
function parseGrokOutput(text) {
  let clean = text.trim();
  // Strip markdown JSON code fences if returned by model
  if (clean.startsWith('```json')) {
    clean = clean.substring(7);
  } else if (clean.startsWith('```')) {
    clean = clean.substring(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.substring(0, clean.length - 3);
  }
  clean = clean.trim();

  try {
    const parsed = JSON.parse(clean);
    return {
      category: parsed.category || 'General Service',
      summary: parsed.summary || 'A revision summary was built based on client requirements.',
      changes: Array.isArray(parsed.checklist) ? parsed.checklist : (Array.isArray(parsed.changes) ? parsed.changes : ['Adjust delivered work file elements according to feedback description.']),
      priority: normalizePriority(parsed.priority),
      rawText: text
    };
  } catch (e) {
    console.warn("Failed to parse JSON response from Grok, attempting text scanner fallback:", e);
    return parseGrokTextFallback(text);
  }
}

// Text Scanner Fallback for non-JSON returns
function parseGrokTextFallback(text) {
  const normalized = text.replace(/\r/g, '');
  let summary = '';
  let changes = [];
  let priority = 'Not specified';
  let category = 'General Service';

  const lines = normalized.split('\n');
  let currentSection = '';
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect headings
    if (/category/i.test(trimmed) && trimmed.length < 35) {
      currentSection = 'category';
      const parts = trimmed.split(':');
      if (parts.length > 1 && parts[1].trim()) category = parts[1].trim();
      continue;
    } else if (/summary/i.test(trimmed) && (trimmed.includes('1') || trimmed.startsWith('#') || trimmed.includes(':') || trimmed.length < 25)) {
      currentSection = 'summary';
      continue;
    } else if (/changes|checklist/i.test(trimmed) && (trimmed.includes('2') || trimmed.startsWith('#') || trimmed.includes(':') || trimmed.length < 25)) {
      currentSection = 'changes';
      continue;
    } else if (/priority/i.test(trimmed) && (trimmed.includes('3') || trimmed.startsWith('#') || trimmed.includes(':') || trimmed.length < 25)) {
      currentSection = 'priority';
      const parts = trimmed.split(':');
      if (parts.length > 1 && parts[1].trim()) {
        priority = parts[1].trim();
      }
      continue;
    }

    // Process data elements
    if (currentSection === 'category') {
      category = trimmed;
    } else if (currentSection === 'summary') {
      if (!trimmed.startsWith('#')) {
        summary += (summary ? ' ' : '') + trimmed;
      }
    } else if (currentSection === 'changes') {
      if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('+') || /^\d+[\.\)]/.test(trimmed)) {
        const cleanItem = trimmed.replace(/^[-*+\d\.\)]\s*/, '').trim();
        if (cleanItem) changes.push(cleanItem);
      } else {
        changes.push(trimmed);
      }
    } else if (currentSection === 'priority') {
      const match = trimmed.match(/(high|medium|low|not specified)/i);
      if (match) priority = match[1];
    }
  }

  priority = normalizePriority(priority);
  summary = summary.replace(/^[:\-\s\d\.\)]+/, '').trim();

  return {
    category: category,
    summary: summary || 'A revision summary was built based on client requirements.',
    changes: changes.length ? changes : ['Adjust delivered work file elements according to feedback description.'],
    priority: normalizePriority(priority),
    rawText: text
  };
}

function normalizePriority(priority) {
  const value = String(priority || '').trim().toLowerCase();
  if (value === 'high') return 'High';
  if (value === 'medium') return 'Medium';
  if (value === 'low') return 'Low';
  return 'Not specified';
}

function resetClarificationState() {
  state.clarification = {
    active: false,
    category: '',
    round: 1,
    questions: [],
    answers: [],
    candidateIssue: ''
  };
}

function isLowInformationFeedback(feedbackText) {
  const text = feedbackText.trim().toLowerCase();
  if (!text) return true;

  // --- TIER 1: Known ultra-vague phrases (exact full-text match) ---
  const ultraVaguePhrases = [
    "i don't know", "i dont know", "not good", "not great",
    "doesn't feel right", "doesnt feel right",
    "doesn't look right", "doesnt look right",
    "don't look right", "dont look right",
    "something is off", "this is off", "not right",
    "looks bad", "looks weird", "needs improvement",
    "improve this", "fix this", "change this",
    "make it better", "do better", "update this",
    "not satisfied", "not happy", "redo this",
    "start over", "i hate it", "hate this",
    "could be better", "needs work", "meh",
    "disappointing", "i don't like it", "i dont like it"
  ];

  // --- TIER 2: Vague sentiment substrings (partial/substring match) ---
  const vagueSubstrings = [
    "not good", "not great", "not right", "not happy",
    "not satisfied", "not what i wanted", "not what i expected",
    "don't like", "dont like", "doesn't look", "doesnt look",
    "doesn't feel", "doesnt feel", "doesn't work", "doesnt work",
    "something is off", "something is wrong", "something wrong",
    "feels off", "feels wrong", "looks off", "looks wrong",
    "looks bad", "looks weird", "needs work", "needs changes",
    "needs improvement", "needs fixing", "could be better",
    "not sure what", "i'm not sure", "im not sure",
    "fix this", "change this", "update this", "redo",
    "make it better", "do better", "start over",
    "disappointed", "disappointing", "unhappy", "hate"
  ];

  // --- Diagnostic detail signals (prove the user described the ACTUAL problem) ---
  // Subject nouns like 'video', 'image', 'text', 'page' are intentionally
  // excluded — they tell us WHAT the user is talking about, not WHAT IS WRONG.
  const diagnosticSignals = [
    'not syncing', 'out of sync', 'delay', 'distorted', 'blurry',
    'pixelated', 'cropped', 'misaligned', 'too slow', 'too small',
    'too large', 'too fast', 'too loud', 'too quiet', 'missing',
    'cut off', 'overlapping', 'unreadable', 'not loading', 'crashing',
    'error message', 'wrong color', 'wrong text', 'wrong font',
    'background noise', 'aspect ratio', 'resolution', 'compress',
    'defer', 'shadow', 'gradient', 'spacing', 'margin', 'padding',
    'alignment', 'brightness', 'contrast', 'saturation', 'opacity',
    'timestamp', 'at the', 'scene where', 'second half', 'first half',
    'beginning', 'ending', 'specific', 'exactly', 'pixel',
    'dimensions', 'position', 'placement'
  ];

  const genericComplaintPatterns = [
    /^i think there is something wrong/,
    /^there is something wrong/,
    /^something is wrong/,
    /^i don'?t know\b/,
    /^it doesn'?t look right/,
    /^it doesn'?t feel right/,
    /doesn'?t look right$/,
    /doesn'?t feel right$/,
    /^the .* looks? not right/,
    /^the .* is not right/,
    /^the .* (is|are|looks?|feels?) (bad|weird|off|wrong|ugly)/,
    /^i (just )?don'?t (like|want)/,
    /^(please )?(just )?(fix|change|update|redo)/
  ];

  const categoryOnlyPatterns = [
    /^.*wrong with the (video|photo|image|design|page|website|app)\.?$/,
    /^.*issue with the (video|photo|image|design|page|website|app)\.?$/,
    /^.*problem with the (video|photo|image|design|page|website|app)\.?$/,
    /^.*not right\b.*(video|photo|image|design|page|website|app)\.?$/
  ];

  const wordCount = text.split(/\s+/).length;
  const hasDiagnosticDetail = diagnosticSignals.some(s => text.includes(s));

  // Very short feedback is always vague
  if (wordCount <= 3) return true;

  // Exact match on known ultra-vague phrases
  if (ultraVaguePhrases.includes(text)) return true;

  // Generic complaint patterns (regex)
  if (genericComplaintPatterns.some(p => p.test(text))) return true;

  // Category-only patterns ("there's a problem with the video")
  if (categoryOnlyPatterns.some(p => p.test(text))) return true;

  // Short feedback (≤10 words) with vague sentiment and no diagnostic detail
  if (wordCount <= 10 && !hasDiagnosticDetail) {
    if (vagueSubstrings.some(phrase => text.includes(phrase))) {
      return true;
    }
  }

  // Even longer feedback: if it contains vague sentiment but ZERO diagnostic detail, flag it
  if (vagueSubstrings.some(phrase => text.includes(phrase)) && !hasDiagnosticDetail) {
    return true;
  }

  // Catch-all: short feedback (≤15 words) with zero diagnostic detail is always vague,
  // even if it doesn't match any specific vague phrase. The user simply hasn't given
  // enough concrete information for a provider to act on.
  if (wordCount <= 15 && !hasDiagnosticDetail) {
    return true;
  }

  return false;
}

function buildLowInformationBrief(feedbackText) {
  const lowerText = feedbackText.toLowerCase();
  const inferredCategory = inferCategoryFromKeywords(lowerText);

  return {
    category: inferredCategory || 'Needs Clarification',
    summary: inferredCategory
      ? `The client has indicated a revision concern in the ${inferredCategory.toLowerCase()} work, but the issue is not described specifically enough yet for a precise provider brief.`
      : 'The client has indicated that revisions are needed, but the request is too vague to identify the exact issue without further clarification.',
    changes: inferredCategory
      ? [
          `Review the customer's feedback to identify the specific concern affecting the **${inferredCategory.toLowerCase()} deliverable**.`,
          'Clarify which exact element, section, or output the client wants revised.',
          'Confirm what outcome the client expects so the revision can be scoped accurately.'
        ]
      : [
          'Identify which deliverable or part of the work the client is referring to.',
          'Clarify the specific issue, dissatisfaction, or requested revision in concrete terms.',
          'Confirm the expected outcome before proceeding with the revision.'
        ],
    priority: detectPriorityFromFeedback(lowerText),
    rawText: feedbackText
  };
}

function generateClarificationQuestions(feedbackText, category, round) {
  const baseQuestions = {
    'Needs Clarification': [
      'Which exact deliverable or part of the work feels wrong to you?',
      'What exactly feels wrong, incomplete, or unsatisfactory from your point of view?',
      'What were you expecting instead of the current result?',
      'Can you point to one example, moment, section, or visual detail that best shows the issue?',
      'How urgent is this revision for your timeline?'
    ],
    'Video Editing': [
      'Which exact part of the video feels wrong to you right now?',
      'Are you noticing the issue throughout the video or only in specific moments?',
      'Is the concern mainly about visuals, audio, timing, transitions, or something else?',
      'What result were you expecting instead of the current version?',
      'Can you point to one scene, timestamp, or example that best shows the problem?'
    ],
    'Photo Editing': [
      'Which exact photo or image area needs revision?',
      'Is the issue mainly with color, lighting, retouching, background, or sharpness?',
      'What feels wrong in the current edit from your point of view?',
      'What outcome were you expecting instead?',
      'Is there one visible example in the image that best shows the problem?'
    ],
    'Graphic Design': [
      'Which design element feels wrong or incomplete to you?',
      'Is the issue mainly about layout, color, typography, imagery, or branding?',
      'What was the design supposed to communicate or feel like?',
      'What result were you expecting from this design?',
      'Which section best represents the concern you want revised?'
    ],
    'Software / App Development': [
      'Which page, screen, or feature is affected?',
      'What exactly happens when you use it now?',
      'What were you expecting to happen instead?',
      'Does this issue happen all the time or only in certain situations?',
      'Is the concern about functionality, speed, layout, or content behavior?'
    ],
    'Content Writing': [
      'Which section of the content needs revision?',
      'Is the issue mainly about tone, clarity, accuracy, structure, or messaging?',
      'What did you expect the writing to communicate instead?',
      'Which sentence or passage best shows the concern?',
      'What feels missing or off in the current version?'
    ]
  };

  const fallbackQuestions = baseQuestions[category] || baseQuestions['Needs Clarification'];
  if (round === 1) return fallbackQuestions;

  return [
    'If you had to explain the problem in one simple sentence, what would you say?',
    'What part of the final delivery should the provider review first?',
    'What makes the current version feel incorrect or incomplete to you?',
    'What specific change would help it feel closer to what you wanted?',
    'Is there any example, moment, or detail that best proves this issue?'
  ];
}

function buildCandidateIssue(feedbackText, category, answers) {
  const nonEmptyAnswers = answers.map(answer => answer.trim()).filter(Boolean);
  const firstDetail = nonEmptyAnswers[0] || 'the delivered work';
  const expectedOutcome = nonEmptyAnswers[2] || nonEmptyAnswers[1] || 'the expected result';
  if (category && category !== 'Needs Clarification') {
    return `The client appears to be reporting a revision concern in the ${category.toLowerCase()} work, specifically around ${firstDetail.toLowerCase()}, and expects the result to align more closely with ${expectedOutcome.toLowerCase()}.`;
  }
  return `The client appears to be reporting an issue affecting ${firstDetail.toLowerCase()} and expects the final outcome to align more closely with ${expectedOutcome.toLowerCase()}.`;
}

function inferCategoryFromKeywords(lowerText) {
  const categorySignals = [
    {
      category: '3D Modeling',
      signals: ['3d', 'model', 'render', 'rendering', 'mesh', 'texture', 'lighting', 'rig', 'topology', 'uv']
    },
    {
      category: '2D Design',
      signals: ['illustration', '2d', 'vector', 'poster', 'flyer', 'brochure', 'storybook', 'comic']
    },
    {
      category: 'Video Editing',
      signals: ['video', 'audio', 'sync', 'voice', 'timeline', 'footage', 'transition', 'subtitle']
    },
    {
      category: 'Photo Editing',
      signals: ['photo', 'image', 'retouch', 'background', 'crop', 'exposure', 'skin', 'masking']
    },
    {
      category: 'Graphic Design',
      signals: ['banner', 'design', 'logo', 'layout', 'typography', 'brand', 'branding', 'color palette']
    },
    {
      category: 'Software / App Development',
      signals: ['page', 'website', 'app', 'dashboard', 'button', 'bug', 'loading', 'screen', 'feature']
    },
    {
      category: 'Content Writing',
      signals: ['copy', 'content', 'caption', 'article', 'blog', 'headline', 'script', 'description']
    }
  ];

  let bestMatch = '';
  let bestScore = 0;

  categorySignals.forEach(({ category, signals }) => {
    const score = signals.reduce((total, signal) => total + (lowerText.includes(signal) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  });

  return bestScore >= 2 ? bestMatch : '';
}

// Inline Markdown bold parser (**bold** -> <strong>bold</strong>)
function formatInlineMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\?(.*?)\*\?/g, '<strong>$1</strong>') // Handle edge formatting
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

// Simulator providing highly detailed summaries that match client feedback exactly
function simulateBrief(feedbackText) {
  const lowerText = feedbackText.toLowerCase();
  let summary = "";
  let changes = [];
  // Use the dropdown-selected category first, fall back to keyword inference
  let category = state.selectedCategory || inferCategoryFromKeywords(lowerText) || "General Service";
  let priority = detectPriorityFromFeedback(lowerText);

  if (isLowInformationFeedback(feedbackText)) {
    return buildLowInformationBrief(feedbackText);
  }

  const issueDescriptors = [];
  const checklist = [];

  if (lowerText.includes('sync') || lowerText.includes('not syncing')) {
    issueDescriptors.push('synchronization between related media elements');
    checklist.push('Review the alignment between the referenced **media elements** that appear out of sync.');
  }
  if (lowerText.includes('audio') || lowerText.includes('voice') || lowerText.includes('sound')) {
    issueDescriptors.push('audio-related elements');
    checklist.push('Check the **audio-related elements** referenced by the client for the reported concern.');
  }
  if (lowerText.includes('video')) {
    issueDescriptors.push('the video output');
    checklist.push('Review the **video output** to identify the issue highlighted by the client.');
  }
  if (lowerText.includes('color') || lowerText.includes('colour')) {
    issueDescriptors.push('color treatment');
    checklist.push('Review the **color treatment** mentioned in the revision request.');
  }
  if (lowerText.includes('banner')) {
    issueDescriptors.push('the banner section');
    checklist.push('Review the **banner section** based on the client’s revision request.');
  }
  if (lowerText.includes('shadow')) {
    issueDescriptors.push('button shadow styling');
    checklist.push('Review the **button shadow styling** mentioned by the client.');
  }
  if (lowerText.includes('slow') || lowerText.includes('loading') || lowerText.includes('sluggish')) {
    issueDescriptors.push('performance and loading behavior');
    checklist.push('Assess the **performance and loading behavior** referenced in the feedback.');
  }
  if (lowerText.includes('font') || lowerText.includes('text')) {
    issueDescriptors.push('text presentation');
    checklist.push('Review the **text presentation** concerns described by the client.');
  }
  if (lowerText.includes('chart') || lowerText.includes('csv') || lowerText.includes('dashboard')) {
    issueDescriptors.push('dashboard functionality');
    checklist.push('Review the **dashboard functionality** areas mentioned in the request.');
  }

  if (issueDescriptors.length > 0) {
    const distinctDescriptors = Array.from(new Set(issueDescriptors));
    summary = `A professional review of ${distinctDescriptors.join(' and ')} is required to address the identified ${category.toLowerCase()} revision concerns.`;
  } else {
    summary = `The submitted ${category.toLowerCase()} deliverable requires revision based on the identified concerns.`;
  }

  changes = Array.from(new Set(checklist));
  if (changes.length === 0) {
    changes = [
      'Review the **specific part of the deliverable** referenced by the client.',
      'Assess the reported concern and translate it into the required revision work.'
    ];
  }

  return {
    category,
    summary,
    changes,
    priority,
    rawText: feedbackText
  };
}

function renderClarificationQuestions() {
  elements.loadingCard.style.display = 'none';
  elements.errorCard.style.display = 'none';
  elements.briefDisplayContainer.style.display = 'flex';
  elements.clarificationFlowContainer.style.display = 'flex';
  hideBriefContent();
  elements.clarificationQuestionsView.style.display = 'block';
  elements.clarificationConfirmationView.style.display = 'none';
  elements.clarificationQuestionsActions.style.display = 'flex';
  elements.clarificationConfirmationActions.style.display = 'none';
  elements.clarificationRoundLabel.innerText = `Round ${state.clarification.round}`;
  elements.clarificationIntroText.innerText = `Answer these five questions so Bustler can translate the request into a clearer ${state.clarification.category.toLowerCase()} brief.`;
  elements.clarificationQuestionList.innerHTML = '';

  state.clarification.questions.forEach((question, idx) => {
    const item = document.createElement('div');
    item.className = 'clarification-question-item';
    item.innerHTML = `
      <label class="clarification-question-label" for="clarification-answer-${idx}">${idx + 1}. ${question}</label>
      <textarea id="clarification-answer-${idx}" class="clarification-answer-input" placeholder="Type your answer here..."></textarea>
    `;
    if (state.clarification.answers[idx]) {
      item.querySelector('textarea').value = state.clarification.answers[idx];
    }
    elements.clarificationQuestionList.appendChild(item);
  });
}

function renderClarificationConfirmation() {
  elements.loadingCard.style.display = 'none';
  elements.errorCard.style.display = 'none';
  elements.briefDisplayContainer.style.display = 'flex';
  elements.clarificationFlowContainer.style.display = 'flex';
  hideBriefContent();
  elements.clarificationQuestionsView.style.display = 'none';
  elements.clarificationConfirmationView.style.display = 'block';
  elements.clarificationQuestionsActions.style.display = 'none';
  elements.clarificationConfirmationActions.style.display = 'flex';
  elements.clarificationProblemPreview.innerText = state.clarification.candidateIssue;
}

async function handleClarificationSubmit() {
  const answerInputs = Array.from(document.querySelectorAll('.clarification-answer-input'));
  const answers = answerInputs.map(input => input.value.trim());
  if (answers.some(answer => answer.length < 2)) {
    elements.clarificationIntroText.innerText = 'Please answer all five questions so Bustler can identify the concern accurately.';
    return;
  }

  state.clarification.answers = answers;

  // Preserve the user's dropdown category selection — only re-infer if they didn't pick one
  if (!state.selectedCategory) {
    const combinedContext = `${state.rawFeedback}\n${answers.join('\n')}`.toLowerCase();
    state.clarification.category = inferCategoryFromKeywords(combinedContext) || state.clarification.category || 'Needs Clarification';
  } else {
    state.clarification.category = state.selectedCategory;
  }

  elements.loadingCard.style.display = 'flex';
  elements.briefDisplayContainer.style.display = 'none';

  try {
    let candidateIssue;
    if (state.isSimulated) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      candidateIssue = buildCandidateIssue(state.rawFeedback, state.clarification.category, answers);
    } else {
      try {
        candidateIssue = await fetchCandidateIssue(state.rawFeedback, state.clarification.category, answers);
      } catch (apiErr) {
        console.warn('API call failed during clarification submit, falling back to local generation:', apiErr.message);
        candidateIssue = buildCandidateIssue(state.rawFeedback, state.clarification.category, answers);
      }
    }
    state.clarification.candidateIssue = candidateIssue;
    renderClarificationConfirmation();
  } catch (err) {
    console.error(err);
    elements.loadingCard.style.display = 'none';
    elements.errorMessageText.innerText = err.message || 'We could not review the clarification answers.';
    elements.errorCard.style.display = 'flex';
  }
}

async function handleClarificationRetry() {
  state.clarification.round += 1;
  elements.loadingCard.style.display = 'flex';
  elements.briefDisplayContainer.style.display = 'none';

  try {
    let questions;
    if (state.isSimulated) {
      await new Promise(resolve => setTimeout(resolve, 800));
      questions = generateClarificationQuestions(state.rawFeedback, state.clarification.category, state.clarification.round);
    } else {
      questions = await fetchClarificationQuestions(
        state.rawFeedback,
        state.clarification.category,
        state.clarification.round,
        state.clarification.answers
      );
    }
    state.clarification.questions = questions;
    state.clarification.answers = [];
    renderClarificationQuestions();
  } catch (err) {
    console.error(err);
    elements.loadingCard.style.display = 'none';
    elements.errorMessageText.innerText = err.message || 'We could not generate a new clarification round.';
    elements.errorCard.style.display = 'flex';
  }
}

async function handleClarificationConfirm() {
  elements.loadingCard.style.display = 'flex';
  elements.briefDisplayContainer.style.display = 'none';

  try {
    const enrichedFeedback = buildEnrichedFeedbackFromClarification();
    let parsedBrief;
    if (state.isSimulated) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      parsedBrief = buildBriefFromClarification();
    } else {
      try {
        parsedBrief = await callBackendGenerateBrief(enrichedFeedback);
        parsedBrief.summary = parsedBrief.summary || state.clarification.candidateIssue;
      } catch (apiErr) {
        console.warn('API call failed during final brief generation, falling back to local generation:', apiErr.message);
        parsedBrief = buildBriefFromClarification();
      }
    }

    // Ensure the user's dropdown category and priority are always used
    if (state.selectedCategory) {
      parsedBrief.category = state.selectedCategory;
    }
    if (state.selectedPriority) {
      parsedBrief.priority = state.selectedPriority;
    }

    state.currentBrief = parsedBrief;
    renderBrief(parsedBrief);
    showBriefView();
  } catch (err) {
    console.error(err);
    elements.loadingCard.style.display = 'none';
    elements.errorMessageText.innerText = err.message || 'We could not create the final brief from the clarification answers.';
    elements.errorCard.style.display = 'flex';
  }
}

function buildEnrichedFeedbackFromClarification() {
  const answersBlock = state.clarification.questions.map((question, idx) => {
    const answer = state.clarification.answers[idx] || '';
    return `Question: ${question}\nAnswer: ${answer}`;
  }).join('\n');

  return `Original client feedback:
${state.rawFeedback}

Detected category:
${state.clarification.category}

Clarification summary:
${state.clarification.candidateIssue}

Clarification answers:
${answersBlock}`;
}

// Build a brief directly from clarification state without re-running
// vagueness checks. Used as fallback when API fails or in simulated mode.
function buildBriefFromClarification() {
  const category = state.selectedCategory || state.clarification.category || 'Needs Clarification';
  const summary = state.clarification.candidateIssue || 'Revision concerns have been identified through client clarification.';
  const priority = state.selectedPriority || detectPriorityFromFeedback(state.rawFeedback.toLowerCase());

  // Build checklist items from the clarification answers
  const changes = [];
  const nonEmptyAnswers = state.clarification.answers
    .map(a => a.trim())
    .filter(Boolean);

  if (nonEmptyAnswers.length > 0) {
    // Use the first answer (typically "what part is affected") as the primary checklist item
    changes.push(`Review the **${nonEmptyAnswers[0].toLowerCase()}** based on the client's revision request.`);

    // If the user described the type of issue (typically answer 3)
    if (nonEmptyAnswers[2]) {
      changes.push(`Address the concern related to **${nonEmptyAnswers[2].toLowerCase()}** as described by the client.`);
    }

    // If the user described the expected result (typically answer 4)
    if (nonEmptyAnswers[3]) {
      changes.push(`Align the output with the client's expectation: **${nonEmptyAnswers[3].toLowerCase()}**.`);
    }
  }

  // Always ensure at least 2 checklist items
  if (changes.length < 2) {
    changes.push(`Review the ${category.toLowerCase()} deliverable for the revision concern identified during clarification.`);
    changes.push('Confirm the revised output meets the client\u2019s stated expectation before resubmission.');
  }

  return {
    category,
    summary,
    changes,
    priority: normalizePriority(priority),
    rawText: state.rawFeedback
  };
}

function hideBriefContent() {
  elements.briefDisplayContainer.querySelectorAll(':scope > .step-title-section, :scope > .back-link-wrapper, :scope > .brief-scroll-container, :scope > .action-row').forEach(node => {
    if (!node.closest('#clarification-flow-container')) {
      node.style.display = 'none';
    }
  });
}

function showBriefView() {
  elements.loadingCard.style.display = 'none';
  elements.errorCard.style.display = 'none';
  elements.briefDisplayContainer.style.display = 'flex';
  elements.clarificationFlowContainer.style.display = 'none';
  elements.briefDisplayContainer.classList.add('animate-reveal');
  elements.briefDisplayContainer.querySelectorAll(':scope > .step-title-section, :scope > .back-link-wrapper, :scope > .brief-scroll-container, :scope > .action-row').forEach(node => {
    if (!node.closest('#clarification-flow-container')) {
      node.style.display = '';
    }
  });

  // Smooth scroll down to brief display
  setTimeout(() => {
    elements.briefDisplayContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);

  showToast('Revision brief created! Review your checklist below.', 'success', 'Brief Ready');
}

// Render parsed brief structures to Step 2 page
function renderBrief(brief) {
  // Set timestamp
  const date = new Date();
  elements.briefTimestamp.innerText = `Generated at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Setup Category badge
  if (brief.category) {
    elements.briefCategory.innerText = brief.category;
    elements.categoryBadgeWrapper.style.display = 'flex';
  } else {
    elements.categoryBadgeWrapper.style.display = 'none';
  }

  // Setup priority badge
  const priorityValue = normalizePriority(brief.priority);
  const priorityClass = priorityValue === 'Not specified'
    ? 'priority-unspecified'
    : `priority-${priorityValue.toLowerCase()}`;
  elements.briefPriority.className = `badge ${priorityClass}`;
  elements.briefPriority.innerText = priorityValue;

  // Set summary text parsing markdown inline
  elements.briefSummaryText.innerHTML = formatInlineMarkdown(brief.summary);

  // Build checklist (read-only for customer review)
  elements.briefChangesList.innerHTML = '';
  brief.changes.forEach((change) => {
    const item = document.createElement('div');
    item.className = 'customer-checklist-item';
    
    item.innerHTML = `
      <div class="checklist-bullet">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="checklist-text">${formatInlineMarkdown(change)}</div>
    `;

    elements.briefChangesList.appendChild(item);
  });

  // Set Raw customer feedback to see exactly what they typed
  elements.rawTextBlock.innerText = state.rawFeedback || brief.rawFeedback || brief.rawText || (elements.feedbackInput ? elements.feedbackInput.value.trim() : '') || '—';
  
  // Reset raw accordion view heights
  elements.rawAccordionContent.classList.remove('open');
  elements.rawAccordionContent.style.maxHeight = '0px';
  if (elements.rawArrow) {
    elements.rawArrow.style.transform = 'rotate(0deg)';
  }
}

// "Back to Edit" transition (doesn't wipe out textarea input)
function backToEdit() {
  resetClarificationState();
  changeStep(1);
}

// Step 2 Action Approved -> Step 3 (Creates Brief via API)

async function approveBrief() {
  if (!state.currentBrief) return;

  syncSessionInputs();
  const isRevisionLoop = Boolean(state.isRevisionLoop && state.currentBriefToken);
  const existingToken = state.currentBriefToken;

  const customerId = state.session.currentUserId;
  const providerId = state.session.assignedProviderId;

  if (!customerId) {
    alert('Enter the current session user ID in Settings before sending the brief.');
    elements.settingsPanel.classList.add('open');
    elements.currentUserIdInput.focus();
    return;
  }

  if (!providerId) {
    alert('Enter an assigned provider ID before sending the brief.');
    elements.providerIdInput.focus();
    return;
  }

  const payload = {
    providerId,
    productId: state.session.productId || undefined,
    category: state.currentBrief.category || state.selectedCategory || 'General Service',
    summary: state.currentBrief.summary || '',
    changes: state.currentBrief.changes || [],
    priority: state.currentBrief.priority || state.selectedPriority || 'Not specified',
    rawFeedback: state.rawFeedback || ''
  };

  try {
    const endpoint = isRevisionLoop ? `${API_BASE}/${existingToken}/revision` : API_BASE;
    const res = await fetch(endpoint, {
      method: isRevisionLoop ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': customerId
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create brief on server.');
    }

    const data = await res.json();
    state.currentBriefToken = data.accessToken;

    // For local testing, include the assigned provider identity in the share link.
    // In production, Bustler can omit these params and inject the provider session directly.
    const baseOrigin = window.location.protocol === 'file:' ? 'http://localhost:8080' : window.location.origin;
    const providerUrl = `${baseOrigin}/provider.html?token=${encodeURIComponent(data.accessToken)}&user_id=${encodeURIComponent(providerId)}&role=provider`;
    
    // Update link input and view link
    const tokenInput = document.getElementById('token-link-input');
    if (tokenInput) tokenInput.value = providerUrl;

    // Attach copy button handler
    const copyBtn = document.getElementById('copy-token-link-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(providerUrl);
        copyBtn.innerText = 'Copied!';
        setTimeout(() => copyBtn.innerText = 'Copy Link', 2000);
      };
    }

    // Save token locally for persistence on refresh
    localStorage.setItem('bustler_active_token', data.accessToken);
    state.isRevisionLoop = false;

    // Broadcast revision update to other tabs (provider portal)
    if (syncChannel) {
      syncChannel.postMessage({ type: 'BRIEF_UPDATED', token: data.accessToken });
    }

  } catch (err) {
    console.error('[APPROVE BRIEF API ERROR]', err);
    alert(`Could not save the revision brief: ${err.message}.`);
    return;
  }

  elements.successTitle.innerText = isRevisionLoop ? "Revision Updated!" : "Brief Sent!";
  elements.successBody.innerText = isRevisionLoop
    ? "The existing provider link has been reused for a new revision cycle. Previous checklist progress was reset for the new round."
    : "The revision brief now has a unique access token. The backend will only return it to the linked customer or assigned provider.";
  
  showToast(isRevisionLoop ? 'Revision cycle updated and sent to provider!' : 'Revision brief approved and dispatched to provider!', 'success', 'Brief Dispatched');
  triggerSuccessAnimation();
  changeStep(3);
  startStep3Polling();
  updateStep3Status();
}

// Restarts checkmark SVG visual paths animation
function triggerSuccessAnimation() {
  const checkCircle = document.querySelector('.checkmark-circle');
  const checkBg = document.querySelector('.checkmark-bg');
  const checkMark = document.querySelector('.checkmark-check');

  if (!checkCircle || !checkBg || !checkMark) return;

  // Strip styles to reset drawing paths
  checkCircle.style.animation = 'none';
  checkBg.style.animation = 'none';
  checkMark.style.animation = 'none';

  // Force reflow
  void checkCircle.offsetWidth;

  // Re-apply animation classes
  checkCircle.style.animation = '';
  checkBg.style.animation = '';
  checkMark.style.animation = '';
}

// Polling timer for Step 3 status updates
let step3PollTimer = null;

function startStep3Polling() {
  stopStep3Polling();
  step3PollTimer = setInterval(updateStep3Status, 3000);
}

function stopStep3Polling() {
  if (step3PollTimer) {
    clearInterval(step3PollTimer);
    step3PollTimer = null;
  }
}

// Return to step 1 (completely resets everything)
function resetToStart() {
  stopStep3Polling();
  elements.feedbackInput.value = '';
  state.selectedCategory = '';
  state.selectedPriority = '';
  state.currentBrief = null;
  state.rawFeedback = '';
  state.currentBriefToken = null;
  state.isRevisionLoop = false;
  localStorage.removeItem('bustler_active_token');
  
  handleFeedbackInput();
  resetClarificationState();
  syncStep1UI();
  changeStep(1);
}
// Interactive sliding tab backdrop helper (inspired by TabsSubtle)
function initSlidingTabs() {
  const group = document.getElementById('priority-buttons-group');
  const pill = document.getElementById('priority-sliding-pill');
  if (!group || !pill) return;

  group.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      updateSlidingTabs(btn, true);
    });
    btn.addEventListener('mouseleave', () => {
      const activeBtn = group.querySelector('.priority-btn.active');
      if (activeBtn) {
        updateSlidingTabs(activeBtn, false);
      } else {
        pill.style.opacity = '0';
      }
    });
  });

  // Re-position on window resize
  window.addEventListener('resize', () => {
    const activeBtn = group.querySelector('.priority-btn.active');
    if (activeBtn) updateSlidingTabs(activeBtn, false);
  });
}

function updateSlidingTabs(targetBtn, isHover = false) {
  const group = document.getElementById('priority-buttons-group');
  const pill = document.getElementById('priority-sliding-pill');
  if (!group || !pill) return;

  if (!targetBtn) {
    pill.style.opacity = '0';
    return;
  }

  const groupRect = group.getBoundingClientRect();
  const btnRect = targetBtn.getBoundingClientRect();
  const left = btnRect.left - groupRect.left;
  const width = btnRect.width;

  pill.style.transform = `translateX(${left}px)`;
  pill.style.width = `${width}px`;
  pill.style.opacity = isHover ? '0.6' : '1';
}

// ----------------------------------------------------
// Custom Select-1 Component (shadcn / Base-UI style)
// ----------------------------------------------------
function initCustomSelect() {
  const trigger = document.getElementById('custom-select-trigger');
  const popup = document.getElementById('custom-select-popup');
  const valueDisplay = document.getElementById('custom-select-value');
  const items = document.querySelectorAll('.custom-select-item');
  const nativeSelect = document.getElementById('field-select');

  if (!trigger || !popup) return;

  const togglePopup = (force) => {
    const isCurrentlyOpen = popup.style.display !== 'none';
    const nextState = typeof force === 'boolean' ? force : !isCurrentlyOpen;
    popup.style.display = nextState ? 'block' : 'none';
    trigger.setAttribute('aria-expanded', String(nextState));
    trigger.setAttribute('data-popup-open', String(nextState));
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopup();
  });

  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = item.getAttribute('data-value') || '';
      const text = item.querySelector('.custom-select-text').innerText;
      
      // Update custom UI
      items.forEach(i => {
        i.classList.remove('active');
        i.setAttribute('aria-selected', 'false');
      });
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
      valueDisplay.innerText = text;

      // Update state & native select
      state.selectedCategory = val;
      if (nativeSelect) {
        nativeSelect.value = val;
        nativeSelect.dispatchEvent(new Event('change'));
      }
      updateGenerateButtonState();
      togglePopup(false);
    });
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target) && !popup.contains(e.target)) {
      togglePopup(false);
    }
  });

  // Keyboard navigation
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePopup(true);
      const activeItem = popup.querySelector('.custom-select-item.active') || items[0];
      if (activeItem) activeItem.focus();
    } else if (e.key === 'Escape') {
      togglePopup(false);
    }
  });
}

// Synchronizes the category select and priority buttons with state
function syncStep1UI() {
  const selectedCategory = state.selectedCategory || '';
  elements.fieldSelect.value = selectedCategory;

  const valueDisplay = document.getElementById('custom-select-value');
  const items = document.querySelectorAll('.custom-select-item');
  if (valueDisplay && items.length > 0) {
    let foundText = 'Choose a field';
    items.forEach(item => {
      const val = item.getAttribute('data-value') || '';
      if (val === selectedCategory) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        foundText = item.querySelector('.custom-select-text').innerText;
      } else {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      }
    });
    valueDisplay.innerText = foundText;
  }
  
  let activeBtn = null;
  document.querySelectorAll('.priority-btn').forEach(btn => {
    if (btn.getAttribute('data-priority') === state.selectedPriority) {
      btn.classList.add('active');
      activeBtn = btn;
    } else {
      btn.classList.remove('active');
    }
  });
  
  if (activeBtn) {
    requestAnimationFrame(() => updateSlidingTabs(activeBtn, false));
  } else {
    updateSlidingTabs(null);
  }

  updateGenerateButtonState();
}

// Updates Step 3 cards and label state based on API response
async function updateStep3Status() {
  if (state.currentStep !== 3) {
    stopStep3Polling();
    return;
  }

  const token = state.currentBriefToken || localStorage.getItem('bustler_active_token');
  if (!token) return;

  const customerId = state.session.currentUserId;
  if (!customerId) return;

  try {
    const res = await fetch(`${API_BASE}/${token}`, {
      headers: { 'X-User-Id': customerId }
    });

    if (!res.ok) return;

    const brief = await res.json();
    state.currentBrief = brief;
    const status = brief.status || 'received';

    // Hide all three success/completed/concluded cards first
    elements.step3SentCard.style.display = 'none';
    elements.step3CompletedCard.style.display = 'none';
    elements.step3ConcludedCard.style.display = 'none';

    if (status === 'received' || status === 'progress') {
      elements.step3SentCard.style.display = 'flex';
      
      // Update status indicator
      elements.providerStatusDot.className = 'provider-status-dot';
      if (status === 'progress') {
        elements.providerStatusDot.classList.add('status-progress');
        elements.providerStatusLabel.innerText = 'Provider is working on this...';
      } else {
        elements.providerStatusLabel.innerText = 'Waiting for provider...';
      }
    } else if (status === 'completed') {
      elements.step3CompletedCard.style.display = 'flex';
      renderCompletedChecklist(brief);
    } else if (status === 'concluded') {
      elements.step3ConcludedCard.style.display = 'flex';
      stopStep3Polling();
    }
  } catch (err) {
    console.error('[UPDATE STEP 3 STATUS ERROR]', err);
  }
}

// Renders the read-only checklist of completed features in Step 3 completed view
function renderCompletedChecklist(briefData) {
  const container = document.getElementById('step3-checklist-list');
  const brief = briefData || state.currentBrief;
  if (!container || !brief) return;
  
  container.innerHTML = '';
  const changes = brief.changes || [];
  const status = brief.status || 'received';
  const isOverallCompleted = (status === 'completed' || status === 'concluded');
  const completedIndices = brief.completedIndices || [];

  changes.forEach((change, idx) => {
    const isCompleted = isOverallCompleted || completedIndices.includes(idx);
    const item = document.createElement('div');
    item.className = `step3-checklist-item ${isCompleted ? 'completed' : 'pending'}`;
    
    if (isCompleted) {
      item.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>${formatInlineMarkdown(change)}</span>
      `;
    } else {
      item.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>${formatInlineMarkdown(change)} (Pending)</span>
      `;
    }
    container.appendChild(item);
  });
}

// Handles requesting a further revision loop (back to step 1)
function handleRequestFurtherRevision() {
  stopStep3Polling();
  state.isRevisionLoop = true;
  elements.feedbackInput.value = state.rawFeedback;
  handleFeedbackInput();

  changeStep(1);
  syncStep1UI();
  elements.feedbackInput.focus();
}

// Handles concluding and closing the current brief via API
async function handleConcludeClose() {
  const token = state.currentBriefToken || localStorage.getItem('bustler_active_token');
  const customerId = state.session.currentUserId;
  if (!customerId) return;

  if (token) {
    try {
      await fetch(`${API_BASE}/${token}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': customerId
        },
        body: JSON.stringify({ status: 'concluded' })
      });

      localStorage.setItem('bustler_last_sync', String(Date.now()));

      if (syncChannel) {
        syncChannel.postMessage({ type: 'BRIEF_UPDATED', token });
      }
      showToast('Revision cycle concluded and finalized.', 'success', 'Task Concluded');
    } catch (err) {
      console.error('[CONCLUDE ERROR]', err);
    }
  }

  updateStep3Status();
}

function detectPriorityFromFeedback(lowerText) {
  const highSignals = [
    'urgent', 'urgently', 'asap', 'immediately', 'right away', 'critical',
    'broken', 'not working', 'cannot', "can't", 'unable', 'deadline today',
    'before today', 'before tomorrow', 'unusable', 'failed', 'error'
  ];
  const mediumSignals = [
    'soon', 'priority', 'important', 'need this by', 'deadline', 'as early as possible'
  ];
  const lowSignals = [
    'whenever', 'not urgent', 'no rush', 'if possible', 'when you have time'
  ];

  if (lowSignals.some(signal => lowerText.includes(signal))) return 'Low';
  if (highSignals.some(signal => lowerText.includes(signal))) return 'High';
  if (mediumSignals.some(signal => lowerText.includes(signal))) return 'Medium';
  return 'Not specified';
}

// Window focus / visibility listener for customer step 3
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.currentStep === 3) {
    updateStep3Status();
  }
});
window.addEventListener('focus', () => {
  if (state.currentStep === 3) {
    updateStep3Status();
  }
});

// Start App
window.addEventListener('DOMContentLoaded', init);
