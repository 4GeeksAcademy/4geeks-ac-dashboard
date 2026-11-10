'use strict';
// Social (lib/social): Meta connector and sync, against a fake Graph API and the memory store.
const test = require('node:test');
const assert = require('node:assert');
const { memoryStore } = require('../lib/social/store');
const { createMetaClient } = require('../lib/social/meta/client');
const { discover } = require('../lib/social/meta/accounts');
const { syncPostsIg, syncPostsFb } = require('../lib/social/meta/posts');
const { syncAccountIg } = require('../lib/social/meta/account-insights');
const { syncAds, linkAdsToPosts } = require('../lib/social/meta/ads');
const { createSocialSync } = require('../lib/social/sync');
const { seedSocial } = require('../lib/social/seed');
const D = require('../lib/social/dates');
const { createFakeMeta } = require('./social-fake-meta');

const quiet = { log() {}, warn() {} };
const client = (fake) => createMetaClient({ token: 'test-token', fetch: fake.fetch, rateLimitPauseMs: 0, transientPauseMs: 0 });
async function setup() {
  const store = memoryStore();
  await seedSocial(store);
  const fake = createFakeMeta();
  return { store, fake, cli: client(fake) };
}
const account = async (store, network, username) => (await store.find('accounts', { network })).find((a) => !username || a.username === username);

test('dates: Meta end_time belongs to the previous day; ranges cover both ends', () => {
  assert.strictEqual(D.dayOfEndTime('2026-11-09T08:00:00+0000'), '2026-11-08');
  assert.deepStrictEqual([...D.ranges('2026-01-01', '2026-01-05', 2)], [['2026-01-01', '2026-01-02'], ['2026-01-03', '2026-01-04'], ['2026-01-05', '2026-01-05']]);
});

test('client: token only in the header, transient errors retried', async () => {
  const fake = createFakeMeta({ failFirst: { 'me/accounts': 1 } });
  const res = await client(fake).get('me/accounts', { fields: 'id' });
  assert.strictEqual(res.data.length, 2);
  assert.strictEqual(fake.calls.length, 2);
  assert.ok(fake.calls.every((c) => c.auth === 'Bearer test-token' && !JSON.stringify(c.params).includes('test-token')));
});

test('discover: the chosen accounts start on with their page, the rest off; admin switches are kept', async () => {
  const { store, cli } = await setup();
  await discover(cli, store);
  const accounts = await store.find('accounts', {});
  const sites = Object.fromEntries((await store.find('sites', {})).map((s) => [s.id, s.slug]));
  const by = (u) => accounts.find((a) => a.username === u || a.name === u);
  assert.strictEqual(by('4geeksacademy').active, true);
  assert.strictEqual(by('4Geeks Academy').active, true, 'its Facebook page is on too');
  assert.strictEqual(by('4geekseurope').active, false);
  assert.strictEqual(sites[by('4geeksacademy').site_id], 'global');
  assert.strictEqual(by('4geeksacademy').page_id, by('4Geeks Academy').id);

  await store.update('accounts', { id: by('4geekseurope').id }, { active: true });
  await discover(cli, store);
  assert.strictEqual((await store.find('accounts', {})).length, 4, 'no duplicates');
  assert.strictEqual((await store.find('accounts', { username: '4geekseurope' }))[0].active, true);
});

test('Instagram posts: stories skipped, estimated paid views, one snapshot per day', async () => {
  const { store, cli } = await setup();
  await discover(cli, store);
  const ig = await account(store, 'instagram', '4geeksacademy');
  const from = D.addDays(D.today(), -30);
  assert.strictEqual((await syncPostsIg(cli, store, ig, from)).posts, 1);
  await syncPostsIg(cli, store, ig, from);
  const [post] = await store.find('posts', {});
  assert.strictEqual(post.format, 'REELS');
  const metrics = await store.find('post_metrics', { post_id: post.id });
  assert.strictEqual(metrics.length, 1);
  assert.strictEqual(metrics[0].metrics.views, 1300);
  assert.strictEqual(metrics[0].metrics.views_paid, 300);
  assert.strictEqual(metrics[0].metrics.avg_watch_s, 4.2);
});

test('Facebook posts: automatic cover posts skipped, exact paid views', async () => {
  const { store, cli } = await setup();
  await discover(cli, store);
  const fb = await account(store, 'facebook');
  const res = await syncPostsFb(cli, store, fb, 'page-token-usa', D.addDays(D.today(), -30));
  assert.strictEqual(res.posts, 1);
  const [m] = await store.find('post_metrics', {});
  assert.deepStrictEqual([m.metrics.views_organic, m.metrics.views_paid, m.metrics.views_followers, m.metrics.link_clicks], [400, 100, 150, 5]);
});

test('Instagram account metrics land on the right day', async () => {
  const { store, cli } = await setup();
  await discover(cli, store);
  const ig = await account(store, 'instagram', '4geeksacademy');
  await syncAccountIg(cli, store, ig, D.addDays(D.today(), -1), D.today());
  const rows = await store.find('account_metrics', { account_id: ig.id, metric: 'reach' });
  assert.deepStrictEqual(rows.map((r) => r.day), [D.addDays(D.today(), -1)]);
  assert.ok((await store.find('account_metrics', { metric: 'followers', day: D.today() })).length);
});

test('ad spend is saved and linked to the post it promotes', async () => {
  const { store, cli } = await setup();
  await discover(cli, store);
  await syncPostsIg(cli, store, await account(store, 'instagram', '4geeksacademy'), D.addDays(D.today(), -30));
  const [usa] = await store.find('ad_accounts', { id: 'act_200000000000001' });
  await syncAds(cli, store, usa, D.addDays(D.today(), -1), D.today());
  assert.strictEqual(await linkAdsToPosts(store), 1);
  const [ad] = await store.find('ads', {});
  const [post] = await store.find('posts', {});
  assert.strictEqual(ad.post_id, post.id);
  assert.strictEqual((await store.find('ad_metrics', {}))[0].spend, 12.5);
  assert.strictEqual((await store.find('ad_accounts', { id: usa.id }))[0].currency, 'USD');
});

test('sync: initial load runs discover + history only for accounts switched on', async () => {
  const { store, fake } = await setup();
  const sync = createSocialSync({ store, makeClient: () => client(fake), log: quiet });
  assert.strictEqual(await sync.prepareInitialLoad(2), true);
  assert.strictEqual(await sync.prepareInitialLoad(2), false, 'never queued twice');
  assert.strictEqual(await sync.processRequests(), 2);
  const requests = await store.find('requests', {}, { order: 'id' });
  assert.deepStrictEqual(requests.map((r) => r.status), ['ok', 'ok'], JSON.stringify(requests.map((r) => r.error)));
  assert.ok(fake.calls.some((c) => c.path === 'ig-usa/media'));
  assert.ok(!fake.calls.some((c) => c.path.startsWith('ig-eu/')), 'accounts switched off are never called');
  assert.ok(!fake.calls.some((c) => c.path.startsWith('act_200000000000004')), 'ad accounts switched off are never called');
  const state = await store.find('sync_state', { task: 'posts' });
  assert.ok(state.length === 2 && state.every((s) => s.ok), JSON.stringify(state));
});

test('sync: requests left running by a restart go back to the queue; one syncer at a time', async () => {
  const { store, fake } = await setup();
  const sync = createSocialSync({ store, makeClient: () => client(fake), log: quiet });
  const req = await sync.enqueue('discover', { user: 'test' });
  await store.update('requests', { id: req.id }, { status: 'running' });
  let inside = null;
  const first = store.withLock(async () => { inside = await store.withLock(async () => 'second'); return 'first'; });
  assert.strictEqual(await first, 'first');
  assert.strictEqual(inside, null);
  assert.strictEqual(await sync.processRequests(), 1);
  assert.strictEqual((await store.find('requests', { id: req.id }))[0].status, 'ok');
  await assert.rejects(sync.enqueue('delete-everything'), /type must be/);
});

// ---------------- analytics (lib/social/analytics.js) ----------------
const { createAnalytics, periods } = require('../lib/social/analytics');

async function loaded() {
  const { store, fake } = await setup();
  const sync = createSocialSync({ store, makeClient: () => client(fake), log: quiet });
  await sync.prepareInitialLoad(3);
  await sync.processRequests();
  return { store, analytics: createAnalytics(store) };
}

test('periods: default last 28 days vs the 28 before; bad ranges refused', () => {
  const p = periods({ from: '2026-10-01', to: '2026-10-28' });
  assert.deepStrictEqual(p.compare, { from: '2026-09-03', to: '2026-09-30' });
  assert.deepStrictEqual(periods({ from: '2026-10-01', to: '2026-10-28', compare: 'year' }).compare, { from: '2025-10-01', to: '2025-10-28' });
  assert.strictEqual(periods({ compare: 'none' }).compare, null);
  assert.throws(() => periods({ from: '2026-10-28', to: '2026-10-01' }), /after/);
  assert.throws(() => periods({ from: '2020-01-01', to: '2026-10-01' }), /2 years/);
});

test('store: range filters work the same in memory', async () => {
  const store = memoryStore();
  await store.upsert('sites', [{ slug: 'a', name: 'A', market: null, sort: 1 }, { slug: 'b', name: 'B', market: null, sort: 5 }]);
  assert.deepStrictEqual((await store.find('sites', { sort: { gte: 2, lte: 9 } })).map((s) => s.slug), ['b']);
});

test('analytics: overview only shows accounts switched on', async () => {
  const { analytics } = await loaded();
  const o = await analytics.overview({});
  assert.deepStrictEqual(o.accounts.map((a) => a.username || a.name).sort(), ['4Geeks Academy', '4geeksacademy']);
  const ig = o.accounts.find((a) => a.username === '4geeksacademy');
  assert.strictEqual(ig.market, 'USA');
  assert.strictEqual(ig.posts, 1);
  assert.strictEqual(o.totals.posts, 2);
});

test('analytics: KPIs hide the change when the previous period has no data', async () => {
  const { store, analytics } = await loaded();
  const [ig] = await store.find('accounts', { username: '4geeksacademy' });
  const k = (await analytics.accountKpis(ig.id, {})).kpis;
  assert.strictEqual(k.followers.current, 6950);
  assert.ok(k.views.current > 0);
  assert.strictEqual(k.views.change_pct, null, 'no data in the previous 28 days');
  assert.strictEqual(k.avg_post_engagement.current, 0.0862, 'interactions / reach of the one reel (69 / 800)');
  await assert.rejects(analytics.accountKpis((await store.find('accounts', { username: '4geekseurope' }))[0].id, {}), /switched off/);
});

test('analytics: posts carry their latest metrics and the spend of their ads', async () => {
  const { store, analytics } = await loaded();
  const [usa] = await store.find('ad_accounts', { id: 'act_200000000000001' });
  await syncAds(client(createFakeMeta()), store, usa, D.addDays(D.today(), -1), D.today());
  await linkAdsToPosts(store);
  const [ig] = await store.find('accounts', { username: '4geeksacademy' });
  const [reel] = await analytics.posts(ig.id, { format: 'REELS' });
  assert.strictEqual(reel.metrics.views, 1300);
  assert.strictEqual(reel.metrics.paid_share, 0.2308);
  assert.deepStrictEqual(reel.ads.spend, { USD: 12.5 });
  assert.strictEqual((await analytics.postSeries(reel.id)).length, 1);
  const demo = await analytics.demographics(ig.id);
  assert.deepStrictEqual(demo.dimensions.country, [{ key: 'ES', value: 300 }]);
});

// ---------------- Social calendar fill (lib/social/calendar-fill.js) ----------------
const os = require('os');
const fs = require('fs');
const path = require('path');
const { fillCalendar, postKey, weekStart } = require('../lib/social/calendar-fill');

function hubFileStore() {
  // The Social calendar's own store (lib/hub/store.js), on a throwaway folder.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-social-'));
  const prev = { url: process.env.DATABASE_URL, dir: process.env.HUB_DATA_DIR };
  delete process.env.DATABASE_URL; process.env.HUB_DATA_DIR = dir;
  delete require.cache[require.resolve('../lib/hub/store')];
  const store = require('../lib/hub/store').createHubStore();
  if (prev.url !== undefined) process.env.DATABASE_URL = prev.url;
  if (prev.dir === undefined) delete process.env.HUB_DATA_DIR; else process.env.HUB_DATA_DIR = prev.dir;
  return store;
}

test('calendar fill: post URLs match however they were pasted; weeks start on Monday', () => {
  assert.strictEqual(postKey('https://www.instagram.com/reel/AAA/'), 'ig:AAA');
  assert.strictEqual(postKey('instagram.com/4geeksacademy/p/AAA?igsh=x'), 'ig:AAA', 'without https too');
  assert.strictEqual(postKey('https://instagram.com/4geeksacademy/reel/AAA?igsh=x'), 'ig:AAA');
  assert.strictEqual(postKey('https://m.facebook.com/1/posts/2/'), postKey('https://www.facebook.com/1/posts/2'));
  assert.strictEqual(weekStart('2026-11-15'), '2026-11-09');
  assert.strictEqual(weekStart('2026-11-09'), '2026-11-09');
});

test('calendar fill: results come from Meta, hand-typed dms and weeks are kept', async () => {
  const { store } = await loaded();
  const hub = hubFileStore();
  const post = await hub.create('post', { account: 'usa_ig', date: D.today(), status: 'published', post_url: 'https://www.instagram.com/reel/AAA/?igsh=abc', results: { views: 1, dms: 3 } }, 'tester');
  await hub.create('post', { account: 'usa_ig', date: D.today(), status: 'idea' }, 'tester');
  const manual = await hub.create('metric', { account: 'usa_ig', week_start: '2026-09-01', views: 9079, source: 'weekly report' }, 'tester');
  // A full week of daily views for yesterday's week, and half of the week before (must be skipped).
  const [ig] = await store.find('accounts', { username: '4geeksacademy' });
  const ws = weekStart(D.addDays(D.today(), -1));
  const day = (d, i) => ({ account_id: ig.id, day: D.addDays(d, i), metric: 'views', breakdown: '', value: 100 });
  await store.upsert('account_metrics', [...Array(7)].map((_, i) => day(ws, i)));
  await store.upsert('account_metrics', [...Array(3)].map((_, i) => day(D.addDays(ws, -7), i)));
  const nextWeek = new Date(D.addDays(ws, 7) + 'T12:00:00Z'); // the Monday after: that week is now complete

  const res = await fillCalendar(store, hub, { now: nextWeek });
  assert.ok(res.accounts_matched.includes('usa_ig'));
  assert.strictEqual(res.posts_filled, 1);
  const p = await hub.get('post', post.id);
  assert.deepStrictEqual([p.results.views, p.results.likes, p.results.dms, p.results_source], [1300, 50, 3, 'meta']);
  assert.strictEqual(res.weeks_filled, 1, 'only the complete week');
  const metrics = (await hub.list('metric')).filter((m) => m.source === 'meta sync');
  assert.ok(metrics.every((m) => m.id.startsWith('meta-usa_ig-') && weekStart(m.week_start) === m.week_start));
  assert.deepStrictEqual([metrics[0].week_start, metrics[0].views, metrics[0].followers], [ws, 700, 6950]);
  assert.deepStrictEqual(await hub.get('metric', manual.id), manual, 'hand-typed week untouched');

  const again = await fillCalendar(store, hub, { now: nextWeek });
  assert.deepStrictEqual([again.posts_filled, again.weeks_filled], [0, 0], 'nothing rewritten when nothing changed');
});
