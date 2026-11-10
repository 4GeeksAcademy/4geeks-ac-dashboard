'use strict';
// ---------------------------------------------------------------------------
// Social — API, mounted by server.js behind the dashboard login.
//
//   GET   /api/social/status                 sync status, accounts, last result per task, recent requests
//   PATCH /api/social/accounts/:id           (admin) {active, site_id}: switch an account on/off, move it to a site
//   PATCH /api/social/ad-accounts/:id        (admin) {active, site_id}
//   POST  /api/social/requests               (admin) {type: refresh|history|discover, account_id?, params?}
//   GET   /api/social/requests/:id           one request (progress, result, error)
//
// The app never calls Meta: it queues requests that lib/social/sync.js runs.
// ---------------------------------------------------------------------------
const { createSocialStore } = require('./store');
const { createSocialSync } = require('./sync');
const { seedSocial } = require('./seed');

function mountSocial(app, { requireAuth, requireAdmin, isBusy, store = createSocialStore() }) {
  const sync = createSocialSync({ store, isBusy });
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

  // Sites and ad accounts exist before the first sync (it needs them to place new accounts).
  seedSocial(store)
    .catch((e) => console.warn('[social] seed failed:', e.message))
    .finally(() => sync.start());
  return { store, sync };
}

module.exports = { mountSocial };
