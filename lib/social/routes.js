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
//   GET   /api/social/analytics/accounts/:id/tiktok-ads   TikTok: KPIs, daily series, posts used in ads, identities
//   GET   /api/social/analytics/posts/:id/series         one post, day by day
//
// Inbox (admins only; comments and Instagram DMs of the accounts switched on):
//   GET   /api/social/inbox/summary                      open / unanswered counters
//   GET   /api/social/inbox/news?after_comment&after_message   for browser notifications
//   GET   /api/social/inbox/comments                     ?account_id&network&origin&status(=open|new,…)&category_id(0=none)&unanswered&q&limit&offset
//   GET   /api/social/inbox/comments/:id                 with its thread and the post or ad
//   PATCH /api/social/inbox/comments/:id                 {status?, category_id?, clear_category?}
//   POST  /api/social/inbox/comments/bulk                {ids, status?, category_id?, clear_category?}
//   GET / PATCH / POST bulk  /api/social/inbox/conversations[/:id]   same, for DMs (+ window_open filter)
//   GET   /api/social/categories                         inbox categories
//   POST  /api/social/categories                         (admin) {name, color}
//   PATCH /api/social/categories/:id                     (admin) {name?, color?, sort?, active?} — never deleted, switched off
//   GET|POST /api/social/webhook/meta                    Meta DM webhook (lib/social/webhook.js, no login, signed)
//
// The app never calls Meta: it queues requests that lib/social/sync.js runs.
// ---------------------------------------------------------------------------
const { getSocialStore } = require('./store');
const { createSocialSync } = require('./sync');
const { seedSocial } = require('./seed');
const { createAnalytics } = require('./analytics');
const { createInbox } = require('./inbox');
const D = require('./defaults');
const { createHubStore } = require('../hub/store');

function mountSocial(app, { requireAuth, requireAdmin, isBusy, store = getSocialStore(), hubStore = createHubStore() }) {
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
  app.get('/api/social/analytics/accounts/:id/tiktok-ads', requireAuth, wrap(async (req, res) => res.json(await analytics.tiktokAds(req.params.id, req.query))));
  app.get('/api/social/analytics/accounts/:id/demographics', requireAuth, wrap(async (req, res) => res.json(await analytics.demographics(req.params.id))));
  app.get('/api/social/analytics/posts/:id/series', requireAuth, wrap(async (req, res) => res.json(await analytics.postSeries(req.params.id))));

  // ---------------- inbox (admins only: it shows who wrote and what) ----------------
  const inbox = createInbox(store, { audit: (user, action, object, id, detail) => store.insert('audit', { user_name: user, action, object, object_id: id == null ? null : String(id), detail }) });
  app.get('/api/social/inbox/summary', requireAdmin, wrap(async (req, res) => res.json(await inbox.summary())));
  app.get('/api/social/inbox/news', requireAdmin, wrap(async (req, res) => res.json(await inbox.news(req.query))));
  for (const [path, kind, list, detail] of [['comments', 'comment', 'listComments', 'commentDetail'], ['conversations', 'conversation', 'listConversations', 'conversationDetail']]) {
    app.get(`/api/social/inbox/${path}`, requireAdmin, wrap(async (req, res) => res.json(await inbox[list](req.query))));
    app.post(`/api/social/inbox/${path}/bulk`, requireAdmin, wrap(async (req, res) => { const b = req.body || {}; res.json(await inbox.classifyBulk(kind, b.ids, b, who(req))); }));
    app.get(`/api/social/inbox/${path}/:id`, requireAdmin, wrap(async (req, res) => res.json(await inbox[detail](req.params.id))));
    app.patch(`/api/social/inbox/${path}/:id`, requireAdmin, wrap(async (req, res) => res.json(await inbox.classify(kind, req.params.id, req.body || {}, who(req)))));
  }

  // ---------------- inbox categories ----------------
  app.get('/api/social/categories', requireAuth, wrap(async (req, res) => res.json({ categories: await store.find('categories', {}, { order: 'sort' }), colors: D.CATEGORY_COLORS })));
  const categoryPatch = async (b, id) => {
    const patch = {};
    if (b.name !== undefined) {
      const name = String(b.name || '').trim().slice(0, 80);
      if (!name) throw Object.assign(new Error('name is required'), { status: 400 });
      if ((await store.find('categories', { name })).some((c) => c.id !== id)) throw Object.assign(new Error('A category with that name already exists'), { status: 409 });
      patch.name = name;
    }
    if (b.color !== undefined) { if (!D.CATEGORY_COLORS.includes(b.color)) throw Object.assign(new Error(`color must be one of ${D.CATEGORY_COLORS.join(', ')}`), { status: 400 }); patch.color = b.color; }
    if (Number.isInteger(b.sort)) patch.sort = b.sort;
    if (typeof b.active === 'boolean') patch.active = b.active;
    return patch;
  };
  app.post('/api/social/categories', requireAdmin, wrap(async (req, res) => {
    const patch = await categoryPatch({ color: 'gray', ...(req.body || {}) }, null);
    if (!patch.name) return res.status(400).json({ error: 'name is required' });
    const row = await store.insert('categories', { name: patch.name, color: patch.color, sort: (await store.find('categories', {})).length, active: true });
    await audit(req, 'create', 'category', row.id, { name: row.name, color: row.color });
    res.status(201).json(row);
  }));
  // Categories are never deleted (classified items use them): they are switched off.
  app.patch('/api/social/categories/:id', requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [before] = await store.find('categories', { id });
    if (!before) return res.status(404).json({ error: 'Category not found' });
    const patch = await categoryPatch(req.body || {}, id);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change' });
    await store.update('categories', { id }, patch);
    await audit(req, 'update', 'category', id, { before: { name: before.name, color: before.color, active: before.active }, after: patch });
    res.json((await store.find('categories', { id }))[0]);
  }));

  // Sites and ad accounts exist before the first sync (it needs them to place new accounts).
  seedSocial(store)
    .catch((e) => console.warn('[social] seed failed:', e.message))
    .finally(() => sync.start());
  return { store, sync };
}

/** DM webhook (lib/social/webhook.js). server.js mounts it before express.json(): it needs the raw body. */
function mountSocialWebhook(app, { store = getSocialStore() } = {}) {
  require('./webhook').mountSocialWebhook(app, { store });
}

module.exports = { mountSocial, mountSocialWebhook };
