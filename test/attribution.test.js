'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { classify } = require('../lib/attribution/channel');
const { createAttribution, cleanEvents, credit, emailHash, keyPagesOf } = require('../lib/attribution/journeys');
const { memStore } = require('../lib/attribution/store');

test('channels: paid vs organic, branded search, AI assistants, fbclid nuance', () => {
  assert.deepEqual(classify({ clickType: 'gclid', utm: { term: '4geeks academy' } }), { group: 'Paid Search', source: 'Google', branded: true });
  assert.equal(classify({ clickType: 'gclid', utm: { term: 'ai bootcamp' } }).branded, false);
  assert.equal(classify({ clickType: 'fbclid' }).group, 'Organic Social');
  assert.equal(classify({ clickType: 'fbclid', utm: { source: 'facebook', medium: 'paid_social', campaign: 'AIE' } }).group, 'Paid Social');
  assert.equal(classify({ utm: { source: 'fb', medium: 'cpc' } }).group, 'Paid Social');
  assert.deepEqual(classify({ referrer: 'https://chatgpt.com/' }), { group: 'AI Assistant', source: 'ChatGPT' });
  assert.deepEqual(classify({ referrer: 'https://www.google.com/' }), { group: 'Organic Search', source: 'Google' });
  assert.deepEqual(classify({ referrer: 'https://l.instagram.com/' }), { group: 'Organic Social', source: 'Instagram' });
  assert.equal(classify({ referrer: 'https://learn.4geeks.com/x' }).group, 'Internal');
  assert.equal(classify({}).group, 'Direct');
  assert.equal(classify({ utm: { source: 'activecampaign', medium: 'email' } }).group, 'Email');
  assert.equal(classify({ referrer: 'https://www.coursereport.com/schools/4geeks' }).source, 'coursereport.com');
});

test('models: first, last non-direct, linear, position', () => {
  const T = (g) => ({ group: g, source: '' });
  const ts = [T('Paid Social'), T('Organic Search'), T('Direct')];
  assert.equal(credit(ts, 'first')[0][0].group, 'Paid Social');
  assert.equal(credit(ts, 'last')[0][0].group, 'Organic Search');
  assert.deepEqual(credit(ts, 'linear').map((x) => Math.round(x[1] * 100)), [33, 33, 33]);
  assert.deepEqual(credit(ts, 'position').map((x) => x[1]), [0.4, 0.2, 0.4]);
  assert.deepEqual(keyPagesOf(['/en/apply', '/en/career-programs/ai-engineering', '/en/financials']).sort(), ['Apply', 'Pricing / financing', 'Program: ai-engineering']);
});

test('collector input is validated and capped', () => {
  assert.equal(cleanEvents({ v: 'nope', e: [] }), null);
  const c = cleanEvents({ v: 'a'.repeat(24), e: [{ t: 'pv', ts: 0, s: 's1', h: '4geeks.com', p: '/', ns: 1, u: { source: 'google', evil: 'x' }, c: 'gclid', cv: 'abc' }, { t: 'id', eh: 'f'.repeat(64) }, { t: 'id', eh: 'not-a-hash' }, ...Array(30).fill({ t: 'pv' })] });
  assert.equal(c.events[0].utm.evil, undefined);
  assert.equal(c.events[0].clickType, 'gclid');
  assert.equal(c.links.length, 1);
  assert.ok(c.events.length <= 20);
});

test('journey: Meta ad → a week later branded Google search → form; report credits and paths', async () => {
  const store = memStore();
  const lead = { id: '501', email: 'Ana@X.com', date: '2026-10-09', admissionsScore: 'Very Good', source: 'google' };
  const other = { id: '502', email: 'bo@x.com', date: '2026-10-10', admissionsScore: 'Good' };
  const enrolled = new Set(['501']);
  const att = createAttribution({ store, getRecords: () => [lead, other], getEnrollOf: () => (r) => (enrolled.has(String(r.id)) ? { status: 'enrolled' } : null) });
  const V = 'b'.repeat(24); const W = 'c'.repeat(24);
  const ts = (d) => Date.parse(d);
  // The collector rejects clocks more than 7 days off, so write history straight to the store.
  await store.addEvents(V, [
    { type: 'pv', ts: ts('2026-10-02T10:00:00Z'), sid: 's1', host: '4geeks.com', path: '/en/career-programs/ai-engineering', newSession: true, utm: { source: 'facebook', medium: 'paid_social', campaign: 'AIE Fall', content: 'Reel 3 - salary' }, clickType: 'fbclid', mobile: true },
    { type: 'pv', ts: ts('2026-10-02T10:03:00Z'), sid: 's1', host: '4geeks.com', path: '/en/financials', newSession: false },
    { type: 'pv', ts: ts('2026-10-09T18:00:00Z'), sid: 's2', host: '4geeks.com', path: '/en/apply', newSession: true, utm: { source: 'google', medium: 'cpc', campaign: 'Brand', term: '4geeks academy' }, clickType: 'gclid' },
    { type: 'pv', ts: ts('2026-10-09T18:05:00Z'), sid: 's3', host: 'learn.4geeks.com', path: '/x', newSession: true, referrer: 'https://4geeks.com/en/apply' },
    { type: 'pv', ts: ts('2026-10-15T12:00:00Z'), sid: 's4', host: '4geeks.com', path: '/en/financials', newSession: true },
  ]);
  await store.link(emailHash('ana@x.com'), V);
  store._ids[0].first_at = '2026-10-09T18:06:00.000Z';
  await store.addEvents(W, [{ type: 'pv', ts: ts('2026-10-10T09:00:00Z'), sid: 't1', host: '4geeks.com', path: '/', newSession: true, referrer: 'https://chatgpt.com/' }]);
  await store.link(emailHash('bo@x.com'), W);

  const j = (await att.journey(lead)).journey;
  assert.deepEqual(j.touches.map((t) => `${t.group}${t.branded ? ' (brand)' : ''}`), ['Paid Social', 'Paid Search (brand)']);
  assert.equal(j.touches[0].ad, 'Reel 3 - salary');
  assert.deepEqual(j.touches[0].keyPages.sort(), ['Pricing / financing', 'Program: ai-engineering']);
  assert.equal(j.touches[0].device, 'phone');
  assert.equal(j.continuations, 1);          // the hop to learn.4geeks.com is not a new touch
  assert.equal(j.after.length, 1);           // came back to pricing after the form

  const rep = await att.report([lead, other]);
  assert.equal(rep.coverage.withJourney, 2);
  assert.equal(rep.coverage.multiTouch, 1);
  assert.equal(rep.coverage.paidThenSearchOrDirect, 1);
  const first = Object.fromEntries(rep.models.first.groups.map((g) => [g.key, g]));
  assert.equal(first['Paid Social'].enrolled, 1);
  assert.equal(first['AI Assistant'].leads, 1);
  const last = Object.fromEntries(rep.models.last.groups.map((g) => [g.key, g]));
  assert.equal(last['Paid Search (brand)'].leads, 1);
  assert.equal(rep.paths[0].path.includes('→') || rep.paths[1].path.includes('→'), true);
  const ad = rep.ads.find((a) => a.ad === 'Reel 3 - salary');
  assert.equal(ad.firstTouch, 1); assert.equal(ad.enrolled, 1);
  assert.equal(rep.tagHealth.noAdName, 1);   // the brand search click has no ad name
});

test('collector endpoint: origin allowlist, CORS, linking', async (t) => {
  const express = require('express');
  const store = memStore();
  const att = createAttribution({ store, getRecords: () => [], getEnrollOf: () => () => null });
  const app = express();
  const ok = (h) => /(^|\.)4geeks\.com$/.test(h);
  app.post('/t/c', express.text({ type: () => true }), async (req, res) => {
    let host = ''; try { host = new URL(req.get('origin')).hostname; } catch (e) { /* none */ }
    if (!ok(host)) return res.status(403).end();
    await att.collect(JSON.parse(req.body)); res.set('Access-Control-Allow-Origin', req.get('origin')); res.status(204).end();
  });
  const server = app.listen(0); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/t/c`;
  const body = JSON.stringify({ v: 'd'.repeat(24), e: [{ t: 'pv', ts: Date.now(), s: 'x', h: '4geeks.com', p: '/', ns: 1 }, { t: 'id', eh: 'e'.repeat(64) }] });
  assert.equal((await fetch(url, { method: 'POST', body, headers: { origin: 'https://evil.com', 'content-type': 'text/plain' } })).status, 403);
  const r = await fetch(url, { method: 'POST', body, headers: { origin: 'https://4geeks.com', 'content-type': 'text/plain' } });
  assert.equal(r.status, 204);
  assert.equal(store._events.length, 1);
  assert.equal(store._ids[0].vid, 'd'.repeat(24));
});
