require('dotenv').config();
const express = require('express');
const path = require('path');
const { ActiveCampaignClient } = require('./lib/ac-client');
const { buildDataset, summarize, groupBy } = require('./lib/analysis');
const { PIPELINE_REGION_MAP } = require('./lib/config');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS || 300) * 1000;

// How far back to pull deals/contacts from ActiveCampaign. The account has
// ~47k deals across all pipelines going back to 2016 -- pulling everything
// is slow and, worse, silently truncates data for whichever pipeline sorts
// last once AC's pagination cap is hit (this is what caused LATAM lost
// reasons to show up empty). Scoping to a rolling window keeps requests
// fast and complete for the window that actually matters day-to-day.
const DATA_WINDOW_MONTHS = Number(process.env.DATA_WINDOW_MONTHS || 6);
const DATA_WINDOW_MS = DATA_WINDOW_MONTHS * 30 * 24 * 60 * 60 * 1000;

let client;
try {
  client = new ActiveCampaignClient({ apiUrl: process.env.AC_API_URL, apiKey: process.env.AC_API_KEY });
} catch (e) {
  console.warn(`[startup] ${e.message} — /api routes will return 500 until env vars are set.`);
}

// Simple in-memory cache so opening the dashboard (and its filter changes)
// doesn't re-hit the AC API on every request. Cleared after CACHE_TTL_MS.
let cache = { at: 0, records: null };

async function getRecords() {
  const now = Date.now();
  if (cache.records && now - cache.at < CACHE_TTL_MS) return cache.records;

const windowStart = new Date(now - DATA_WINDOW_MS).toISOString().slice(0, 10);

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
  cache = { at: now, records };
  return records;
}

app.get('/health', (req, res) => res.json({ ok: true }));

// Introspection endpoint used to fill in lib/config.js — safe to leave live,
// it only returns field/pipeline metadata, not lead data.
app.get('/api/schema', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    const [pipelines, stages, dealFields, contactFields] = await Promise.all([
      client.listPipelines(),
      client.listDealStages(),
      client.listDealCustomFieldMeta(),
      client.listContactCustomFieldMeta(),
      ]);
    res.json({ pipelines, stages, dealFields, contactFields, currentRegionMap: PIPELINE_REGION_MAP });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/summary', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    const region = req.query.region; // 'USA' | 'Spain' | 'LATAM' | undefined = all
  let records = await getRecords();
    if (region && region !== 'all') records = records.filter((r) => r.region === region);
    res.json({
      generatedAt: new Date().toISOString(),
      cacheAgeSeconds: Math.round((Date.now() - cache.at) / 1000),
      dataWindowMonths: DATA_WINDOW_MONTHS,
      summary: summarize(records),
      byRegion: groupBy(records, 'region'),
      records,
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/refresh', async (req, res) => {
  cache = { at: 0, records: null };
  try {
    await getRecords();
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`4Geeks AC dashboard listening on :${PORT}`));
