require('dotenv').config();
const express = require('express');
const path = require('path');
const { ActiveCampaignClient } = require('./lib/ac-client');
const { buildDataset } = require('./lib/analysis');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 1800);
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

// How far back to pull deals/contacts from ActiveCampaign. The account has
// ~47k deals across all pipelines going back years -- pulling everything is
// slow and, worse, silently truncates data for whichever pipeline sorts last
// once AC's pagination cap is hit (this is what caused LATAM lost reasons to
// show up empty). Scoping to a rolling window keeps requests complete for
// the window that actually matters day-to-day.
const DATA_WINDOW_MONTHS = Number(process.env.DATA_WINDOW_MONTHS || 6);
const DATA_WINDOW_MS = DATA_WINDOW_MONTHS * 30 * 24 * 60 * 60 * 1000;
// Wall-clock cap on a single enrichment pass. Whatever it manages is cached
// and reused, so the next pass picks up where this one stopped instead of
// starting over -- the window fills in across a few refreshes rather than
// blocking one refresh indefinitely.
const ENRICH_DEADLINE_MS = Number(process.env.ENRICH_DEADLINE_MS || 60000);
// Emergency brake: set AC_DISABLE_ENRICHMENT=true to stop all per-entity
// custom field fetching. The dashboard still works (deals, contacts, values,
// stages); only the CRM custom field columns go blank. Use this if the
// dashboard is ever competing with production workflows for the account's
// shared API budget.
const DISABLE_ENRICHMENT = String(process.env.AC_DISABLE_ENRICHMENT || '').toLowerCase() === 'true';

let client;
try {
    // The AC client appends `/api/3/...` to the base URL, so AC_API_URL must be
    // just the account origin. Some stores keep it WITH `/api/3` on the end,
    // which would produce `/api/3/api/3/deals` (404); strip it defensively.
    const acUrl = (process.env.AC_API_URL || '').replace(/\/+$/, '').replace(/\/api\/3$/, '');
    client = new ActiveCampaignClient({ apiUrl: acUrl, apiKey: process.env.AC_API_KEY });
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
let leadNotes = {}; // In-memory storage for lead notes (contactId -> { notes, tags, emailSent, etc })
let sessionAdsData = {}; // Store uploaded ads data per session

// Per-entity custom field rows, kept BETWEEN refreshes. Without this the
// 5-minute refresh refetched every deal and contact in the window from
// scratch -- thousands of requests, every time, so the pull never got ahead
// of the clock. With it, a refresh only pays for entities it hasn't seen.
const dealFieldCache = new Map();
const contactFieldCache = new Map();
const MAX_FIELD_CACHE = 60000;

// Entity lists from the last pass, reused while enrichment is still catching
// up so we don't burn ~90s of every cycle re-paginating unchanged data.
let lastEntities = null;
const ENTITY_REUSE_MS = 30 * 60 * 1000;

function trimFieldCaches() {
    [dealFieldCache, contactFieldCache].forEach((store) => {
        if (store.size <= MAX_FIELD_CACHE) return;
        const excess = store.size - MAX_FIELD_CACHE;
        let i = 0;
        for (const key of store.keys()) {
            if (i++ >= excess) break;
            store.delete(key);
        }
    });
}

// Progress is exposed on /api/status so a slow first load is legible instead
// of looking like a hang.
let refreshProgress = { phase: 'idle', done: 0, total: 0, startedAt: null };

function buildRecords(deals, contactsRaw, dealCustomFieldData, fieldValuesRaw) {
    const contactsById = new Map(contactsRaw.map((c) => [String(c.id), c]));
    const contactFieldValuesById = new Map();
    (fieldValuesRaw || []).forEach((fv) => {
        const key = String(fv.contact);
        if (!contactFieldValuesById.has(key)) contactFieldValuesById.set(key, []);
        contactFieldValuesById.get(key).push(fv);
    });
    return buildDataset({ deals, dealCustomFieldData, contactsById, contactFieldValuesById });
}

// Two phases:
//   1. deals + contacts only (~100 paginated requests, tens of seconds) and
//      PUBLISH immediately, so the dashboard renders instead of polling 202
//      for nine minutes and giving up.
//   2. custom-field enrichment in the background, republishing when it lands.
// buildDataset already tolerates missing custom field data, so phase 1 is a
// valid dataset -- just without the custom-field-derived columns.
async function refreshCache() {
    if (!client || refreshing) return;
    refreshing = true;
    const startedAt = Date.now();
    refreshProgress = { phase: 'deals+contacts', done: 0, total: 0, startedAt };
    try {
        const windowStart = new Date(startedAt - DATA_WINDOW_MS).toISOString().slice(0, 10);

        // Re-paginating every deal and contact costs ~350 requests (~90s of a
        // 300s cycle). While enrichment is still catching up that is capacity
        // we'd rather spend on custom fields, so reuse the entity lists from
        // the last pass until they go stale.
        let deals;
        let contactsRaw;
        let sideDealFields = null;
        let sideContactFields = null;
        const enrichmentPending = !!(cache.records && !cache.fullyEnriched);
        if (enrichmentPending && lastEntities && Date.now() - lastEntities.at < ENTITY_REUSE_MS) {
            ({ deals, contactsRaw } = lastEntities);
            console.log(`[refresh] reusing entity lists (${deals.length} deals) -- spending this pass on enrichment`);
        } else {
            // Ask AC to side-load custom fields with the list pages. When it
            // works this replaces ~34,000 per-entity requests with the ~370
            // pagination requests we make anyway.
            const [dealRes, contactRes] = await Promise.all([
                client.listDealsWithCustomFields({ createdAfter: windowStart }),
                client.listContactsWithFieldValues({ createdAfter: windowStart }),
            ]);
            deals = dealRes.deals;
            contactsRaw = contactRes.contacts;
            if (dealRes.includeSupported) sideDealFields = dealRes.dealCustomFieldData;
            if (contactRes.includeSupported) sideContactFields = contactRes.fieldValues;
            console.log(`[refresh] side-load support: deals=${dealRes.includeSupported} (${dealRes.dealCustomFieldData.length} rows), contacts=${contactRes.includeSupported} (${contactRes.fieldValues.length} rows)`);
            lastEntities = { deals, contactsRaw, at: Date.now() };
        }

        // Enrich newest-first. The table sorts by date descending, so the
        // rows anyone actually looks at are the most recent ones -- fetching
        // in list order meant the visible rows were served LAST and every
        // custom field on screen showed "-" for hours.
        const byDateDesc = (a, b) => String(b.cdate || '').localeCompare(String(a.cdate || ''));
        const dealIds = deals.slice().sort(byDateDesc).map((d) => d.id);
        // Only contacts that actually have a deal in the window matter -- the
        // rest were being fetched for nothing. Ordered to match dealIds so the
        // newest deals' contacts are enriched first too.
        const contactsWithDeals = new Set(deals.map((d) => String(d.contact)).filter(Boolean));
        const dealOrder = new Map(dealIds.map((id, i) => [String(id), i]));
        const contactIds = contactsRaw
            .filter((c) => contactsWithDeals.has(String(c.id)))
            .map((c) => c.id);
        const contactPriority = new Map();
        deals.forEach((d) => {
            const key = String(d.contact);
            const rank = dealOrder.get(String(d.id));
            if (rank !== undefined && (!contactPriority.has(key) || rank < contactPriority.get(key))) {
                contactPriority.set(key, rank);
            }
        });
        contactIds.sort((a, b) => (contactPriority.get(String(a)) ?? 1e9) - (contactPriority.get(String(b)) ?? 1e9));

        // If AC side-loaded the custom fields, we already have everything and
        // there is no per-entity enrichment to do at all.
        if (sideDealFields && sideContactFields) {
            // Side-load pulls the FULL window's custom fields every refresh
            // cycle (not just new rows), so this must REPLACE each key's
            // rows, not append to them. Appending here was the memory leak:
            // every ~30 minutes the same ~117k deal / ~102k contact rows got
            // pushed onto whatever was already cached, growing unbounded
            // until the process hit its heap limit and crashed with an OOM.
            const freshDealRows = new Map();
            sideDealFields.forEach((row) => {
                const key = String(row.dealId ?? row.deal);
                if (!freshDealRows.has(key)) freshDealRows.set(key, []);
                freshDealRows.get(key).push(row);
            });
            const freshContactRows = new Map();
            sideContactFields.forEach((row) => {
                const key = String(row.contact);
                if (!freshContactRows.has(key)) freshContactRows.set(key, []);
                freshContactRows.get(key).push(row);
            });
            freshDealRows.forEach((rows, key) => dealFieldCache.set(key, rows));
            freshContactRows.forEach((rows, key) => contactFieldCache.set(key, rows));
            trimFieldCaches();

            const records = buildRecords(deals, contactsRaw, sideDealFields, sideContactFields);
            cache = {
                at: Date.now(),
                records,
                enriched: true,
                fullyEnriched: true,
                coverage: {
                    deals: { done: dealIds.length, total: dealIds.length },
                    contacts: { done: contactIds.length, total: contactIds.length },
                },
            };
            lastError = null;
            refreshProgress = { phase: 'idle', done: 0, total: 0, startedAt };
            console.log(`[refresh] ok via side-load -- ${records.length} records in ${((Date.now() - startedAt) / 1000).toFixed(1)}s | AC stats ${JSON.stringify(client.stats)}`);
            return;
        }

        // --- Phase 1: publish something usable NOW ---
        if (!cache.records) {
            const partial = buildRecords(
                deals,
                contactsRaw,
                dealIds.flatMap((id) => dealFieldCache.get(String(id)) || []),
                contactIds.flatMap((id) => contactFieldCache.get(String(id)) || [])
            );
            cache = { at: Date.now(), records: partial, enriched: false };
            lastError = null;
            console.log(`[refresh] phase 1 published ${partial.length} records in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (custom fields still loading)`);
        }

        if (DISABLE_ENRICHMENT) {
            console.log('[refresh] enrichment disabled via AC_DISABLE_ENRICHMENT -- serving deals/contacts only');
            refreshProgress = { phase: 'idle', done: 0, total: 0, startedAt };
            return;
        }

        // --- Phase 2: enrichment, cheapest strategy that works ---
        //
        // BULK first. This is how the dashboard originally worked, and it is
        // ~1 request per 100 ROWS instead of 1 per ENTITY. It was abandoned
        // because the paginator silently capped at 200 pages and truncated the
        // data; that cap is now 5000 and truncation logs loudly, so the cheap
        // path is viable again. Per-entity fetching survives only as a
        // last resort for ids the bulk pull genuinely didn't cover.
        refreshProgress = { phase: 'custom-fields', done: 0, total: dealIds.length + contactIds.length, startedAt };
        const onProgress = () => { refreshProgress.done += 100; };

        let dealCustomFieldData = [];
        let fieldValuesRaw = [];
        const dealIdSet = new Set(dealIds.map(String));
        const contactIdSet = new Set(contactIds.map(String));

        try {
            const [allDealFields, allContactFields] = await Promise.all([
                client.listAllDealCustomFieldData(),
                client.listAllContactFieldValues(),
            ]);
            dealCustomFieldData = allDealFields.filter((r) => dealIdSet.has(String(r.dealId ?? r.deal)));
            fieldValuesRaw = allContactFields.filter((r) => contactIdSet.has(String(r.contact)));

            // Same replace-not-append fix as the side-load path above: this
            // bulk pull also covers the full window every cycle, so pushing
            // onto an existing cached array duplicates data forever instead
            // of refreshing it.
            const freshBulkDealRows = new Map();
            dealCustomFieldData.forEach((row) => {
                const key = String(row.dealId ?? row.deal);
                if (!freshBulkDealRows.has(key)) freshBulkDealRows.set(key, []);
                freshBulkDealRows.get(key).push(row);
            });
            const freshBulkContactRows = new Map();
            fieldValuesRaw.forEach((row) => {
                const key = String(row.contact);
                if (!freshBulkContactRows.has(key)) freshBulkContactRows.set(key, []);
                freshBulkContactRows.get(key).push(row);
            });
            freshBulkDealRows.forEach((rows, key) => dealFieldCache.set(key, rows));
            freshBulkContactRows.forEach((rows, key) => contactFieldCache.set(key, rows));

            console.log(`[refresh] bulk custom fields: ${dealCustomFieldData.length} deal rows, ${fieldValuesRaw.length} contact rows | AC requests so far ${client.stats.requests}`);
        } catch (e) {
            console.warn(`[refresh] bulk custom field pull failed (${e.message}) -- falling back to per-entity`);
            const [d, f] = await Promise.all([
                client.listDealCustomFieldDataForDeals(dealIds, { cache: dealFieldCache, onProgress, deadlineMs: ENRICH_DEADLINE_MS }),
                client.listContactFieldValuesForContacts(contactIds, { cache: contactFieldCache, onProgress, deadlineMs: ENRICH_DEADLINE_MS }),
            ]);
            dealCustomFieldData = d;
            fieldValuesRaw = f;
        }
        trimFieldCaches();

        // `enriched` only meant "a pass finished", which reads as "all data is
        // in" when a pass usually stops at its deadline with most entities
        // still unfetched. Report actual coverage instead.
        const dealsCovered = dealIds.filter((id) => dealFieldCache.has(String(id))).length;
        const contactsCovered = contactIds.filter((id) => contactFieldCache.has(String(id))).length;
        const fullyEnriched = dealsCovered === dealIds.length && contactsCovered === contactIds.length;

        const records = buildRecords(deals, contactsRaw, dealCustomFieldData, fieldValuesRaw);
        cache = {
            at: Date.now(),
            records,
            enriched: true,
            fullyEnriched,
            coverage: {
                deals: { done: dealsCovered, total: dealIds.length },
                contacts: { done: contactsCovered, total: contactIds.length },
            },
        };
        lastError = null;
        console.log(`[refresh] custom field coverage: deals ${dealsCovered}/${dealIds.length}, contacts ${contactsCovered}/${contactIds.length}`);
        const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`[refresh] ok -- ${records.length} records (${deals.length} deals, ${contactsRaw.length} contacts) in ${secs}s | AC stats ${JSON.stringify(client.stats)}`);
    } catch (e) {
        lastError = e.message;
        console.error(`[refresh] failed: ${e.message}`);
    } finally {
        refreshing = false;
        refreshProgress = { ...refreshProgress, phase: 'idle' };
    }
}

if (client) {
  refreshCache();
  setInterval(refreshCache, CACHE_TTL_MS);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// Simple auth middleware
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'password';

// Validates the token issued by /api/login (base64 "<user>:<issuedAt>").
// The previous version compared against process.env.DASHBOARD_TOKEN, which is
// never set anywhere -- so this middleware could only ever return 401.
function isValidDashboardToken(token) {
  if (!token) return false;
  // Still honour an explicitly configured static token, if one is set.
  if (process.env.DASHBOARD_TOKEN && token === process.env.DASHBOARD_TOKEN) return true;
  try {
    const decoded = Buffer.from(String(token), 'base64').toString('utf8');
    const sep = decoded.lastIndexOf(':');
    if (sep < 1) return false;
    const user = decoded.slice(0, sep);
    const issuedAt = Number(decoded.slice(sep + 1));
    if (user !== DASHBOARD_USER) return false;
    if (!Number.isFinite(issuedAt)) return false;
    // Tokens are good for 7 days.
    return Date.now() - issuedAt < 7 * 24 * 60 * 60 * 1000;
  } catch (e) {
    return false;
  }
}

function requireAuth(req, res, next) {
  const token = req.headers['x-dashboard-token'] || req.query.token;
  if (!isValidDashboardToken(token)) {
    return res.status(401).json({ error: 'Unauthorized', needsAuth: true });
  }
  next();
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === DASHBOARD_USER && password === DASHBOARD_PASS) {
    // In production, use proper JWT or session tokens
    const token = Buffer.from(`${DASHBOARD_USER}:${Date.now()}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});


app.get('/api/status', (req, res) => {
  res.json({
    ready: !!cache.records,
    refreshing,
    enriched: !!cache.enriched,
    fullyEnriched: !!cache.fullyEnriched,
    coverage: cache.coverage || null,
    progress: refreshProgress,
    recordCount: cache.records ? cache.records.length : 0,
    acStats: client ? client.stats : null,
    lastUpdated: cache.at ? new Date(cache.at).toISOString() : null,
    dataWindowMonths: DATA_WINDOW_MONTHS,
    lastError,
  });
});

// Diagnostic: shows exactly what ActiveCampaign returns for a contact's
// engagement sub-resources. Use this to confirm email tracking end-to-end
// without deploying new code:
//   GET /api/diag/engagement/<contactId>   (header: x-dashboard-token)
app.get('/api/diag/engagement/:contactId', requireAuth, async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    // The dashboard table shows DEAL ids, so accept either: try the id as a
    // contact, and if that fails resolve it as a deal and use its contact.
    let contactId = req.params.contactId;
    let resolvedFrom = 'contact';
    const asContact = await client._getSafe(`/api/3/contacts/${contactId}`);
    if (!asContact.ok) {
      const asDeal = await client._getSafe(`/api/3/deals/${contactId}`);
      if (asDeal.ok && asDeal.data?.deal?.contact) {
        contactId = asDeal.data.deal.contact;
        resolvedFrom = 'deal';
      } else {
        return res.status(404).json({ error: `${req.params.contactId} is neither a contact nor a deal id` });
      }
    }

    const probe = await client.probeContactEngagement(contactId);
    const engagement = await client.getContactEmailEngagement(contactId);
    res.json({
      resolvedFrom,
      contactId,
      probe,
      parsed: {
        sent: engagement.sent,
        opened: engagement.opened,
        clicked: engagement.clicked,
        bounced: engagement.bounced,
        openRate: engagement.openRate,
        clickRate: engagement.clickRate,
        lastEmailDate: engagement.lastEmailDate,
        unavailable: engagement.unavailable,
        sources: engagement.sources,
        eventCount: engagement.events.length,
        firstEvents: engagement.events.slice(0, 5),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exhaustive scan: asks AC what sub-resources this contact actually has and
// probes each one, reporting which carry open/click data and under what field
// names. Accepts a deal id or a contact id.
//   GET /api/diag/engagement-scan/<id>?token=<dashboard token>
app.get('/api/diag/engagement-scan/:id', requireAuth, async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    let contactId = req.params.id;
    let resolvedFrom = 'contact';
    const asContact = await client._getSafe(`/api/3/contacts/${contactId}`);
    if (!asContact.ok) {
      const asDeal = await client._getSafe(`/api/3/deals/${contactId}`);
      if (asDeal.ok && asDeal.data?.deal?.contact) {
        contactId = asDeal.data.deal.contact;
        resolvedFrom = 'deal';
      } else {
        return res.status(404).json({ error: `${req.params.id} is neither a contact nor a deal id` });
      }
    }
    const scan = await client.scanContactEngagementSources(contactId);
    res.json({ resolvedFrom, ...scan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Wide scan: probes the contact's sub-resources, the DEAL's sub-resources,
// and account-level activity endpoints. Use when the AC UI shows engagement
// but the contact endpoints come back empty.
//   GET /api/diag/engagement-wide/<dealId>?token=<dashboard token>
app.get('/api/diag/engagement-wide/:id', requireAuth, async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    let contactId = req.params.id;
    let dealId = null;
    const asDeal = await client._getSafe(`/api/3/deals/${req.params.id}`);
    if (asDeal.ok && asDeal.data?.deal?.contact) {
      dealId = req.params.id;
      contactId = asDeal.data.deal.contact;
    }
    const scan = await client.scanEngagementEverywhere(contactId, dealId);
    res.json(scan);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Determines whether /api/3/logs and /api/3/trackingLogs can be filtered per
// contact at all -- and verifies the returned rows actually belong to that
// contact, since an ignored filter returns 200 with the WRONG rows.
//   GET /api/diag/engagement-filters/<dealOrContactId>?token=<token>
app.get('/api/diag/engagement-filters/:id', requireAuth, async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    let contactId = req.params.id;
    const asDeal = await client._getSafe(`/api/3/deals/${req.params.id}`);
    if (asDeal.ok && asDeal.data?.deal?.contact) contactId = asDeal.data.deal.contact;
    const probe = await client.probeEngagementFilters(contactId);
    res.json(probe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// How much of ActiveCampaign's shared rate limit is THIS app using right now?
// No token required -- it exposes no CRM data, only our own call counts.
//   GET /api/load
app.get('/api/load', (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  res.json({
    ...client.getLoadReport(),
    refreshing,
    refreshIntervalSeconds: CACHE_TTL_SECONDS,
    enrichmentDisabled: DISABLE_ENRICHMENT,
    dataWindowMonths: DATA_WINDOW_MONTHS,
  });
});

// Lists the account's score definitions and this lead's values, so we can
// confirm the exact name/id of the engagement score before wiring it in.
//   GET /api/diag/scores/<dealId>?token=<token>
app.get('/api/diag/scores/:id', requireAuth, async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    let contactId = req.params.id;
    let dealId = null;
    const asDeal = await client._getSafe(`/api/3/deals/${req.params.id}`);
    if (asDeal.ok && asDeal.data?.deal?.contact) {
      dealId = req.params.id;
      contactId = asDeal.data.deal.contact;
    }
    const [allScores, named] = await Promise.all([
      client.listScores(),
      client.getNamedScores(contactId, dealId),
    ]);
    res.json({
      dealId,
      contactId,
      // Every score defined on the account -- find the engagement one here.
      scoreDefinitions: allScores.map((s) => ({ id: s.id, name: s.name, status: s.status })),
      leadScores: named,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    const { question, context, history = [], adsData = {} } = req.body || {};
    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'question is required' });
    }
    try {
        let systemPrompt = 'You are a sharp, concise data analyst helping the 4Geeks Academy admissions/sales team read their ActiveCampaign deal pipeline. You are given a JSON summary of the deals currently shown on their dashboard (already filtered to what they are looking at) -- counts, breakdowns by region/source/campaign/etc, and a small sample of individual deals. Answer the question using ONLY this data. Cite concrete numbers and percentages. If the data cannot answer the question, say so plainly instead of guessing. Keep the answer tight -- a short paragraph or a few bullet points, not a full report.';

        if (Object.keys(adsData).length > 0) {
            systemPrompt += '\n\nYou also have access to marketing/ads performance data that was uploaded. Consider this data when relevant to questions about marketing performance, ROI, or campaign effectiveness.';
        }

        // Build messages with conversation history
        const messages = [];

        // Add previous conversation turns
        if (Array.isArray(history) && history.length > 0) {
            history.forEach(turn => {
                if (turn.question) messages.push({ role: 'user', content: turn.question });
                if (turn.answer) messages.push({ role: 'assistant', content: turn.answer });
            });
        }

        // Add current question with context
        let contentStr = `Question: ${question}\n\nDashboard data (JSON):\n${JSON.stringify(context || {})}`;
        if (Object.keys(adsData).length > 0) {
            contentStr += `\n\nAds/Marketing data uploaded:\n${JSON.stringify(adsData)}`;
        }
        messages.push({ role: 'user', content: contentStr });

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
                system: systemPrompt,
                messages,
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

// Lead Coach: AI-powered coaching for a specific lead
// Provides insights about engagement, scoring, and personalized email/SMS templates
app.post('/api/lead-coach', async (req, res) => {
    if (!client) {
        return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    }

    const { leadId, question } = req.body || {};
    if (!leadId) {
        return res.status(400).json({ error: 'leadId is required' });
    }

    try {
        // 1. Fetch deal and contact
        const deal = await client.getDeal(leadId);
        if (!deal) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        const contact = await client.getContact(deal.contact);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // 2. Fetch custom field data
        const dealCustomFieldData = await client.listDealCustomFieldDataForDeal(leadId);
        const contactFieldValues = await client.listContactFieldValues(contact.id);

        // Helper to get deal custom field value
        const getDealField = (fieldId) => {
            if (!Array.isArray(dealCustomFieldData)) return null;
            const hit = dealCustomFieldData.find((row) => String(row.customFieldId) === String(fieldId));
            return hit ? hit.fieldValue : null;
        };

        // Helper to get contact custom field value
        const getContactField = (mappedName) => {
            const { CONTACT_FIELD_MAP } = require('./lib/config');
            if (!Array.isArray(contactFieldValues)) return null;
            for (const [fieldId, name] of Object.entries(CONTACT_FIELD_MAP)) {
                if (name !== mappedName) continue;
                const hit = contactFieldValues.find((fieldVal) => String(fieldVal.field) === String(fieldId));
                if (hit) return hit.value || null;
            }
            return null;
        };

        // 3. Fetch email engagement
        // Fetch once and reuse -- buildContactEngagementTimeline used to re-run
        // the entire engagement fetch, doubling AC round-trips for every lead.
        const emailEngagement = await client.getContactEmailEngagement(contact.id);
        const engagementTimeline = await client.buildContactEngagementTimeline(contact.id, {
            engagement: emailEngagement,
        });
        // AC scores driven by open/click rules -- real per-person engagement.
        const leadScores = await client.getNamedScores(contact.id, leadId).catch(() => []);

        // 4. Fetch config for region mapping
        const { PIPELINE_REGION_MAP, DEAL_FIELD_MAP } = require('./lib/config');
        const region = PIPELINE_REGION_MAP[String(deal.group)] || 'Unknown';

        // 5. Build comprehensive lead profile
        const leadProfile = {
            id: deal.id,
            contactId: contact.id,
            name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown',
            email: contact.email || null,
            phone: contact.phone || null,
            course: getContactField('course'),
            region,
            dealValue: deal.value ? Number(deal.value) / 100 : 0,
            dealStage: deal.stage || null,
            dealStatus: deal.status === 1 ? 'Won' : deal.status === 2 ? 'Lost' : 'Active',
            dealTitle: deal.title || null,
            assignedTo: deal.owner || null,
            createdDate: deal.cdate ? deal.cdate.slice(0, 10) : null,

            // Engagement metrics
            engagement: {
                emailsEngaged: emailEngagement.opened + emailEngagement.clicked,
                emailsOpened: emailEngagement.opened,
                emailOpenRate: Number(emailEngagement.openRate),
                linksClicked: emailEngagement.clicked,
                clickRate: Number(emailEngagement.clickRate),
                lastEmailDate: emailEngagement.lastEmailDate ? emailEngagement.lastEmailDate.slice(0, 10) : null,
                trackingAvailable: !emailEngagement.unavailable,
                emailsSent: emailEngagement.sent,
                // 'campaign-aggregate' means opens/clicks are inferred from
                // each campaign's overall rates, not from this person's own
                // tracked actions -- AC does not expose per-recipient opens
                // through its API. The UI must not present these as facts
                // about this individual.
                engagementBasis: emailEngagement.engagementBasis || 'per-contact',
                // AC scores built from open/click rules are TRUE per-person
                // engagement, unlike the campaign-aggregate inference above.
                scores: leadScores,
                timeline: engagementTimeline,
            },

            // Custom fields - prioritized for coaching
            customFields: {
                admissionsScore: getContactField('admissionsTestScore'),
                classification: getContactField('classification'),
                conversationType: getContactField('admissionsConversationType'),
                leadSentiment: getContactField('leadSentiment'),
                dealQuality: getDealField(DEAL_FIELD_MAP.dealQuality),
                feedback: getDealField(DEAL_FIELD_MAP.dealClientComments),
                offerSentDate: getDealField(DEAL_FIELD_MAP.offerSentDate),
                wonDate: getDealField(DEAL_FIELD_MAP.wonDate),
                lostDate: getDealField(DEAL_FIELD_MAP.lostDate),
                source: getContactField('utmSource'),
                campaign: getContactField('utmCampaign'),
            },
        };

        // 6. Call Claude with lead coaching prompt
        const coachingSystem = `You are an expert sales coach helping 4Geeks Academy admissions reps close more deals. You are given a specific lead's profile including their email engagement, custom scoring, and interaction history.

Your job is to:
1. **Analyze** — Why does this lead matter right now? What signals suggest they're ready to move forward (or stuck)?
2. **Recommend** — What should the rep do next? (Send offer, schedule call, provide financing info, etc.)
3. **Draft** — Generate 2 personalized templates they can copy and send TODAY:
   - A warm, personalized EMAIL addressing their specific situation, interests, and engagement level
   - A brief SMS they could send same-day (under 60 characters)

Use their name, course interest, engagement patterns, and signals from custom fields (sentiment, quality score, classification) to make templates feel personal and timely. If they've opened emails about financing but haven't replied, mention financing in your email. If their admission score is high, emphasize their qualification.

READING THE ENGAGEMENT SCORE ("Score: Quality + Engagement"). This score is built entirely from email opens and clicks, so it is real behaviour, not a guess:
- Below 0: they marked email as spam or similar. Do NOT push more email. Suggest a different channel or backing off entirely.
- 0: no engagement at all. Nothing has landed. Assume they have not read anything you sent -- do not reference "as you saw in my last email".
- 6: light engagement, some opens.
- 8: opening consistently -- warm.
- 14 or above: they have CLICKED a link. This is the strongest signal available. Treat as high intent and push for the meeting.
Match your urgency to this number. Never claim a lead engaged with something when the score says 0.

If engagement.engagementBasis is "campaign-aggregate", the opens/clicks shown are INFERRED from campaign averages, not that person's own actions -- treat them as weak evidence and rely on the engagement score instead.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

**Analysis:**
[2-3 sentence analysis of where this lead stands]

**Next Steps:**
- [Action 1]
- [Action 2]

**EMAIL TEMPLATE:**
Subject: [subject line]

[Email body - max 100 words]

**SMS TEMPLATE:**
[SMS text - max 60 characters]`;

        const userContent = `Lead Profile:\n${JSON.stringify(leadProfile, null, 2)}${question ? `\n\nLead Rep Question: ${question}` : ''}`;

        const claudeReq = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                max_tokens: 2048,
                system: coachingSystem,
                messages: [{ role: 'user', content: userContent }],
            }),
        });

        if (!claudeReq.ok) {
            const errText = await claudeReq.text();
            return res.status(502).json({ error: `Anthropic API error (${claudeReq.status}): ${errText.slice(0, 300)}` });
        }

        const claudeData = await claudeReq.json();
        const coachingText = (claudeData.content || []).map((b) => b.text || '').join('\n').trim();

        // 7. Parse templates from Claude response
        const parseTemplates = (text) => {
            const emailMatch = text.match(/\*\*EMAIL TEMPLATE:\*\*\n([\s\S]*?)(?=\*\*SMS TEMPLATE:|$)/);
            const smsMatch = text.match(/\*\*SMS TEMPLATE:\*\*\n([\s\S]*?)$/);

            return {
                email: emailMatch ? emailMatch[1].trim() : '',
                sms: smsMatch ? smsMatch[1].trim() : '',
            };
        };

        const templates = parseTemplates(coachingText);

        // 8. Return complete response
        res.json({
            lead: leadProfile,
            aiCoaching: {
                fullAnalysis: coachingText,
                templates,
            },
        });
    } catch (e) {
        console.error('[lead-coach] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Lead Recommendations: Analyze leads and group by recommended action
app.post('/api/recommendations', async (req, res) => {
    if (!client) {
        return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    try {
        // Get filtered records from request body (dashboard sends filtered data)
        // If not provided, use full cache
        const { filteredRecords } = req.body || {};

        if (!cache.records) {
            return res.status(202).json({ ready: false, refreshing });
        }

        const records = filteredRecords && filteredRecords.length > 0 ? filteredRecords : cache.records;

        // Categorize leads by recommended action
        const today = new Date();
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const recommendations = {
            needsContact: [], // Active deals, no recent activity (> 30 days), low engagement
            needsFollowUp: [], // Engaged (opened emails), no offer yet, good scores
            atRisk: [], // Active > 60 days, declining engagement
            readyToClose: [], // High scores, recent engagement, no won yet
            wonRecently: [], // Won in last 7 days
            lostNeedAnalysis: [], // Lost but no reason recorded
        };

        records.forEach((r) => {
            // Skip already won deals
            if (r.bucket === 'Won') {
                if (r.date && r.date >= sevenDaysAgo) {
                    recommendations.wonRecently.push(r);
                }
                return;
            }

            // Skip already lost deals with reasons
            if (r.bucket === 'Lost - Classified') return;

            // Lost without reason - needs analysis
            if (r.bucket === 'Lost - Unclassified') {
                recommendations.lostNeedAnalysis.push(r);
                return;
            }

            // Active deals - categorize by engagement & time
            const daysSinceCreated = r.date ? Math.floor((today - new Date(r.date)) / (1000 * 60 * 60 * 24)) : 999;
            const hasOffer = r.offerSentDate ? true : false;
            const engagementScore = (r.admissionsScore || 0) + (r.dealQuality || 0);
            const recentlyEngaged = r.date && r.date >= thirtyDaysAgo;

            if (hasOffer && engagementScore >= 12 && recentlyEngaged) {
                // High engagement + offer sent + recent = ready to close
                recommendations.readyToClose.push(r);
            } else if (recentlyEngaged && !hasOffer && engagementScore >= 10) {
                // Engaged, good scores, no offer = needs follow-up with offer
                recommendations.needsFollowUp.push(r);
            } else if (daysSinceCreated > 60 && !recentlyEngaged) {
                // Old deal, no recent engagement = at risk
                recommendations.atRisk.push(r);
            } else if (!recentlyEngaged || daysSinceCreated > 30) {
                // No recent activity or aged = needs contact
                recommendations.needsContact.push(r);
            }
        });

        // Generate AI summary for each group using Claude
        const generateGroupSummary = async (groupName, leads) => {
            if (leads.length === 0) return null;

            const summary = {
                name: groupName,
                count: leads.length,
                leads: leads.slice(0, 5), // Top 5 per group
                recommendation: '',
            };

            if (process.env.ANTHROPIC_API_KEY) {
                try {
                    const context = {
                        groupName,
                        count: leads.length,
                        sampleLeads: leads.slice(0, 3).map(l => ({
                            name: l.name,
                            email: l.email,
                            course: l.course,
                            admissionsScore: l.admissionsScore,
                            dealQuality: l.dealQuality,
                            lastActivity: l.date,
                            sentiment: l.leadSentiment,
                        })),
                    };

                    const prompts = {
                        needsContact: 'These leads have been in the pipeline but not engaged recently. What should the admissions team prioritize for outreach?',
                        needsFollowUp: 'These leads are engaged but havent received an offer yet. What should be sent to convert them?',
                        atRisk: 'These leads are at risk of being lost due to inactivity. What interventions would help re-engage them?',
                        readyToClose: 'These leads are highly engaged with offers sent. What final actions should close these deals?',
                        wonRecently: 'These deals were won recently. What should the success team do next?',
                        lostNeedAnalysis: 'These lost deals have no reason recorded. What common patterns might explain why they failed?',
                    };

                    const question = prompts[groupName] || 'What recommendations do you have for this group of leads?';

                    const r = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-api-key': process.env.ANTHROPIC_API_KEY,
                            'anthropic-version': '2023-06-01',
                        },
                        body: JSON.stringify({
                            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                            max_tokens: 512,
                            system: 'You are an expert sales coach for 4Geeks Academy. Provide concise, actionable recommendations for admissions teams based on lead data. Be specific about next steps and priorities.',
                            messages: [{ role: 'user', content: `${question}\n\nLead Group Data:\n${JSON.stringify(context, null, 2)}` }],
                        }),
                    });

                    if (r.ok) {
                        const data = await r.json();
                        summary.recommendation = (data.content || []).map((b) => b.text || '').join('\n').trim();
                    }
                } catch (e) {
                    console.warn(`[recommendations] Claude error for ${groupName}: ${e.message}`);
                }
            }

            return summary;
        };

        // Generate summaries for all groups in parallel
        const summaries = await Promise.all([
            generateGroupSummary('needsContact', recommendations.needsContact),
            generateGroupSummary('needsFollowUp', recommendations.needsFollowUp),
            generateGroupSummary('atRisk', recommendations.atRisk),
            generateGroupSummary('readyToClose', recommendations.readyToClose),
            generateGroupSummary('wonRecently', recommendations.wonRecently),
            generateGroupSummary('lostNeedAnalysis', recommendations.lostNeedAnalysis),
        ]);

        res.json({
            summary: {
                totalDeals: records.length,
                active: records.filter(r => r.bucket === 'Active / Other').length,
                won: records.filter(r => r.bucket === 'Won').length,
                lost: records.filter(r => r.bucket.includes('Lost')).length,
            },
            groups: summaries.filter(Boolean),
        });
    } catch (e) {
        console.error('[recommendations] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Lead Notes: Save and retrieve notes/tags for each lead
app.post('/api/lead-notes', (req, res) => {
    const { leadId, contactId, notes, tags, emailSent, actions } = req.body || {};
    if (!contactId) {
        return res.status(400).json({ error: 'contactId is required' });
    }

    const key = String(contactId);
    if (!leadNotes[key]) {
        leadNotes[key] = { notes: '', tags: [], emailSent: false, actions: [], updatedAt: null };
    }

    // Update fields if provided
    if (notes !== undefined) leadNotes[key].notes = notes;
    if (Array.isArray(tags)) leadNotes[key].tags = tags;
    if (emailSent !== undefined) leadNotes[key].emailSent = emailSent;
    if (Array.isArray(actions)) leadNotes[key].actions = actions;
    leadNotes[key].updatedAt = new Date().toISOString();

    res.json({ success: true, data: leadNotes[key] });
});

app.get('/api/lead-notes/:contactId', (req, res) => {
    const { contactId } = req.params;
    const key = String(contactId);
    const data = leadNotes[key] || { notes: '', tags: [], emailSent: false, actions: [], updatedAt: null };
    res.json(data);
});

// Ads Data: Store uploaded ads file metadata and data
app.post('/api/ads-data', (req, res) => {
    const { sessionId = 'default', filename, data, platform } = req.body || {};
    if (!filename || !data) {
        return res.status(400).json({ error: 'filename and data are required' });
    }

    if (!sessionAdsData[sessionId]) {
        sessionAdsData[sessionId] = [];
    }

    sessionAdsData[sessionId].push({
        filename,
        platform: platform || 'unknown',
        data,
        uploadedAt: new Date().toISOString(),
    });

    res.json({ success: true, count: sessionAdsData[sessionId].length });
});

app.get('/api/ads-data/:sessionId', (req, res) => {
    const { sessionId = 'default' } = req.params;
    const files = sessionAdsData[sessionId] || [];
    res.json({ files, count: files.length });
});

app.delete('/api/ads-data/:sessionId', (req, res) => {
    const { sessionId = 'default' } = req.params;
    delete sessionAdsData[sessionId];
    res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Live Ads Performance — consumed from 4Geeks Center (single source of truth)
// ---------------------------------------------------------------------------
// Instead of mounting Google/Meta/TikTok credentials and re-deriving spend/
// CPL/CPA/ROAS here (a second, drifting version of the truth), this proxies
// Center's public endpoint, which reuses the SAME functions that power
// Center's Marketing panels -> byte-for-byte parity. Server-to-server, the key
// stays server-side, never reaches the browser.
//   Center: GET /api/public/ads-performance?region=ES|US|LATAM|CL&start_date&end_date
//   Auth:   X-Api-Key header (Center setting `ads_api_key`)
const CENTER_ADS_URL = process.env.CENTER_ADS_URL || 'https://4geekscenter.duckdns.org/api/public/ads-performance';
const CENTER_ADS_API_KEY = process.env.CENTER_ADS_API_KEY || '';
const CENTER_ADS_TTL_MS = Number(process.env.CENTER_ADS_TTL_SECONDS || 600) * 1000;
// Demo payload is served ONLY when explicitly enabled (local preview), so a
// forgotten key in production never shows fake numbers -- it 503s loudly.
const ADS_DEMO = String(process.env.ADS_DEMO || '').toLowerCase() === '1' || String(process.env.ADS_DEMO || '').toLowerCase() === 'true';

// Our dashboard labels regions USA/Spain/LATAM; Center expects US/ES/LATAM/CL.
const REGION_TO_CENTER = { USA: 'US', Spain: 'ES', LATAM: 'LATAM', US: 'US', ES: 'ES', CL: 'CL', all: 'US' };
const CURRENCY_FOR = { ES: 'EUR', CL: 'CLP' };

const _adsCache = new Map();     // key -> { at, data }
const _adsLastGood = new Map();  // key -> normalized data (survives Center outages)

function _pickNum(obj, keys) {
  for (const k of keys) {
    const v = obj ? obj[k] : undefined;
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function _pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj ? obj[k] : undefined;
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return null;
}

// Map Center's payload (field names not pinned) onto one internal shape the
// frontend renders. If Center's real keys differ, adjust ONLY here.
function normalizeCenterAds(data, region) {
  const currency = data.currency || CURRENCY_FOR[region] || 'USD';
  const s = data.summary || {};
  // Real Center keys (verified 2026-09): total_cost, leads_total/deals, won,
  // cpl, cpa, roas, revenue. `conversions` is a different, inflated metric --
  // do NOT use it for "leads".
  const summary = {
    spend: _pickNum(s, ['total_cost', 'paid_cost', 'spend', 'gasto', 'cost']),
    leads: _pickNum(s, ['leads_total', 'deals', 'leads']),
    won: _pickNum(s, ['won', 'won_paid']),
    cpl: _pickNum(s, ['cpl', 'cost_per_lead']),
    cpa: _pickNum(s, ['cpa', 'cost_per_acquisition']),
    roas: _pickNum(s, ['roas']),
    revenue: _pickNum(s, ['revenue', 'ingresos']),
    revenueTotal: _pickNum(s, ['revenue_total']),
    impressions: _pickNum(s, ['impressions']),
    clicks: _pickNum(s, ['clicks']),
    ctr: _pickNum(s, ['avg_ctr', 'ctr']),
    cpc: _pickNum(s, ['avg_cpc', 'cpc']),
    conversions: _pickNum(s, ['conversions']),
    wonPaid: _pickNum(s, ['won_paid']),
    activeCampaigns: _pickNum(s, ['active_campaigns']),
  };
  const channels = (Array.isArray(data.channels) ? data.channels : []).map((c) => ({
    name: _pickStr(c, ['channel', 'name', 'canal', 'platform']) || '—',
    spend: _pickNum(c, ['spend', 'gasto', 'cost']),
    impressions: _pickNum(c, ['impressions']),
    clicks: _pickNum(c, ['clicks']),
    leads: _pickNum(c, ['deals', 'leads', 'conversions']),
    won: _pickNum(c, ['won']),
    revenue: _pickNum(c, ['revenue', 'ingresos']),
    cpl: _pickNum(c, ['cpl']),
    cpa: _pickNum(c, ['cpa']),
    roas: _pickNum(c, ['roas']),
    conv: _pickNum(c, ['conversion']),
  })).filter((c) => (c.spend || 0) > 0 || (c.leads || 0) > 0 || (c.revenue || 0) > 0);
  const campaigns = (Array.isArray(data.campaigns) ? data.campaigns : []).map((c) => ({
    name: _pickStr(c, ['campaign', 'name', 'nombre']) || '—',
    channel: _pickStr(c, ['channel', 'canal', 'platform']),
    spend: _pickNum(c, ['spend', 'gasto', 'cost']),
    leads: _pickNum(c, ['leads', 'deals']),
    won: _pickNum(c, ['won']),
    revenue: _pickNum(c, ['revenue', 'ingresos']),
    cpl: _pickNum(c, ['cpl']),
    cpa: _pickNum(c, ['cpa']),
    roas: _pickNum(c, ['roas']),
  }));
  const daily = (Array.isArray(data.daily) ? data.daily : []).map((d) => ({
    date: _pickStr(d, ['day', 'date', 'fecha']),
    spend: _pickNum(d, ['spend', 'gasto', 'cost']),
    leads: _pickNum(d, ['deals', 'leads', 'conversions']),
  }));
  // Rich per-campaign table (matches Center's "Detalle por campaña" panel).
  // Its fields are already clean (campaign, channel, status, start_date, spend,
  // impressions, clicks, ctr, cpc, leads, cpl, won, cpa, revenue, roas) so we
  // pass them through as-is.
  const cp = data.campaigns_performance;
  const campaignsPerf = cp && typeof cp === 'object'
    ? { campaigns: Array.isArray(cp.campaigns) ? cp.campaigns : [], totals: cp.totals || null }
    : { campaigns: [], totals: null };
  return {
    region,
    currency,
    summary,
    channels,
    campaigns,
    campaignsPerf,
    daily,
    landings: data.landings || null,
    leadProgress: data.lead_progress || null,
    emailFunnels: data.email_funnels || null,
    definitions: data.definitions || null,
    period: data.period || null,
    generatedAt: data.generatedAt || data.generated_at || null,
  };
}

// Sample (already in the internal shape) so the layout is visible in local
// preview before the key is wired. Never served in production unless ADS_DEMO.
function demoAdsPayload(region) {
  const currency = CURRENCY_FOR[region] || 'USD';
  const days = 14;
  const daily = Array.from({ length: days }, (_, i) => {
    const spend = 700 + ((i * 137) % 400);
    const leads = 14 + ((i * 7) % 18);
    return { date: `2026-08-${String(18 + i).padStart(2, '0')}`, spend, leads };
  });
  return {
    region,
    currency,
    summary: { spend: 12450, leads: 318, cpl: 39.2, cpa: 210, roas: 3.4, revenue: 42300 },
    channels: [
      { name: 'Google Ads', spend: 7200, leads: 190, cpl: 37.9, cpa: 205, roas: 3.6 },
      { name: 'Meta Ads', spend: 4100, leads: 98, cpl: 41.8, cpa: 220, roas: 3.1 },
      { name: 'TikTok Ads', spend: 1150, leads: 30, cpl: 38.3, cpa: 240, roas: 2.6 },
    ],
    campaigns: [
      { name: 'FS Web Dev — Search Brand', channel: 'Google Ads', spend: 2600, leads: 82, cpl: 31.7, cpa: 180, roas: 4.1 },
      { name: 'Bootcamp — Lookalike ES', channel: 'Meta Ads', spend: 1900, leads: 44, cpl: 43.2, cpa: 225, roas: 3.0 },
      { name: 'Data Science — Retarget', channel: 'Google Ads', spend: 1400, leads: 38, cpl: 36.8, cpa: 198, roas: 3.7 },
      { name: 'AI — Awareness', channel: 'TikTok Ads', spend: 1150, leads: 30, cpl: 38.3, cpa: 240, roas: 2.6 },
    ],
    daily,
    definitions: { note: 'DATOS DE EJEMPLO — conecta la clave de 4Geeks Center para ver datos reales.' },
    generatedAt: new Date().toISOString(),
  };
}

app.get('/api/ads-performance', async (req, res) => {
  const region = REGION_TO_CENTER[req.query.region] || String(req.query.region || 'US');
  let startDate = req.query.start_date || '';
  let endDate = req.query.end_date || '';
  // Center returns ALL history (since 2020) when no dates are given -- not what
  // a marketing view wants. Default to the last 90 days; the dashboard's
  // From/To filters override it.
  if (!startDate && !endDate) {
    const now = new Date();
    endDate = now.toISOString().slice(0, 10);
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  const cacheKey = `${region}|${startDate}|${endDate}`;

  // No key configured: show the layout with sample data locally, or 503 in prod.
  if (!CENTER_ADS_API_KEY) {
    if (ADS_DEMO) {
      return res.json({ ...demoAdsPayload(region), _cache: { demo: true, stale: false, ageSeconds: 0 } });
    }
    return res.status(503).json({
      error: 'CENTER_ADS_API_KEY no configurada. Añádela como variable de entorno (en Railway) para traer los datos en vivo de 4Geeks Center.',
      needsKey: true,
    });
  }

  const cached = _adsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CENTER_ADS_TTL_MS) {
    return res.json({ ...cached.data, _cache: { demo: false, stale: false, ageSeconds: Math.round((Date.now() - cached.at) / 1000) } });
  }

  const url = new URL(CENTER_ADS_URL);
  url.searchParams.set('region', region);
  if (startDate) url.searchParams.set('start_date', startDate);
  if (endDate) url.searchParams.set('end_date', endDate);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(url.toString(), {
      headers: { 'X-Api-Key': CENTER_ADS_API_KEY, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const stale = _adsLastGood.get(cacheKey);
      if (stale) return res.json({ ...stale, _cache: { demo: false, stale: true, error: `Center ${r.status}` } });
      return res.status(r.status === 401 ? 502 : r.status).json({
        error: r.status === 401
          ? 'La CENTER_ADS_API_KEY es inválida para 4Geeks Center (401).'
          : `4Geeks Center devolvió ${r.status}: ${body.slice(0, 200)}`,
      });
    }
    const raw = await r.json();
    const data = normalizeCenterAds(raw, region);
    _adsCache.set(cacheKey, { at: Date.now(), data });
    _adsLastGood.set(cacheKey, data);
    res.json({ ...data, _cache: { demo: false, stale: false, ageSeconds: 0 } });
  } catch (e) {
    clearTimeout(timer);
    const stale = _adsLastGood.get(cacheKey);
    if (stale) return res.json({ ...stale, _cache: { demo: false, stale: true, error: e.message } });
    res.status(504).json({ error: `No se pudo contactar con 4Geeks Center: ${e.message}` });
  }
});

app.listen(PORT, () => console.log(`4Geeks AC dashboard listening on :${PORT}`));
