'use strict';
require('./social-seed'); // before lib/social: made-up account ids
// Social on real Postgres (lib/social/store.js pgStore). Skipped unless
// SOCIAL_TEST_DATABASE_URL points to a THROWAWAY database: its social_* tables are dropped.
const test = require('node:test');
const assert = require('node:assert');
const { pgStore, TABLES } = require('../lib/social/store');
const { createMetaClient } = require('../lib/social/meta/client');
const { createSocialSync } = require('../lib/social/sync');
const { seedSocial } = require('../lib/social/seed');
const { today } = require('../lib/social/dates');
const { createFakeMeta } = require('./social-fake-meta');

const URL_ = process.env.SOCIAL_TEST_DATABASE_URL;

test('Postgres: initial load, snapshots and switches', { skip: !URL_ && 'set SOCIAL_TEST_DATABASE_URL to run' }, async () => {
  const { Client } = require('pg');
  const admin = new Client({ connectionString: URL_ });
  await admin.connect();
  await admin.query(`DROP TABLE IF EXISTS ${Object.keys(TABLES).reverse().map((t) => 'social_' + t).join(', ')} CASCADE`);
  await admin.end();

  const store = pgStore(URL_);
  await seedSocial(store);
  await seedSocial(store); // twice: no duplicates
  assert.strictEqual((await store.find('sites', {})).length, 7);

  const fake = createFakeMeta();
  const sync = createSocialSync({ store, makeClient: () => createMetaClient({ token: 't', fetch: fake.fetch, transientPauseMs: 0 }), log: { log() {}, warn() {} } });
  await sync.prepareInitialLoad(2);
  await sync.processRequests();
  const requests = await store.find('requests', {}, { order: 'id' });
  assert.deepStrictEqual(requests.map((r) => r.status), ['ok', 'ok'], JSON.stringify(requests.map((r) => r.error)));

  // Same day again: still one snapshot per post; DATE comes back as 'YYYY-MM-DD'.
  await sync.enqueue('history', { params: { days: 2 } });
  await sync.processRequests();
  const metrics = await store.find('post_metrics', {});
  assert.strictEqual(metrics.length, 2);
  assert.ok(metrics.every((m) => m.day === today() && typeof m.metrics === 'object'));
  assert.strictEqual(typeof (await store.find('ad_metrics', {}))[0].impressions, 'number');

  // Inbox on Postgres: timestamps come back as Date objects here.
  await sync.inbox();
  const inbox = require('../lib/social/inbox').createInbox(store);
  const comments = await inbox.listComments({});
  assert.deepStrictEqual(comments.items.map((c) => c.author_name).sort(), ['ana', 'luis', null]);
  assert.strictEqual(comments.items.find((c) => c.author_name === 'ana').status, 'replied');
  const [conv] = (await inbox.listConversations({})).items;
  assert.deepStrictEqual([conv.participant_name, conv.unanswered, conv.window_open], ['pedro', true, true]);
  await inbox.classify('conversation', conv.id, { status: 'closed' }, 'qa');
  await sync.inbox();
  assert.strictEqual((await inbox.conversationDetail(conv.id)).status, 'closed', 'sync keeps the status');
  const s = await inbox.summary();
  assert.deepStrictEqual([s.comments.open, s.messages.open], [2, 0]);

  const eu = (await store.find('accounts', { username: '4geekseurope' }))[0];
  assert.strictEqual(eu.active, false);
  assert.strictEqual(await store.update('accounts', { id: eu.id }, { active: true }), 1);
  assert.strictEqual((await store.find('accounts', { active: true })).length, 3, 'USA IG + page, and now Europe IG');
  assert.strictEqual(await store.withLock(async () => store.withLock(async () => 'inner')), null, 'lock is exclusive');
  await store.close();
});
