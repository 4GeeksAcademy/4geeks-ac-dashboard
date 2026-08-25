// Thin client for the ActiveCampaign REST API v3.
// Docs: https://developers.activecampaign.com/reference/overview
const fetch = require('node-fetch');

class ActiveCampaignClient {
  constructor({ apiUrl, apiKey, requestsPerSecond, timeoutMs } = {}) {
    if (!apiUrl || !apiKey) {
      throw new Error('AC_API_URL and AC_API_KEY must be set');
    }
    this.baseUrl = apiUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;

    // ActiveCampaign rate-limits at ~5 requests/second per account. Firing
    // more than that doesn't go faster -- it returns 429s, and each 429 then
    // sleeps on `retry-after`, so exceeding the limit makes a bulk pull
    // dramatically SLOWER than staying under it. We pace every request
    // through one shared limiter so total throughput stays just below the
    // ceiling no matter how many callers are running concurrently.
    this.minRequestIntervalMs = 1000 / Number(requestsPerSecond || process.env.AC_REQUESTS_PER_SECOND || 4);
    this._nextSlot = 0;

    // node-fetch has NO default timeout: a stalled socket hangs forever and
    // takes a worker slot with it. Every request gets an explicit deadline.
    this.timeoutMs = Number(timeoutMs || process.env.AC_TIMEOUT_MS || 20000);

    this.stats = { requests: 0, retries: 0, timeouts: 0, errors: 0 };
  }

// Reserves the next allowed send slot, so concurrent callers queue in order
// rather than all firing at once.
async _throttle() {
  const now = Date.now();
  const slot = Math.max(now, this._nextSlot);
  this._nextSlot = slot + this.minRequestIntervalMs;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async _get(path, params = {}, retries = 3) {
  const url = new URL(this.baseUrl + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  await this._throttle();
  this.stats.requests++;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), this.timeoutMs);
  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { 'Api-Token': this.apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e.name === 'AbortError';
    if (aborted) this.stats.timeouts++;
    if (retries > 0) {
      this.stats.retries++;
      await new Promise((r) => setTimeout(r, 500));
      return this._get(path, params, retries - 1);
    }
    this.stats.errors++;
    throw new Error(aborted ? `AC API timeout after ${this.timeoutMs}ms on ${path}` : `AC API request failed on ${path}: ${e.message}`);
  }
  clearTimeout(timer);

  if (res.status === 429 && retries > 0) {
    // Cap the backoff: AC can hand back a retry-after measured in minutes,
    // and honouring that verbatim across a bulk pull stalls it for hours.
    const advised = Number(res.headers.get('retry-after')) * 1000;
    const wait = Math.min(Number.isFinite(advised) && advised > 0 ? advised : 1000, 5000);
    this.stats.retries++;
    // Back the whole limiter off, not just this one request -- otherwise
    // every other in-flight caller keeps hammering the same limit.
    this._nextSlot = Math.max(this._nextSlot, Date.now() + wait);
    await new Promise((r) => setTimeout(r, wait));
    return this._get(path, params, retries - 1);
  }
  if (!res.ok) {
    this.stats.errors++;
    const body = await res.text().catch(() => '');
    throw new Error(`AC API ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// Generic paginator for AC's offset/limit list endpoints.
async _paginateAll(path, params, itemsKey, { pageSize = 100, maxPages = 200 } = {}) {
  let offset = 0;
  let all = [];
  for (let page = 0; page < maxPages; page++) {
    const data = await this._get(path, { ...params, limit: pageSize, offset });
    const items = data[itemsKey] || [];
    all = all.concat(items);
    const total = Number(data.meta?.total ?? items.length);
    offset += pageSize;
    if (items.length < pageSize || offset >= total) break;
  }
  return all;
}

// Runs fn over items with a bounded number of in-flight requests.
async _mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  };
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

// ---- Reference / schema data ----

async listPipelines() {
  return this._paginateAll('/api/3/dealGroups', {}, 'dealGroups');
}

async listDealStages() {
  return this._paginateAll('/api/3/dealStages', {}, 'dealStages');
}

async listDealCustomFieldMeta() {
  const data = await this._get('/api/3/dealCustomFieldMeta');
  return data.dealCustomFieldMeta || [];
}

async listContactCustomFieldMeta() {
  const data = await this._get('/api/3/fields');
  return data.fields || [];
}

// ---- Core entities ----

// filters: { group (pipeline id), status (0 open/1 won/2 lost), createdAfter, createdBefore }
async listDeals(filters = {}, opts = {}) {
  const params = {};
  if (filters.group) params['filters[group]'] = filters.group;
  if (filters.status !== undefined) params['filters[status]'] = filters.status;
  if (filters.createdAfter) params['filters[created_after]'] = filters.createdAfter;
  if (filters.createdBefore) params['filters[created_before]'] = filters.createdBefore;
  return this._paginateAll('/api/3/deals', params, 'deals', opts);
}

// Per-deal custom field data (mirrors listContactFieldValues below). Scoping
// data pulls to a specific, already-date-filtered deal ID list keeps this
// fast and complete -- pulling the WHOLE account's dealCustomFieldData via
// the flat /api/3/dealCustomFieldData endpoint hits AC's pagination cap in
// accounts with tens of thousands of historical deals, silently truncating
// data for whichever pipeline sorts last (this is what caused LATAM lost
// reasons to show up empty).
async listDealCustomFieldDataForDeal(dealId) {
  const data = await this._get(`/api/3/deals/${dealId}/dealCustomFieldData`);
  return data.dealCustomFieldData || [];
}

// Per-entity custom field fetching is one HTTP request per deal, which at
// AC's rate limit means a six-month window can take tens of minutes. Two
// things keep that survivable:
//   - `cache`: a Map of id -> rows that persists across refreshes, so the
//     5-minute refresh only pays for deals it has never seen before instead
//     of refetching the entire window every single time.
//   - `onProgress` / `deadlineMs`: the caller can surface progress and stop
//     early rather than blocking the dashboard indefinitely.
async listDealCustomFieldDataForDeals(dealIds, { concurrency = 6, cache = null, onProgress = null, deadlineMs = null } = {}) {
  const store = cache || new Map();
  return this._enrich(dealIds, store, concurrency, onProgress, deadlineMs, 'deal', (id) => this.listDealCustomFieldDataForDeal(id));
}

// Shared driver for per-entity enrichment: skips ids already in `store`,
// respects a wall-clock deadline, and always returns rows for every
// requested id that we have data for (cached or freshly fetched).
async _enrich(ids, store, concurrency, onProgress, deadlineMs, label, fetchOne) {
  const started = Date.now();
  const pending = ids.filter((id) => !store.has(String(id)));
  let done = 0;
  let stopped = false;

  await this._mapWithConcurrency(pending, concurrency, async (id) => {
    if (stopped) return null;
    if (deadlineMs && Date.now() - started > deadlineMs) { stopped = true; return null; }
    let rows = [];
    try {
      rows = await fetchOne(id);
    } catch (e) {
      rows = [];
    }
    store.set(String(id), rows);
    done++;
    if (onProgress && done % 100 === 0) onProgress(done, pending.length);
    return rows;
  });

  if (stopped) {
    console.warn(`[AC] ${label} enrichment stopped at its ${deadlineMs}ms deadline (${done}/${pending.length} fetched this pass)`);
  } else if (pending.length) {
    console.log(`[AC] ${label} enrichment complete: ${pending.length} fetched, ${ids.length - pending.length} served from cache`);
  }

  return ids.flatMap((id) => store.get(String(id)) || []);
}

async listContacts(filters = {}, opts = {}) {
  const params = {};
  if (filters.createdAfter) params['filters[created_after]'] = filters.createdAfter;
  if (filters.createdBefore) params['filters[created_before]'] = filters.createdBefore;
  return this._paginateAll('/api/3/contacts', params, 'contacts', opts);
}

async getContact(id) {
  const data = await this._get(`/api/3/contacts/${id}`);
  return data.contact;
}

async listContactFieldValues(contactId) {
  const data = await this._get(`/api/3/contacts/${contactId}/fieldValues`);
  return data.fieldValues || [];
}

async listContactFieldValuesForContacts(contactIds, { concurrency = 6, cache = null, onProgress = null, deadlineMs = null } = {}) {
  const store = cache || new Map();
  return this._enrich(contactIds, store, concurrency, onProgress, deadlineMs, 'contact', async (id) => {
    const values = await this.listContactFieldValues(id);
    return values.map((v) => ({ ...v, contact: String(id) }));
  });
}

// ---- Lead Coach / Email Engagement ----

// Get a single deal by ID
async getDeal(dealId) {
  const data = await this._get(`/api/3/deals/${dealId}`);
  return data.deal;
}

// ---- Email engagement ----
//
// HISTORY / WHY THIS LOOKS THE WAY IT DOES:
// This used to call /api/3/contacts/{id}/emailTrackingLogs and fall back to
// /api/3/contacts/{id}/communications. NEITHER OF THOSE EXISTS in the
// ActiveCampaign REST API v3. Every call returned 404, the surrounding
// try/catch swallowed it, and the function returned all-zero metrics -- which
// is exactly why every lead in the dashboard read as "never opened, never
// clicked" regardless of their real behaviour.
//
// The fix does not guess at endpoint names. AC returns a `links` object on
// every contact listing that contact's real sub-resources, so we read that
// and pull only the engagement sources the account actually exposes, falling
// back to the canonical paths when `links` is missing.

// Sub-resources that carry email/site engagement, in priority order.
static get ENGAGEMENT_SOURCES() {
  return [
    { name: 'contactLogs', path: 'contactLogs', itemsKey: 'contactLogs' },
    { name: 'trackingLogs', path: 'trackingLogs', itemsKey: 'trackingLogs' },
    { name: 'bounceLogs', path: 'bounceLogs', itemsKey: 'bounceLogs' },
  ];
}

// GET that resolves to null instead of throwing, so one dead sub-resource
// can never zero out the whole engagement read.
async _getSafe(path, params = {}) {
  try {
    return { ok: true, data: await this._get(path, params) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// AC is inconsistent about field naming across log types (sdate vs sentDate,
// opens vs totalopens vs opened, and event-style rows where `type` is the
// verb). Rather than hard-coding one shape, normalise case-insensitively
// across every variant we've seen.
static _lowerMap(obj) {
  const map = {};
  Object.entries(obj || {}).forEach(([k, v]) => { map[String(k).toLowerCase()] = v; });
  return map;
}

static _readCount(map, keys) {
  for (const key of keys) {
    const raw = map[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(raw);
    if (Number.isFinite(num)) return num;
    // Non-numeric: AC sometimes stores a timestamp in the "opened"/"clicked"
    // column. That only counts if it's a REAL date -- their zero-date
    // placeholder ("0000-00-00 00:00:00") means the action never happened.
    return ActiveCampaignClient._readDate({ value: raw }, ['value']) ? 1 : 0;
  }
  return 0;
}

static _readDate(map, keys) {
  for (const key of keys) {
    const raw = map[key];
    if (!raw) continue;
    const str = String(raw);
    // AC uses these as "null" for datetime columns.
    if (str.startsWith('0000-00-00') || str === '0' || str === '1969-12-31') continue;
    const parsed = new Date(str.replace(' ', 'T'));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

// Turn one raw log row (any shape) into { opened, clicked, bounced,
// unsubscribed, openDate, clickDate, sentDate, subject }.
static _normaliseLog(raw) {
  const map = ActiveCampaignClient._lowerMap(raw);
  const verb = String(map.type || map.action || map.event || '').toLowerCase();

  let opened = ActiveCampaignClient._readCount(map, [
    'opens', 'totalopens', 'opened', 'open_count', 'opencount', 'times_opened', 'timesopened',
  ]);
  let clicked = ActiveCampaignClient._readCount(map, [
    'clicks', 'totalclicks', 'clicked', 'click_count', 'clickcount', 'linksclicked', 'links_clicked',
  ]);

  const openDate = ActiveCampaignClient._readDate(map, [
    'openeddate', 'opened_date', 'firstopen', 'first_open', 'lastopen', 'last_open', 'opendate', 'open_date',
  ]);
  const clickDate = ActiveCampaignClient._readDate(map, [
    'clickeddate', 'clicked_date', 'firstclick', 'first_click', 'lastclick', 'last_click', 'clickdate', 'click_date',
  ]);
  const sentDate = ActiveCampaignClient._readDate(map, [
    'sdate', 'sentdate', 'sent_date', 'sd', 'tstamp', 'timestamp', 'date', 'ldate', 'cdate', 'created_timestamp',
  ]);

  // Event-style rows: the row itself IS the open/click.
  if (verb.includes('open')) opened = Math.max(opened, 1);
  if (verb.includes('click')) clicked = Math.max(clicked, 1);

  // A date present with no counter still proves the action happened.
  if (openDate && opened === 0) opened = 1;
  if (clickDate && clicked === 0) clicked = 1;

  const bounced = ActiveCampaignClient._readCount(map, ['bounced', 'bouncedate', 'bounce_date', 'hardbounce', 'softbounce'])
    || (verb.includes('bounce') ? 1 : 0);
  const unsubscribed = ActiveCampaignClient._readCount(map, ['unsubscribed', 'unsubscribedate', 'unsubscribe_date', 'unsubdate'])
    || (verb.includes('unsub') ? 1 : 0);

  return {
    opened,
    clicked,
    bounced,
    unsubscribed,
    openDate: openDate || (opened ? sentDate : null),
    clickDate: clickDate || (clicked ? sentDate : null),
    sentDate,
    subject: map.subject || map.name || map.title || map.campaignname || null,
  };
}

// Returns engagement metrics plus a ready-made event list. Never throws.
async getContactEmailEngagement(contactId) {
  const engagement = {
    sent: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
    logs: [],
    events: [],
    lastEmailDate: null,
    openRate: 0,
    clickRate: 0,
    sources: [],
    unavailable: false,
  };

  // Ask the contact which sub-resources it actually has.
  let links = null;
  const contactRes = await this._getSafe(`/api/3/contacts/${contactId}`);
  if (contactRes.ok) links = contactRes.data?.contact?.links || null;

  let anySourceReachable = false;

  for (const source of ActiveCampaignClient.ENGAGEMENT_SOURCES) {
    // Skip sources this account doesn't expose, but only when links told us
    // definitively. If links is missing we try the canonical path anyway.
    if (links && !links[source.name]) {
      engagement.sources.push({ name: source.name, status: 'not-exposed', count: 0 });
      continue;
    }

    const res = await this._getSafe(`/api/3/contacts/${contactId}/${source.path}`, { limit: 100 });
    if (!res.ok) {
      engagement.sources.push({ name: source.name, status: 'error', error: res.error, count: 0 });
      continue;
    }

    anySourceReachable = true;
    const items = Array.isArray(res.data?.[source.itemsKey]) ? res.data[source.itemsKey] : [];
    engagement.sources.push({ name: source.name, status: 'ok', count: items.length });

    items.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      engagement.logs.push(raw);

      const log = ActiveCampaignClient._normaliseLog(raw);
      engagement.sent += 1;
      engagement.opened += log.opened;
      engagement.clicked += log.clicked;
      engagement.bounced += log.bounced;
      engagement.unsubscribed += log.unsubscribed;

      const bump = (iso) => {
        if (!iso) return;
        if (!engagement.lastEmailDate || new Date(iso) > new Date(engagement.lastEmailDate)) {
          engagement.lastEmailDate = iso;
        }
      };
      bump(log.openDate);
      bump(log.clickDate);

      if (log.opened && log.openDate) {
        engagement.events.push({
          date: log.openDate.slice(0, 10),
          type: 'email_open',
          detail: log.subject ? `Opened: ${log.subject}` : 'Email opened',
          timestamp: new Date(log.openDate).getTime(),
        });
      }
      if (log.clicked && log.clickDate) {
        engagement.events.push({
          date: log.clickDate.slice(0, 10),
          type: 'link_click',
          detail: log.subject ? `Clicked link in: ${log.subject}` : 'Clicked link',
          timestamp: new Date(log.clickDate).getTime(),
        });
      }
    });
  }

  // "Unavailable" means we could not reach ANY source -- genuinely different
  // from "reached them and this contact has no activity", which is real data.
  engagement.unavailable = !anySourceReachable;

  if (engagement.sent > 0) {
    engagement.openRate = Number((engagement.opened / engagement.sent * 100).toFixed(1));
    engagement.clickRate = Number((engagement.clicked / engagement.sent * 100).toFixed(1));
  }

  engagement.events.sort((a, b) => b.timestamp - a.timestamp);

  const summary = engagement.sources.map((s) => `${s.name}:${s.status}(${s.count})`).join(' ');
  console.log(`[AC] engagement contact=${contactId} sent=${engagement.sent} opened=${engagement.opened} clicked=${engagement.clicked} | ${summary}`);

  return engagement;
}

// Chronological engagement timeline. Accepts an already-fetched engagement
// object so callers don't pay for the same API round-trips twice.
async buildContactEngagementTimeline(contactId, { limit = 30, engagement = null } = {}) {
  try {
    const data = engagement || await this.getContactEmailEngagement(contactId);
    return (data.events || []).slice(0, limit);
  } catch (e) {
    console.warn(`[AC] Failed to build engagement timeline: ${e.message}`);
    return [];
  }
}

// Diagnostic: hit every candidate engagement source and report exactly what
// AC returns, so a production issue can be confirmed without a code change.
async probeContactEngagement(contactId) {
  const out = { contactId, contactLinks: null, sources: [] };

  const contactRes = await this._getSafe(`/api/3/contacts/${contactId}`);
  if (contactRes.ok) {
    out.contactLinks = Object.keys(contactRes.data?.contact?.links || {});
  } else {
    out.contactError = contactRes.error;
  }

  for (const source of ActiveCampaignClient.ENGAGEMENT_SOURCES) {
    const res = await this._getSafe(`/api/3/contacts/${contactId}/${source.path}`, { limit: 5 });
    if (!res.ok) {
      out.sources.push({ name: source.name, ok: false, error: res.error });
      continue;
    }
    const items = Array.isArray(res.data?.[source.itemsKey]) ? res.data[source.itemsKey] : [];
    out.sources.push({
      name: source.name,
      ok: true,
      responseKeys: Object.keys(res.data || {}),
      count: items.length,
      sampleKeys: items[0] ? Object.keys(items[0]) : [],
      sample: items[0] || null,
      normalisedSample: items[0] ? ActiveCampaignClient._normaliseLog(items[0]) : null,
    });
  }
  return out;
}
}

module.exports = { ActiveCampaignClient };
