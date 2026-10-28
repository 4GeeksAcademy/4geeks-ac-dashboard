'use strict';
// ---------------------------------------------------------------------------
// Qualified leads -> Google Ads.
//
// Every minute, any deal in ADS_SYNC_REGIONS (default USA, Spain, LATAM) whose
// Admission Code Test Score is Good or Very Good, created in the last
// ADS_SYNC_LOOKBACK_DAYS, and not sent before for that tier, is posted to the
// n8n workflow "Qualified Leads → Google Ads (all regions, Marketing Hub)",
// which uploads it as an offline click conversion (GCLID first, hashed email
// as fallback) to that market's Google Ads account and its own conversion
// action per region + tier, then calls back POST /api/pipeline/ads-sync/result
// with Google's answer.
//
// Value of each conversion = expected revenue, in the market's currency:
//   USA    fixed (ADS_VALUE_VERY_GOOD / ADS_VALUE_GOOD, default $1,660 / $90)
//   others win rate of that tier in that market (Hub data) x the market's
//          average tuition paid, ADS_TUITION='{"LATAM":1400,"Spain":...}'
//          (CRM deal amounts are not reliable money, so they are not used).
//          A market without a tuition sends value 1 (counted, not valued).
//          ADS_VALUES='{"Spain":{"good":50}}' sets a value outright.
//
// Log states, one row per deal + tier:
//   pending   qualified, not handed to n8n yet (next minute)
//   no_id     qualified but no GCLID and no email: can't be matched
//   queued    handed to n8n, waiting for Google's answer
//   uploaded  Google accepted the conversion
//   failed    Google (or n8n) rejected it; can be retried from the Hub
//
// Nothing personal leaves in clear: the email is SHA-256 hashed here with
// Google's normalization. n8n and Google also dedupe by order_id.
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const fetch = require('node-fetch');

const TIERS = { 'Very Good': 'very_good', Good: 'good' };
const DAY = 86400000;

function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const parts = e.split('@');
  if (parts.length !== 2) return e;
  let [local] = parts;
  const domain = parts[1];
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.split('+')[0].replace(/\./g, '');
  return `${local}@${domain}`;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isHash = (v) => /^[0-9a-f]{64}$/i.test(String(v || ''));
// Google errors that go away by themselves: retried automatically later.
const TRANSIENT = /TOO_RECENT_CONVERSION_ACTION|TOO_RECENT_EVENT|TOO_RECENT_GCLID|INTERNAL_ERROR|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|TRANSIENT|UNAVAILABLE|n8n answered 5/i;
// Already in Google (same order_id): that's a success.
const ALREADY_THERE = /DUPLICATE_ORDER_ID|CLICK_CONVERSION_ALREADY_EXISTS|ALREADY_EXISTS/i;
const CURRENCY = { USA: 'USD', Spain: 'EUR', LATAM: 'USD' };
const DEFAULT_TUITION = { LATAM: 1400 }; // USD, average paid per LATAM enrollment (Oct 2026)
// Meta click IDs (fbclid) sometimes land in the CRM's GCLID field: Google can't read them.
const isGoogleClick = (id) => !!id && !/^(IwA|IwZ|IwY|PAZ|AbZ)/.test(String(id));
const MIN_SAMPLE = 15; // qualified leads needed before a tier's own win rate is trusted
const RETRY_FAILED_AFTER_H = 7; // Google asks for 6h on brand-new conversion actions
const RETRY_SILENT_AFTER_H = 12; // handed to n8n but no answer came back
const MAX_ATTEMPTS = 4;

function createAdsSync({ store, getRecords, log = console, env = process.env }) {
  const url = env.ADS_SYNC_WEBHOOK_URL;
  const key = env.ADS_SYNC_KEY;
  const regions = String(env.ADS_SYNC_REGIONS || 'USA,Spain,LATAM').split(',').map((s) => s.trim()).filter(Boolean);
  const lookbackDays = Number(env.ADS_SYNC_LOOKBACK_DAYS || 30);
  const usaValues = { very_good: Number(env.ADS_VALUE_VERY_GOOD || 1660), good: Number(env.ADS_VALUE_GOOD || 90) };
  let overrides = {};
  try { overrides = JSON.parse(env.ADS_VALUES || '{}') || {}; } catch (e) { log.warn('[ads-sync] ADS_VALUES is not valid JSON, ignored'); }
  let tuition = { ...DEFAULT_TUITION };
  try { tuition = { ...tuition, ...(JSON.parse(env.ADS_TUITION || '{}') || {}) }; } catch (e) { log.warn('[ads-sync] ADS_TUITION is not valid JSON, ignored'); }
  const currencyOf = (region) => CURRENCY[region] || 'USD';
  let valueCache = { at: 0, byRegion: {} };
  // Expected revenue of a qualified lead per region + tier (see header).
  function regionValues() {
    if (Date.now() - valueCache.at < 3600000) return valueCache.byRegion;
    const recs = getRecords() || [];
    const byRegion = {};
    regions.forEach((region) => {
      const mine = recs.filter((r) => r.region === region);
      const avgWon = Number(tuition[region]) || 0;
      // Only decided leads (won or lost) count: open ones haven't had their outcome yet.
      const qual = mine.filter((r) => TIERS[r.admissionsScore || ''] && (r.bucket === 'Won' || /^Lost/.test(r.bucket || '')));
      const rate = (list) => (list.length ? list.filter((r) => r.bucket === 'Won').length / list.length : 0);
      const out = {};
      Object.values(TIERS).forEach((tier) => {
        const o = overrides[region] && Number(overrides[region][tier]);
        if (o > 0) { out[tier] = o; return; }
        if (region === 'USA') { out[tier] = usaValues[tier]; return; }
        const tierList = qual.filter((r) => TIERS[r.admissionsScore] === tier);
        const v = (tierList.length >= MIN_SAMPLE ? rate(tierList) : rate(qual)) * avgWon;
        out[tier] = v > 0 ? Math.round(v * 100) / 100 : 1;
      });
      byRegion[region] = out;
    });
    valueCache = { at: Date.now(), byRegion };
    return byRegion;
  }
  const valueOf = (region, tier) => ((regionValues()[region] || {})[tier]) || (region === 'USA' ? usaValues[tier] : 1);
  const enabled = !!(url && key) && String(env.ADS_SYNC_DISABLED || '').toLowerCase() !== 'true';
  const rows = new Map(); // `${dealId}:${tier}` -> log row
  const status = { enabled, regions, lookbackDays, sentToday: 0, day: null, lastRunAt: null, lastError: null, loaded: false };

  async function load() {
    try {
      (await store.all('adsync')).forEach((r) => rows.set(String(r.id), { ...r, status: r.status || 'queued', sentAt: r.sentAt || r.at || null, attempts: r.attempts || 1 }));
      status.loaded = true;
    } catch (e) { status.lastError = `load: ${e.message}`; }
  }
  async function save(k, row) {
    const clean = { ...row };
    delete clean.id; delete clean.updatedAt;
    rows.set(k, { ...clean, id: k });
    await store.put('adsync', k, clean);
  }

  const inScope = (r, now = Date.now()) => regions.includes(r.region)
    && !!TIERS[r.admissionsScore || '']
    && !/Lost/.test(r.bucket || '')
    && !!r.date && Date.parse(r.date + 'T12:00:00Z') >= now - lookbackDays * DAY;
  const hasId = (r) => !!(isGoogleClick(r.gclid) || (r.email && !isHash(r.email)));

  // Deals to hand to n8n now: never sent for this tier, or a failure marked for retry.
  function due(now = Date.now()) {
    return (getRecords() || []).filter((r) => {
      if (!inScope(r, now) || !hasId(r)) return false;
      const row = rows.get(`${r.id}:${TIERS[r.admissionsScore]}`);
      return !row || row.status === 'retry';
    });
  }

  async function run() {
    if (!enabled) return;
    if (!status.loaded) await load();
    const today = new Date().toISOString().slice(0, 10);
    if (status.day !== today) { status.day = today; status.sentToday = 0; }
    status.lastRunAt = new Date().toISOString();
    await autoRetry();
    for (const r of due().slice(0, 100)) {
      const tier = TIERS[r.admissionsScore];
      const k = `${r.id}:${tier}`;
      const prev = rows.get(k) || {};
      const body = {
        dealId: String(r.id), region: r.region, tier, score: r.admissionsScore, currency: currencyOf(r.region),
        gclid: isGoogleClick(r.gclid) ? r.gclid : null,
        emailSha256: r.email && !isHash(r.email) ? sha256(normalizeEmail(r.email)) : null,
        // A few minutes in the past: Google rejects conversion times ahead of its clock.
        qualifiedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        value: valueOf(r.region, tier),
      };
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-key': key }, body: JSON.stringify(body), timeout: 15000 });
        if (!res.ok) throw new Error(`n8n answered ${res.status}`);
        await save(k, {
          dealId: String(r.id), tier, region: r.region, status: 'queued',
          viaGclid: !!body.gclid, value: body.value, currency: body.currency, sentAt: new Date().toISOString(),
          attempts: (prev.attempts || 0) + 1, error: null, resultAt: null, identifier: null,
        });
        status.sentToday++;
      } catch (e) {
        status.lastError = `${r.id}: ${e.message}`;
        log.warn('[ads-sync]', status.lastError);
        break; // n8n down: try again next minute
      }
    }
  }

  // n8n -> Hub: what Google said about one upload.
  async function recordResult({ deal_id: dealId, tier, ok, identifier_used: identifier, error }) {
    if (!dealId || !tier) { const e = new Error('deal_id and tier are required'); e.status = 400; throw e; }
    const k = `${dealId}:${tier}`;
    const prev = rows.get(k) || { dealId: String(dealId), tier, attempts: 1, sentAt: null };
    const success = ok || ALREADY_THERE.test(String(error || ''));
    const row = { ...prev, status: success ? 'uploaded' : 'failed', identifier: identifier || prev.identifier || null, error: success ? null : String(error || 'Rejected').slice(0, 600), transient: !success && TRANSIENT.test(String(error || '')), resultAt: new Date().toISOString() };
    await save(k, row);
    return row;
  }

  // Temporary Google errors and uploads that never got an answer go again on their own.
  async function autoRetry(now = Date.now()) {
    const hours = (iso) => (iso ? (now - Date.parse(iso)) / 3600000 : Infinity);
    for (const [k, row] of rows) {
      if ((row.attempts || 1) >= MAX_ATTEMPTS) continue;
      const transientFail = row.status === 'failed' && (row.transient || TRANSIENT.test(row.error || '')) && hours(row.resultAt) >= RETRY_FAILED_AFTER_H;
      const silent = row.status === 'queued' && hours(row.sentAt) >= RETRY_SILENT_AFTER_H;
      if (transientFail || silent) await save(k, { ...row, status: 'retry', autoRetry: true });
    }
  }

  async function retry(keys) {
    let n = 0;
    for (const k of keys) {
      const row = rows.get(String(k));
      if (row && (row.status === 'failed' || row.status === 'queued')) { await save(String(k), { ...row, status: 'retry' }); n++; }
    }
    return n;
  }

  // Everything for the log page: stored rows + what's still pending / unmatchable.
  function logRows() {
    const recs = getRecords() || [];
    const byId = new Map(recs.map((r) => [String(r.id), r]));
    const now = Date.now();
    const out = [];
    const seen = new Set();
    rows.forEach((row, k) => {
      seen.add(k);
      const r = byId.get(String(row.dealId));
      out.push({ key: k, ...row, region: row.region || (r && r.region) || 'USA', currency: row.currency || currencyOf(row.region || (r && r.region) || 'USA'), status: row.status === 'retry' ? 'pending' : row.status, lead: r ? leadInfo(r) : null });
    });
    recs.forEach((r) => {
      if (!inScope(r, now)) return;
      const tier = TIERS[r.admissionsScore];
      const k = `${r.id}:${tier}`;
      if (seen.has(k)) return;
      out.push({ key: k, dealId: String(r.id), tier, region: r.region, status: hasId(r) ? 'pending' : 'no_id', viaGclid: !!r.gclid, value: valueOf(r.region, tier), currency: currencyOf(r.region), lead: leadInfo(r) });
    });
    return out.sort((a, b) => String(b.resultAt || b.sentAt || b.lead?.date || '').localeCompare(String(a.resultAt || a.sentAt || a.lead?.date || '')));
  }
  // contactId marks this as a person: lib/pii.js hashes the name and adds namePartial.
  const leadInfo = (r) => ({ contactId: r.contactId || null, name: r.name || null, owner: r.assignTo || null, stage: r.stage || null, score: r.admissionsScore || null, date: r.date || null, source: r.source || null, campaign: r.campaign || null, hasGclid: !!r.gclid });

  function summary() {
    const counts = { pending: 0, no_id: 0, queued: 0, uploaded: 0, failed: 0 };
    const byRegion = {};
    const uploadedValueByCurrency = {};
    logRows().forEach((x) => {
      counts[x.status] = (counts[x.status] || 0) + 1;
      const g = byRegion[x.region] || (byRegion[x.region] = { pending: 0, no_id: 0, queued: 0, uploaded: 0, failed: 0 });
      g[x.status] = (g[x.status] || 0) + 1;
      if (x.status === 'uploaded') uploadedValueByCurrency[x.currency || 'USD'] = (uploadedValueByCurrency[x.currency || 'USD'] || 0) + Number(x.value || 0);
    });
    const values = {};
    regions.forEach((region) => { values[region] = { currency: currencyOf(region), very_good: valueOf(region, 'very_good'), good: valueOf(region, 'good') }; });
    return { ...status, values, counts, byRegion, uploadedValueByCurrency, uploadedValue: uploadedValueByCurrency.USD || 0 };
  }

  function start() {
    if (!enabled) { log.log('[ads-sync] off (set ADS_SYNC_WEBHOOK_URL and ADS_SYNC_KEY to send qualified leads to Google Ads)'); return; }
    log.log(`[ads-sync] on: ${regions.join(',')} Good/Very Good leads from the last ${lookbackDays} days -> Google Ads`);
    load().then(() => {
      setTimeout(() => run().catch((e) => { status.lastError = e.message; }), 90 * 1000);
      setInterval(() => run().catch((e) => { status.lastError = e.message; }), 60 * 1000);
    });
  }

  return { start, run, due, recordResult, retry, autoRetry, logRows, summary, load, checkKey: (k) => !!key && typeof k === 'string' && k.length === key.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(key)), status: () => summary() };
}

module.exports = { createAdsSync, normalizeEmail };
