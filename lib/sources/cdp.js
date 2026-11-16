'use strict';
// ---------------------------------------------------------------------------
// 4Geeks CDP -> Hub, read-only (docs: breatheco-de/cdp, docs/agents/skills).
//
// The CDP (https://cdp.4geeks.us) collects people and what they do, scores
// their interest and nurtures them with emails and flows. With a reader token
// the Hub looks one person up by email and shows, inside the lead's page, what
// the CDP knows: traits, interest (personas / products), segments, consent,
// recent activity and nurture state (points, goals, flow runs).
//
// A reader token cannot change anything in the CDP. Env:
//   CDP_TOKEN      an agent token with role agent_reader (CDP console > Tokens)
//   CDP_BASE_URL   default https://cdp.4geeks.us
//
// Personal data: only the email is used, to look the person up. Trait values
// that are personal (name, email, phone, address...) and event properties are
// dropped here, so they never reach the browser.
// ---------------------------------------------------------------------------
const nodeFetch = require('node-fetch');

const TTL = 5 * 60 * 1000;
const PERSONAL_TRAIT = /name|email|mail|phone|whats|address|street|birth|passport|dni|document|linkedin|ip$/i;
const isScalar = (v) => ['string', 'number', 'boolean'].includes(typeof v);

// Any list of objects (points, goals, runs...) as short rows of plain values.
function compactList(list, max = 12) {
  return list.slice(0, max).map((x) => {
    if (!x || typeof x !== 'object') return { value: x };
    const out = {};
    Object.entries(x).forEach(([k, v]) => { if (isScalar(v) && !PERSONAL_TRAIT.test(k) && Object.keys(out).length < 8) out[k] = v; });
    return out;
  });
}
function compactNurture(n) {
  const root = n && typeof n === 'object' ? (n.profile && typeof n.profile === 'object' && !Array.isArray(n.profile) && Object.keys(n).length === 1 ? n.profile : n) : null;
  if (!root) return null;
  const out = {};
  Object.entries(root).forEach(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') out[k] = { total: v.length, items: compactList(v) };
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.entries(v).forEach(([k2, v2]) => { if (Array.isArray(v2) && v2.length && typeof v2[0] === 'object') out[`${k}.${k2}`] = { total: v2.length, items: compactList(v2) }; });
  });
  return Object.keys(out).length ? out : null;
}

function createCdp({ env = process.env, log = console, fetch = nodeFetch } = {}) {
  const token = env.CDP_TOKEN;
  const base = String(env.CDP_BASE_URL || 'https://cdp.4geeks.us').replace(/\/+$/, '');
  const enabled = !!token;
  const cache = new Map();

  async function get(path) {
    const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, timeout: 12000 });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error((body && body.error && body.error.message) || `CDP answered ${res.status}`);
      e.status = res.status; e.code = body && body.error && body.error.code;
      throw e;
    }
    return body;
  }
  async function cached(k, fn) {
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < TTL) return hit.data;
    const data = await fn();
    if (cache.size > 2000) cache.clear();
    cache.set(k, { at: Date.now(), data });
    return data;
  }

  // Connection check for Settings: is the token valid, and how many people the CDP holds.
  async function status() {
    if (!enabled) return { enabled: false, baseUrl: base };
    try {
      const s = await cached('summary', () => get('/v1/profiles/summary'));
      const sum = (s && s.summary) || {};
      return { enabled: true, ok: true, baseUrl: base, leads: sum.leadCounts ? sum.leadCounts.leads : null, known: sum.whoCounts ? sum.whoCounts.known : null };
    } catch (e) {
      return { enabled: true, ok: false, baseUrl: base, error: e.message, code: e.code || null, httpStatus: e.status || null };
    }
  }

  // One person by email. { found: false } when the CDP does not know them.
  async function person(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) return { found: false, reason: 'no_email' };
    return cached(`p:${e}`, async () => {
      let d;
      try { d = await get(`/v1/profiles/by/email/${encodeURIComponent(e)}`); } catch (err) { if (err.status === 404) return { found: false }; throw err; }
      const p = (d && d.profile) || {};
      const id = p.profile && p.profile.id;
      let nurture = null;
      if (id) { try { nurture = compactNurture(await get(`/v1/automations/profiles/${encodeURIComponent(id)}`)); } catch (err) { log.warn('[cdp] nurture state not read:', err.message); } }
      const segs = p.segments || [];
      return {
        found: true,
        profileId: id || null,
        createdAt: (p.profile && p.profile.createdAt) || null,
        identifierTypes: [...new Set((p.identifiers || []).map((x) => x.type))],
        traits: (p.traits || []).filter((t) => !PERSONAL_TRAIT.test(t.key || '') && isScalar(t.value)).map((t) => ({ key: t.key, value: t.value, source: t.source || null, updatedAt: t.updatedAt || null })),
        personas: segs.filter((s) => s.kind === 'persona').map((s) => ({ segment: s.name, enteredAt: s.enteredAt || null })),
        segments: segs.filter((s) => s.kind !== 'persona').map((s) => ({ segment: s.name, kind: s.kind || null, enteredAt: s.enteredAt || null })),
        consent: p.consent ? { marketingAnywhere: !!p.consent.marketingAnywhere, channels: (p.consent.channels || []).map((c) => ({ channel: c.channel, marketing: !!c.marketing, block: c.marketingBlock || null })) } : null,
        activity: (p.events || []).slice(0, 15).map((x) => ({ event: x.name, source: x.source || null, at: x.timestamp || null })),
        nurture,
      };
    });
  }

  function start() { log.log(enabled ? `[cdp] on: read-only lookups against ${base}` : '[cdp] off (set CDP_TOKEN, an agent_reader token, to show CDP data on each lead)'); }

  return { enabled, start, status, person };
}

module.exports = { createCdp, compactNurture };
