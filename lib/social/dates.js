'use strict';
// ---------------------------------------------------------------------------
// Social — dates. Days are 'YYYY-MM-DD' strings in the team's time zone
// (SOCIAL_TZ, default Europe/Madrid, the same day boundary Central RRSS used).
// ---------------------------------------------------------------------------
const TZ = process.env.SOCIAL_TZ || 'Europe/Madrid';

/** Today in the team's time zone. */
function today(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}
function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Midnight UTC of a day, in seconds (Meta's since / until). */
function ts(day) {
  return Math.floor(Date.parse(day + 'T00:00:00Z') / 1000);
}
/** '2026-09-15T09:31:01+0000' → Date. */
function parseMeta(s) {
  return new Date(String(s).slice(0, 19) + 'Z');
}
/** Meta labels daily values with end_time = start of the next day. */
function dayOfEndTime(s) {
  return new Date(parseMeta(s).getTime() - 12 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Local hour and minute in the team's time zone (for the scheduler). */
function localClock(now = new Date()) {
  const [h, m] = now.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false }).split(':').map(Number);
  return { hour: h % 24, minute: m };
}
/** [from, to] split into chunks of at most `maxDays` (both ends included). */
function* ranges(from, to, maxDays) {
  let start = from;
  while (start <= to) {
    const end = addDays(start, maxDays - 1) < to ? addDays(start, maxDays - 1) : to;
    yield [start, end];
    start = addDays(end, 1);
  }
}

module.exports = { TZ, today, addDays, ts, parseMeta, dayOfEndTime, localClock, ranges };
