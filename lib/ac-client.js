// Thin client for the ActiveCampaign REST API v3.
// Docs: https://developers.activecampaign.com/reference/overview
const fetch = require('node-fetch');

class ActiveCampaignClient {
  constructor({ apiUrl, apiKey }) {
    if (!apiUrl || !apiKey) {
      throw new Error('AC_API_URL and AC_API_KEY must be set');
    }
    this.baseUrl = apiUrl.replace(/\/+$/, '');
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
}

module.exports = { ActiveCampaignClient };
