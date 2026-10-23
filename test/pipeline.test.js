'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const C = require('../lib/pipeline/classify');
const { cleanDiagnosis, safeJson, createIntel } = require('../lib/pipeline/intel');
const { fileStore } = require('../lib/pipeline/store');

const NOW = Date.parse('2026-10-22T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10);

test('stageGroup maps the USA F-stages and common buckets', () => {
  assert.strictEqual(C.stageGroup('F2 — Some Feedback'), 'f2');
  assert.strictEqual(C.stageGroup('F5 — EA / Reg Sent'), 'f5');
  assert.strictEqual(C.stageGroup('Never Answered'), 'not_reached');
  assert.strictEqual(C.stageGroup('Day 7 (No ans 7x) - No Reply Automation USA (Auto-Texting)'), 'not_reached');
  assert.strictEqual(C.stageGroup('All Duplicates'), 'junk');
  assert.strictEqual(C.stageGroup('Follow Up Later'), 'stalled');
  assert.strictEqual(C.stageGroup('AI Engineering Core'), 'other');
});

test('candidatePriority reads money-closest deals first and skips junk', () => {
  const base = { bucket: 'Active / Other', date: daysAgo(30), admissionsScore: 'Very Good' };
  assert.strictEqual(C.candidatePriority({ ...base, stage: 'F4 — Likely To Enroll' }, NOW), 0);
  assert.strictEqual(C.candidatePriority({ ...base, stage: 'F3 — Strong Feedback' }, NOW), 1);
  assert.strictEqual(C.candidatePriority({ ...base, stage: 'F2 — Some Feedback' }, NOW), 2);
  assert.strictEqual(C.candidatePriority({ ...base, admissionsScore: 'Invalid Traffic', stage: 'F4' }, NOW), null);
  assert.strictEqual(C.candidatePriority({ ...base, admissionsScore: 'Bad', stage: 'Never Answered' }, NOW), null);
  assert.strictEqual(C.candidatePriority({ ...base, bucket: 'Won', stage: 'Won' }, NOW), 6);
  assert.strictEqual(C.candidatePriority({ ...base, bucket: 'Lost - Classified', lostDate: daysAgo(10) }, NOW), 7);
  assert.strictEqual(C.candidatePriority({ ...base, bucket: 'Lost - Classified', lostDate: daysAgo(400) }, NOW), null);
});

test('needsRefresh: never read, deal changed, or a day old for open deals', () => {
  const r = { bucket: 'Active / Other', dealUpdatedAt: '2026-10-21 10:00:00' };
  assert.ok(C.needsRefresh(r, null, NOW));
  assert.ok(C.needsRefresh(r, { fetchedAt: '2026-10-20T00:00:00Z' }, NOW));
  assert.ok(!C.needsRefresh(r, { fetchedAt: '2026-10-22T06:00:00Z' }, NOW));
  assert.ok(C.needsRefresh({ ...r, dealUpdatedAt: null }, { fetchedAt: '2026-10-21T06:00:00Z' }, NOW));
});

test('buildTimeline merges notes, strips HTML, names reps and stage moves, newest first', () => {
  const usersById = new Map([['7', { firstName: 'Eli', lastName: 'P' }]]);
  const stagesById = new Map([['10', { title: 'F2 — Some Feedback' }], ['11', { title: 'F3 — Strong Feedback' }]]);
  const tl = C.buildTimeline({
    dealNotes: [{ note: '<p>Asked about <b>financing</b></p>', cdate: '2026-10-10T10:00:00Z', userid: '7' }],
    contactNotes: [{ note: 'Wife needs to agree', cdate: '2026-10-12T09:00:00Z', userid: '7' }, { note: '<p>Asked about <b>financing</b></p>', cdate: '2026-10-10T10:00:00Z', userid: '7' }],
    activities: [{ dataType: 'deal', dataAction: 'stage', dataOldval: '10', d_stageid: '11', cdate: '2026-10-11T08:00:00Z', userid: '7' }, { dataType: 'note', cdate: '2026-10-10T10:00:00Z' }],
    usersById, stagesById,
  });
  assert.strictEqual(tl.length, 3);
  assert.strictEqual(tl[0].note, 'Wife needs to agree');
  assert.strictEqual(tl[1].kind, 'stage');
  assert.strictEqual(tl[1].note, 'F2 — Some Feedback → F3 — Strong Feedback');
  assert.strictEqual(tl[2].note, 'Asked about financing');
  assert.strictEqual(tl[2].by, 'Eli P');
  const m = C.timelineMetrics({ date: '2026-10-09' }, tl, NOW);
  assert.strictEqual(m.notes, 2);
  assert.strictEqual(m.daysSinceLastTouch, 10);
  assert.strictEqual(m.daysInStage, 11);
  assert.ok(m.firstTouchHours >= 0);
});

test('cleanDiagnosis keeps only known values and never uses an "email" key', () => {
  const d = cleanDiagnosis(safeJson('Sure! {"summary":"Waiting on financing","stuckAt":"financing","ballInCourt":"rep","objections":["financing","banana"],"intent":9,"nextAction":{"type":"send_financing","when":"today","why":"asked twice"},"scripts":{"sms":"Hi {first_name}","email":"Body","email_subject":"Your plan"}}'));
  assert.strictEqual(d.ballInCourt, 'rep');
  assert.deepStrictEqual(d.objections, ['financing']);
  assert.strictEqual(d.intent, 5);
  assert.strictEqual(d.scripts.emailBody, 'Body');
  assert.ok(!('email' in d.scripts));
  assert.strictEqual(cleanDiagnosis(safeJson('no json here')), null);
});

test('intel: reads conversations, diagnoses once per change, aggregates and hides done leads', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-'));
  const store = fileStore(dir);
  const records = [
    { id: '1', contactId: '11', region: 'USA', bucket: 'Active / Other', stage: 'F3 — Strong Feedback', admissionsScore: 'Very Good', date: '2026-10-01', assignTo: 'Eli' },
    { id: '2', contactId: '12', region: 'USA', bucket: 'Won', stage: 'Won', admissionsScore: 'Very Good', date: '2026-09-01', assignTo: 'Eli' },
    { id: '3', contactId: '13', region: 'USA', bucket: 'Active / Other', stage: 'Never Answered', admissionsScore: 'Bad', date: '2026-09-01', assignTo: 'Eli' },
  ];
  const calls = [];
  const client = {
    listDealNotes: async (id) => { calls.push(`notes:${id}`); return [{ note: `note for ${id}`, cdate: '2026-10-15 10:00:00', userid: '1' }]; },
    listContactNotes: async () => [],
    listDealActivities: async () => [],
    interactive: (fn) => fn(),
  };
  let aiCalls = 0;
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test';
  const intel = createIntel({
    client, store, getRecords: () => records,
    getLookups: () => ({ usersById: new Map([['1', { firstName: 'Eli' }]]), stagesById: new Map() }),
    callClaude: async () => { aiCalls++; return JSON.stringify({ summary: 'stuck', stuckAt: 'decision', ballInCourt: 'rep', objections: ['family'], intent: 4, nextAction: { type: 'call', when: 'today', why: 'x' }, scripts: {} }); },
    log: { log() {}, error() {} },
  });
  await intel.load();
  await intel.tick();
  assert.deepStrictEqual(calls.sort(), ['notes:1', 'notes:2']); // junk deal 3 not read
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(aiCalls, 2);
  await intel.tick(); // nothing changed: no re-read, no new AI calls
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(aiCalls, 2);
  const ins = intel.insights('USA');
  assert.strictEqual(ins.byScore['Very Good'].won, 1);
  assert.strictEqual(ins.ballInCourt.rep, 1);
  assert.strictEqual(ins.objectionsOpen.family, 1);
  assert.strictEqual(intel.leadSummary('1').ballInCourt, 'rep');
  await intel.setState('1', { doneUntil: new Date(Date.now() + 86400000).toISOString() });
  assert.ok(intel.hiddenUntil('1'));
  assert.strictEqual(intel.hiddenUntil('2'), null);
});

test('ads-sync posts each Good/Very Good USA lead once per tier, hashed, and never sends clear email', async () => {
  const http = require('http');
  const { createAdsSync, normalizeEmail } = require('../lib/pipeline/ads-sync');
  assert.strictEqual(normalizeEmail(' Jo.Hn+ads@Gmail.com '), 'john@gmail.com');
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { got.push({ key: req.headers['x-hub-key'], body: JSON.parse(b) }); res.end('ok'); }); });
  await new Promise((r) => srv.listen(0, r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-'));
  const today = new Date().toISOString().slice(0, 10);
  const mk = (id, score, extra = {}) => { const { g, ...rest } = extra; const r = { id, region: 'USA', bucket: 'Active / Other', admissionsScore: score, date: today, email: `p${id}@x.com`, ...rest }; Object.defineProperty(r, 'gclid', { value: g || null, enumerable: false, writable: true }); return r; };
  const records = [mk('1', 'Very Good', { g: 'abc' }), mk('2', 'Good'), mk('3', 'Bad'), mk('4', 'Very Good', { region: 'LATAM' }), mk('5', 'Good', { bucket: 'Lost - Classified' })];
  const sync = createAdsSync({ store: fileStore(dir), getRecords: () => records, log: { log() {}, warn() {} }, env: { ADS_SYNC_WEBHOOK_URL: `http://127.0.0.1:${srv.address().port}/hook`, ADS_SYNC_KEY: 'k' } });
  await sync.run();
  assert.deepStrictEqual(got.map((g) => g.body.dealId).sort(), ['1', '2']);
  const one = got.find((g) => g.body.dealId === '1').body;
  assert.strictEqual(one.tier, 'very_good'); assert.strictEqual(one.gclid, 'abc'); assert.match(one.emailSha256, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(got).includes('@x.com'));
  assert.strictEqual(got[0].key, 'k');
  await sync.run();
  assert.strictEqual(got.length, 2); // nothing re-sent
  records[1].admissionsScore = 'Very Good';
  await sync.run();
  assert.strictEqual(got.length, 3); // upgrade Good -> Very Good is its own conversion
  assert.ok(!JSON.stringify(records[0]).includes('abc')); // gclid never serialized
  // n8n reports back; the log shows each state; failures can be retried.
  await sync.recordResult({ deal_id: '1', tier: 'very_good', ok: true, identifier_used: 'gclid' });
  await sync.recordResult({ deal_id: '2', tier: 'very_good', ok: false, identifier_used: 'hashed_email', error: 'CLICK_NOT_FOUND' });
  records.push(mk('6', 'Good', { email: '' }));
  const byKey = Object.fromEntries(sync.logRows().map((r) => [r.key, r.status]));
  assert.strictEqual(byKey['1:very_good'], 'uploaded');
  assert.strictEqual(byKey['2:very_good'], 'failed');
  assert.strictEqual(byKey['2:good'], 'queued');
  assert.strictEqual(byKey['6:good'], 'no_id');
  assert.strictEqual(sync.summary().counts.uploaded, 1);
  assert.strictEqual(await sync.retry(['2:very_good']), 1);
  await sync.run();
  assert.strictEqual(got.length, 4); // failed one sent again
  assert.ok(sync.checkKey('k') && !sync.checkKey('x'));
  // Temporary Google errors and silent uploads go again by themselves; duplicates count as uploaded.
  await sync.recordResult({ deal_id: '1', tier: 'very_good', ok: false, error: '{"conversionUploadError":"TOO_RECENT_CONVERSION_ACTION"}' });
  await sync.recordResult({ deal_id: '2', tier: 'good', ok: false, error: 'DUPLICATE_ORDER_ID' });
  await sync.autoRetry(Date.now() + 8 * 3600000);
  const after = Object.fromEntries(sync.logRows().map((r) => [r.key, r.status]));
  assert.strictEqual(after['1:very_good'], 'pending');
  assert.strictEqual(after['2:good'], 'uploaded');
  srv.closeAllConnections(); srv.close();
});
