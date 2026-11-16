'use strict';
// ---------------------------------------------------------------------------
// Social — minimal TikTok API for Business v1.3 client (Marketing API, ads only).
// The token goes in the Access-Token header, never in the URL. TikTok answers
// HTTP 200 with {code, message, data}: code 0 is success.
// ---------------------------------------------------------------------------
const BASE = 'https://business-api.tiktok.com/open_api/v1.3/';
const RATE_LIMIT = new Set([40100, 40133]); // too many requests: wait and retry
const isTransient = (code) => code >= 50000 && code < 52000; // TikTok internal errors

class TikTokError extends Error {
  constructor(code, message) {
    super(`(${code}) ${message || ''}`);
    this.code = code;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {string} o.token         TIKTOK_ACCESS_TOKEN
 * @param {string} [o.appId] [o.secret]  TIKTOK_APP_ID / TIKTOK_APP_SECRET (to list the ad accounts)
 * @param {Function} [o.fetch]     injectable for tests
 */
function createTikTokClient({ token, appId, secret, fetch: fetchImpl, rateLimitPauseMs = 60000, transientPauseMs = 5000 } = {}) {
  if (!token) throw new Error('TIKTOK_ACCESS_TOKEN is not set');
  const doFetch = fetchImpl || globalThis.fetch;
  const client = { calls: 0, appId, secret };

  /** GET with lists and objects in `params` sent as JSON (TikTok asks for that). Returns `data`. */
  client.get = async (path, params = {}, retries = 2) => {
    const url = new URL(String(path).replace(/^\//, ''), BASE);
    Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); });
    for (let attempt = 0; ; attempt++) {
      client.calls++;
      let d;
      try {
        const res = await doFetch(url.toString(), { headers: { 'Access-Token': token }, signal: AbortSignal.timeout(60000) });
        d = await res.json();
      } catch (e) { d = { code: 50000, message: `Network: ${e.message}`.slice(0, 300) }; }
      if (d && d.code === 0) return d.data || {};
      const err = new TikTokError(d && d.code, d && d.message);
      if (attempt >= retries || !(RATE_LIMIT.has(err.code) || isTransient(err.code))) throw err;
      const pause = RATE_LIMIT.has(err.code) ? rateLimitPauseMs : transientPauseMs;
      console.warn(`[social] TikTok ${err.code} on ${path}; waiting ${pause / 1000}s`);
      await sleep(pause);
    }
  };

  /** Follows page-number paging (page_info.total_page) and returns every item of `key`. */
  client.pages = async (path, params, key = 'list', pageSize = 1000, maxPages = 50) => {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const d = await client.get(path, { ...params, page, page_size: pageSize });
      out.push(...(d[key] || []));
      if (page >= ((d.page_info || {}).total_page || 1)) break;
    }
    return out;
  };

  return client;
}

module.exports = { createTikTokClient, TikTokError };
