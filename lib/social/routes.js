'use strict';
// ---------------------------------------------------------------------------
// Social — API, mounted by server.js behind the dashboard login.
//
//   GET   /api/social/status                 sync status, accounts, last result per task, recent requests
//   PATCH /api/social/accounts/:id           (admin) {active, site_id}: switch an account on/off, move it to a site
//   PATCH /api/social/ad-accounts/:id        (admin) {active, site_id}
//   POST  /api/social/requests               (admin) {type: refresh|history|discover|calendar, account_id?, params?}
//   GET   /api/social/requests/:id           one request (progress, result, error)
//   POST  /api/social/sites                  (admin) {name, market?}: add a site
//   PATCH /api/social/sites/:id              (admin) {name?, market?, sort?}
//   DELETE /api/social/sites/:id             (admin) its accounts are left without a site
//
// Analytics (query: from, to = YYYY-MM-DD, default the last 28 days; compare = prev | year | none):
//   GET   /api/social/analytics/overview                 every account switched on, side by side
//   GET   /api/social/analytics/accounts/:id/kpis        KPIs vs the comparison period
//   GET   /api/social/analytics/accounts/:id/series      ?metrics=views,reach… daily values
//   GET   /api/social/analytics/accounts/:id/posts       ?format=REELS… posts with latest metrics and ad spend
//   GET   /api/social/analytics/accounts/:id/demographics
//   GET   /api/social/analytics/posts/:id/series         one post, day by day
//
// The app never calls Meta: it queues requests that lib/social/sync.js runs.
// ---------------------------------------------------------------------------
const { createSocialStore } = require('./store');
const { createSocialSync } = require('./sync');
const { seedSocial } = require('./seed');
const { createAnalytics } = require('./analytics');
const { createHubStore } = require('../hub/store');

function mountSocial(app, { requireAuth, requireAdmin, isBusy, store = createSocialStore(), hubStore = createHubStore() }) {
  // hubStore: the Social calendar's storage (lib/hub), used only to fill in its results.
  const sync = createSocialSync({ store, hubStore, isBusy });
  console.log(`[social] storage: ${store.kind}`);
  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error('[social]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  });
  const who = (req) => (req.user && req.user.name) || 'unknown';
  const audit = (req, action, object, objectId, detail) => store.insert('audit', { user_name: who(req), action, object, object_id: String(objectId), detail });

  app.get('/api/social/status', requireAuth, wrap(async (req, res) => {
    const [sites, accounts, adAccounts, state, requests] = await Promise.all([
      store.find('sites', {}, { order: 'sort' }),
      store.find('accounts', {}, { order: 'id' }),
      store.find('ad_accounts', {}, { order: 'id' }),
      store.find('sync_state', {}),
      store.find('requests', {}, { order: 'id DESC', limit: 20 }),
    ]);
    const { enabled, running, lastRun, lastError } = sync.status;
    res.json({ sync: { enabled, running, lastRun, lastError }, storage: store.kind, sites, accounts, adAccounts, state, requests });
  }));

  // Switch on/off and site. Only these two fields can change from the app.
  const editable = (body) => {
    const patch = {};
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (body.site_id === null || Number.isInteger(body.site_id)) patch.site_id = body.site_id;
    if (!Object.keys(patch).length) throw Object.assign(new Error('Send active (true/false) and/or site_id'), { status: 400 });
    return patch;
  };
  app.patch('/api/social/accounts/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [before] = await store.find('accounts', { id });
    if (!before) return res.status(404).json({ error: 'Account not found' });
    const patch = editable(req.body || {});
    await store.update('accounts', { id }, patch);
    await audit(req, 'update', 'account', id, { before: { active: before.active, site_id: before.site_id }, after: patch });
    // Switched on: load what it is missing (last 30 days), like a new account.
    if (patch.active && !before.active) await sync.enqueue('history', { params: { days: 30, account_ids: [id] }, user: who(req) });
    res.json((await store.find('accounts', { id }))[0]);
  }));
  app.patch('/api/social/ad-accounts/:id', requireAdmin, wrap(async (req, res) => {
    const id = String(req.params.id);
    const [before] = await store.find('ad_accounts', { id });
    if (!before) return res.status(404).json({ error: 'Ad account not found' });
    const patch = editable(req.body || {});
    await store.update('ad_accounts', { id }, patch);
    await audit(req, 'update', 'ad_account', id, { before: { active: before.active, site_id: before.site_id }, after: patch });
    res.json((await store.find('ad_accounts', { id }))[0]);
  }));

  app.post('/api/social/requests', requireAdmin, wrap(async (req, res) => {
    const b = req.body || {};
    const accountId = b.account_id == null ? null : Number(b.account_id);
    if (b.type === 'refresh' && !accountId) return res.status(400).json({ error: 'refresh needs account_id' });
    res.status(202).json(await sync.enqueue(b.type, { accountId, params: b.params || null, user: who(req) }));
  }));
  app.get('/api/social/requests/:id', requireAuth, wrap(async (req, res) => {
    const [row] = await store.find('requests', { id: Number(req.params.id) });
    if (!row) return res.status(404).json({ error: 'Request not found' });
    res.json(row);
  }));

  // ---------------- sites ----------------
  const MARKETS = ['USA', 'Spain', 'LATAM'];
  const sitePatch = (b) => {
    const patch = {};
    if (b.name !== undefined) { const name = String(b.name || '').trim().slice(0, 100); if (!name) throw Object.assign(new Error('name is required'), { status: 400 }); patch.name = name; }
    if (b.market !== undefined) { if (b.market !== null && !MARKETS.includes(b.market)) throw Object.assign(new Error(`market must be ${MARKETS.join(', ')} or null`), { status: 400 }); patch.market = b.market; }
    if (Number.isInteger(b.sort)) patch.sort = b.sort;
    return patch;
  };
  app.post('/api/social/sites', requireAdmin, wrap(async (req, res) => {
    const patch = sitePatch({ market: null, ...(req.body || {}) });
    if (!patch.name) return res.status(400).json({ error: 'name is required' });
    const slug = patch.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if ((await store.find('sites', { slug })).length) return res.status(409).json({ error: 'A site with that name already exists' });
    const sort = (await store.find('sites', {})).length;
    const row = await store.insert('sites', { slug, name: patch.name, market: patch.market, sort });
    await audit(req, 'create', 'site', row.id, { name: row.name, market: row.market });
    res.status(201).json(row);
  }));
  app.patch('/api/social/sites/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [before] = await store.find('sites', { id });
    if (!before) return res.status(404).json({ error: 'Site not found' });
    const patch = sitePatch(req.body || {});
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change' });
    await store.update('sites', { id }, patch);
    await audit(req, 'update', 'site', id, { before: { name: before.name, market: before.market }, after: patch });
    res.json((await store.find('sites', { id }))[0]);
  }));
  app.delete('/api/social/sites/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [before] = await store.find('sites', { id });
    if (!before) return res.status(404).json({ error: 'Site not found' });
    // Postgres does this through ON DELETE SET NULL; done here too so the memory store matches.
    await store.update('accounts', { site_id: id }, { site_id: null });
    await store.update('ad_accounts', { site_id: id }, { site_id: null });
    await store.remove('sites', { id });
    await audit(req, 'delete', 'site', id, { name: before.name });
    res.json({ success: true });
  }));

  // ---------------- analytics ----------------
  const analytics = createAnalytics(store);
  app.get('/api/social/analytics/overview', requireAuth, wrap(async (req, res) => res.json(await analytics.overview(req.query))));
  app.get('/api/social/analytics/accounts/:id/kpis', requireAuth, wrap(async (req, res) => res.json(await analytics.accountKpis(req.params.id, req.query))));
  app.get('/api/social/analytics/accounts/:id/series', requireAuth, wrap(async (req, res) => res.json(await analytics.series(req.params.id, req.query))));
  app.get('/api/social/analytics/accounts/:id/posts', requireAuth, wrap(async (req, res) => res.json(await analytics.posts(req.params.id, req.query))));
  app.get('/api/social/analytics/accounts/:id/demographics', requireAuth, wrap(async (req, res) => res.json(await analytics.demographics(req.params.id))));
  app.get('/api/social/analytics/posts/:id/series', requireAuth, wrap(async (req, res) => res.json(await analytics.postSeries(req.params.id))));

  // Sites and ad accounts exist before the first sync (it needs them to place new accounts).
  seedSocial(store)
    .catch((e) => console.warn('[social] seed failed:', e.message))
    .finally(() => sync.start());
  return { store, sync };
}

module.exports = { mountSocial };
