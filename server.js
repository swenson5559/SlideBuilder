require('dotenv').config();
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');

const app  = express();
const PORT = process.env.PORT || 3000;

// In production, store token on a persistent volume mounted at /app/data
const TOKEN_DIR  = process.env.TOKEN_DIR || __dirname;
const TOKEN_PATH = path.join(TOKEN_DIR, 'token.json');

// Public URL: set PUBLIC_URL env var in production (e.g. https://yourapp.railway.app)
// Falls back to localhost for local development.
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Startup diagnostics — confirm env vars reach the runtime
console.log('[startup] PORT:', PORT);
console.log('[startup] PUBLIC_URL:', PUBLIC_URL);
console.log('[startup] GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `set (${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}…)` : 'NOT SET');
console.log('[startup] GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'set' : 'NOT SET');
console.log('[startup] ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET');

// ── Auth helpers ──────────────────────────────────────────────────────────────
function oauthClient() {
  const { google } = require('googleapis');
  let client_id, client_secret;
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    // Production: individual env vars
    client_id     = process.env.GOOGLE_CLIENT_ID;
    client_secret = process.env.GOOGLE_CLIENT_SECRET;
  } else {
    // Local: read from credentials.json
    const localPath = path.join(__dirname, 'credentials.json');
    if (!fs.existsSync(localPath)) throw new Error('GOOGLE_CLIENT_ID/SECRET env vars not set and credentials.json not found.');
    const creds = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    ({ client_id, client_secret } = creds.installed || creds.web);
  }
  return new google.auth.OAuth2(client_id, client_secret, `${PUBLIC_URL}/auth/callback`);
}

function authedClient() {
  // Read token from env var (production) or token.json file (local)
  const raw = process.env.GOOGLE_TOKEN || (fs.existsSync(TOKEN_PATH) ? fs.readFileSync(TOKEN_PATH, 'utf8') : null);
  if (!raw) return null;
  const client = oauthClient();
  client.setCredentials(JSON.parse(raw));
  return client;
}

function extractId(val) {
  if (!val || !val.trim()) return null;
  const m = val.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : val.trim();
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/auth/status', (req, res) => {
  try {
    res.json({ connected: !!authedClient() });
  } catch (e) {
    console.error('[auth/status]', e.message);
    res.json({ connected: false });
  }
});

app.get('/auth/google', (req, res) => {
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(req.query.code);
    // Always write to file (works locally and on Railway ephemeral disk)
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    // Log the token so you can copy it into GOOGLE_TOKEN env var on Railway
    if (process.env.PUBLIC_URL) console.log('[auth] GOOGLE_TOKEN:', JSON.stringify(tokens));
    res.redirect('/?connected=true');
  } catch (err) {
    res.redirect('/?error=auth_failed');
  }
});

app.post('/generate', upload.single('logo'), async (req, res) => {
  try {
    const auth = authedClient();
    if (!auth) return res.status(401).json({ error: 'Not connected to Google. Please connect your account first.' });

    const {
      presentationId, templateId,
      title, clientName, tagline,
      primaryColor, secondaryColor, accentColor, bgColor, textColor,
      font, slideSize, slideCount, tone, audience, description,
    } = req.body;

    if (!description || description.trim().length < 10)
      return res.status(400).json({ error: 'Please provide a presentation description.' });

    const cleanPresentationId = extractId(presentationId);
    const cleanTemplateId     = extractId(templateId);
    console.log('[generate] presentationId:', cleanPresentationId, '| templateId:', cleanTemplateId);

    // ── Template mode: structure is driven by the template itself ────────────────
    if (cleanTemplateId) {
      const { buildFromTemplateInPlace } = require('./slideBuilder');
      const url = await buildFromTemplateInPlace(
        auth, cleanTemplateId, title, clientName, description, tone, audience
      );
      return res.json({ url });
    }

    // ── Scratch mode: Claude generates the full slide structure ───────────────────
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const claudeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: `You are a senior presentation strategist. You build decks that move audiences.

Output: a valid JSON array only — no markdown, no explanation, nothing else.

Principles:
- One idea per slide. If a headline needs "and", split the slide.
- Headlines are the insight, not the topic. Write the conclusion, not the category.
- Chapter slides open a tension or question. "The market shifted while we slept" beats "Market Overview".
- Use stat slides when a number is the point. Use quote slides for moments of emphasis. Use two-column for direct comparisons.
- Every slide earns its place. No filler.`,
      messages: [{
        role: 'user',
        content: `Build a presentation deck.

Client: ${clientName || 'Client'}
Title: ${title || 'Presentation'}
Tagline: ${tagline || ''}
Tone: ${tone || 'Professional'}
Audience: ${audience || 'General'}
Slide count: ~${slideCount || 10}

Brief:
${description}

Choose the right layout for each moment. Available layouts:

{ "layout": "title",             "headline": "...", "tagline": "..." }
{ "layout": "agenda",            "title": "Agenda", "items": [{ "number": "01", "label": "..." }] }
{ "layout": "chapter",           "title": "...", "description": "..." }
{ "layout": "content",           "title": "...", "subtopics": [{ "heading": "...", "text": "..." }] }
{ "layout": "big-statement",     "statement": "...", "context": "..." }
{ "layout": "stat",              "value": "42%", "label": "...", "context": "..." }
{ "layout": "metrics",           "title": "...", "items": [{ "value": "42%", "label": "..." }] }
{ "layout": "quote",             "text": "...", "attribution": "Name, Role" }
{ "layout": "testimonial",       "company": "...", "quote": "...", "name": "...", "role": "..." }
{ "layout": "timeline",          "title": "...", "steps": [{ "label": "...", "text": "..." }] }
{ "layout": "roadmap",           "title": "...", "milestones": [{ "date": "Q1 2025", "label": "...", "text": "..." }] }
{ "layout": "three-column",      "title": "...", "columns": [{ "heading": "...", "text": "..." }] }
{ "layout": "numbered-list",     "title": "...", "items": [{ "heading": "...", "text": "..." }] }
{ "layout": "checklist",         "title": "...", "items": [{ "text": "...", "note": "..." }] }
{ "layout": "two-column",        "title": "...", "leftHeading": "...", "leftBody": "...", "rightHeading": "...", "rightBody": "..." }
{ "layout": "comparison-table",  "title": "...", "options": ["Option A", "Option B", "Option C"], "rows": [{ "label": "Feature", "values": ["Yes", "No", "Yes"] }] }
{ "layout": "full-bleed-text",   "headline": "...", "body": "..." }
{ "layout": "chart",             "title": "...", "chartType": "bar", "labels": ["Jan", "Feb", "Mar"], "datasets": [{ "label": "Series A", "data": [40, 65, 30] }], "caption": "[Placeholder — update with actual figures]" }
{ "layout": "closing",           "headline": "...", "subline": "..." }

When to use each:
- content: default workhorse — titled slide with 2–4 subtopic cards
- big-statement: one powerful sentence that deserves the whole slide (1–2 per deck)
- stat: a single number IS the point
- metrics: 2–4 numbers that belong together
- quote: a striking phrase from a customer, expert, or the brief
- testimonial: a customer quote with company + person attribution
- timeline: a process or sequence (3–5 steps)
- roadmap: milestones with dates (3–5 milestones)
- three-column: three equal pillars, options, or benefits
- numbered-list: 3–5 ordered points where sequence matters
- checklist: requirements, criteria, or deliverables
- two-column: direct contrast between two things
- comparison-table: structured options × criteria grid (2–3 options, 3–6 rows)
- full-bleed-text: a concept that needs room to breathe — minimal, editorial
- agenda: place near the start to outline the deck's chapters
- chart: when a trend, comparison, or composition is better shown as a graph than stated as text. chartType options: bar (comparisons), line (trends over time), pie or doughnut (composition/share). Always set caption to "[Placeholder — update with actual figures]". Use plausible non-zero placeholder numbers (e.g. 40, 65, 30) — never claim they are real. Values must be visible on the chart.

Rules:
- Structure: title → (optional agenda) → chapters with supporting slides → closing
- Vary layouts — avoid the same layout back to back
- Never put two chapter slides in a row
- content subtopic count: vary between 2, 3, and 4`,
      }],
    });

    let slides;
    try {
      const raw = claudeRes.content[0].text.trim().replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
      slides = JSON.parse(raw);
    } catch {
      console.error('[claude] raw response:', claudeRes.content[0].text.slice(0, 500));
      return res.status(500).json({ error: 'Failed to parse AI-generated slide structure. Please try again.' });
    }

    const { buildPresentation } = require('./slideBuilder');
    const branding = { primaryColor, secondaryColor, accentColor, bgColor, textColor, font };
    const url = await buildPresentation(auth, slides, branding, title, cleanPresentationId, null, req.file?.path, req.file?.mimetype);

    res.json({ url, slideCount: slides.length });
  } catch (err) {
    console.error(err);
    if (err.message === 'DRIVE_SCOPE_MISSING') {
      return res.status(403).json({ error: 'Template copying requires Drive access. Please click Reconnect and re-authorize.' });
    }
    res.status(500).json({ error: err.message || 'Something went wrong.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Slide Builder → http://localhost:${PORT}\n`);
});
