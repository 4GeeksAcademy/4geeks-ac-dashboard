'use strict';
// ---------------------------------------------------------------------------
// Social → Social calendar (lib/hub). Fills in what the team used to type by hand,
// through the Hub store's own API (list / update / upsert); lib/hub is not changed.
//
//   1. Calendar posts with a post_url: results.views / likes / comments / saves / shares
//      come from the matching Meta post (latest snapshot). `dms` is never touched and
//      `follows` only when empty: Meta doesn't give those per post (or not always).
//   2. Weekly account metrics: one item per calendar account and complete week
//      (Monday–Sunday, like the calendar, with all 7 days of data), id
//      `meta-<account>-<week>`. Items typed by hand (any other id) are never changed.
//      Followers = the latest snapshot up to the week's Sunday (Instagram only gives
//      today's count, so older weeks stay empty).
//
// Calendar account → Meta account: same network and @handle; if the calendar account
// has no handle, the Meta account of that network whose site has the same market.
// ---------------------------------------------------------------------------
const { today, addDays } = require('./dates');
const HUB_DEFAULTS = require('../hub/defaults');

const RESULT_KEYS = ['views', 'likes', 'comments', 'saves', 'shares'];
const WEEKS_BACK = 8;
const BY = 'meta sync';

/** A comparable key for a post URL: the Instagram shortcode, or the URL without query / www / trailing slash. */
function postKey(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const ig = s.match(/instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return 'ig:' + ig[1];
  try {
    const u = new URL(s);
    return (u.hostname.replace(/^(www|m|web)\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch (e) { return null; }
}

/** Monday of the week of `day` (YYYY-MM-DD). */
function weekStart(day) {
  const wd = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return addDays(day, -wd);
}

async function fillCalendar(store, hubStore, { now } = {}) {
  // Same rule as lib/hub/routes.js settings(): saved accounts, else the defaults.
  const settings = await hubStore.get('settings', 'main');
  const calendarAccounts = (settings && settings.accounts) || HUB_DEFAULTS.DEFAULT_SETTINGS.accounts;
  const [accounts, sites] = await Promise.all([store.find('accounts', { platform: 'meta', active: true }), store.find('sites', {})]);
  const marketOf = new Map(sites.map((s) => [s.id, s.market]));

  // Calendar account key → Meta account.
  const metaFor = new Map();
  calendarAccounts.forEach((c) => {
    const handle = String(c.handle || '').replace(/^@/, '').toLowerCase();
    const sameNet = accounts.filter((a) => a.network === c.channel);
    const m = (handle && sameNet.find((a) => (a.username || a.name || '').toLowerCase() === handle))
      || (!handle && sameNet.find((a) => marketOf.get(a.site_id) === c.market));
    if (m) metaFor.set(c.key, m);
  });

  // ---- 1. post results ----
  const calendarPosts = (await hubStore.list('post')).filter((p) => postKey(p.post_url));
  let postsFilled = 0;
  if (calendarPosts.length && accounts.length) {
    const metaPosts = await store.find('posts', { account_id: accounts.map((a) => a.id) });
    const byKey = new Map(metaPosts.map((p) => [postKey(p.permalink), p]).filter(([k]) => k));
    const wanted = calendarPosts.map((p) => [p, byKey.get(postKey(p.post_url))]).filter(([, m]) => m);
    const snaps = wanted.length ? await store.find('post_metrics', { post_id: wanted.map(([, m]) => m.id) }) : [];
    const latest = new Map();
    snaps.forEach((s) => { const cur = latest.get(s.post_id); if (!cur || s.day > cur.day) latest.set(s.post_id, s); });
    for (const [p, m] of wanted) {
      const snap = latest.get(m.id);
      if (!snap) continue;
      const x = snap.metrics;
      const results = { ...(p.results || {}) };
      RESULT_KEYS.forEach((k) => { if (x[k] != null) results[k] = x[k]; });
      if (results.follows == null && x.follows != null) results.follows = x.follows;
      const changed = RESULT_KEYS.some((k) => results[k] !== (p.results || {})[k]) || results.follows !== (p.results || {}).follows;
      if (!changed && p.results_synced_day === snap.day) continue;
      await hubStore.update('post', p.id, { results, results_source: 'meta', results_synced_day: snap.day }, BY);
      postsFilled++;
    }
  }

  // ---- 2. weekly account metrics (complete weeks only) ----
  const lastMonday = weekStart(addDays(today(now), -7));
  const weeks = Array.from({ length: WEEKS_BACK }, (_, i) => addDays(lastMonday, -7 * i));
  let weeksFilled = 0;
  const saved = new Map((await hubStore.list('metric')).map((m) => [m.id, m]));
  for (const [key, acc] of metaFor) {
    const rows = await store.find('account_metrics', { account_id: acc.id, breakdown: '', day: { gte: weeks[weeks.length - 1], lte: addDays(lastMonday, 6) } });
    const followers = await store.find('account_metrics', { account_id: acc.id, metric: 'followers', breakdown: '' });
    const posts = await store.find('posts', { account_id: acc.id });
    const snaps = posts.length ? await store.find('post_metrics', { post_id: posts.map((p) => p.id) }) : [];
    const views = new Map();
    snaps.forEach((s) => { const cur = views.get(s.post_id); if (!cur || s.day > cur.day) views.set(s.post_id, s); });
    for (const ws of weeks) {
      const we = addDays(ws, 6);
      const inWeek = rows.filter((r) => r.day >= ws && r.day <= we);
      // Only weeks with all 7 days of views: a partial week (before the first load) would mislead.
      if (new Set(inWeek.filter((r) => r.metric === 'views').map((r) => r.day)).size < 7) continue;
      const sum = (m) => { const v = inWeek.filter((r) => r.metric === m && r.value != null); return v.length ? Math.round(v.reduce((a, r) => a + r.value, 0)) : null; };
      const fol = followers.filter((r) => r.day <= we && r.value != null).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
      const top = posts.filter((p) => { const d = new Date(p.published_at).toISOString().slice(0, 10); return d >= ws && d <= we; })
        .map((p) => ({ p, v: (views.get(p.id) || { metrics: {} }).metrics.views || 0 })).sort((a, b) => b.v - a.v)[0];
      const id = `meta-${key}-${ws}`;
      const item = {
        account: key, week_start: ws, source: 'meta sync',
        followers: fol ? Math.round(fol.value) : null, views: sum('views'), interactions: sum('interactions'),
        accounts_engaged: sum('accounts_engaged'), profile_visits: sum('profile_visits'),
        top_post: top ? `${(top.p.caption || top.p.format || '').replace(/\s+/g, ' ').trim().slice(0, 80)} — ${top.v.toLocaleString('en-US')} views` : null,
      };
      // Write only when something changed, so the calendar's "last updated" stays meaningful.
      const cur = saved.get(id);
      if (cur && Object.keys(item).every((k) => cur[k] === item[k])) continue;
      await hubStore.upsert('metric', id, item, BY);
      weeksFilled++;
    }
  }
  return { accounts_matched: [...metaFor.keys()], posts_filled: postsFilled, weeks_filled: weeksFilled };
}

module.exports = { fillCalendar, postKey, weekStart };
