'use strict';
// ---------------------------------------------------------------------------
// Attribution from what is already installed: GA4 (G-75HHYX37ZM, fed by the
// server-side GTM container) exports every raw event to BigQuery. This module
// reads that export, links each ActiveCampaign lead to its GA visitor, and
// stores the visitor's visits as journey events (same shape the Hub already
// renders), so no new tag is needed on the sites.
//
// Linking a lead to its GA visitor (user_pseudo_id):
//   1. gclid — the deal's GCLID field equals the visit's gclid (exact).
//   2. form time — a lead event (request_more_info, student_application,
//      sign_up, submit_form, application_submitted) within ±20 min of the
//      deal's creation, preferring the same campaign and landing page.
//      Each GA form event is used for one lead at most.
//
// Configuration (Railway variables):
//   GA_BQ_KEY       service-account JSON (BigQuery Data Viewer + Job User)
//   GA_BQ_PROJECT   Google Cloud project ID holding the export
//   GA_BQ_DATASET   default analytics_281853246
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const { emailHash } = require('./journeys');

const LEAD_EVENTS = ['request_more_info', 'student_application', 'sign_up', 'submit_form', 'application_submitted', 'generate_lead'];
const WINDOW_MIN = 20;
const ymd = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');
const pathOf = (url) => { try { return new URL(url).pathname.replace(/\/+$/, '') || '/'; } catch (e) { return null; } };
const norm = (s) => String(s || '').trim().toLowerCase();

// ---------------- BigQuery over REST (no SDK) ----------------
function createBigQuery({ key, project, fetchImpl = (...a) => fetch(...a) }) {
  const sa = typeof key === 'string' ? JSON.parse(key) : key;
  let token = null; let exp = 0;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  async function auth() {
    if (token && Date.now() < exp - 60000) return token;
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/bigquery', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
    const r = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${sig}` });
    const d = await r.json();
    if (!r.ok || !d.access_token) throw new Error(`Google sign-in failed: ${d.error_description || d.error || r.status}`);
    token = d.access_token; exp = Date.now() + (d.expires_in || 3600) * 1000;
    return token;
  }
  const param = (name, v) => (Array.isArray(v)
    ? { name, parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } }, parameterValue: { arrayValues: v.map((x) => ({ value: String(x) })) } }
    : { name, parameterType: { type: 'STRING' }, parameterValue: { value: String(v) } });
  const rowsOf = (schema, rows) => (rows || []).map((r) => Object.fromEntries(schema.fields.map((f, i) => [f.name, r.f[i].v])));
  async function query(sql, params = {}) {
    const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}`;
    const headers = { authorization: `Bearer ${await auth()}`, 'content-type': 'application/json' };
    let r = await fetchImpl(`${base}/queries`, { method: 'POST', headers, body: JSON.stringify({ query: sql, useLegacySql: false, parameterMode: 'NAMED', queryParameters: Object.entries(params).map(([k, v]) => param(k, v)), timeoutMs: 90000, maxResults: 50000 }) });
    let d = await r.json();
    if (!r.ok) throw new Error(`BigQuery: ${(d.error && d.error.message) || r.status}`);
    const job = d.jobReference;
    while (!d.jobComplete) {
      r = await fetchImpl(`${base}/queries/${job.jobId}?location=${encodeURIComponent(job.location || 'US')}&timeoutMs=60000&maxResults=50000`, { headers });
      d = await r.json(); if (!r.ok) throw new Error(`BigQuery: ${(d.error && d.error.message) || r.status}`);
    }
    let out = rowsOf(d.schema, d.rows);
    let page = d.pageToken;
    while (page) {
      r = await fetchImpl(`${base}/queries/${job.jobId}?location=${encodeURIComponent(job.location || 'US')}&pageToken=${encodeURIComponent(page)}&maxResults=50000`, { headers });
      const p = await r.json(); if (!r.ok) throw new Error(`BigQuery: ${(p.error && p.error.message) || r.status}`);
      out = out.concat(rowsOf(d.schema, p.rows)); page = p.pageToken;
    }
    return out;
  }
  return { query };
}

// ---------------- SQL ----------------
const tables = (project, dataset) => `\`${project}.${dataset}.events_*\``;
const suffix = `(_TABLE_SUFFIX BETWEEN @from AND @to OR _TABLE_SUFFIX BETWEEN CONCAT('intraday_', @from) AND CONCAT('intraday_', @to))`;
const P = (k, t = 'string') => `(SELECT value.${t}_value FROM UNNEST(event_params) WHERE key = '${k}')`;

const sqlFormEvents = (T) => `SELECT user_pseudo_id AS u, event_timestamp AS ts, event_name AS n, ${P('page_location')} AS loc,
  collected_traffic_source.gclid AS gclid, collected_traffic_source.manual_campaign_name AS camp
  FROM ${T} WHERE ${suffix} AND event_name IN UNNEST(@names)`;
const sqlGclids = (T) => `SELECT DISTINCT user_pseudo_id AS u, collected_traffic_source.gclid AS gclid
  FROM ${T} WHERE ${suffix} AND collected_traffic_source.gclid IN UNNEST(@gclids)`;
const sqlJourney = (T, rich) => `SELECT user_pseudo_id AS u, event_timestamp AS ts, event_name AS n,
  ${P('ga_session_id', 'int')} AS sid, ${P('page_location')} AS loc, ${P('page_referrer')} AS ref, ${P('entrances', 'int')} AS ent,
  collected_traffic_source.manual_source AS src, collected_traffic_source.manual_medium AS med, collected_traffic_source.manual_campaign_name AS camp,
  collected_traffic_source.manual_content AS content, collected_traffic_source.manual_term AS term, collected_traffic_source.gclid AS gclid,
  ${rich ? 'session_traffic_source_last_click.google_ads_campaign.campaign_name AS ads_campaign, session_traffic_source_last_click.google_ads_campaign.ad_group_name AS ads_adgroup,' : 'NULL AS ads_campaign, NULL AS ads_adgroup,'}
  device.category AS dev
  FROM ${T} WHERE ${suffix} AND user_pseudo_id IN UNNEST(@users) AND event_name IN ('page_view', 'session_start')`;

// ---------------- pure helpers (tested) ----------------
// leads: [{ id, createdAt, gclid, campaign, landingUrl }]; forms: [{ u, ts(µs), n, loc, camp }]; gclidUsers: Map gclid -> u
function matchLeads(leads, forms, gclidUsers) {
  const out = new Map(); // lead id -> { u, method, at, confidence }
  const used = new Set();
  for (const l of leads) {
    if (l.gclid && gclidUsers.has(l.gclid)) {
      const f = forms.filter((x) => x.u === gclidUsers.get(l.gclid)).sort((a, b) => Math.abs(Number(a.ts) / 1000 - Date.parse(l.createdAt)) - Math.abs(Number(b.ts) / 1000 - Date.parse(l.createdAt)))[0];
      out.set(String(l.id), { u: gclidUsers.get(l.gclid), method: 'gclid', confidence: 'high', at: f ? new Date(Number(f.ts) / 1000).toISOString() : l.createdAt });
      if (f) used.add(`${f.u}|${f.ts}`);
    }
  }
  // Every (lead, form event) pair inside the window, best first; each side used once.
  const pairs = [];
  for (const l of leads) {
    if (out.has(String(l.id)) || !l.createdAt) continue;
    const t = Date.parse(l.createdAt);
    const lp = l.landingUrl ? pathOf(l.landingUrl) : null;
    for (const f of forms) {
      const ft = Number(f.ts) / 1000;
      const dt = Math.abs(ft - t) / 60000;
      if (!(dt <= WINDOW_MIN)) continue;
      const sameCamp = !!(l.campaign && f.camp && norm(l.campaign) === norm(f.camp));
      const samePath = !!(lp && f.loc && pathOf(f.loc) === lp);
      pairs.push({ l, f, dt, score: dt - (sameCamp ? 8 : 0) - (samePath ? 6 : 0), sameCamp, samePath });
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  for (const p of pairs) {
    const key = `${p.f.u}|${p.f.ts}`;
    if (out.has(String(p.l.id)) || used.has(key)) continue;
    used.add(key);
    out.set(String(p.l.id), { u: p.f.u, method: 'form-time', confidence: p.dt <= 3 && (p.sameCamp || p.samePath) ? 'high' : p.dt <= 8 ? 'medium' : 'low', at: new Date(Number(p.f.ts) / 1000).toISOString() });
  }
  return out;
}

// GA rows -> the tracker's event shape (one row per page view; session start carries the source).
function toEvents(rows) {
  const bySession = new Map();
  rows.sort((a, b) => Number(a.ts) - Number(b.ts));
  const out = [];
  for (const r of rows) {
    const sid = String(r.sid || '');
    if (r.n === 'session_start') { bySession.set(sid, r); continue; }
    let loc; try { loc = new URL(r.loc); } catch (e) { continue; }
    const start = bySession.get(sid);
    const first = !out.some((e) => e.sid === sid && e.vid === r.u);
    const src = first ? (start && (start.src || start.gclid || start.camp) ? start : r) : null;
    const utm = src ? Object.fromEntries(Object.entries({ source: src.src, medium: src.med, campaign: src.camp || src.ads_campaign, content: src.content || src.ads_adgroup, term: src.term }).filter(([, v]) => v && v !== '(not set)' && v !== '(direct)' && v !== '(none)')) : null;
    out.push({
      vid: r.u, type: 'pv', ts: Math.floor(Number(r.ts) / 1000), sid, host: loc.hostname, path: loc.pathname, title: null,
      newSession: first, referrer: first ? (r.ref || (start && start.ref) || null) : null,
      utm: utm && Object.keys(utm).length ? utm : null,
      clickType: first && src && src.gclid ? 'gclid' : null, clickId: first && src ? src.gclid || null : null,
      mobile: r.dev ? r.dev === 'mobile' : null,
    });
  }
  return out;
}

// ---------------- sync ----------------
function createGa4Sync({ store, getRecords, env = process.env, bq = null, log = console }) {
  const project = env.GA_BQ_PROJECT; const dataset = env.GA_BQ_DATASET || 'analytics_281853246';
  const configured = !!(bq || (env.GA_BQ_KEY && project));
  const client = bq || (configured ? createBigQuery({ key: env.GA_BQ_KEY, project }) : null);
  const T = tables(project, dataset);
  const state = { configured, project: project || null, dataset, running: false, lastRun: null, lastError: null, last: null };
  const LOOKBACK_DAYS = Number(env.GA_LEAD_LOOKBACK_DAYS || 45);
  const HISTORY_DAYS = Number(env.GA_HISTORY_DAYS || 90);

  async function run() {
    if (!configured || state.running) return state;
    state.running = true; state.lastError = null;
    const t0 = Date.now();
    try {
      const since = Date.now() - LOOKBACK_DAYS * 864e5;
      const all = (getRecords() || []).filter((r) => r.email && r.createdAt && Date.parse(r.createdAt) >= since);
      const hashes = new Map(all.map((r) => [String(r.id), emailHash(r.email)]));
      const linked = new Set((await store.vidsFor([...new Set(hashes.values())])).filter((x) => String(x.vid).startsWith('ga:')).map((x) => x.email_hash));
      const leads = all.filter((r) => !linked.has(hashes.get(String(r.id))));
      const res = { leads: leads.length, matched: 0, byMethod: { gclid: 0, 'form-time': 0 }, events: 0 };
      if (leads.length) {
        const from = ymd(Math.min(...leads.map((r) => Date.parse(r.createdAt))) - 864e5); const to = ymd(Date.now());
        const forms = await client.query(sqlFormEvents(T), { from, to, names: LEAD_EVENTS });
        const gclids = [...new Set(leads.map((r) => r.gclid).filter(Boolean))];
        const gclidUsers = new Map();
        if (gclids.length) (await client.query(sqlGclids(T), { from: ymd(Date.now() - (LOOKBACK_DAYS + 30) * 864e5), to, gclids })).forEach((x) => gclidUsers.set(x.gclid, x.u));
        const matches = matchLeads(leads.map((r) => ({ id: r.id, createdAt: r.createdAt, gclid: r.gclid, campaign: r.campaign, landingUrl: r.landingUrl })), forms, gclidUsers);
        // Pull the visits of matched visitors we don't have yet.
        const users = [...new Set([...matches.values()].map((m) => m.u))];
        const have = new Set((await store.knownVids(users.map((u) => `ga:${u}`))).map((v) => v.slice(3)));
        const need = users.filter((u) => !have.has(u));
        const hFrom = ymd(Date.now() - (LOOKBACK_DAYS + HISTORY_DAYS) * 864e5);
        for (let i = 0; i < need.length; i += 400) {
          const chunk = need.slice(i, i + 400);
          let rows;
          try { rows = await client.query(sqlJourney(T, true), { from: hFrom, to, users: chunk }); } catch (e) {
            if (!/session_traffic_source_last_click|Unrecognized name|not found inside/i.test(e.message)) throw e;
            rows = await client.query(sqlJourney(T, false), { from: hFrom, to, users: chunk }); // older export schema
          }
          const evs = toEvents(rows);
          const byU = new Map(); evs.forEach((e) => (byU.get(e.vid) || byU.set(e.vid, []).get(e.vid)).push(e));
          for (const [u, list] of byU) { await store.addEvents(`ga:${u}`, list.map((e) => ({ ...e, vid: `ga:${u}` }))); res.events += list.length; }
        }
        for (const r of leads) {
          const m = matches.get(String(r.id)); if (!m) continue;
          await store.link(hashes.get(String(r.id)), `ga:${m.u}`, { at: m.at, method: m.method, confidence: m.confidence });
          res.matched++; res.byMethod[m.method]++;
        }
      }
      state.last = { ...res, ms: Date.now() - t0 };
      state.lastRun = new Date().toISOString();
      log.log(`[attribution] GA4 sync: ${res.matched}/${res.leads} new leads linked (gclid ${res.byMethod.gclid}, form time ${res.byMethod['form-time']}), ${res.events} visits`);
    } catch (e) {
      state.lastError = e.message; state.lastRun = new Date().toISOString();
      log.warn('[attribution] GA4 sync failed:', e.message);
    } finally { state.running = false; }
    return state;
  }

  return { run, status: () => ({ ...state }), configured };
}

module.exports = { createGa4Sync, createBigQuery, matchLeads, toEvents, LEAD_EVENTS };
