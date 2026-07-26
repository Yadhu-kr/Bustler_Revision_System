/**
 * Bustler Backend — Revision Brief API
 * 
 * Token-based access control for revision briefs.
 * Only the customer who created a brief and the assigned provider can access it.
 * 
 * Storage:
 *   - Local Development: In-memory store (zero configuration required)
 *   - Production / Cloud Run: Cloud Firestore
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ---------------------------------------------------------------------------
// Storage Layer (Firestore with fallback to In-Memory for local dev)
// ---------------------------------------------------------------------------
const projectId = process.env.GCP_PROJECT_ID;
const hasGoogleCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
let useFirestore = false;
let db = null;
const memoryStore = new Map(); // Local dev fallback

if (projectId || process.env.K_SERVICE || hasGoogleCredentials) {
  try {
    const admin = require('firebase-admin');
    admin.initializeApp({
      ...(projectId && { projectId }),
    });
    db = admin.firestore();
    useFirestore = true;
    console.log(`✅ Using Cloud Firestore storage (Project: ${projectId || 'Cloud Run Default'})`);
  } catch (err) {
    console.warn(`⚠️ Firestore init skipped (${err.message}). Falling back to local in-memory storage.`);
  }
}

if (!useFirestore) {
  console.log(`ℹ️ Running in Local Development mode (In-Memory database active — no GCP setup needed!).`);
}

// Data Access Helpers
async function saveBrief(token, briefData) {
  if (useFirestore && db) {
    const admin = require('firebase-admin');
    await db.collection('briefs').doc(token).set({
      ...briefData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    memoryStore.set(token, {
      ...briefData,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString()
    });
  }
}

async function getBrief(token) {
  if (useFirestore && db) {
    const doc = await db.collection('briefs').doc(token).get();
    if (!doc.exists) return null;
    const brief = doc.data();
    return {
      ...brief,
      createdAt: brief.createdAt?.toDate?.()?.toISOString?.() || brief.createdAt,
      approvedAt: brief.approvedAt?.toDate?.()?.toISOString?.() || brief.approvedAt
    };
  } else {
    return memoryStore.get(token) || null;
  }
}

async function updateBrief(token, updateData) {
  if (useFirestore && db) {
    const admin = require('firebase-admin');
    await db.collection('briefs').doc(token).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    const existing = memoryStore.get(token);
    if (existing) {
      memoryStore.set(token, {
        ...existing,
        ...updateData,
        updatedAt: new Date().toISOString()
      });
    }
  }
}

function buildRevisionSnapshot(brief) {
  return {
    category: brief.category,
    summary: brief.summary,
    changes: brief.changes,
    priority: brief.priority,
    rawFeedback: brief.rawFeedback,
    status: brief.status,
    completedIndices: brief.completedIndices || [],
    revisionRound: brief.revisionRound || 1,
    archivedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Express App Setup
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ---------------------------------------------------------------------------
// Auth Middleware — Extract userId from X-User-Id header
// ---------------------------------------------------------------------------
function requireUserId(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return res.status(401).json({
      error: 'Missing or invalid X-User-Id header',
      message: 'You must provide your user ID via the X-User-Id HTTP header.'
    });
  }
  req.userId = userId.trim();
  next();
}

function getViewerRole(userId, brief) {
  if (userId === brief.customerId) return 'customer';
  if (userId === brief.providerId) return 'provider';
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/briefs — Create a new brief
// ---------------------------------------------------------------------------
app.post('/api/briefs', requireUserId, async (req, res) => {
  try {
    const {
      providerId,
      productId,
      category,
      summary,
      changes,
      priority,
      rawFeedback
    } = req.body;

    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ error: 'providerId is required (string).' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required (string).' });
    }
    if (!summary || typeof summary !== 'string') {
      return res.status(400).json({ error: 'summary is required (string).' });
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes must be a non-empty array of strings.' });
    }

    const accessToken = uuidv4();

    const briefDoc = {
      accessToken,
      customerId: req.userId,
      providerId: providerId.trim(),
      productId: typeof productId === 'string' ? productId.trim() : '',
      category,
      summary,
      changes,
      priority: priority || 'Not specified',
      rawFeedback: rawFeedback || '',
      status: 'received',
      completedIndices: [],
      revisionRound: 1,
      revisionHistory: []
    };

    await saveBrief(accessToken, briefDoc);

    console.log(`[CREATE] Brief ${accessToken} created by ${req.userId} for provider ${providerId}`);

    res.status(201).json({
      briefId: accessToken,
      accessToken,
      message: 'Brief created successfully.'
    });

  } catch (err) {
    console.error('[CREATE ERROR]', err);
    res.status(500).json({ error: 'Failed to create brief.', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/briefs/:token/revision — Reuse the same brief token for a new cycle
// ---------------------------------------------------------------------------
app.patch('/api/briefs/:token/revision', requireUserId, async (req, res) => {
  try {
    const { token } = req.params;
    const {
      providerId,
      productId,
      category,
      summary,
      changes,
      priority,
      rawFeedback
    } = req.body;

    const brief = await getBrief(token);
    if (!brief) {
      return res.status(404).json({ error: 'Brief not found.' });
    }

    const viewerRole = getViewerRole(req.userId, brief);
    if (viewerRole !== 'customer') {
      return res.status(403).json({
        error: 'Access denied.',
        message: 'Only the customer can reopen a brief with a new revision cycle.'
      });
    }

    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ error: 'providerId is required (string).' });
    }
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category is required (string).' });
    }
    if (!summary || typeof summary !== 'string') {
      return res.status(400).json({ error: 'summary is required (string).' });
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes must be a non-empty array of strings.' });
    }

    const revisionHistory = Array.isArray(brief.revisionHistory) ? brief.revisionHistory : [];
    revisionHistory.push(buildRevisionSnapshot(brief));

    await updateBrief(token, {
      providerId: providerId.trim(),
      productId: typeof productId === 'string' ? productId.trim() : '',
      category,
      summary,
      changes,
      priority: priority || 'Not specified',
      rawFeedback: rawFeedback || '',
      status: 'received',
      completedIndices: [],
      revisionRound: (brief.revisionRound || 1) + 1,
      revisionHistory
    });

    console.log(`[REVISION] Brief ${token} reopened for round ${(brief.revisionRound || 1) + 1} by ${req.userId}`);
    res.json({
      message: 'Revision cycle restarted.',
      accessToken: token,
      revisionRound: (brief.revisionRound || 1) + 1
    });
  } catch (err) {
    console.error('[REVISION ERROR]', err);
    res.status(500).json({ error: 'Failed to restart revision cycle.', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/briefs/:token — Retrieve a brief (access-controlled)
// ---------------------------------------------------------------------------
app.get('/api/briefs/:token', requireUserId, async (req, res) => {
  try {
    const { token } = req.params;
    const brief = await getBrief(token);

    if (!brief) {
      return res.status(404).json({ error: 'Brief not found.' });
    }

    // Access control: only customer or provider can view
    const viewerRole = getViewerRole(req.userId, brief);
    if (!viewerRole) {
      console.warn(`[ACCESS DENIED] User ${req.userId} tried to access brief ${token} (owner: ${brief.customerId}, provider: ${brief.providerId})`);
      return res.status(403).json({
        error: 'Access denied.',
        message: 'You do not have permission to view this brief.'
      });
    }

    res.json({
      ...brief,
      viewerRole
    });

  } catch (err) {
    console.error('[GET ERROR]', err);
    res.status(500).json({ error: 'Failed to retrieve brief.', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/briefs/:token/status — Update brief status
// ---------------------------------------------------------------------------
app.patch('/api/briefs/:token/status', requireUserId, async (req, res) => {
  try {
    const { token } = req.params;
    const { status } = req.body;

    const validStatuses = ['received', 'progress', 'completed', 'concluded'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const brief = await getBrief(token);
    if (!brief) {
      return res.status(404).json({ error: 'Brief not found.' });
    }

    const viewerRole = getViewerRole(req.userId, brief);
    if (!viewerRole) {
      return res.status(403).json({
        error: 'Access denied.',
        message: 'You do not have permission to update this brief.'
      });
    }

    if (viewerRole === 'provider' && !['progress', 'completed'].includes(status)) {
      return res.status(403).json({
        error: 'Invalid role action.',
        message: 'Providers can only move briefs to progress or completed.'
      });
    }

    if (viewerRole === 'customer' && status !== 'concluded') {
      return res.status(403).json({
        error: 'Invalid role action.',
        message: 'Customers can only conclude a brief.'
      });
    }

    if (viewerRole === 'customer' && status === 'concluded' && brief.status !== 'completed') {
      return res.status(409).json({
        error: 'Invalid status transition.',
        message: 'A brief can only be concluded after the provider marks it completed.'
      });
    }

    await updateBrief(token, { status });

    console.log(`[STATUS] Brief ${token} → ${status} by ${req.userId}`);
    res.json({ message: 'Status updated.', status });

  } catch (err) {
    console.error('[STATUS ERROR]', err);
    res.status(500).json({ error: 'Failed to update status.', details: err.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/briefs/:token/checklist — Update completed checklist indices
// ---------------------------------------------------------------------------
app.patch('/api/briefs/:token/checklist', requireUserId, async (req, res) => {
  try {
    const { token } = req.params;
    const { completedIndices } = req.body;

    if (!Array.isArray(completedIndices)) {
      return res.status(400).json({ error: 'completedIndices must be an array of numbers.' });
    }

    const brief = await getBrief(token);
    if (!brief) {
      return res.status(404).json({ error: 'Brief not found.' });
    }

    const viewerRole = getViewerRole(req.userId, brief);
    if (!viewerRole) {
      return res.status(403).json({
        error: 'Access denied.',
        message: 'You do not have permission to update this brief.'
      });
    }

    if (viewerRole !== 'provider') {
      return res.status(403).json({
        error: 'Invalid role action.',
        message: 'Only the assigned provider can update checklist progress.'
      });
    }

    await updateBrief(token, { completedIndices });

    res.json({ message: 'Checklist updated.', completedIndices });

  } catch (err) {
    console.error('[CHECKLIST ERROR]', err);
    res.status(500).json({ error: 'Failed to update checklist.', details: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bustler-backend', mode: useFirestore ? 'firestore' : 'memory' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Bustler Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api/briefs`);
});
