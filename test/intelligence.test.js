'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createScoreJourneys, bucketOf } = require('../lib/pipeline/scores');
const mk = require('../lib/marketing/intel');

function memStore() { const b = new Map(); return { putBlob: async (id, data, meta) => b.set(id, { data, meta }), getBlob: async (id) => b.get(id) || null }; }
const rec = (id, o) => ({ id: String(id), date: '2026-08-10', region: 'USA', bucket: 'Active / Other', stage: 'F2 — Some feedback', admissionsScore: 'Good', email: `l${id}@x.com`, source: 'google', campaign: 'AIE Search', ...o });

test('score buckets', () => {
  assert.equal(bucketOf('Very Good'), 'Very Good');
  assert.equal(bucketOf(''), 'Not scored');
  assert.equal(bucketOf('Duplicate'), 'Junk');
  assert.equal(bucketOf('Something new'), 'Something new');
});

test('enrollments come from the Enrollments section (by id or email), not AC Won; journeys and hygiene', async () => {
  let records = [
    rec(1, { admissionsScore: 'Very Good' }),                                   // enrolled via sheet (email), still open in AC
    rec(2, { admissionsScore: 'Very Good', bucket: 'Won', stage: 'Won' }),      // enrolled and marked won
    rec(3, { admissionsScore: 'Good' }),                                         // will move Good -> Very Good, then enroll
    rec(4, { admissionsScore: 'Bad', course: 'AI Fluency' }),                    // off-path enrollment
    rec(5, { admissionsScore: 'Good', bucket: 'Lost - Classified' }),
    rec(6, { admissionsScore: '', stage: 'Won' }),                               // Won stage, still open, no enrollment
    rec(7, { admissionsScore: 'Very Good', bucket: 'Won', stage: 'Won' }),      // won in AC, no enrollment
  ];
  const enr = { rows: [
    { id: 'usa-12', email: 'L1@x.com', converted: '2026-09-01', status: 'enrolled', program: 'AI Engineering' },
    { id: '2', email: 'other@x.com', converted: '2026-08-20', status: 'enrolled' },
    { id: 'usa-13', email: 'l3@x.com', converted: '2026-10-25', status: 'enrolled' },
    { id: 'usa-14', email: 'l4@x.com', converted: '2026-09-05', status: 'dropped', program: 'AI Fluency' },
  ] };
  const sj = createScoreJourneys({ store: memStore(), getRecords: () => records, getEnrollments: () => enr, log: { warn() {} } });
  await sj.snapshot(records, '2026-10-20');
  records = records.map((r) => (r.id === '3' ? { ...r, admissionsScore: 'Very Good' } : r));
  assert.equal(await sj.snapshot(records, '2026-10-22'), 1);

  const r = sj.report(records);
  const by = Object.fromEntries(r.scores.map((s) => [s.score, s]));
  assert.equal(by['Very Good'].total, 4);
  assert.equal(by['Very Good'].enrolled, 3);      // 1 (email), 2 (id), 3 (now Very Good)
  assert.equal(by['Very Good'].notWonInAC, 2);    // 1 and 3 are not Won in AC
  assert.equal(by['Very Good'].acWon, 2);
  assert.equal(by.Good.lost, 1);
  assert.equal(by.Good.decidedRate, 0);
  assert.equal(by.Bad.enrolled, 1);
  assert.equal(by.Bad.dropped, 1);
  assert.deepEqual(r.offPath[0], { score: 'Bad', n: 1, programs: [{ program: 'AI Fluency', n: 1 }] });
  assert.equal(r.journeys.trackingSince, '2026-10-20');
  assert.deepEqual(r.journeys.transitions[0], { path: 'Good → Very Good', n: 1, enrolled: 1 });
  assert.deepEqual(r.journeys.paths[0], { path: 'Good → Very Good → Enrolled', n: 1, medianDaysAfterChange: 3 });
  assert.equal(r.hygiene.wonStageOpen, 1);
  assert.equal(r.hygiene.enrolledNotWonInAC, 3);
  assert.equal(r.hygiene.wonInACNotEnrolled, 1);
  assert.equal(r.cohorts[0].month, '2026-08');

  // History survives a restart.
  const store = memStore();
  const a = createScoreJourneys({ store, getRecords: () => records, getEnrollments: () => enr });
  await a.snapshot(records, '2026-10-20');
  const b = createScoreJourneys({ store, getRecords: () => records, getEnrollments: () => enr });
  await b.load();
  assert.equal(b._history().since, '2026-10-20');
});

test('marketing: quality, enrollments, change vs previous period, spend by campaign name', () => {
  const enrolledEmails = new Set(['l1@x.com', 'l2@x.com']);
  const enrollOf = (r) => (enrolledEmails.has(r.email) ? { status: 'enrolled' } : null);
  const cur = [
    rec(1, { source: 'google', campaign: 'AIE Search US', admissionsScore: 'Very Good' }),
    rec(2, { source: 'Google', campaign: 'AIE Search US', admissionsScore: 'Good' }),
    rec(3, { source: 'facebook', campaign: 'FB Leads Form', admissionsScore: 'Duplicate' }),
    rec(4, { source: 'facebook', campaign: 'FB Leads Form', admissionsScore: '' }),
  ];
  const prev = [rec(10, { source: 'facebook' }), rec(11, { source: 'facebook' }), rec(12, { source: 'tiktok' }), ...Array.from({ length: 6 }, (_, i) => rec(20 + i, { source: 'tiktok' }))];
  const bySource = mk.report({ records: cur, prevRecords: prev, dim: 'source', enrollOf });
  const g = bySource.rows.find((x) => x.key === 'google');
  assert.equal(g.leads, 2); assert.equal(g.qualifiedRate, 1); assert.equal(g.enrolled, 2); assert.equal(g.prevLeads, 0);
  const f = bySource.rows.find((x) => x.key === 'facebook');
  assert.equal(f.junkRate, 0.5); assert.equal(f.change, 0);
  assert.ok(bySource.rows.find((x) => x.key === 'tiktok' && x.leads === 0 && x.change === -1), 'a source that vanished is still listed');
  assert.equal(bySource.totals.qualified, 2);

  const center = { currency: 'USD', summary: { spend: 1000 }, campaigns: [{ campaign: 'AIE Search US', spend: 600, leads: 3 }, { name: 'Other', spend: 400 }] };
  const byCampaign = mk.report({ records: cur, dim: 'campaign', enrollOf, center });
  const c = byCampaign.rows.find((x) => x.key === 'aie search us');
  assert.equal(c.spend, 600); assert.equal(c.costPerEnrollment, 300);
  assert.equal(byCampaign.totals.costPerQualified, 500);
  assert.equal(byCampaign.totals.costPerEnrollment, 500);
  assert.match(mk.adviceContent({ region: 'USA', period: 'Oct', report: byCampaign, lang: 'es' }), /Spanish[\s\S]*aie search us: 2 leads/);
});
