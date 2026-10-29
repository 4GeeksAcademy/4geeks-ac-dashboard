'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { matchLeads, toEvents, createGa4Sync, createBigQuery } = require('../lib/attribution/ga4');
const { memStore } = require('../lib/attribution/store');
const { createAttribution } = require('../lib/attribution/journeys');

const us = (iso) => String(Date.parse(iso) * 1000);

test('matchLeads: gclid is exact, form time is nearest, each form event used once', () => {
  const forms = [
    { u: 'A', ts: us('2026-10-20T10:00:30Z'), n: 'request_more_info', loc: 'https://4geeks.com/en/ai-engineering', camp: 'AIE-US' },
    { u: 'B', ts: us('2026-10-20T10:02:00Z'), n: 'request_more_info', loc: 'https://4geeks.com/en/apply', camp: null },
    { u: 'G', ts: us('2026-10-19T08:00:00Z'), n: 'student_application', loc: 'https://4geeks.com/x', camp: null },
  ];
  const leads = [
    { id: 1, createdAt: '2026-10-20T10:01:00Z', campaign: null, landingUrl: 'https://4geeks.com/en/apply?x=1' }, // same path as B
    { id: 2, createdAt: '2026-10-20T10:01:00Z', campaign: 'AIE-US' }, // same campaign as A
    { id: 3, createdAt: '2026-10-20T10:01:30Z' }, // both events taken → no match
    { id: 4, createdAt: '2026-10-25T00:00:00Z', gclid: 'g1' },
    { id: 5, createdAt: '2026-10-20T13:00:00Z' }, // outside the window
  ];
  const m = matchLeads(leads, forms, new Map([['g1', 'G']]));
  assert.equal(m.get('1').u, 'B');
  assert.equal(m.get('2').u, 'A');
  assert.equal(m.get('2').confidence, 'high');
  assert.equal(m.has('3'), false);
  assert.deepEqual([m.get('4').u, m.get('4').method, m.get('4').confidence], ['G', 'gclid', 'high']);
  assert.equal(m.has('5'), false);
});

test('toEvents: session start carries the source, ads campaign fills in, device kept', () => {
  const ev = toEvents([
    { u: 'A', n: 'page_view', ts: us('2026-10-01T10:00:02Z'), sid: 's1', loc: 'https://4geeks.com/en/ai', ref: null, dev: 'mobile' },
    { u: 'A', n: 'session_start', ts: us('2026-10-01T10:00:01Z'), sid: 's1', loc: 'https://4geeks.com/en/ai', gclid: 'gc', ads_campaign: 'AIE Search', ads_adgroup: 'Bootcamp', dev: 'mobile' },
    { u: 'A', n: 'page_view', ts: us('2026-10-01T10:01:00Z'), sid: 's1', loc: 'https://4geeks.com/en/apply', dev: 'mobile' },
    { u: 'A', n: 'page_view', ts: us('2026-10-08T09:00:00Z'), sid: 's2', loc: 'https://4geeks.com/', ref: 'https://www.google.com/', src: '(direct)', dev: 'desktop' },
    { u: 'A', n: 'page_view', ts: us('2026-10-08T09:00:00Z'), sid: 's3', loc: 'not a url' },
  ]);
  assert.equal(ev.length, 3);
  assert.deepEqual([ev[0].clickType, ev[0].clickId, ev[0].utm.campaign, ev[0].utm.content, ev[0].mobile, ev[0].newSession], ['gclid', 'gc', 'AIE Search', 'Bootcamp', true, true]);
  assert.equal(ev[1].newSession, false); assert.equal(ev[1].utm, null);
  assert.equal(ev[2].referrer, 'https://www.google.com/'); assert.equal(ev[2].utm, null); assert.equal(ev[2].mobile, false);
});

test('GA4 sync: links leads, loads their visits once, journeys show the method', async () => {
  const store = memStore();
  const calls = [];
  const bq = {
    async query(sql, p) {
      calls.push(sql);
      if (/gclid IN UNNEST/.test(sql)) return [{ gclid: 'g1', u: 'G' }];
      if (/event_name IN UNNEST/.test(sql)) return [{ u: 'F', ts: us('2026-10-20T10:00:00Z'), n: 'request_more_info', loc: 'https://4geeks.com/en/apply', camp: null }];
      return p.users.flatMap((u) => [
        { u, n: 'session_start', ts: us('2026-10-10T09:00:00Z'), sid: 'x' + u, loc: 'https://4geeks.com/', src: 'facebook', med: 'paid_social', camp: 'AIE' },
        { u, n: 'page_view', ts: us('2026-10-10T09:00:01Z'), sid: 'x' + u, loc: 'https://4geeks.com/' },
        { u, n: 'page_view', ts: us('2026-10-19T09:00:00Z'), sid: 'y' + u, loc: 'https://4geeks.com/en/apply', ref: 'https://www.google.com/' },
      ]);
    },
  };
  const now = new Date();
  const recs = [
    { id: 1, email: 'a@x.com', createdAt: new Date(now - 2 * 864e5).toISOString(), gclid: 'g1', date: now.toISOString().slice(0, 10) },
    { id: 2, email: 'b@x.com', createdAt: '2026-10-20T10:03:00Z', date: '2026-10-20' },
    { id: 3, email: 'c@x.com', createdAt: new Date(now - 400 * 864e5).toISOString() }, // too old
  ];
  // The fixed form timestamp must be inside the lookback; widen it for the test.
  const sync = createGa4Sync({ store, getRecords: () => recs, bq, env: { GA_LEAD_LOOKBACK_DAYS: '3650' }, log: { log() {}, warn() {} } });
  assert.equal(sync.configured, true);
  const st = await sync.run();
  assert.equal(st.lastError, null);
  assert.deepEqual([st.last.matched, st.last.byMethod.gclid, st.last.byMethod['form-time']], [2, 1, 1]);
  assert.equal(st.last.events, 4); // 2 visitors × 2 page views (session_start only carries the source)
  const s = await store.status();
  assert.equal(s.linkedByGclid, 1); assert.equal(s.linkedByFormTime, 1);

  const before = calls.length;
  const st2 = await sync.run(); // already linked → nothing new
  assert.equal(st2.last.leads, 1); // only the old lead remains unlinked… and it is out of range
  assert.ok(calls.length - before <= 3);

  const attr = createAttribution({ store, getRecords: () => recs, getEnrollOf: () => () => null });
  const js = await attr.journeysFor(recs.slice(0, 2));
  assert.equal(js['1'].link.method, 'gclid');
  assert.deepEqual(js['2'].link, { method: 'form-time', confidence: 'medium' });
  assert.ok(js['2'].touches.length >= 1);
});

test('GA4 sync is off without credentials; BigQuery client signs and pages', async () => {
  assert.equal(createGa4Sync({ store: memStore(), getRecords: () => [], env: {} }).configured, false);
  const { generateKeyPairSync } = require('crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = JSON.stringify({ client_email: 'x@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const seen = [];
  const fetchImpl = async (url, opt) => {
    seen.push(url);
    const json = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (/oauth2/.test(url)) return json({ access_token: 't', expires_in: 3600 });
    const schema = { fields: [{ name: 'u' }, { name: 'n' }] };
    if (/\/queries$/.test(url)) return json({ jobComplete: true, jobReference: { jobId: 'j', location: 'US' }, schema, rows: [{ f: [{ v: 'A' }, { v: '1' }] }], pageToken: 'p2' });
    return json({ jobComplete: true, schema, rows: [{ f: [{ v: 'B' }, { v: '2' }] }] });
  };
  const bq = createBigQuery({ key, project: 'p', fetchImpl });
  const rows = await bq.query('SELECT 1', { from: '20261001', users: ['A'] });
  assert.deepEqual(rows, [{ u: 'A', n: '1' }, { u: 'B', n: '2' }]);
  assert.ok(seen.some((u) => /oauth2/.test(u)));
});

test('a wrong GA_BQ_KEY (e.g. the key ID) never stops the app', () => {
  const warns = [];
  const sync = createGa4Sync({ store: memStore(), getRecords: () => [], env: { GA_BQ_KEY: '7e69f6042cd4c5cb1dfc14508bb173ed53d66e84', GA_BQ_PROJECT: 'p' }, log: { log() {}, warn: (...a) => warns.push(a.join(' ')) } });
  assert.equal(sync.configured, false);
  assert.match(sync.status().lastError, /not a service-account JSON key/);
  assert.ok(warns.length);
  const { parseKey } = require('../lib/attribution/ga4');
  const k = { type: 'service_account', client_email: 'a@b', private_key: 'x' };
  assert.deepEqual(parseKey(Buffer.from(JSON.stringify(k)).toString('base64')), k);
});
