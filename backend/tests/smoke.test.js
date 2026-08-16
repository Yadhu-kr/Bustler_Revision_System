/**
 * Bustler Backend — Smoke Tests (W4 fix)
 *
 * Uses Node.js built-in test runner (`node:test`) — zero extra dependencies.
 *
 * Run:  npm test              (from backend/)
 *       node --test tests/    (direct)
 *
 * Tests spin up the Express app on a random port in-process, exercise the
 * core API lifecycle, and tear everything down. No real Firestore or Groq
 * calls are made (falls back to in-memory storage, GROQ_API_KEY not set).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server');

let server;
let BASE_URL;

/**
 * Make an HTTP request and return { status, body }.
 */
function request(method, path, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bustler Backend API — Smoke Tests', () => {
  before((_, done) => {
    server = app.listen(0, () => {
      const addr = server.address();
      BASE_URL = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  // ------- Health Check -------
  it('GET /health returns 200 with memory mode', async () => {
    const { status, body } = await request('GET', '/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.mode, 'memory');
  });

  // ------- Brief Lifecycle -------
  let accessToken;
  const CUSTOMER_ID = 'usr_test_customer';
  const PROVIDER_ID = 'usr_test_provider';

  it('POST /api/briefs — creates a brief', async () => {
    const { status, body } = await request('POST', '/api/briefs', {
      headers: { 'X-User-Id': CUSTOMER_ID },
      body: {
        providerId: PROVIDER_ID,
        productId: 'order_test_001',
        category: 'Website Development',
        summary: 'Fix the homepage layout.',
        changes: ['Adjust hero banner', 'Fix footer alignment'],
        priority: 'Medium',
        rawFeedback: 'The homepage looks broken on mobile.'
      }
    });

    assert.equal(status, 201);
    assert.ok(body.accessToken, 'Response should include accessToken');
    accessToken = body.accessToken;
  });

  it('POST /api/briefs — rejects without X-User-Id', async () => {
    const { status } = await request('POST', '/api/briefs', {
      body: {
        providerId: PROVIDER_ID,
        category: 'Test',
        summary: 'Test summary',
        changes: ['item']
      }
    });

    assert.equal(status, 401);
  });

  it('POST /api/briefs — rejects invalid payload', async () => {
    const { status } = await request('POST', '/api/briefs', {
      headers: { 'X-User-Id': CUSTOMER_ID },
      body: { providerId: PROVIDER_ID }
      // Missing required fields: category, summary, changes
    });

    assert.equal(status, 400);
  });

  it('GET /api/briefs/:token — retrieves the brief as customer', async () => {
    const { status, body } = await request('GET', `/api/briefs/${accessToken}`, {
      headers: { 'X-User-Id': CUSTOMER_ID }
    });

    assert.equal(status, 200);
    assert.equal(body.category, 'Website Development');
    assert.equal(body.viewerRole, 'customer');
    assert.equal(body.status, 'received');
  });

  it('GET /api/briefs/:token — retrieves the brief as provider', async () => {
    const { status, body } = await request('GET', `/api/briefs/${accessToken}`, {
      headers: { 'X-User-Id': PROVIDER_ID }
    });

    assert.equal(status, 200);
    assert.equal(body.viewerRole, 'provider');
  });

  it('GET /api/briefs/:token — returns 403 for unauthorized user', async () => {
    const { status } = await request('GET', `/api/briefs/${accessToken}`, {
      headers: { 'X-User-Id': 'usr_random_hacker' }
    });

    assert.equal(status, 403);
  });

  it('GET /api/briefs/:token — returns 404 for non-existent token', async () => {
    const { status } = await request('GET', '/api/briefs/non-existent-token-123', {
      headers: { 'X-User-Id': CUSTOMER_ID }
    });

    assert.equal(status, 404);
  });

  // ------- Status Updates -------
  it('PATCH /api/briefs/:token/status — provider moves to progress', async () => {
    const { status, body } = await request('PATCH', `/api/briefs/${accessToken}/status`, {
      headers: { 'X-User-Id': PROVIDER_ID },
      body: { status: 'progress' }
    });

    assert.equal(status, 200);
    assert.equal(body.status, 'progress');
  });

  it('PATCH /api/briefs/:token/status — provider completes', async () => {
    const { status, body } = await request('PATCH', `/api/briefs/${accessToken}/status`, {
      headers: { 'X-User-Id': PROVIDER_ID },
      body: { status: 'completed' }
    });

    assert.equal(status, 200);
    assert.equal(body.status, 'completed');
  });

  it('PATCH /api/briefs/:token/status — customer concludes', async () => {
    const { status, body } = await request('PATCH', `/api/briefs/${accessToken}/status`, {
      headers: { 'X-User-Id': CUSTOMER_ID },
      body: { status: 'concluded' }
    });

    assert.equal(status, 200);
    assert.equal(body.status, 'concluded');
  });

  // ------- Checklist -------
  it('PATCH /api/briefs/:token/checklist — provider updates checklist', async () => {
    // Create a new brief for this test (previous one is concluded)
    const createRes = await request('POST', '/api/briefs', {
      headers: { 'X-User-Id': CUSTOMER_ID },
      body: {
        providerId: PROVIDER_ID,
        category: 'Design',
        summary: 'Fix logo.',
        changes: ['Item 1', 'Item 2', 'Item 3'],
        priority: 'Low'
      }
    });

    const newToken = createRes.body.accessToken;

    const { status, body } = await request('PATCH', `/api/briefs/${newToken}/checklist`, {
      headers: { 'X-User-Id': PROVIDER_ID },
      body: { completedIndices: [0, 2] }
    });

    assert.equal(status, 200);
    assert.deepEqual(body.completedIndices, [0, 2]);
  });

  // ------- XSS Sanitization (#04) -------
  it('POST /api/briefs — strips HTML from stored fields', async () => {
    const { status, body } = await request('POST', '/api/briefs', {
      headers: { 'X-User-Id': CUSTOMER_ID },
      body: {
        providerId: PROVIDER_ID,
        category: 'Test XSS',
        summary: 'Fix <script>alert("xss")</script> issue',
        changes: ['<img src=x onerror=alert(1)> Fix this'],
        priority: 'High',
        rawFeedback: 'Hello <b>world</b>'
      }
    });

    assert.equal(status, 201);

    // Retrieve and verify sanitization
    const getRes = await request('GET', `/api/briefs/${body.accessToken}`, {
      headers: { 'X-User-Id': CUSTOMER_ID }
    });

    assert.equal(getRes.status, 200);
    assert.ok(!getRes.body.summary.includes('<script>'), 'summary should be sanitized');
    assert.ok(!getRes.body.changes[0].includes('<img'), 'changes should be sanitized');
    assert.ok(!getRes.body.rawFeedback.includes('<b>'), 'rawFeedback should be sanitized');
  });
});
