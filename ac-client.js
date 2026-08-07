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

  async _get(path, params = {}) {
    const url = new URL(this.baseUrl + path);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), {
      headers: { 'Api-Token': this.apiKey, Accept: 'application/json' },
    });
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

  async listDealCustomFieldData(dealIds) {
    // AC doesn't support bulk-by-ids on this endpoint reliably across versions,
    // so we pull all and filter client-side, chunked by page.
    const all = await this._paginateAll('/api/3/dealCustomFieldData', {}, 'dealCustomFieldData', { pageSize: 100 });
    if (!dealIds) return all;
    const idSet = new Set(dealIds.map(String));
    return all.filter((d) => idSet.has(String(d.dealId)));
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

  // Bulk pull of ALL contact custom field values (avoids N+1 requests per contact).
  async listAllFieldValues(opts = {}) {
    return this._paginateAll('/api/3/fieldValues', {}, 'fieldValues', { pageSize: 100, ...opts });
  }

  async listContactFieldValues(contactId) {
    const data = await this._get(`/api/3/contacts/${contactId}/fieldValues`);
    return data.fieldValues || [];
  }
}

module.exports = { ActiveCampaignClient };
