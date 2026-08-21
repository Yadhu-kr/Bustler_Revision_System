// Provider Portal — JavaScript Controller (API + Access Controlled)
// Communicates with backend Express API using security tokens & user IDs.

const API_BASE = window.location.protocol === 'file:' 
  ? 'http://localhost:8080/api/briefs' 
  : '/api/briefs';

// State
let currentToken = null;
let currentUserId = null;
let currentBrief = null;
let pollTimer = null;

// DOM Elements
const els = {
  loadingState: document.getElementById('provider-loading'),
  accessDeniedState: document.getElementById('provider-access-denied'),
  accessDeniedMsg: document.getElementById('access-denied-msg'),
  currentUserBadge: document.getElementById('current-user-badge'),
  emptyState: document.getElementById('provider-empty-state'),
  briefDisplay: document.getElementById('provider-brief-display'),
  timestamp: document.getElementById('prov-timestamp'),
  category: document.getElementById('prov-category'),
  priority: document.getElementById('prov-priority'),
  statusBadge: document.getElementById('prov-status-badge'),
  summary: document.getElementById('prov-summary'),
  checklist: document.getElementById('prov-checklist'),
  progressFill: document.getElementById('prov-progress-fill'),
  progressLabel: document.getElementById('prov-progress-label'),
  rawToggle: document.getElementById('prov-raw-toggle'),
  rawContent: document.getElementById('prov-raw-content'),
  rawArrow: document.getElementById('prov-raw-arrow'),
  rawText: document.getElementById('prov-raw-text'),
  actionRow: document.getElementById('prov-action-row'),
  btnProgress: document.getElementById('prov-btn-progress'),
  btnComplete: document.getElementById('prov-btn-complete'),
  completedBanner: document.getElementById('prov-completed-banner'),
  concludedBanner: document.getElementById('prov-concluded-banner'),
  concludedView: document.getElementById('provider-concluded-view'),
  viewBriefBtn: document.getElementById('provider-view-brief-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  // Status bar steps
  stepReceived: document.getElementById('prov-step-received'),
  stepProgress: document.getElementById('prov-step-progress'),
  stepCompleted: document.getElementById('prov-step-completed'),
  line1: document.getElementById('prov-line-1'),
  line2: document.getElementById('prov-line-2'),
};

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get('token') || params.get('brief_token'),
    user_id: params.get('user_id') || params.get('userId') || ''
  };
}

function resolveUserId(urlUserId) {
  // URL param takes highest priority for the provider portal (from the share link)
  if (urlUserId && urlUserId.trim()) return urlUserId.trim();

  if (!window.BustlerContext) return '';
  const session = window.BustlerContext.resolveSession('provider');
  session.currentUserRole = 'provider';
  window.BustlerContext.persistSession(session);
  return session.currentUserId || '';
}

function resolveToken(queryToken) {
  if (queryToken && queryToken.trim()) {
    localStorage.setItem('bustler_active_token', queryToken.trim());
    return queryToken.trim();
  }
  return localStorage.getItem('bustler_active_token') || null;
}

// Real-time tab synchronization channel
let syncChannel = null;
try {
  syncChannel = new BroadcastChannel('bustler_sync');
  syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'BRIEF_UPDATED') {
      if (!currentToken || !event.data.token || event.data.token === currentToken) {
        if (event.data.token && !currentToken) {
          currentToken = event.data.token;
        }
        fetchBriefDetails();
      }
    }
  };
} catch (_) {}

// Storage sync fallback for universal browser support
window.addEventListener('storage', (e) => {
  if (e.key === 'bustler_last_sync' || e.key === 'bustler_active_token') {
    fetchBriefDetails();
  }
});

async function init() {
  const { token: queryToken, user_id: queryUserId } = getQueryParams();
  
  currentUserId = resolveUserId(queryUserId);
  currentToken = resolveToken(queryToken);

  const session = window.BustlerContext ? window.BustlerContext.resolveSession('provider') : null;
  if (session && session.currentUserRole !== 'provider') {
    showAccessDenied('This page is restricted to provider sessions only.');
    return;
  }

  if (els.currentUserBadge) {
    els.currentUserBadge.innerText = `Current Session User ID: ${currentUserId || 'Missing'}`;
  }

  if (!currentToken) {
    showEmptyState();
    return;
  }

  if (!currentUserId) {
    showAccessDenied('No provider session user ID was supplied. In Bustler, inject window.BUSTLER_CONTEXT.currentUserId. For local testing, append ?user_id=usr_provider_123.');
    return;
  }

  // Event listeners for actions
  els.btnProgress.addEventListener('click', () => updateBriefStatus('progress'));
  els.btnComplete.addEventListener('click', async () => {
    // Automatically mark all checklist items as completed
    const checkboxes = els.checklist.querySelectorAll('.provider-checklist-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = true;
      cb.parentElement.classList.add('checked');
    });
    await syncChecklistProgress();
    await updateBriefStatus('completed');
  });

  if (els.viewBriefBtn) {
    els.viewBriefBtn.addEventListener('click', () => {
      showBriefDisplay();
    });
  }

  // Theme toggle listener
  if (els.themeToggleBtn) {
    els.themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Raw feedback accordion toggle
  els.rawToggle.addEventListener('click', toggleRawAccordion);

  // Immediate refresh when tab becomes visible or focused
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchBriefDetails();
    }
  });
  window.addEventListener('focus', () => {
    fetchBriefDetails();
  });

  // Initial fetch
  await fetchBriefDetails();

  // Active polling (every 2.5 seconds for instant feedback)
  pollTimer = setInterval(fetchBriefDetails, 2500);
}

// ---------------------------------------------------------------------------
// View State Machine
// ---------------------------------------------------------------------------
function showLoading() {
  els.loadingState.style.display = 'flex';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'none';
  if (els.concludedView) els.concludedView.style.display = 'none';
}

function showAccessDenied(message) {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'flex';
  if (message && els.accessDeniedMsg) {
    els.accessDeniedMsg.innerText = message;
  }
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'none';
  if (els.concludedView) els.concludedView.style.display = 'none';
}

function showEmptyState() {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'flex';
  els.briefDisplay.style.display = 'none';
  if (els.concludedView) els.concludedView.style.display = 'none';
}

function showBriefDisplay() {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'flex';
  if (els.concludedView) els.concludedView.style.display = 'none';
}

function showConcludedState() {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'none';
  if (els.concludedView) els.concludedView.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// API Communication
// ---------------------------------------------------------------------------
async function fetchBriefDetails() {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/${currentToken}`, {
      headers: {
        'X-User-Id': currentUserId
      }
    });

    if (res.status === 403) {
      const errorData = await res.json();
      showAccessDenied(errorData.message || 'Access denied for your User ID.');
      if (pollTimer) clearInterval(pollTimer);
      return;
    }

    if (res.status === 404) {
      showEmptyState();
      if (pollTimer) clearInterval(pollTimer);
      return;
    }

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const brief = await res.json();
    currentBrief = brief;
    renderBrief(brief);
    if (brief.status === 'concluded') {
      showConcludedState();
    } else {
      showBriefDisplay();
    }

  } catch (err) {
    console.error('[FETCH BRIEF ERROR]', err);
    // If we already rendered brief before, don't break UI on brief network blips
    if (!currentBrief) {
      showEmptyState();
    }
  }
}

async function updateBriefStatus(newStatus) {
  if (!currentToken) return;

  try {
    const res = await fetch(`${API_BASE}/${currentToken}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': currentUserId
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      applyStatus(newStatus);
      if (newStatus === 'progress') {
        showToast('Status updated: In Progress.', 'info', 'Work Started');
      } else if (newStatus === 'completed') {
        showToast('Work completed & submitted for customer review!', 'success', 'Work Submitted');
      }
      if (syncChannel) {
        syncChannel.postMessage({ type: 'BRIEF_UPDATED', token: currentToken });
      }
      fetchBriefDetails(); // Refresh
    } else {
      const err = await res.json();
      alert(`Could not update status: ${err.message || err.error}`);
    }
  } catch (err) {
    console.error('[UPDATE STATUS ERROR]', err);
  }
}

async function syncChecklistProgress() {
  if (!currentToken) return;

  const checkboxes = els.checklist.querySelectorAll('.provider-checklist-checkbox');
  const checkedIndices = [];
  checkboxes.forEach((cb, idx) => {
    if (cb.checked) {
      checkedIndices.push(idx);
    }
  });

  try {
    await fetch(`${API_BASE}/${currentToken}/checklist`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': currentUserId
      },
      body: JSON.stringify({ completedIndices: checkedIndices })
    });

    if (syncChannel) {
      syncChannel.postMessage({ type: 'BRIEF_UPDATED', token: currentToken });
    }
  } catch (err) {
    console.error('[SYNC CHECKLIST ERROR]', err);
  }

  updateChecklistProgressBar();
}

// ---------------------------------------------------------------------------
// Rendering & Helpers
// ---------------------------------------------------------------------------
function renderBrief(brief) {
  // Timestamp
  if (brief.approvedAt) {
    const date = new Date(brief.approvedAt);
    els.timestamp.innerText = `Received at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${date.toLocaleDateString()}`;
  }

  // Category badge
  els.category.innerText = brief.category || 'General Service';

  // Priority badge
  const priority = normalizePriority(brief.priority);
  const priorityClass = priority === 'Not specified'
    ? 'priority-unspecified'
    : `priority-${priority.toLowerCase()}`;
  els.priority.className = `badge ${priorityClass}`;
  els.priority.innerText = priority;

  // Summary
  els.summary.textContent = brief.summary || '—';

  // Checklist
  const completedIndices = brief.completedIndices || [];
  
  // Render checklist items if changed
  const changes = brief.changes || [];
  if (els.checklist.childElementCount !== changes.length) {
    els.checklist.innerHTML = '';
    changes.forEach((change, idx) => {
      const item = document.createElement('div');
      item.className = 'provider-checklist-item';
      const isChecked = completedIndices.includes(idx);
      if (isChecked) item.classList.add('checked');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `prov-chk-${idx}`;
      checkbox.className = 'provider-checklist-checkbox';
      checkbox.checked = isChecked;

      const label = document.createElement('label');
      label.htmlFor = `prov-chk-${idx}`;
      label.className = 'provider-checklist-text';
      label.textContent = change;

      item.appendChild(checkbox);
      item.appendChild(label);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          item.classList.add('checked');
        } else {
          item.classList.remove('checked');
        }
        syncChecklistProgress();
      });

      els.checklist.appendChild(item);
    });
  } else {
    // Update existing checkboxes state
    const checkboxes = els.checklist.querySelectorAll('.provider-checklist-checkbox');
    checkboxes.forEach((cb, idx) => {
      const isChecked = completedIndices.includes(idx);
      cb.checked = isChecked;
      if (isChecked) {
        cb.parentElement.classList.add('checked');
      } else {
        cb.parentElement.classList.remove('checked');
      }
    });
  }

  updateChecklistProgressBar();

  // Raw feedback
  els.rawText.innerText = brief.rawFeedback || brief.rawText || '—';

  // Apply current status
  applyStatus(brief.status || 'received');
}

function updateChecklistProgressBar() {
  const checkboxes = els.checklist.querySelectorAll('.provider-checklist-checkbox');
  const total = checkboxes.length;
  let checked = 0;
  checkboxes.forEach(cb => {
    if (cb.checked) checked++;
  });

  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressLabel.innerText = `${checked} / ${total} completed`;
}

function applyStatus(status) {
  // Reset all steps
  els.stepReceived.className = 'provider-step';
  els.stepProgress.className = 'provider-step';
  els.stepCompleted.className = 'provider-step';
  els.line1.className = 'provider-step-line';
  els.line2.className = 'provider-step-line';

  // Reset status badge
  els.statusBadge.className = 'badge provider-status-badge';

  // Hide completed and concluded banners and show action row by default
  els.completedBanner.style.display = 'none';
  els.concludedBanner.style.display = 'none';
  els.actionRow.style.display = 'flex';
  els.btnProgress.style.display = '';

  if (status === 'received') {
    els.stepReceived.classList.add('active');
    els.statusBadge.innerText = 'Received';
  } else if (status === 'progress') {
    els.stepReceived.classList.add('done');
    els.line1.classList.add('filled');
    els.stepProgress.classList.add('active');
    els.statusBadge.classList.add('status-progress');
    els.statusBadge.innerText = 'In Progress';
    els.btnProgress.style.display = 'none';
  } else if (status === 'completed') {
    els.stepReceived.classList.add('done');
    els.line1.classList.add('filled');
    els.stepProgress.classList.add('done');
    els.line2.classList.add('filled');
    els.stepCompleted.classList.add('active');
    els.statusBadge.classList.add('status-completed');
    els.statusBadge.innerText = 'Completed — Awaiting Review';
    els.actionRow.style.display = 'none';
    els.completedBanner.style.display = 'flex';
    // Keep polling active so if the customer reopens with a new revision or concludes, provider updates automatically!
  } else if (status === 'concluded') {
    els.stepReceived.classList.add('done');
    els.line1.classList.add('filled');
    els.stepProgress.classList.add('done');
    els.line2.classList.add('filled');
    els.stepCompleted.classList.add('done');
    els.statusBadge.classList.add('status-completed');
    els.statusBadge.innerText = 'Concluded';
    els.actionRow.style.display = 'none';
    els.concludedBanner.style.display = 'flex';
    showConcludedState();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
}

function toggleRawAccordion() {
  const isExpanded = els.rawContent.style.maxHeight && els.rawContent.style.maxHeight !== '0px';

  if (isExpanded) {
    els.rawContent.style.maxHeight = '0px';
    els.rawArrow.style.transform = 'rotate(0deg)';
  } else {
    els.rawContent.style.maxHeight = els.rawContent.scrollHeight + 'px';
    els.rawArrow.style.transform = 'rotate(180deg)';
  }
}

function normalizePriority(p) {
  if (!p) return 'Not specified';
  const lower = p.toLowerCase();
  if (lower.includes('high')) return 'High';
  if (lower.includes('med')) return 'Medium';
  if (lower.includes('low')) return 'Low';
  return 'Not specified';
}

function formatInlineMarkdown(text) {
  if (!text) return '';
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
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
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('bustler_theme', newTheme);
  if (els.themeToggleBtn) {
    els.themeToggleBtn.title = newTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', init);
