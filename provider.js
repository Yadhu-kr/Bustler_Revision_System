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
    token: params.get('token') || params.get('brief_token')
  };
}

function resolveUserId() {
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

async function init() {
  const { token: queryToken } = getQueryParams();
  
  currentUserId = resolveUserId();
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

  // Raw feedback accordion toggle
  els.rawToggle.addEventListener('click', toggleRawAccordion);

  // Initial fetch
  await fetchBriefDetails();

  // Start real-time polling (every 3 seconds)
  pollTimer = setInterval(fetchBriefDetails, 3000);
}

// ---------------------------------------------------------------------------
// View State Machine
// ---------------------------------------------------------------------------
function showLoading() {
  els.loadingState.style.display = 'flex';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'none';
}

function showAccessDenied(message) {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'flex';
  if (message && els.accessDeniedMsg) {
    els.accessDeniedMsg.innerText = message;
  }
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'none';
}

function showEmptyState() {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'flex';
  els.briefDisplay.style.display = 'none';
}

function showBriefDisplay() {
  els.loadingState.style.display = 'none';
  els.accessDeniedState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.briefDisplay.style.display = 'flex';
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
    showBriefDisplay();

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
  els.summary.innerHTML = formatInlineMarkdown(brief.summary || '—');

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

      item.innerHTML = `
        <input type="checkbox" id="prov-chk-${idx}" class="provider-checklist-checkbox" ${isChecked ? 'checked' : ''}>
        <label for="prov-chk-${idx}" class="provider-checklist-text">${formatInlineMarkdown(change)}</label>
      `;

      const checkbox = item.querySelector('input');
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
    els.statusBadge.innerText = 'Completed';
    els.actionRow.style.display = 'none';
    els.completedBanner.style.display = 'flex';
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

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', init);
