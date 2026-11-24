'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { createSalesActivity, offerQualityOf, slimCall } = require('../lib/pipeline/sales-activity');

const memStore = () => { const m = new Map(); return { async getBlob(id) { return m.get(id) || null; }, async putBlob(id, data, meta) { m.set(id, { data, meta }); }, _m: m }; };
const call = (o) => ({ cdr_id: o.id, direction: o.dir || 'out', last_state: o.state || 'ANSWERED', start_time: o.at, incall_duration: o.inCall || 0, total_duration: o.total || 0, user: { firstname: o.rep.split(' ')[0], lastname: o.rep.split(' ')[1] } });

test('offer quality reads the has_offer values the sheet counts', () => {
  assert.equal(offerQualityOf('STRONG_FEEDBACK'), 'strong');
  assert.equal(offerQualityOf('SOFT_FEEDBACK'), 'soft');
  assert.equal(offerQualityOf('SUPER_SOFT_FEEDBACK'), 'supersoft');
  assert.equal(offerQualityOf(''), null);
  assert.equal(slimCall({ start_time: '2026-11-23 10:00:00', direction: 'out', Comercial: 'Ana B' }).rep, 'Ana B');
});

test('report: same formulas as admisiones_spain, Madrid days, offers by quality, sales, leads, enrollments', async () => {
  const store = memStore();
  const calls = [
    call({ id: 1, rep: 'Pablo Han', at: '2026-11-23T09:00:00Z', inCall: 52, total: 105 }), // answered, active
    call({ id: 2, rep: 'Pablo Han', at: '2026-11-23T09:10:00Z', inCall: 5, total: 40 }), // answered, not active (≤15 s)
    call({ id: 3, rep: 'Pablo Han', at: '2026-11-23T09:20:00Z', state: 'CANCELLED', total: 60 }),
    call({ id: 4, rep: 'Pablo Han', at: '2026-11-23T09:30:00Z', inCall: 1000, total: 1010 }), // >15 min
    call({ id: 5, rep: 'Ana Ruiz', at: '2026-11-23T10:00:00Z', dir: 'in', state: 'MISSED' }),
    call({ id: 6, rep: 'Ana Ruiz', at: '2026-11-22T23:30:00Z', inCall: 30, total: 40 }), // 00:30 Madrid on the 23rd
    call({ id: 7, rep: 'Ana Ruiz', at: '2026-11-23T23:30:00Z', inCall: 30, total: 40 }), // 00:30 Madrid on the 24th: not counted
  ];
  const posted = [];
  const fetchImpl = async (url, opt) => {
    posted.push({ url, body: JSON.parse(opt.body), key: opt.headers['x-hub-key'] });
    if (url.includes('calls')) return { ok: true, status: 200, text: async () => JSON.stringify({ calls }) };
    return { ok: true, status: 200, text: async () => '{}' };
  };
  const recs = [
    { id: 1, region: 'Spain', assignTo: 'Pablo Han', date: '2026-11-23', offerSentDate: '2026-11-23', stage: 'STRONG FEEDBACK + 50% DE QUE SE INSCRIBA', bucket: 'Active / Other', dealCourse: 'AI' },
    { id: 2, region: 'Spain', assignTo: 'Pablo Han', date: '2026-11-20', offerSentDate: '2026-11-23', stage: 'SUPER SOFT FEEDBACK - OFERTA TIRADA SIN', bucket: 'Active / Other' },
    { id: 3, region: 'Spain', assignTo: 'Ana Ruiz', date: '2026-11-01', offerSentDate: '2026-11-23 15:00:00', stage: 'WON AI ENG', bucket: 'Won', wonDate: '2026-11-23', dealCourse: 'FS', name: 'Laura' },
    { id: 4, region: 'USA', assignTo: 'X', date: '2026-11-23', offerSentDate: '2026-11-23', stage: 'STRONG FEEDBACK' },
  ];
  Object.defineProperty(recs[1], 'title', { value: 'DUP - Juan', enumerable: false });
  recs[1].date = '2026-11-23';
  const stageHistory = async (id) => (String(id) === '3' ? [{ at: '2026-11-10T10:00:00Z', stage: 'TO CONTACT' }, { at: '2026-11-23T09:00:00Z', stage: 'SOFT FEEDBACK -30% DE QUE SE INSCRIBA' }, { at: '2026-11-23T16:00:00Z', stage: 'WON AI ENG' }] : []);
  const sa = createSalesActivity({ store, stageHistory, getRecords: () => recs, getEnrollments: () => ({ rows: [{ id: '3', region: 'Spain', converted: '2026-11-23', name: 'Laura', program: 'Full Stack', assignTo: 'Ana Ruiz' }] }),
    env: { RINGOVER_WEBHOOK_URL: 'https://n8n/calls', BRIEF_WEBHOOK_URL: 'https://n8n/brief', ADS_SYNC_KEY: 'k' }, fetchImpl, log: { log() {}, warn() {} }, now: () => Date.parse('2026-11-23T20:00:00Z') });
  await sa.sync({ days: 2 });
  assert.equal(posted[0].key, 'k');
  const r = await sa.report({ from: '2026-11-23', to: '2026-11-23' });
  const ph = r.reps.find((x) => x.rep === 'Pablo Han');
  assert.deepEqual([ph.calls.emitidas, ph.calls.descuelgues, ph.calls.activas, ph.calls.largas], [4, 3, 2, 1]);
  assert.equal(ph.calls.tasaDescuelgue, 0.75);
  assert.equal(ph.calls.tasaActivas, 0.5);
  assert.equal(ph.calls.tActiva, 1052);
  assert.equal(ph.calls.tConectado, 1215);
  const ana = r.reps.find((x) => x.rep === 'Ana Ruiz');
  assert.deepEqual([ana.calls.emitidas, ana.calls.entrantes, ana.calls.perdidasEntrantes], [1, 1, 1]); // the 00:30 Madrid call of the 24th is not here
  assert.deepEqual(r.total.offers, { strong: 1, soft: 1, supersoft: 1, other: 0 });
  assert.equal(r.total.offersTotal, 3);
  assert.equal(r.total.ventas, 1); assert.deepEqual(r.total.ventasByCourse, { FS: 1 });
  assert.equal(r.total.leads, 2); assert.equal(r.total.dups, 1);
  assert.equal(r.total.matriculas, 1);
  const text = sa.briefText(r);
  assert.match(text, /Resumen España · lunes, 23 de noviembre/);
  assert.match(text, /5 emitidas · 4 descuelgues \(\*80%\*\)/);
  assert.match(text, /Ofertas:\* 3 — Strong 1 · Soft 1 · Super soft 1/);
  assert.match(text, /Matrículas:\* 1/);
  // A day already stored survives a restart (from the store, not memory).
  const sa2 = createSalesActivity({ store, getRecords: () => recs, getEnrollments: () => ({ rows: [] }), env: {}, log: { log() {}, warn() {} } });
  const r2 = await sa2.report({ from: '2026-11-23', to: '2026-11-23' });
  assert.equal(r2.total.calls.emitidas, 5);
  // Brief: the n8n check only passes while the Hub is sending that day's briefing.
  assert.equal(sa.isPendingBrief('2026-11-23'), false);
  const out = await sa.sendBriefOnce('2026-11-23');
  assert.equal(out.sent, true);
  assert.equal(posted.at(-1).url, 'https://n8n/brief');
  assert.equal(sa.checkKey('k'), true); assert.equal(sa.checkKey('x'), false);
});

test('rep names match across ActiveCampaign and Ringover; offer quality falls back to the offer stage', async () => {
  const recs = [
    { id: 1, region: 'Spain', assignTo: 'Pablo Han @4Geeks Academy', date: '2026-11-24', offerSentDate: '2026-11-24', stage: 'SOFT FEEDBACK -30% DE QUE SE INSCRIBA', bucket: 'Active / Other', course: 'AI Engineering' },
    { id: 2, region: 'Spain', assignTo: 'Pablo Ballesteros  de 4Geeks Academy', date: '2026-11-20', offerSentDate: '2026-11-24', stage: 'SUPER SOFT FEEDBACK - OFERTA TIRADA', bucket: 'Active / Other' },
  ];
  const store = (() => { const m = new Map(); return { async getBlob(id) { return m.get(id) || null; }, async putBlob(id, data) { m.set(id, { data }); } }; })();
  const sa = createSalesActivity({ store, getRecords: () => recs, getEnrollments: () => ({ rows: [] }), env: {}, log: { log() {}, warn() {} } });
  sa._cache.set('2026-11-24', [{ id: 'a', dir: 'out', state: 'ANSWERED', at: '2026-11-24T10:00:00Z', inCall: 30, total: 40, rep: 'Pablo Han' }]);
  let r = await sa.report({ from: '2026-11-24', to: '2026-11-24' });
  assert.deepEqual(r.total.offers, { strong: 0, soft: 1, supersoft: 1, other: 0 });
  const ph = r.reps.filter((x) => x.rep === 'Pablo Han');
  assert.equal(ph.length, 1); assert.equal(ph[0].calls.emitidas, 1); assert.equal(ph[0].offersTotal, 1);
  assert.equal(r.reps.some((x) => /4Geeks/.test(x.rep)), false);
  assert.deepEqual(r.total.leadsByCourse, { AI: 1 });
  // Deal 2 is later Won: it keeps the Super soft quality the Hub saw.
  recs[1].stage = 'WON AI ENG'; recs[1].bucket = 'Won';
  r = await sa.report({ from: '2026-11-24', to: '2026-11-24' });
  assert.equal(r.total.offers.supersoft, 1);
});
