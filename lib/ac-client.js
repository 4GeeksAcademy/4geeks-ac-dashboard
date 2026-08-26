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
    // IMPORTANT: AC's ~5 req/sec ceiling is per ACCOUNT, shared with every
    // other system hitting the same API (n8n flows, automations, integrations).
    // This dashboard is a background reporting job -- the least latency-
    // sensitive consumer on the account -- so it takes a small slice by
    // default and leaves the rest for work that users are waiting on.
    // Defaulting this to 4 previously meant quietly consuming ~80% of the
    // shared budget around the clock and starving those other workflows.
    this.baseRequestsPerSecond = Number(requestsPerSecond || process.env.AC_REQUESTS_PER_SECOND || 1);
    this.minRequestIntervalMs = 1000 / this.baseRequestsPerSecond;
    this._nextSlot = 0;

    // When we see a 429 it means somebody else is also using the budget.
    // Yield hard rather than continuing to race them.
    this._backoffUntil = 0;
    this.contendedBackoffMs = Number(process.env.AC_CONTENDED_BACKOFF_MS || 60000);

    // node-fetch has NO default timeout: a stalled socket hangs forever and
    // takes a worker slot with it. Every request gets an explicit deadline.
    this.timeoutMs = Number(timeoutMs || process.env.AC_TIMEOUT_MS || 20000);

    this.stats = { requests: 0, retries: 0, timeouts: 0, errors: 0, contended: 0 };
    // Rolling per-minute request counts so actual API pressure is observable
    // rather than guessed at. Keeps the last 120 minutes.
    this._minuteBuckets = new Map();
    this.startedAt = Date.now();
  }

// Reserves the next allowed send slot, so concurrent callers queue in order
// rather than all firing at once.
_recordMinute() {
  const minute = Math.floor(Date.now() / 60000);
  this._minuteBuckets.set(minute, (this._minuteBuckets.get(minute) || 0) + 1);
  if (this._minuteBuckets.size > 120) {
    const cutoff = minute - 120;
    for (const k of this._minuteBuckets.keys()) if (k < cutoff) this._minuteBuckets.delete(k);
  }
}

// What load are we ACTUALLY putting on the shared AC rate limit right now?
getLoadReport() {
  const nowMinute = Math.floor(Date.now() / 60000);
  const at = (m) => this._minuteBuckets.get(m) || 0;
  const lastN = (n) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += at(nowMinute - i);
    return sum;
  };
  const uptimeMin = Math.max(1, (Date.now() - this.startedAt) / 60000);
  const last60 = lastN(60);

  return {
    configuredRequestsPerSecond: this.baseRequestsPerSecond,
    currentlyBackedOff: Date.now() < this._backoffUntil,
    requestsThisMinute: at(nowMinute),
    requestsLastMinute: at(nowMinute - 1),
    requestsLast5Min: lastN(5),
    requestsLast60Min: last60,
    avgPerSecondLast5Min: Number((lastN(5) / 300).toFixed(3)),
    avgPerSecondLast60Min: Number((last60 / 3600).toFixed(3)),
    peakMinuteLast60: Math.max(0, ...Array.from({ length: 60 }, (_, i) => at(nowMinute - i))),
    totalSinceBoot: this.stats.requests,
    avgPerMinuteSinceBoot: Number((this.stats.requests / uptimeMin).toFixed(1)),
    uptimeMinutes: Number(uptimeMin.toFixed(1)),
    // AC's documented ceiling is ~5/sec per ACCOUNT, shared with every other
    // integration. This is the share this dashboard is consuming.
    estimatedShareOfAccountLimit: `${((lastN(5) / 300 / 5) * 100).toFixed(1)}%`,
    stats: this.stats,
  };
}

async _throttle() {
  const now = Date.now();
  // While contended (we recently got a 429), run at a quarter speed so the
  // other consumers on the account can get their requests through.
  const interval = now < this._backoffUntil ? this.minRequestIntervalMs * 4 : this.minRequestIntervalMs;
  const slot = Math.max(now, this._nextSlot);
  this._nextSlot = slot + interval;
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
  this._recordMinute();

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
    this.stats.contended = (this.stats.contended || 0) + 1;
    // A 429 means the account's shared budget is under contention. Back the
    // whole limiter off -- not just this request -- and stay slowed down for
    // a while so we're not racing whatever else is trying to use the API.
    this._nextSlot = Math.max(this._nextSlot, Date.now() + wait);
    this._backoffUntil = Date.now() + this.contendedBackoffMs;
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
async _paginateAll(path, params, itemsKey, { pageSize = 100, maxPages = 5000, onProgress = null } = {}) {
  let offset = 0;
  let all = [];
  let reportedTotal = null;

  for (let page = 0; page < maxPages; page++) {
    const data = await this._get(path, { ...params, limit: pageSize, offset });
    const items = data[itemsKey] || [];
    all = all.concat(items);
    if (reportedTotal === null) reportedTotal = Number(data.meta?.total ?? items.length);
    const total = Number(data.meta?.total ?? items.length);
    offset += pageSize;
    if (onProgress) onProgress(all.length, total);
    if (items.length < pageSize || offset >= total) return all;
  }

  // Hitting the page cap USED to happen silently at maxPages=200 (20,000 rows).
  // That is what quietly truncated dealCustomFieldData and left LATAM lost
  // reasons empty -- and it is why this was abandoned for one-request-per-
  // entity fetching, which cost ~100x more requests. Truncation is now loud,
  // so the cap can be raised instead of the strategy being thrown away.
  console.warn(`[AC] TRUNCATED ${path}: stopped at ${all.length} rows after ${maxPages} pages (meta.total reported ${reportedTotal}). Raise maxPages -- data is INCOMPLETE.`);
  return all;
}

// Bulk custom field pulls. These are the cheap way to get custom fields:
// ~1 request per 100 ROWS, versus 1 request per ENTITY. For a 4-month window
// that is the difference between a few thousand requests and ~34,000.
async listAllDealCustomFieldData(opts = {}) {
  return this._paginateAll('/api/3/dealCustomFieldData', {}, 'dealCustomFieldData', opts);
}

async listAllContactFieldValues(opts = {}) {
  return this._paginateAll('/api/3/fieldValues', {}, 'fieldValues', opts);
}

// Same paginator, but asks AC to SIDE-LOAD a related collection into the
// same response via ?include=. When supported this collapses one request per
// entity (~17,000 for a 4-month window) into the ~170 requests we were
// already making to page through the list -- a ~100x reduction, and the
// difference between custom fields arriving in a minute versus in hours.
//
// AC ignores unknown query params rather than erroring, so "supported" is
// determined by whether the related collection actually comes back, and the
// caller falls back to per-entity fetching when it doesn't.
async _paginateAllWithInclude(path, params, itemsKey, includeKey, { pageSize = 100, maxPages = 400 } = {}) {
  let offset = 0;
  let items = [];
  let included = [];
  let includeSupported = null;

  for (let page = 0; page < maxPages; page++) {
    const data = await this._get(path, { ...params, include: includeKey, limit: pageSize, offset });
    const pageItems = data[itemsKey] || [];

    const sideLoaded = Array.isArray(data[includeKey]) ? data[includeKey] : null;
    if (includeSupported === null) includeSupported = sideLoaded !== null;
    // If the first page side-loaded but a later one didn't, we'd silently
    // lose data -- treat any missing page as unsupported and fall back.
    if (includeSupported && sideLoaded === null) {
      console.warn(`[AC] ${includeKey} side-load vanished mid-pagination; falling back to per-entity fetching`);
      includeSupported = false;
    }
    if (sideLoaded) included = included.concat(sideLoaded);

    items = items.concat(pageItems);
    const total = Number(data.meta?.total ?? pageItems.length);
    offset += pageSize;
    if (pageItems.length < pageSize || offset >= total) break;
  }

  return { items, included, includeSupported: !!includeSupported };
}

// Deals plus their custom field data in one pass, when AC allows it.
async listDealsWithCustomFields(filters = {}, opts = {}) {
  const params = {};
  if (filters.group) params['filters[group]'] = filters.group;
  if (filters.status !== undefined) params['filters[status]'] = filters.status;
  if (filters.createdAfter) params['filters[created_after]'] = filters.createdAfter;
  if (filters.createdBefore) params['filters[created_before]'] = filters.createdBefore;
  const res = await this._paginateAllWithInclude('/api/3/deals', params, 'deals', 'dealCustomFieldData', opts);
  return { deals: res.items, dealCustomFieldData: res.included, includeSupported: res.includeSupported };
}

// Contacts plus their field values in one pass, when AC allows it.
async listContactsWithFieldValues(filters = {}, opts = {}) {
  const params = {};
  if (filters.createdAfter) params['filters[created_after]'] = filters.createdAfter;
  if (filters.createdBefore) params['filters[created_before]'] = filters.createdBefore;
  const res = await this._paginateAllWithInclude('/api/3/contacts', params, 'contacts', 'fieldValues', opts);
  return { contacts: res.items, fieldValues: res.included, includeSupported: res.includeSupported };
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

  // Always ATTEMPT every canonical source. An earlier version skipped any
  // source missing from `contact.links`, which silently reported every
  // source as "not-exposed" if AC names those link keys differently than we
  // expect -- indistinguishable from "this lead never engaged". A wasted
  // 404 is far cheaper than wrongly reporting zero engagement.
  for (const source of ActiveCampaignClient.ENGAGEMENT_SOURCES) {
    const advertised = links ? !!links[source.name] : null;
    const res = await this._getSafe(`/api/3/contacts/${contactId}/${source.path}`, { limit: 100 });
    if (!res.ok) {
      engagement.sources.push({ name: source.name, status: 'error', advertised, error: res.error, count: 0 });
      continue;
    }

    anySourceReachable = true;
    // Some AC responses key the collection differently than the path; accept
    // any array in the payload rather than giving up on a name mismatch.
    let items = Array.isArray(res.data?.[source.itemsKey]) ? res.data[source.itemsKey] : null;
    let itemsKeyUsed = source.itemsKey;
    if (!items && res.data && typeof res.data === 'object') {
      const arrayKey = Object.keys(res.data).find((k) => k !== 'meta' && Array.isArray(res.data[k]));
      if (arrayKey) { items = res.data[arrayKey]; itemsKeyUsed = arrayKey; }
    }
    items = items || [];
    engagement.sources.push({ name: source.name, status: 'ok', advertised, itemsKeyUsed, count: items.length });

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

// Exhaustive engagement scan. Instead of guessing endpoint names, this asks
// the CONTACT what sub-resources it has (AC returns them in contact.links),
// probes every one of them, and reports which actually contain open/click
// data and under what field names. One request to this answers "does this
// account expose email engagement, and how do we read it" definitively.
// Wide scan: contact sub-resources WERE the only thing probed, which found
// nothing even though the AC UI clearly shows opens and clicks. So also probe
// the DEAL's own sub-resources and the account-level activity endpoints
// (filtered to this contact). Whichever one has rows is where the UI reads
// from, and that is what we wire up.
async scanEngagementEverywhere(contactId, dealId = null) {
  const out = { contactId, dealId, contact: null, deal: null, accountLevel: [] };

  out.contact = await this.scanContactEngagementSources(contactId);

  // --- Deal sub-resources ---
  if (dealId) {
    const dealRes = await this._getSafe(`/api/3/deals/${dealId}`);
    if (dealRes.ok) {
      const links = dealRes.data?.deal?.links || {};
      const names = Object.keys(links);
      const probes = [];
      // Probe everything the deal advertises -- deals have far fewer
      // sub-resources than contacts, so this stays cheap.
      for (const name of names) {
        const res = await this._getSafe(`/api/3/deals/${dealId}/${name}`, { limit: 5 });
        if (!res.ok) { probes.push({ name, ok: false, error: String(res.error).slice(0, 140) }); continue; }
        const body = res.data || {};
        const arrayKey = Object.keys(body).find((k) => k !== 'meta' && Array.isArray(body[k]));
        const items = arrayKey ? body[arrayKey] : [];
        probes.push({
          name, ok: true, collectionKey: arrayKey || null,
          count: items.length, total: body.meta?.total ?? null,
          sampleKeys: items[0] ? Object.keys(items[0]) : [],
          sample: items[0] || null,
        });
      }
      out.deal = { linkNames: names, probes };
    } else {
      out.deal = { error: dealRes.error };
    }
  }

  // --- Account-level activity endpoints, filtered to this contact ---
  // These are where AC's UI timeline typically reads from, and they are NOT
  // reachable as contact sub-resources.
  const ACCOUNT_LEVEL = [
    { path: '/api/3/activities', params: { 'filters[contact]': contactId, limit: 5 } },
    { path: '/api/3/dealActivities', params: { 'filters[contact]': contactId, limit: 5 } },
    { path: '/api/3/campaigns', params: { limit: 3 } },
    { path: '/api/3/logs', params: { 'filters[contact]': contactId, limit: 5 } },
    { path: '/api/3/mailLogs', params: { 'filters[contact]': contactId, limit: 5 } },
    { path: '/api/3/trackingLogs', params: { 'filters[contact]': contactId, limit: 5 } },
    { path: '/api/3/contactActivities', params: { 'filters[contact]': contactId, limit: 5 } },
  ];

  for (const cand of ACCOUNT_LEVEL) {
    const res = await this._getSafe(cand.path, cand.params);
    if (!res.ok) {
      out.accountLevel.push({ path: cand.path, ok: false, error: String(res.error).slice(0, 140) });
      continue;
    }
    const body = res.data || {};
    const arrayKey = Object.keys(body).find((k) => k !== 'meta' && Array.isArray(body[k]));
    const items = arrayKey ? body[arrayKey] : [];
    out.accountLevel.push({
      path: cand.path, ok: true, collectionKey: arrayKey || null,
      count: items.length, total: body.meta?.total ?? null,
      sampleKeys: items[0] ? Object.keys(items[0]) : [],
      sample: items[0] || null,
    });
  }

  const hits = [];
  if (out.deal?.probes) hits.push(...out.deal.probes.filter((p) => p.ok && p.count > 0).map((p) => `deal/${p.name}`));
  hits.push(...out.accountLevel.filter((p) => p.ok && p.count > 0).map((p) => p.path));
  out.verdict = hits.length
    ? `ROWS FOUND IN: ${hits.join(', ')} -- check their sampleKeys for open/click fields`
    : 'Still nothing anywhere. Send me a screenshot of where you see opens/clicks in the AC UI.';

  return out;
}

// The account-level /api/3/logs and /api/3/trackingLogs endpoints hold the
// real open/click data (millions of rows), but the contact-scoped routes
// return nothing and `filters[contact]` appears to be IGNORED -- the probe
// got back rows for other contacts entirely.
//
// This tests each plausible filter parameter and VERIFIES the returned rows
// actually belong to the requested contact. Without that verification an
// ignored filter looks like a working one: it returns 200 with rows, just
// the wrong rows. That is precisely the trap that produced the original bug.
async probeEngagementFilters(contactId) {
  const out = { contactId, endpoints: [], working: [], verdict: null };

  // AC's tracking tables key on the legacy "subscriberid", which is usually
  // -- but not always -- the same number as the contact id. Resolve it.
  let subscriberId = String(contactId);
  const contactRes = await this._getSafe(`/api/3/contacts/${contactId}`);
  if (contactRes.ok) {
    const c = contactRes.data?.contact || {};
    subscriberId = String(c.id ?? contactId);
    out.contactEmail = c.email || null;
  }

  const ENDPOINTS = [
    { path: '/api/3/logs', itemsKey: 'logs', idFields: ['contact', 'subscriberid'] },
    { path: '/api/3/trackingLogs', itemsKey: 'trackingLogs', idFields: ['contact', 'subscriberid'] },
  ];

  const FILTERS = [
    { label: 'filters[contact]', build: (id) => ({ 'filters[contact]': id }) },
    { label: 'filters[subscriberid]', build: (id) => ({ 'filters[subscriberid]': id }) },
    { label: 'filters[subscriber]', build: (id) => ({ 'filters[subscriber]': id }) },
    { label: 'contact', build: (id) => ({ contact: id }) },
    { label: 'subscriberid', build: (id) => ({ subscriberid: id }) },
  ];

  for (const ep of ENDPOINTS) {
    const results = [];
    for (const f of FILTERS) {
      const res = await this._getSafe(ep.path, { ...f.build(subscriberId), limit: 5 });
      if (!res.ok) {
        results.push({ filter: f.label, ok: false, error: String(res.error).slice(0, 120) });
        continue;
      }
      const items = Array.isArray(res.data?.[ep.itemsKey]) ? res.data[ep.itemsKey] : [];
      const total = res.data?.meta?.total ?? null;

      // THE decisive check: do the rows actually belong to this contact?
      const belongs = items.filter((row) =>
        ep.idFields.some((k) => row[k] != null && String(row[k]) === String(subscriberId))
      );
      const respected = items.length > 0 && belongs.length === items.length;

      results.push({
        filter: f.label,
        ok: true,
        rows: items.length,
        total,
        rowsMatchingContact: belongs.length,
        filterRespected: respected,
        sampleContactValues: items.slice(0, 3).map((r) => ({ contact: r.contact ?? null, subscriberid: r.subscriberid ?? null })),
        sample: respected ? items[0] : null,
      });

      if (respected) out.working.push({ path: ep.path, filter: f.label, total });
    }
    out.endpoints.push({ path: ep.path, results });
  }

  out.verdict = out.working.length
    ? `WORKING FILTERS: ${out.working.map((w) => `${w.path} via ${w.filter}`).join(' | ')}`
    : 'No filter is respected on these endpoints -- per-contact querying is NOT possible. Recommend an AC automation writing open/click counts into a deal custom field instead.';

  return out;
}

async scanContactEngagementSources(contactId, { extraPaths = [] } = {}) {
  const out = { contactId, linkNames: [], probes: [], verdict: null };

  const contactRes = await this._getSafe(`/api/3/contacts/${contactId}`);
  if (!contactRes.ok) {
    out.error = `could not load contact: ${contactRes.error}`;
    return out;
  }
  const contact = contactRes.data?.contact || {};
  const links = contact.links || {};
  out.linkNames = Object.keys(links);
  out.contactEmail = contact.email || null;

  // Probe every sub-resource the contact advertises, plus any extras, but
  // skip ones that clearly cannot carry email activity so a scan stays cheap.
  const SKIP = new Set(['organization', 'plusAppend', 'accountContacts', 'contactAutomations', 'automationEntryCounts', 'contactLists', 'contactTags', 'contactDeals', 'deals', 'fieldValues', 'geoIps', 'notes', 'scoreValues', 'contactData', 'contactGoals']);
  const candidates = [...new Set([...out.linkNames.filter((n) => !SKIP.has(n)), ...extraPaths])];

  const ENGAGEMENT_HINT = /open|click|bounce|unsub|sent|sdate|tstamp|campaign|message|subject/i;

  for (const name of candidates) {
    const res = await this._getSafe(`/api/3/contacts/${contactId}/${name}`, { limit: 5 });
    if (!res.ok) {
      out.probes.push({ name, ok: false, error: String(res.error).slice(0, 160) });
      continue;
    }
    const body = res.data || {};
    const arrayKey = Object.keys(body).find((k) => k !== 'meta' && Array.isArray(body[k]));
    const items = arrayKey ? body[arrayKey] : [];
    const sample = items[0] || null;
    const sampleKeys = sample ? Object.keys(sample) : [];
    const engagementFields = sampleKeys.filter((k) => ENGAGEMENT_HINT.test(k));

    out.probes.push({
      name,
      ok: true,
      collectionKey: arrayKey || null,
      count: items.length,
      total: body.meta?.total ?? null,
      sampleKeys,
      engagementFields,
      sample,
      normalised: sample ? ActiveCampaignClient._normaliseLog(sample) : null,
    });
  }

  const withData = out.probes.filter((p) => p.ok && p.count > 0);
  const withEngagement = withData.filter((p) => p.engagementFields.length > 0);
  out.verdict = withEngagement.length
    ? `FOUND engagement data in: ${withEngagement.map((p) => p.name).join(', ')}`
    : withData.length
      ? `Sources returned rows but none carry open/click fields: ${withData.map((p) => p.name).join(', ')}`
      : 'No source returned any rows -- this contact has no tracked activity, or tracking is not enabled on the account.';

  return out;
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
