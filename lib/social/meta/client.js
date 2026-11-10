'use strict';
// ---------------------------------------------------------------------------
// Social — minimal Graph API client. The token goes in the Authorization
// header, never in the URL (so it never ends up in logs).
// ---------------------------------------------------------------------------

// Usage limits: wait and retry.
const RATE_LIMIT = new Set([4, 17, 32, 613, ...Array.from({ length: 15 }, (_, i) => 80000 + i)]);
// Transient Meta errors (e.g. "(#-2) Timeout" on big inboxes): retry soon.
const TRANSIENT = new Set([-2, 1, 2]);

class GraphError extends Error {
  constructor(status, payload) {
    const err = (payload && payload.error) || {};
    const message = err.message || JSON.stringify(payload).slice(0, 300);
    super(`HTTP ${status} (#${err.code}) ${message}`);
    this.status = status;
    this.code = err.code;
    this.graphMessage = message;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {string} o.token        System User token (META_ACCESS_TOKEN)
 * @param {string} [o.version]    Graph API version (META_GRAPH_API_VERSION)
 * @param {Function} [o.fetch]    injectable for tests
 * @param {number} [o.rateLimitPauseMs] [o.transientPauseMs]
 */
function createMetaClient({ token, version, fetch: fetchImpl, rateLimitPauseMs = 60000, transientPauseMs = 5000 } = {}) {
  if (!token) throw new Error('META_ACCESS_TOKEN is not set');
  const base = `https://graph.facebook.com/${version || process.env.META_GRAPH_API_VERSION || 'v26.0'}/`;
  const doFetch = fetchImpl || globalThis.fetch;
  const client = { calls: 0 };

  async function request(method, endpoint, params, pageToken) {
    client.calls++;
    const url = new URL(String(endpoint).replace(/^\//, ''), base);
    Object.entries(params || {}).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
    let res;
    try {
      res = await doFetch(url.toString(), { method, headers: { Authorization: `Bearer ${pageToken || token}` }, signal: AbortSignal.timeout(60000) });
    } catch (e) {
      throw new GraphError(599, { error: { code: -2, message: `Network: ${e.message}` } });
    }
    let data;
    try { data = await res.json(); } catch (e) { data = { error: { message: `Not JSON (HTTP ${res.status})` } }; }
    if (res.status >= 400 || (data && data.error)) throw new GraphError(res.status, data);
    return data;
  }

  /** GET with retries on rate limits and transient errors. */
  client.get = async (endpoint, params, pageToken, retries = 2) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request('GET', endpoint, params, pageToken);
      } catch (e) {
        if (attempt >= retries) throw e;
        if (RATE_LIMIT.has(e.code)) {
          console.warn(`[social] Meta usage limit (#${e.code}); waiting ${rateLimitPauseMs / 1000}s`);
          await sleep(rateLimitPauseMs);
        } else if (TRANSIENT.has(e.code) || e.status >= 500) {
          await sleep(transientPauseMs);
        } else {
          throw e;
        }
      }
    }
  };

  /** POST without retries (it writes to Meta). */
  client.post = (endpoint, params, pageToken) => request('POST', endpoint, params, pageToken);

  /** Follows cursor paging and returns the whole `data` list. */
  client.getAll = async (endpoint, params, pageToken, maxPages = 10) => {
    const p = { ...(params || {}) };
    const out = [];
    for (let i = 0; i < maxPages; i++) {
      const res = await client.get(endpoint, p, pageToken);
      out.push(...(res.data || []));
      const after = res.paging && res.paging.cursors && res.paging.cursors.after;
      if (!(res.paging && res.paging.next) || !after) break;
      p.after = after;
    }
    return out;
  };

  return client;
}

module.exports = { createMetaClient, GraphError };
