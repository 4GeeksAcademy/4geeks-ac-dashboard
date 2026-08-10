require('dotenv').config();
const express = require('express');
const path = require('path');
const { ActiveCampaignClient } = require('./lib/ac-client');
const { buildDataset } = require('./lib/analysis');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

// How far back to pull deals/contacts from ActiveCampaign. The account has
// ~47k deals across all pipelines going back years -- pulling everything is
// slow and, worse, silently truncates data for whichever pipeline sorts last
// once AC's pagination cap is hit (this is what caused LATAM lost reasons to
// show up empty). Scoping to a rolling window keeps requests complete for
// the window that actually matters day-to-day.
const DATA_WINDOW_MONTHS = Number(process.env.DATA_WINDOW_MONTHS || 6);
const DATA_WINDOW_MS = DATA_WINDOW_MONTHS * 30 * 24 * 60 * 60 * 1000;

let client;
try {
    client = new ActiveCampaignClient({ apiUrl: process.env.AC_API_URL, apiKey: process.env.AC_API_KEY });
} catch (e) {
    console.warn(`[startup] ${e.message} -- /api routes will return 500 until env vars are set.`);
}

// The ActiveCampaign pull (deals + contacts + per-deal/per-contact custom
// field data for the whole window) can take a couple of minutes on a cold
// cache -- longer than Railway's edge proxy will hold a request open. So we
// NEVER do this fetch inline inside a request handler. A background loop
// keeps `cache.records` warm; route handlers only ever read whatever is
// currently cached and return immediately.
let cache = { at: 0, records: null };
let refreshing = false;
let lastError = null;

async function refreshCache() {
    if (!client || refreshing) return;
    refreshing = true;
    const startedAt = Date.now();
    try {
          const windowStart = new Date(startedAt - DATA_WINDOW_MS).toISOString().slice(0, 10);

      const [deals, contactsRaw] = await Promise.all([
              client.listDeals({ createdAfter: windowStart }),
              client.listContacts({ createdAfter: windowStart }),
            ]);

      const dealIds = deals.map((d) => d.id);
          const contactIds = contactsRaw.map((c) => c.id);

      const [dealCustomFieldData, fieldValuesRaw] = await Promise.all([
              client.listDealCustomFieldDataForDeals(dealIds),
              client.listContactFieldValuesForContacts(contactIds),
            ]);

  const contactsById = new Map(contactsRaw.map((c) => [String(c.id), c]));
      const contactFieldValuesById = new Map();
      fieldValuesRaw.forEach((fv) => {
          const key = String(fv.contact);
          if (!contactFieldValuesById.has(key)) contactFieldValuesById.set(key, []);
          contactFieldValuesById.get(key).push(fv);
      });

  const records = buildDataset({ deals, dealCustomFieldData, contactsById, contactFieldValuesById });
      cache = { at: Date.now(), records };
      lastError = null;
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[refresh] ok -- ${records.length} records (${deals.length} deals, ${contactsRaw.length} contacts) in ${secs}s`);
    } catch (e) {
      lastError = e.message;
      console.error(`[refresh] failed: ${e.message}`);
    } finally {
      refreshing = false;
    }
}

if (client) {
  refreshCache();
  setInterval(refreshCache, CACHE_TTL_MS);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));


app.get('/api/status', (req, res) => {
  res.json({
    ready: !!cache.records,
    refreshing,
    lastUpdated: cache.at ? new Date(cache.at).toISOString() : null,
    dataWindowMonths: DATA_WINDOW_MONTHS,
    lastError,
  });
});

app.get('/api/summary', (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  if (!cache.records) {
    return res.status(202).json({ ready: false, refreshing, lastError });
  }
  const region = req.query.region;
  const records = region ? cache.records.filter((r) => r.region === region) : cache.records;
  res.json({
    records,
    generatedAt: new Date(cache.at).toISOString(),
    cacheAgeSeconds: Math.round((Date.now() - cache.at) / 1000),
    dataWindowMonths: DATA_WINDOW_MONTHS,
  });
});

app.post('/api/refresh', (req, res) => {
  refreshCache();
  res.json({ started: true, refreshing: true });
});

app.get('/api/schema', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    const [pipelines, stages, dealFields, contactFields] = await Promise.all([
      client.listPipelines(),
      client.listDealStages(),
      client.listDealCustomFieldMeta(),
      client.listContactCustomFieldMeta(),
      ]);
    res.json({ pipelines, stages, dealFields, contactFields });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Free-text "ask AI" panel on the dashboard. The client sends the question
// plus an already-aggregated JSON summary of whatever is currently filtered
// on screen (not the raw record list -- keeps token usage sane even when
// thousands of deals are in view). Requires ANTHROPIC_API_KEY to be set.
app.post('/api/ask', async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    }
    const { question, context } = req.body || {};
    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'question is required' });
    }
    try {
        const system = 'You are a sharp, concise data analyst helping the 4Geeks Academy admissions/sales team read their ActiveCampaign deal pipeline. You are given a JSON summary of the deals currently shown on their dashboard (already filtered to what they are looking at) -- counts, breakdowns by region/source/campaign/etc, and a small sample of individual deals. Answer the question using ONLY this data. Cite concrete numbers and percentages. If the data cannot answer the question, say so plainly instead of guessing. Keep the answer tight -- a short paragraph or a few bullet points, not a full report.';
        const userContent = `Question: ${question}\n\nDashboard data (JSON):\n${JSON.stringify(context || {})}`;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                max_tokens: 1024,
                system,
                messages: [{ role: 'user', content: userContent }],
            }),
        });
        if (!r.ok) {
            const errText = await r.text();
            return res.status(502).json({ error: `Anthropic API error (${r.status}): ${errText.slice(0, 300)}` });
        }
        const data = await r.json();
        const answer = (data.content || []).map((b) => b.text || '').join('\n').trim();
        res.json({ answer });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


app.listen(PORT, () => console.log(`4Geeks AC dashboard listening on :${PORT}`));
