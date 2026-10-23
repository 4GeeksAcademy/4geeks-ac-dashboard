'use strict';
// Pure helpers for Pipeline intelligence: which deals deserve a conversation
// read, how AC notes/activities become one timeline, and the hard numbers
// (days since last touch, time in stage...) computed without any AI.

const GOOD_SCORES = ['Very Good', 'Good'];
const JUNK_SCORES = ['Invalid Traffic', 'Fake Contact Details', 'Duplicate', 'Invalid / Spam'];
const DAY = 86400000;

// Stage names are free text per pipeline. USA uses "F1 — Replied, Low
// Interest" ... "F5 — EA / Reg Sent"; other pipelines fall back to 'other'.
function stageGroup(stage) {
  const s = String(stage || '');
  const f = s.match(/\bF([1-5])\b/);
  if (f) return 'f' + f[1];
  if (/^won$/i.test(s.trim())) return 'won';
  if (/never answered|no ans|called \dx|no reply|to contact/i.test(s)) return 'not_reached';
  if (/spam|duplicate|stop/i.test(s)) return 'junk';
  if (/responded, lost|stopped responding|follow up later|do not message|low interest/i.test(s)) return 'stalled';
  if (/likely to enroll|reg sent|registration|enroll/i.test(s)) return 'f4';
  return 'other';
}
const STAGE_ORDER = ['not_reached', 'f1', 'f2', 'f3', 'f4', 'f5', 'won'];

const isOpen = (r) => r.bucket === 'Active / Other';
const isWon = (r) => r.bucket === 'Won';
const isGood = (r) => GOOD_SCORES.includes(r.admissionsScore || '');
const hotOrWarm = (r) => /hot|warm|deciding|exploring/i.test(r.admissionsConversationType || '');

/**
 * Lower = read first. null = not worth reading the conversation.
 * Open qualified deals closest to money first, then the rest of the
 * qualified pool, then won deals (what worked) and recent lost (why we lose).
 */
function candidatePriority(r, now = Date.now()) {
  const score = r.admissionsScore || '';
  if (JUNK_SCORES.includes(score)) return null;
  const g = stageGroup(r.stage);
  const age = r.date ? (now - Date.parse(r.date + 'T12:00:00Z')) / DAY : 999;
  if (isOpen(r)) {
    if (r.offerSentDate || g === 'f4' || g === 'f5') return 0;
    if (g === 'f3') return 1;
    if (isGood(r) && (g === 'f2' || hotOrWarm(r))) return 2;
    if (isGood(r)) return 3;
    if (g === 'f1' || g === 'f2' || hotOrWarm(r)) return 4;
    if (age <= 7) return 5;
    return null;
  }
  if (isWon(r)) return 6;
  const lostAt = r.lostDate ? Date.parse(String(r.lostDate).slice(0, 10) + 'T12:00:00Z') : null;
  if ((isGood(r) || hotOrWarm(r)) && lostAt && now - lostAt <= 120 * DAY) return 7;
  return null;
}

/** When to re-read a deal's conversation. */
function needsRefresh(r, intel, now = Date.now()) {
  if (!intel || !intel.fetchedAt) return true;
  const fetched = Date.parse(intel.fetchedAt);
  if (r.dealUpdatedAt && Date.parse(String(r.dealUpdatedAt).replace(' ', 'T')) > fetched) return true;
  // Contact notes don't bump the deal's mdate, so open deals are re-read daily.
  if (isOpen(r)) return now - fetched > 24 * 3600 * 1000;
  return now - fetched > 14 * DAY;
}

const stripHtml = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

const isoOf = (v) => {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d) ? null : d.toISOString();
};

/**
 * One timeline, newest first. Each entry: { at, kind, by, note }.
 * kind: note | contact_note | stage | owner | task | email | activity
 */
function buildTimeline({ dealNotes = [], contactNotes = [], activities = [], usersById = new Map(), stagesById = new Map() }) {
  const userName = (id) => {
    if (!id || String(id) === '0') return 'system';
    const u = usersById.get(String(id));
    return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || `User #${id}` : `User #${id}`;
  };
  const stageName = (id) => { const s = stagesById.get(String(id)); return s ? s.title : (id ? `Stage #${id}` : ''); };
  const out = [];
  const seenNotes = new Set();
  const pushNote = (n, kind) => {
    const text = stripHtml(n.note);
    if (!text) return;
    const key = text.slice(0, 120) + '|' + String(n.cdate || '').slice(0, 16);
    if (seenNotes.has(key)) return;
    seenNotes.add(key);
    out.push({ at: isoOf(n.cdate || n.mdate), kind, by: userName(n.userid || n.user), note: text.slice(0, 1500) });
  };
  dealNotes.forEach((n) => pushNote(n, 'note'));
  contactNotes.forEach((n) => pushNote(n, 'contact_note'));
  activities.forEach((a) => {
    const type = String(a.dataType || a.data_type || '').toLowerCase();
    const action = String(a.dataAction || a.data_action || '').toLowerCase();
    if (type === 'note') return; // already read from the notes endpoints
    const at = isoOf(a.cdate);
    const by = userName(a.userid);
    const oldIsStage = /^\d+$/.test(String(a.dataOldval || '')) && stagesById.has(String(a.dataOldval));
    if (/stage/.test(action) || (type === 'deal' && oldIsStage && !/owner|value|status/.test(action))) {
      out.push({ at, kind: 'stage', by, note: `${stageName(a.dataOldval) || '?'} → ${stageName(a.d_stageid) || '?'}`, stageId: a.d_stageid ? String(a.d_stageid) : null });
    } else if (/owner/.test(action)) {
      out.push({ at, kind: 'owner', by, note: `${userName(a.dataOldval)} → ${userName(a.dataId || a.owner)}` });
    } else if (type === 'task' || type === 'dealtask') {
      out.push({ at, kind: 'task', by, note: [action, stripHtml(a.dataOldval || a.note || '')].filter(Boolean).join(': ').slice(0, 300) });
    } else if (/email|mail/.test(type)) {
      out.push({ at, kind: 'email', by, note: [action, stripHtml(a.dataOldval || '')].filter(Boolean).join(': ').slice(0, 300) });
    } else {
      out.push({ at, kind: 'activity', by, note: [type, action].filter(Boolean).join(' / ').slice(0, 120) });
    }
  });
  return out.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at));
}

/** Hard numbers from the timeline: no AI, no guessing. */
function timelineMetrics(r, timeline, now = Date.now()) {
  const human = timeline.filter((e) => e.by !== 'system');
  const touches = human.filter((e) => e.kind === 'note' || e.kind === 'contact_note' || e.kind === 'task' || e.kind === 'email');
  const last = touches[0] || human[0] || null;
  const first = touches[touches.length - 1] || null;
  const created = r.date ? Date.parse(r.date + 'T12:00:00Z') : null;
  const stageChange = timeline.find((e) => e.kind === 'stage');
  const days = (iso) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : null);
  return {
    notes: timeline.filter((e) => e.kind === 'note' || e.kind === 'contact_note').length,
    touches: touches.length,
    touches7d: touches.filter((e) => now - Date.parse(e.at) <= 7 * DAY).length,
    lastTouchAt: last ? last.at : null,
    lastTouchBy: last ? last.by : null,
    daysSinceLastTouch: last ? days(last.at) : (created ? Math.floor((now - created) / DAY) : null),
    firstTouchHours: first && created ? Math.max(0, Math.round((Date.parse(first.at) - created) / 3600000)) : null,
    daysInStage: stageChange ? days(stageChange.at) : (created ? Math.floor((now - created) / DAY) : null),
    stageChanges: timeline.filter((e) => e.kind === 'stage').length,
  };
}

/** Fingerprint of what the AI would read, so a diagnosis is only redone when the conversation changed. */
function timelineHash(r, timeline) {
  const crypto = require('crypto');
  const basis = JSON.stringify([r.stage, r.bucket, r.admissionsScore, r.feedback, timeline.slice(0, 30).map((e) => [e.at, e.kind, e.note])]);
  return crypto.createHash('sha1').update(basis).digest('hex');
}

const median = (arr) => {
  const v = arr.filter((x) => x != null && !isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

module.exports = {
  GOOD_SCORES, JUNK_SCORES, STAGE_ORDER, stageGroup, candidatePriority, needsRefresh,
  buildTimeline, timelineMetrics, timelineHash, stripHtml, median, isOpen, isWon, isGood,
};
