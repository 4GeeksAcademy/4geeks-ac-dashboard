'use strict';
// ---------------------------------------------------------------------------
// Lead score → enrollment, measured on what really happened.
//
// "Enrolled" is NOT ActiveCampaign's Won stage (AC under-records USA
// enrollments): a lead counts as enrolled when it matches an enrollment from
// the Enrollments section (USA attribution sheet, Spain/LATAM won deals), by
// deal id or by email. AC's own Won flag is kept alongside, so the gap shows.
//
// Score journeys: AC does not keep a history of the "Admission Code Test
// Score" contact field, so the app snapshots every lead's score after each
// data refresh and records each change (Good → Very Good → enrolled…). Paths
// are only known from the day tracking started; the report says since when.
// ---------------------------------------------------------------------------
const zlib = require('zlib');
const C = require('./classify');

const BLOB = 'score-history';
const DAY = 86400000;
const QUALIFIED = ['Very Good', 'Good'];
const JUNK = ['Invalid Traffic', 'Fake Contact Details', 'Duplicate', 'Invalid / Spam'];
const BUCKETS = ['Very Good', 'Good', 'No Feedback', 'Bad', 'Junk', 'Not scored'];

function bucketOf(score) {
  const s = String(score || '').trim();
  if (!s) return 'Not scored';
  if (JUNK.includes(s)) return 'Junk';
  if (BUCKETS.includes(s)) return s;
  return s; // any other value the team uses stays visible as-is
}
const today = () => new Date().toISOString().slice(0, 10);
const median = (a) => { const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const days = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / DAY) : null);

const RANK = { 'Very Good': 4, Good: 3, 'No Feedback': 2, Bad: 1, Junk: 0 };
const TIER_SCORE = { very_good: 'Very Good', good: 'Good' };

// extraHistory(): more dated score points from elsewhere, { [dealId]: [[date, score]] }
// (the Google Ads sync log: when a lead was sent as Good, then as Very Good).
function createScoreJourneys({ store, getRecords, getEnrollments, extraHistory = () => ({}), log = console }) {
  // history: { since: 'YYYY-MM-DD', deals: { [dealId]: [[date, score, first?]] } }
  let history = { since: null, deals: {} };
  let loaded = false;
  let dirty = false;

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const b = store && await store.getBlob(BLOB);
      if (b && b.data) history = JSON.parse(zlib.gunzipSync(b.data).toString('utf8'));
    } catch (e) { log.warn('[scores] history not loaded:', e.message); }
    history.deals = history.deals || {};
  }

  // Called after every data refresh: one entry per score CHANGE per deal.
  async function snapshot(records = getRecords() || [], at = today()) {
    await load();
    if (!history.since) history.since = at;
    let changes = 0;
    for (const r of records) {
      const id = String(r.id);
      const s = String(r.admissionsScore || '');
      const h = history.deals[id];
      if (!h) { history.deals[id] = [[at, s, 1]]; dirty = true; continue; } // first sighting: score already set, date unknown
      if (h[h.length - 1][1] !== s) { h.push([at, s]); dirty = true; changes++; }
    }
    if (dirty && store) {
      try {
        await store.putBlob(BLOB, zlib.gzipSync(Buffer.from(JSON.stringify(history))), { since: history.since, deals: Object.keys(history.deals).length });
        dirty = false;
      } catch (e) { log.warn('[scores] history not saved:', e.message); }
    }
    return changes;
  }

  function enrollmentIndex() {
    const rows = ((getEnrollments && getEnrollments()) || {}).rows || [];
    const byId = new Map(); const byEmail = new Map();
    rows.forEach((e) => {
      if (e.id && !String(e.id).startsWith('usa-')) byId.set(String(e.id), e);
      if (e.email) byEmail.set(String(e.email).trim().toLowerCase(), e);
    });
    return { byId, byEmail, n: rows.length };
  }

  // lead -> its enrollment (deal id first, then email), or null.
  function matcher() {
    const idx = enrollmentIndex();
    const fn = (r) => idx.byId.get(String(r.id)) || (r.email && idx.byEmail.get(String(r.email).trim().toLowerCase())) || null;
    fn.known = idx.n;
    return fn;
  }

  // The report for any set of leads (the page sends the ones its filters show).
  function report(records) {
    const enrollOf = matcher();
    const idx = { n: enrollOf.known };

    const blank = () => ({ total: 0, enrolled: 0, dropped: 0, notWonInAC: 0, acWon: 0, open: 0, lost: 0, daysToEnroll: [] });
    const byScore = {};
    const cohorts = {}; // month -> bucket -> { total, enrolled }
    const offPath = {}; // bucket -> { n, programs: {} }
    const hygiene = { wonStageOpen: 0, enrolledNotWonInAC: 0, wonInACNotEnrolled: 0 };
    const transitions = {}; // "Good → Very Good" -> { n, enrolled }
    const paths = {}; // for enrolled leads: "Good → Very Good → Enrolled" -> { n, days: [] }
    let tracked = 0;
    // Score moves: the first rating a lead got vs its rating at enrollment (or now).
    const extra = (() => { try { return extraHistory() || {}; } catch (e) { return {}; } })();
    const moves = { enrolled: { tracked: 0, up: 0, down: 0, same: 0, matrix: {} }, all: { tracked: 0, up: 0, down: 0, same: 0, matrix: {} }, leads: [] };

    for (const r of records) {
      const b = bucketOf(r.admissionsScore);
      const e = enrollOf(r);
      const s = byScore[b] || (byScore[b] = blank());
      s.total++;
      if (e) {
        s.enrolled++;
        if (e.status === 'dropped') s.dropped++;
        if (!C.isWon(r)) { s.notWonInAC++; hygiene.enrolledNotWonInAC++; }
        const d = days(r.date, e.converted);
        if (d != null && d >= 0) s.daysToEnroll.push(d);
        if (!QUALIFIED.includes(b)) {
          const o = offPath[b] || (offPath[b] = { n: 0, programs: {} });
          o.n++;
          const prog = e.program || r.course || 'Not set';
          o.programs[prog] = (o.programs[prog] || 0) + 1;
        }
      } else if (C.isOpen(r)) s.open++;
      else if (!C.isWon(r)) s.lost++;
      if (C.isWon(r)) { s.acWon++; if (!e) hygiene.wonInACNotEnrolled++; }
      if (C.isOpen(r) && C.stageGroup(r.stage) === 'won') hygiene.wonStageOpen++;

      const m = String(r.date || '').slice(0, 7);
      if (m) {
        const c = cohorts[m] || (cohorts[m] = {});
        const cb = c[b] || (c[b] = { total: 0, enrolled: 0 });
        cb.total++; if (e) cb.enrolled++;
      }

      // Score journey (only changes seen since tracking started).
      const h = history.deals[String(r.id)];
      {
        // Dated ratings: snapshots (the very first one only if the score was set when we first saw the deal) + Google Ads sync.
        const pts = [];
        (h || []).forEach((x, i) => { const sb = bucketOf(x[1]); if (sb !== 'Not scored') pts.push([x[0], sb, i === 0 && x[2] ? 'before' : 'seen']); });
        (extra[String(r.id)] || []).forEach(([d, sc]) => pts.push([String(d).slice(0, 10), sc, 'ads']));
        pts.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        const cut = e && e.converted ? pts.filter((p) => p[0] <= e.converted) : pts;
        const known = cut.length ? cut : pts.slice(0, 1);
        if (known.length) {
          const from = known[0][1]; const to = known[known.length - 1][1];
          const dir = RANK[to] > RANK[from] ? 'up' : RANK[to] < RANK[from] ? 'down' : 'same';
          [moves.all, ...(e ? [moves.enrolled] : [])].forEach((m) => {
            m.tracked++; m[dir]++;
            const k = `${from} → ${to}`; m.matrix[k] = (m.matrix[k] || 0) + 1;
          });
          if (dir !== 'same') {
            const changed = known.find((p) => p[1] === to && p !== known[0]);
            moves.leads.push({ id: r.id, contactId: r.contactId || null, name: r.name || null, from, to, dir, firstAt: known[0][2] === 'before' ? null : known[0][0], changedAt: changed ? changed[0] : null, enrolled: !!e, enrolledAt: e ? e.converted || null : null, course: (e && e.program) || r.course || null, region: r.region, now: bucketOf(r.admissionsScore) });
          }
        }
      }
      if (h && h.length) {
        tracked++;
        const seq = h.map((x) => bucketOf(x[1]));
        for (let i = 1; i < seq.length; i++) {
          if (seq[i] === seq[i - 1]) continue;
          const k = `${seq[i - 1]} → ${seq[i]}`;
          const t = transitions[k] || (transitions[k] = { n: 0, enrolled: 0 });
          t.n++; if (e) t.enrolled++;
        }
        if (e) {
          // The path that led to enrolling: score changes AFTER the enrollment date are not part of it.
          const before = h.filter((x, i) => i === 0 || !e.converted || x[0] <= e.converted);
          const seqB = before.map((x) => bucketOf(x[1]));
          const distinct = seqB.filter((x, i) => i === 0 || x !== seqB[i - 1]);
          const k = `${distinct.join(' → ')} → Enrolled`;
          const p = paths[k] || (paths[k] = { n: 0, days: [], changed: distinct.length > 1 });
          p.n++;
          const lastChange = before.length > 1 ? before[before.length - 1][0] : null;
          const d = days(lastChange, e.converted);
          if (d != null) p.days.push(d);
        }
      }
    }

    const scores = Object.entries(byScore).map(([score, s]) => {
      const decided = s.enrolled + s.lost;
      return {
        score, total: s.total, enrolled: s.enrolled, dropped: s.dropped, open: s.open, lost: s.lost,
        acWon: s.acWon, notWonInAC: s.notWonInAC,
        rate: s.total ? s.enrolled / s.total : null,
        decidedRate: decided ? s.enrolled / decided : null,
        medianDaysToEnroll: median(s.daysToEnroll),
      };
    }).sort((a, b) => {
      const ia = BUCKETS.indexOf(a.score); const ib = BUCKETS.indexOf(b.score);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.total - a.total;
    });

    const months = Object.keys(cohorts).sort().slice(-6);
    return {
      enrollmentsKnown: idx.n,
      leads: records.length,
      enrolled: scores.reduce((a, s) => a + s.enrolled, 0),
      scores,
      cohorts: months.map((m) => ({ month: m, byScore: cohorts[m] })),
      offPath: Object.entries(offPath).map(([score, o]) => ({ score, n: o.n, programs: Object.entries(o.programs).sort((a, b) => b[1] - a[1]).map(([program, n]) => ({ program, n })) })).sort((a, b) => b.n - a.n),
      journeys: {
        trackingSince: history.since,
        tracked,
        transitions: Object.entries(transitions).map(([path, t]) => ({ path, ...t })).sort((a, b) => b.n - a.n),
        paths: Object.entries(paths).filter(([, p]) => p.changed).map(([path, p]) => ({ path, n: p.n, medianDaysAfterChange: median(p.days) })).sort((a, b) => b.n - a.n),
      },
      hygiene,
      moves: {
        since: history.since,
        enrolled: { ...moves.enrolled, matrix: Object.entries(moves.enrolled.matrix).map(([path, n]) => ({ path, n })).sort((a, b) => b.n - a.n) },
        all: { ...moves.all, matrix: Object.entries(moves.all.matrix).map(([path, n]) => ({ path, n })).sort((a, b) => b.n - a.n) },
        leads: moves.leads.sort((a, b) => (b.enrolled - a.enrolled) || String(b.changedAt || '').localeCompare(String(a.changedAt || ''))).slice(0, 300),
      },
    };
  }

  return { load, snapshot, report, matcher, bucketOf, _history: () => history };
}

module.exports = { TIER_SCORE, createScoreJourneys, bucketOf, BUCKETS, QUALIFIED, JUNK };
