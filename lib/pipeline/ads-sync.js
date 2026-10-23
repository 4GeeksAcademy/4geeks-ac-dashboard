'use strict';
// ---------------------------------------------------------------------------
// Qualified leads -> Google Ads.
//
// Every minute, any deal in ADS_SYNC_REGIONS (default USA) whose Admission
// Code Test Score is Good or Very Good, created in the last
// ADS_SYNC_LOOKBACK_DAYS, and not sent before for that tier, is posted to the
// n8n workflow "USA Qualified Leads → Google Ads (Marketing Hub)", which
// uploads it as an offline click conversion (GCLID first, hashed email as
// fallback) to its own conversion action per tier.
//
// Nothing personal leaves in clear: the email is SHA-256 hashed here with
// Google's normalization. Each deal+tier is sent once (kept in the pipeline
// store; n8n and Google also dedupe by order_id).
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const fetch = require('node-fetch');

const TIERS = { 'Very Good': 'very_good', Good: 'good' };
const DAY = 86400000;

function normalizeEmail(email) {
  let e = String(email || '').trim().toLowerCase();
  const parts = e.split('@');
  if (parts.length !== 2) return e;
  let [local, domain] = parts;
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.split('+')[0].replace(/\./g, '');
  return `${local}@${domain}`;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createAdsSync({ store, getRecords, log = console, env = process.env }) {
  const url = env.ADS_SYNC_WEBHOOK_URL;
  const key = env.ADS_SYNC_KEY;
  const regions = String(env.ADS_SYNC_REGIONS || 'USA').split(',').map((s) => s.trim()).filter(Boolean);
  const lookbackDays = Number(env.ADS_SYNC_LOOKBACK_DAYS || 30);
  const values = { very_good: Number(env.ADS_VALUE_VERY_GOOD || 1660), good: Number(env.ADS_VALUE_GOOD || 90) };
  const enabled = !!(url && key) && String(env.ADS_SYNC_DISABLED || '').toLowerCase() !== 'true';
  const sent = new Set();
  const status = { enabled, regions, lookbackDays, sentTotal: 0, sentToday: 0, day: null, lastRunAt: null, lastError: null, pendingLastRun: 0, loaded: false };

  async function load() {
    try { (await store.all('adsync')).forEach((r) => sent.add(String(r.id))); status.loaded = true; } catch (e) { status.lastError = `load: ${e.message}`; }
  }

  function due(now = Date.now()) {
    const since = now - lookbackDays * DAY;
    return (getRecords() || []).filter((r) => {
      if (!regions.includes(r.region)) return false;
      const tier = TIERS[r.admissionsScore || ''];
      if (!tier) return false;
      if (/Lost/.test(r.bucket || '')) return false;
      if (!r.date || Date.parse(r.date + 'T12:00:00Z') < since) return false;
      if (!r.gclid && !r.email) return false;
      return !sent.has(`${r.id}:${tier}`);
    });
  }

  async function run() {
    if (!enabled) return;
    if (!status.loaded) await load();
    const today = new Date().toISOString().slice(0, 10);
    if (status.day !== today) { status.day = today; status.sentToday = 0; }
    status.lastRunAt = new Date().toISOString();
    const list = due().slice(0, 100);
    status.pendingLastRun = list.length;
    for (const r of list) {
      const tier = TIERS[r.admissionsScore];
      const body = {
        dealId: String(r.id), region: r.region, tier, score: r.admissionsScore,
        gclid: r.gclid || null,
        emailSha256: r.email && !/^[0-9a-f]{64}$/i.test(r.email) ? sha256(normalizeEmail(r.email)) : null,
        // A few minutes in the past: Google rejects conversion times ahead of its clock.
        qualifiedAt: new Date(Date.now() - 5 * 60000).toISOString(),
        value: values[tier],
      };
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-key': key }, body: JSON.stringify(body), timeout: 15000 });
        if (!res.ok) throw new Error(`n8n ${res.status}`);
        const k = `${r.id}:${tier}`;
        sent.add(k);
        await store.put('adsync', k, { at: new Date().toISOString(), tier, viaGclid: !!r.gclid });
        status.sentTotal++; status.sentToday++;
      } catch (e) {
        status.lastError = `${r.id}: ${e.message}`;
        log.warn('[ads-sync]', status.lastError);
        break; // n8n down: try again next minute
      }
    }
  }

  function start() {
    if (!enabled) { log.log('[ads-sync] off (set ADS_SYNC_WEBHOOK_URL and ADS_SYNC_KEY to send qualified leads to Google Ads)'); return; }
    log.log(`[ads-sync] on: ${regions.join(',')} Good/Very Good leads from the last ${lookbackDays} days -> Google Ads`);
    setTimeout(() => run().catch((e) => { status.lastError = e.message; }), 90 * 1000);
    setInterval(() => run().catch((e) => { status.lastError = e.message; }), 60 * 1000);
  }

  return { start, run, due, status: () => ({ ...status, sentKnown: sent.size }) };
}

module.exports = { createAdsSync, normalizeEmail };
