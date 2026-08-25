// Thin client for the ActiveCampaign REST API v3.
// Docs: https://developers.activecampaign.com/reference/overview
const fetch = require('node-fetch');

class ActiveCampaignClient {
  constructor({ apiUrl, apiKey }) {
    if (!apiUrl || !apiKey) {
      throw new Error('AC_API_URL and AC_API_KEY must be set');
    }
    this.baseUrl = apiUrl.replace(//+$/, '');
    this.apiKey = apiKey;
  }

async _get(path, params = {}, retries = 3) {
  const url = new URL(this.baseUrl + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    headers: { 'Api-Token': this.apiKey, Accept: 'application/json' },
  });
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 1000;
    await new Promise((r) => setTimeout(r, wait));
    return this._get(path, params, retries - 1);
  }
  if (!res.ok) {
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

async listDealCustomFieldDataForDeals(dealIds, { concurrency = 8 } = {}) {
  const results = await this._mapWithConcurrency(dealIds, concurrency, async (id) => {
    try {
      return await this.listDealCustomFieldDataForDeal(id);
    } catch (e) {
      return [];
    }
  });
  return results.flat();
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

async listContactFieldValuesForContacts(contactIds, { concurrency = 8 } = {}) {
  const results = await this._mapWithConcurrency(contactIds, concurrency, async (id) => {
    try {
      const values = await this.listContactFieldValues(id);
      return values.map((v) => ({ ...v, contact: String(id) }));
    } catch (e) {
      return [];
    }
  });
  return results.flat();
}

// ---- Lead Coach / Email Engagement ----

// Get a single deal by ID
async getDeal(dealId) {
  const data = await this._get(`/api/3/deals/${dealId}`);
  return data.deal;
}

// Get email tracking logs for a contact (opens, clicks, etc)
// Returns engagement events like opens, clicks, bounces
async getContactEmailEngagement(contactId, { days = 90 } = {}) {
  try {
    // AC Email Tracking Logs endpoint: shows opens, clicks, bounces, etc
    // Try the emailTrackingLogs endpoint first
    let data;
    try {
      data = await this._get(`/api/3/contacts/${contactId}/emailTrackingLogs`);
    } catch (e) {
      // If emailTrackingLogs endpoint fails, try the communications history endpoint
      console.warn(`[AC] emailTrackingLogs endpoint failed for contact ${contactId}, trying alternative: ${e.message}`);
      try {
        data = await this._get(`/api/3/contacts/${contactId}/communications`, { limit: 100 });
      } catch (e2) {
        // If both fail, return unavailable
        throw new Error(`Both emailTrackingLogs and communications endpoints failed: ${e2.message}`);
      }
    }

    const logs = data.emailTrackingLogs || data.communications || [];

    // Parse the logs to extract metrics
    const engagement = {
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
      logs: [],
      lastEmailDate: null,
    };

    logs.forEach((log) => {
      engagement.logs.push(log);

      if (log.openedDate) {
        engagement.opened++;
        if (!engagement.lastEmailDate || new Date(log.openedDate) > new Date(engagement.lastEmailDate)) {
          engagement.lastEmailDate = log.openedDate;
        }
      }
      if (log.clickedDate) {
        engagement.clicked++;
        if (!engagement.lastEmailDate || new Date(log.clickedDate) > new Date(engagement.lastEmailDate)) {
          engagement.lastEmailDate = log.clickedDate;
        }
      }
      if (log.bounceDate) engagement.bounced++;
      if (log.unsubscribeDate) engagement.unsubscribed++;
    });

    // If no logs but request succeeded, it means no tracking data available
    if (logs.length === 0) {
      console.log(`[AC] No email tracking data for contact ${contactId} (might not have email tracking enabled)`);
    }

    // Calculate rates
    engagement.openRate = logs.length > 0 ? (engagement.opened / logs.length * 100).toFixed(1) : 0;
    engagement.clickRate = logs.length > 0 ? (engagement.clicked / logs.length * 100).toFixed(1) : 0;

    return engagement;
  } catch (e) {
    // Email tracking may not be available on all AC plans
    console.warn(`[AC] Email tracking not available for contact ${contactId}: ${e.message}`);
    return {
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
      logs: [],
      lastEmailDate: null,
      openRate: 0,
      clickRate: 0,
      unavailable: true,
    };
  }
}

// Get engagement timeline: aggregates email opens/clicks + notes in chronological order
async buildContactEngagementTimeline(contactId, { limit = 30 } = {}) {
  try {
    const [emailEngagement, contact] = await Promise.all([
      this.getContactEmailEngagement(contactId),
      this.getContact(contactId),
    ]);

    const timeline = [];

    // Add email events to timeline
    emailEngagement.logs.forEach((log) => {
      if (log.openedDate) {
        timeline.push({
          date: log.openedDate.slice(0, 10),
          type: 'email_open',
          detail: log.subject || 'Email opened',
          timestamp: new Date(log.openedDate).getTime(),
        });
      }
      if (log.clickedDate) {
        timeline.push({
          date: log.clickedDate.slice(0, 10),
          type: 'link_click',
          detail: log.subject ? `Clicked link in: ${log.subject}` : 'Clicked link',
          timestamp: new Date(log.clickedDate).getTime(),
        });
      }
    });

    // Sort by date descending (most recent first)
    timeline.sort((a, b) => b.timestamp - a.timestamp);

    return timeline.slice(0, limit);
  } catch (e) {
    console.warn(`[AC] Failed to build engagement timeline: ${e.message}`);
    return [];
  }
}
}

module.exports = { ActiveCampaignClient };
