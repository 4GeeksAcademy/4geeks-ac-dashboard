'use strict';
// ---------------------------------------------------------------------------
// Social — sync with Meta and TikTok (ads only). Only this file calls them; the
// app only queues requests (social_requests) that the scheduler picks up.
//
// Schedule (team time zone, see dates.js):
//   every 20 s   pending requests (Refresh button, history load, discover)
//   hourly :10   posts of the last 30 days, today's account metrics, ad spend (Meta + TikTok)
//   daily 03:30  discover accounts (Meta + TikTok), close the last 3 days of metrics (Meta
//                takes up to 48 h to settle them), demographics, ad spend
//   after both   fill the Social calendar's results and weekly metrics (calendar-fill.js)
//
// Rules:
//   - One syncer at a time (store.withLock), even across overlapping deploys.
//   - Only accounts / ad accounts switched ON are synced.
//   - Each step per account writes its result to social_sync_state; one
//     failing account never stops the rest.
//   - Every load is an upsert, so repeating one is always safe.
//   - Pauses while the Hub's ActiveCampaign refresh runs (isBusy).
// ---------------------------------------------------------------------------
const { createMetaClient } = require('./meta/client');
const metaAccounts = require('./meta/accounts');
const metaPosts = require('./meta/posts');
const metaInsights = require('./meta/account-insights');
const metaAds = require('./meta/ads');
const { createTikTokClient } = require('./tiktok/client');
const tiktokAds = require('./tiktok/ads');
const { fillCalendar } = require('./calendar-fill');
const { today, addDays, localClock } = require('./dates');

const REQUEST_TYPES = ['refresh', 'history', 'discover', 'calendar'];
const MAX_HISTORY_DAYS = 365;

/**
 * @param {object} o
 * @param {object} o.store         lib/social/store.js
 * @param {Function} [o.makeClient] () => Meta client (injectable for tests)
 * @param {Function} [o.makeTikTok] () => TikTok client, or null when TikTok is not set up (injectable for tests)
 * @param {object} [o.hubStore]    lib/hub/store.js, to fill the Social calendar (optional)
 * @param {Function} [o.isBusy]    () => true while the Hub must not be slowed down
 */
function createSocialSync({ store, hubStore, makeClient, makeTikTok, isBusy = () => false, log = console } = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  const disabled = String(process.env.SOCIAL_SYNC_DISABLED || '').toLowerCase() === 'true';
  const status = { enabled: !disabled && (!!token || !!makeClient), running: null, lastRun: {}, lastError: null };
  makeClient = makeClient || (() => createMetaClient({ token }));
  // TikTok is optional: without TIKTOK_ACCESS_TOKEN its steps are skipped.
  makeTikTok = makeTikTok || (() => (process.env.TIKTOK_ACCESS_TOKEN
    ? createTikTokClient({ token: process.env.TIKTOK_ACCESS_TOKEN, appId: process.env.TIKTOK_APP_ID, secret: process.env.TIKTOK_APP_SECRET })
    : null));

  /** Meta client + page tokens (asked for once per run, never stored) and the TikTok client. */
  function context() {
    const cli = makeClient();
    let pages = null;
    return {
      cli,
      tt: makeTikTok(),
      async pages() { return pages || (pages = await metaAccounts.pagesWithToken(cli)); },
      async pageToken(pageId) { return ((await this.pages())[pageId] || {}).access_token; },
    };
  }

  /** Runs fn and saves its result in social_sync_state. Returns [ok, result | error]. */
  async function record(task, accountId, fn) {
    const started = new Date();
    let ok = true; let result = null; let error = null;
    try { result = await fn(); } catch (e) {
      ok = false; error = String(e.message || e).slice(0, 1000);
      log.warn(`[social] ${task} account=${accountId} failed: ${error}`);
    }
    const finished = new Date();
    const prev = (await store.find('sync_state', { task, account_id: accountId }))[0];
    await store.upsert('sync_state', [{
      task, account_id: accountId, started_at: started.toISOString(), finished_at: finished.toISOString(), ok,
      last_ok_at: ok ? finished.toISOString() : (prev ? prev.last_ok_at : null),
      detail: result && typeof result === 'object' ? result : null, error,
    }]);
    return [ok, ok ? result : error];
  }

  async function activeAccounts(ids) {
    const rows = await store.find('accounts', { platform: 'meta', active: true }, { order: 'id' });
    return ids && ids.length ? rows.filter((a) => ids.includes(a.id)) : rows;
  }

  async function syncAccount(ctx, account, postDays = 30, metricDays = 1) {
    const postsFrom = addDays(today(), -postDays);
    const metricsFrom = addDays(today(), -metricDays);
    if (account.network === 'facebook') {
      const tok = await ctx.pageToken(account.external_id);
      if (!tok) return { posts: await record('posts', account.id, async () => { throw new Error('The token has no access to this page'); }) };
      return {
        posts: await record('posts', account.id, () => metaPosts.syncPostsFb(ctx.cli, store, account, tok, postsFrom)),
        account_metrics: await record('account_metrics', account.id, () => metaInsights.syncAccountFb(ctx.cli, store, account, tok, metricsFrom, today())),
      };
    }
    return {
      posts: await record('posts', account.id, () => metaPosts.syncPostsIg(ctx.cli, store, account, postsFrom)),
      account_metrics: await record('account_metrics', account.id, () => metaInsights.syncAccountIg(ctx.cli, store, account, metricsFrom, today())),
    };
  }

  async function syncAdSpend(ctx, days) {
    const out = {};
    for (const a of await store.find('ad_accounts', { platform: 'meta', active: true })) {
      out[a.id] = await record(`ads:${a.id}`, 0, () => metaAds.syncAds(ctx.cli, store, a, addDays(today(), -days), today()));
    }
    await record('link_ads', 0, async () => ({ linked: await metaAds.linkAdsToPosts(store) }));
    return out;
  }

  async function tiktokAccounts(ids) {
    const rows = await store.find('accounts', { platform: 'tiktok', active: true }, { order: 'id' });
    return ids && ids.length ? rows.filter((a) => ids.includes(a.id)) : rows;
  }
  /** TikTok ads and daily spend of the accounts switched on, last `days` days (today included). */
  async function syncTikTok(ctx, days, ids) {
    if (!ctx.tt) return {};
    const out = {};
    for (const acc of await tiktokAccounts(ids)) {
      const [adAcc] = await store.find('ad_accounts', { id: acc.external_id });
      out[acc.id] = await record('ads', acc.id, () => tiktokAds.syncAds(ctx.tt, store, adAcc, addDays(today(), -days), today()));
    }
    return out;
  }
  const discoverTikTok = (ctx) => (ctx.tt ? record('discover_tiktok', 0, () => tiktokAds.discover(ctx.tt, store)) : null);

  /** Social calendar results and weekly metrics (no Meta calls: reads what is already stored). */
  const syncCalendar = () => (hubStore ? record('calendar_fill', 0, () => fillCalendar(store, hubStore)) : null);

  // ---------------- scheduled tasks ----------------
  async function hourly(ctx = context()) {
    for (const a of await activeAccounts()) await syncAccount(ctx, a, 30, 1);
    await syncAdSpend(ctx, 1);
    await syncTikTok(ctx, 1);
    await syncCalendar();
    return { calls: ctx.cli.calls, tiktok_calls: ctx.tt ? ctx.tt.calls : 0 };
  }

  async function daily(ctx = context()) {
    await record('discover', 0, async () => metaAccounts.discover(ctx.cli, store, await ctx.pages()));
    for (const a of await activeAccounts()) {
      await syncAccount(ctx, a, 30, 3);
      if (a.network === 'instagram') await record('demographics', a.id, () => metaInsights.syncDemographicsIg(ctx.cli, store, a));
    }
    await syncAdSpend(ctx, 3);
    await discoverTikTok(ctx);
    await syncTikTok(ctx, 3);
    await syncCalendar();
    return { calls: ctx.cli.calls, tiktok_calls: ctx.tt ? ctx.tt.calls : 0 };
  }

  // ---------------- requests from the app ----------------
  async function runRequest(ctx, req) {
    const p = req.params || {};
    if (req.type === 'discover') {
      const res = await metaAccounts.discover(ctx.cli, store, await ctx.pages());
      const tt = await discoverTikTok(ctx);
      return tt ? { ...res, tiktok: tt[1] } : res;
    }
    if (req.type === 'calendar') {
      if (!hubStore) throw new Error('Social calendar storage is not available');
      return fillCalendar(store, hubStore);
    }
    if (req.type === 'refresh') {
      const [account] = await store.find('accounts', { id: req.account_id });
      if (!account) throw new Error('Account not found');
      if (!account.active) throw new Error('This account is switched off');
      if (account.platform === 'tiktok') {
        if (!ctx.tt) throw new Error('TikTok is not set up (TIKTOK_ACCESS_TOKEN)');
        return { account: account.id, ok: Object.values(await syncTikTok(ctx, 1, [account.id])).every((r) => r[0]) };
      }
      const res = await syncAccount(ctx, account, 30, 1);
      await syncAdSpend(ctx, 1);
      return { account: account.id, ok: Object.values(res).every((r) => r[0]) };
    }
    if (req.type === 'history') {
      const days = Math.min(Math.max(parseInt(p.days, 10) || 30, 1), MAX_HISTORY_DAYS);
      const accounts = await activeAccounts(p.account_ids);
      const tiktok = ctx.tt ? await tiktokAccounts(p.account_ids) : [];
      if (!accounts.length && !tiktok.length) throw new Error('No accounts switched on to load');
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        await syncAccount(ctx, a, days, days);
        if (a.network === 'instagram') await record('demographics', a.id, () => metaInsights.syncDemographicsIg(ctx.cli, store, a));
        await store.update('requests', { id: req.id }, { progress: { done: i + 1, total: accounts.length, current: a.username || a.name } });
      }
      if (accounts.length) await syncAdSpend(ctx, days);
      if (tiktok.length) await syncTikTok(ctx, days, tiktok.map((a) => a.id));
      await syncCalendar();
      return { accounts: accounts.length + tiktok.length, days };
    }
    throw new Error(`Unknown request type: ${req.type}`);
  }

  /** Queues a request from the app. Returns the request row. */
  async function enqueue(type, { accountId = null, params = null, user = null } = {}) {
    if (!REQUEST_TYPES.includes(type)) throw Object.assign(new Error(`type must be one of ${REQUEST_TYPES.join(', ')}`), { status: 400 });
    return store.insert('requests', { type, account_id: accountId, params, user_name: user, status: 'pending', progress: null, error: null });
  }

  /**
   * Requests left 'running' go back to the queue. Only called holding the lock:
   * then nobody is running them, so they belong to a process that died (redeploy).
   */
  async function requeueInterrupted() {
    return store.update('requests', { status: 'running' }, { status: 'pending', started_at: null });
  }

  async function processRequests(max = 5) {
    const n = await requeueInterrupted();
    if (n) log.warn(`[social] ${n} request(s) were left running by a restart: queued again`);
    let done = 0;
    let ctx = null;
    while (done < max) {
      const [req] = await store.find('requests', { status: 'pending' }, { order: 'id', limit: 1 });
      if (!req) break;
      await store.update('requests', { id: req.id }, { status: 'running', started_at: new Date().toISOString() });
      ctx = ctx || context();
      try {
        const result = await runRequest(ctx, req);
        const [cur] = await store.find('requests', { id: req.id });
        await store.update('requests', { id: req.id }, { status: 'ok', progress: { ...((cur && cur.progress) || {}), result }, finished_at: new Date().toISOString() });
      } catch (e) {
        log.warn(`[social] request #${req.id} (${req.type}) failed: ${e.message}`);
        await store.update('requests', { id: req.id }, { status: 'error', error: String(e.message).slice(0, 1000), finished_at: new Date().toISOString() });
      }
      done++;
    }
    return done;
  }

  /** With no Meta accounts yet (first boot), queues discover + 30 days of history. */
  async function prepareInitialLoad(days = 30) {
    if ((await store.find('requests', { status: ['pending', 'running'] }, { limit: 1 })).length) return false;
    if ((await store.find('accounts', { platform: 'meta' }, { limit: 1 })).length) return false;
    await enqueue('discover', { user: 'system' });
    await enqueue('history', { params: { days }, user: 'system' });
    return true;
  }

  // ---------------- scheduler ----------------
  /** Runs a job under the lock; returns false if another syncer had it. */
  async function exclusive(name, fn) {
    if (isBusy()) return false;
    const ran = await store.withLock(async () => {
      status.running = name;
      const t0 = Date.now();
      try {
        const res = await fn();
        status.lastRun[name] = { at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), result: res };
      } catch (e) {
        status.lastError = `${name}: ${e.message}`;
        log.warn(`[social] ${name} failed: ${e.message}`);
      } finally { status.running = null; }
      return true;
    });
    return ran === true;
  }

  // Keys of the last hourly / daily run, so each one runs once per slot even if a tick is skipped.
  const done = { hourly: null, daily: null };
  async function tick(now = new Date()) {
    const { hour, minute } = localClock(now);
    const day = today(now);
    if (done.daily !== day && (hour > 3 || (hour === 3 && minute >= 30))) {
      if (await exclusive('daily', () => daily())) done.daily = day;
      return;
    }
    const slot = `${day} ${hour}`;
    if (done.hourly !== slot && minute >= 10) {
      if (await exclusive('hourly', () => hourly())) done.hourly = slot;
      return;
    }
    await exclusive('requests', () => processRequests());
  }

  function start() {
    if (!status.enabled) { log.log(`[social] sync off (${disabled ? 'SOCIAL_SYNC_DISABLED=true' : 'no META_ACCESS_TOKEN'})`); return; }
    // A boot (deploy) must not start a full daily or hourly job right away: slots
    // already past count as done, so queued requests (initial load) go first.
    const { hour, minute } = localClock();
    if (hour > 3 || (hour === 3 && minute >= 30)) done.daily = today();
    if (minute >= 10) done.hourly = `${today()} ${hour}`;
    prepareInitialLoad()
      .then((queued) => { if (queued) log.log('[social] no accounts yet: queued the initial load (discover + 30 days)'); })
      .catch((e) => { status.lastError = e.message; log.warn('[social] initial load failed:', e.message); });
    let ticking = false;
    setInterval(() => {
      if (ticking) return;
      ticking = true;
      tick().catch((e) => { status.lastError = e.message; }).finally(() => { ticking = false; });
    }, 20 * 1000);
    log.log('[social] sync on (requests every 20 s, hourly :10, daily 03:30)');
  }

  return { start, tick, hourly, daily, processRequests, prepareInitialLoad, enqueue, requeueInterrupted, record, status };
}

module.exports = { createSocialSync, REQUEST_TYPES };
