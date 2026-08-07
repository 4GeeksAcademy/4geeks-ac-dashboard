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

app.listen(PORT, () => console.log(`4Geeks AC dashboard listening on :${PORT}`));
