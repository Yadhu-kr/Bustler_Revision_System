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
// API Secret Middleware — extra security layer for production deployments
// ---------------------------------------------------------------------------
const API_SECRET = process.env.API_SECRET || '';

function requireApiSecret(req, res, next) {
  // Skip API_SECRET check if not configured (local dev) or for health endpoint
  if (!API_SECRET || req.path === '/health') {
    return next();
  }
  const provided = req.headers['x-api-secret'];
  if (provided !== API_SECRET) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or missing X-Api-Secret header.'
    });
  }
  next();
}

// Apply API_SECRET check to all /api routes
app.use('/api', requireApiSecret);

// ---------------------------------------------------------------------------
// Input Sanitization — strip HTML to prevent stored XSS
// ---------------------------------------------------------------------------
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

function sanitizeBriefFields(body) {
  if (typeof body.summary === 'string') body.summary = stripHtml(body.summary);
  if (typeof body.rawFeedback === 'string') body.rawFeedback = stripHtml(body.rawFeedback);
  if (Array.isArray(body.changes)) {
    body.changes = body.changes.map(c => typeof c === 'string' ? stripHtml(c) : c);
  }
  return body;
}

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

    const sanitized = sanitizeBriefFields({ summary, changes, rawFeedback });

    const briefDoc = {
      accessToken,
      customerId: req.userId,
      providerId: providerId.trim(),
      productId: typeof productId === 'string' ? productId.trim() : '',
      category,
      summary: sanitized.summary,
      changes: sanitized.changes,
      priority: priority || 'Not specified',
      rawFeedback: sanitized.rawFeedback || '',
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

    const sanitized = sanitizeBriefFields({ summary, changes, rawFeedback });

    await updateBrief(token, {
      providerId: providerId.trim(),
      productId: typeof productId === 'string' ? productId.trim() : '',
      category,
      summary: sanitized.summary,
      changes: sanitized.changes,
      priority: priority || 'Not specified',
      rawFeedback: sanitized.rawFeedback || '',
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

// ---------------------------------------------------------------------------
// Groq API Proxy — keeps the API key server-side only
// ---------------------------------------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(systemPrompt, userContent) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured on the server.');
  }

  const payload = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  };

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try { errorData = JSON.parse(errorText); } catch (_) {}
    const message = errorData?.error?.message || `Groq HTTP ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq.');
  return text;
}

function extractJson(text) {
  let clean = text.trim();
  if (clean.startsWith('```json')) clean = clean.substring(7);
  else if (clean.startsWith('```')) clean = clean.substring(3);
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
  return clean.trim();
}

function normalizePriority(p) {
  if (!p || typeof p !== 'string') return 'Not specified';
  const lower = p.toLowerCase().trim();
  if (lower === 'high') return 'High';
  if (lower === 'medium') return 'Medium';
  if (lower === 'low') return 'Low';
  return 'Not specified';
}

// POST /api/briefs/generate — Generate a revision brief from raw feedback
app.post('/api/briefs/generate', async (req, res) => {
  try {
    const { feedback, category, priority } = req.body;

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length < 3) {
      return res.status(400).json({ error: 'feedback is required (string, min 3 chars).' });
    }

    const selectedCategory = category || '';
    const categoryInstruction = selectedCategory
      ? `The service category is already known: "${selectedCategory}". Use this exact category. Do not guess or change it.`
      : `Infer the most likely service category from the customer's wording only.`;

    const systemPrompt = `You are Bustler's revision interpreter.

Your task is to convert a customer's informal revision message into a professional provider-facing revision brief.

Follow these rules exactly:

RULE 1 - CATEGORY
${categoryInstruction}

RULE 2 - WRITE A PROFESSIONAL SUMMARY
Rewrite the customer's feedback as a single professional sentence using industry-standard terminology appropriate to the service category.
Do NOT quote, paraphrase, or repeat the customer's exact words.
Do NOT include phrases like "the client said" or "based on feedback".
Instead, translate the intent into professional language that a skilled provider in this category would immediately understand.
For example, if a customer says "the colors look weird", write something like "The current color palette requires refinement to align with brand guidelines."
Preserve the customer's meaning but elevate the language.
Do not invent details that were not mentioned.

RULE 3 - BUILD THE CHECKLIST
Write 2 to 4 checklist items.
Each item must come directly from the customer's message but rephrased in professional category-specific language.
Describe what needs attention, clarification, correction, or revision.
Do not add generic filler items.
Do not include implementation steps the customer did not ask for.

RULE 4 - PRIORITY
Only assign a priority if the customer's own wording clearly signals urgency or severity.
If the customer does not clearly signal urgency, set priority to "Not specified".
Never guess or infer priority from your own judgment alone.

  Return only valid JSON with this exact shape:
  {"category":"...","summary":"...","checklist":["...","..."],"priority":"High|Medium|Low|Not specified"}`;

    const raw = await callGroq(systemPrompt, feedback.trim());
    const parsed = JSON.parse(extractJson(raw));

    const brief = {
      category: parsed.category || selectedCategory || 'General Service',
      summary: parsed.summary || 'A revision summary was built based on client requirements.',
      changes: Array.isArray(parsed.checklist)
        ? parsed.checklist
        : (Array.isArray(parsed.changes) ? parsed.changes : ['Adjust delivered work file elements according to feedback description.']),
      priority: normalizePriority(priority || parsed.priority),
      rawText: raw
    };

    console.log(`[GENERATE] Brief generated for category "${brief.category}"`);
    res.json(brief);

  } catch (err) {
    console.error('[GENERATE ERROR]', err);
    res.status(502).json({ error: 'Failed to generate brief.', details: err.message });
  }
});

// POST /api/briefs/clarify — Generate clarification questions
app.post('/api/briefs/clarify', async (req, res) => {
  try {
    const { feedback, category, round, previousAnswers } = req.body;

    if (!feedback || typeof feedback !== 'string') {
      return res.status(400).json({ error: 'feedback is required.' });
    }

    const cat = category || 'General Service';
    const systemPrompt = `You are Bustler's clarification assistant.

The user's feedback is too vague to create a provider-ready revision brief.
The service category is already known: "${cat}". Do NOT ask any question about which field, type of service, or category this belongs to.
Generate exactly 5 short, practical clarification questions for the client.

Rules:
- Do NOT ask about the service category or type of work — it is already known.
- The questions must help identify the actual issue within the ${cat} category.
- Focus on symptoms, affected deliverable area, expected outcome, visible example, and severity.
- Avoid technical jargon unless it naturally matches the category.
- Each question must be one sentence.
- If this is not the first round, ask a different set of questions from the previous round.

Return only valid JSON:
{"questions":["...","...","...","...","..."]}`;

    const userPrompt = JSON.stringify({
      raw_feedback: feedback,
      likely_category: cat,
      round: round || 1,
      previous_answers: previousAnswers || []
    });

    const raw = await callGroq(systemPrompt, userPrompt);
    const parsed = JSON.parse(extractJson(raw));
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 5) : [];

    res.json({ questions });

  } catch (err) {
    console.error('[CLARIFY ERROR]', err);
    res.status(502).json({ error: 'Failed to generate clarification questions.', details: err.message });
  }
});

// POST /api/briefs/candidate-issue — Synthesise a candidate issue statement
app.post('/api/briefs/candidate-issue', async (req, res) => {
  try {
    const { feedback, category, answers } = req.body;

    if (!feedback || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'feedback (string) and answers (array) are required.' });
    }

    const systemPrompt = `You are Bustler's revision interpreter.

You have the client's original feedback and their answers to clarification questions.
Write one short professional issue statement that describes what the client most likely wants revised.

Rules:
- Preserve meaning without inventing facts.
- Be specific when the answers are specific.
- Do not prescribe the fix.
- Keep it to 1 or 2 sentences.

Return only valid JSON:
{"issue":"..."}`;

    const userPrompt = JSON.stringify({
      raw_feedback: feedback,
      category: category || 'General Service',
      clarification_answers: answers
    });

    const raw = await callGroq(systemPrompt, userPrompt);
    const parsed = JSON.parse(extractJson(raw));

    res.json({ issue: parsed.issue || '' });

  } catch (err) {
    console.error('[CANDIDATE-ISSUE ERROR]', err);
    res.status(502).json({ error: 'Failed to generate candidate issue.', details: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'bustler-backend', mode: useFirestore ? 'firestore' : 'memory' });
});

// Start Server (only when run directly, not when required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Bustler Backend running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api/briefs`);
  });
}

module.exports = app;

