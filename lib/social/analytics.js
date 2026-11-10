'use strict';
// ---------------------------------------------------------------------------
// Social — numbers for the screens, read from the social_* tables.
// Only accounts switched on are shown.
//
// Reading rules (same as Central RRSS):
//   - Post metrics are lifetime values: a post's numbers are its latest snapshot.
//   - Daily reach is never summed across days (the same person counts again):
//     the KPI is the average daily reach.
//   - A change vs the previous period is hidden when that period has far fewer
//     days with data (Meta keeps little history): the % would mislead.
// ---------------------------------------------------------------------------
const { today, addDays, startOfDay, daysBetween } = require('./dates');
const { UNATTRIBUTED } = require('./tiktok/ads');

// Daily account metrics that can be summed over a period.
const SUMMABLE = ['new_followers', 'unfollows', 'views', 'interactions', 'accounts_engaged', 'profile_visits', 'likes', 'comments', 'shares', 'saves'];
// KPI → the daily metric it comes from (to check both periods have comparable data).
const SOURCE_METRIC = {
  new_followers: 'new_followers', unfollows: 'unfollows', views: 'views', views_organic: 'views', views_paid: 'views',
  organic_share: 'views', avg_daily_reach: 'reach', interactions: 'interactions', accounts_engaged: 'accounts_engaged', profile_visits: 'profile_visits',
};
const MAX_DAYS = 731;

const ratio = (a, b) => (a != null && b ? Math.round((a / b) * 10000) / 10000 : null);
const iso = (d) => (d instanceof Date ? d.toISOString() : d);
const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Period from the query (default: the last 28 days) and the one it is compared with. */
function periods(q = {}) {
  const to = isDay(q.to) ? q.to : today();
  const from = isDay(q.from) ? q.from : addDays(to, -27);
  if (from > to) throw badRequest("'from' can't be after 'to'");
  if (daysBetween(from, to) > MAX_DAYS) throw badRequest('The longest period is 2 years');
  const len = daysBetween(from, to);
  const compare = q.compare === 'year' ? { from: addDays(from, -365), to: addDays(to, -365) }
    : q.compare === 'none' ? null : { from: addDays(from, -len), to: addDays(from, -1) };
  return { from, to, compare };
}

function createAnalytics(store) {
  async function account(id) {
    const [a] = await store.find('accounts', { id: Number(id), active: true });
    if (!a) throw Object.assign(new Error('Account not found or switched off'), { status: 404 });
    return a;
  }

  /** Posts published in [from, to] (team's days) with their latest snapshot. */
  async function postsWithLatest(accountIds, from, to) {
    const posts = await store.find('posts', { account_id: accountIds, published_at: { gte: startOfDay(from), lt: startOfDay(addDays(to, 1)) } });
    if (!posts.length) return [];
    const snaps = await store.find('post_metrics', { post_id: posts.map((p) => p.id) });
    const latest = new Map();
    snaps.forEach((s) => { const cur = latest.get(s.post_id); if (!cur || s.day > cur.day) latest.set(s.post_id, s); });
    return posts.map((p) => ({ ...p, published_at: iso(p.published_at), snapshot: latest.get(p.id) || null }));
  }

  async function kpis(acc, from, to) {
    const rows = await store.find('account_metrics', { account_id: acc.id, day: { gte: from, lte: to } });
    const plain = rows.filter((r) => r.breakdown === '');
    const sum = (metric, breakdown = '') => {
      const vals = rows.filter((r) => r.metric === metric && r.breakdown === breakdown && r.value != null);
      return vals.length ? vals.reduce((a, r) => a + r.value, 0) : null;
    };
    const reach = plain.filter((r) => r.metric === 'reach' && r.value != null);
    // Followers at the end of a day: the latest 'followers' value on or before it.
    const followersRows = await store.find('account_metrics', { account_id: acc.id, metric: 'followers', breakdown: '', day: { lte: to } });
    const followersAt = (day) => followersRows.filter((r) => r.day <= day && r.value != null).sort((a, b) => (a.day < b.day ? 1 : -1))[0]?.value ?? null;
    const end = followersAt(to); const start = followersAt(addDays(from, -1));
    const posts = await postsWithLatest([acc.id], from, to);
    const rates = posts.map((p) => p.snapshot && ratio(p.snapshot.metrics.interactions, p.snapshot.metrics.reach)).filter((x) => x != null);
    const organic = sum('views', 'organic'); const paid = sum('views', 'paid');
    const coverage = {};
    plain.forEach((r) => { (coverage[r.metric] = coverage[r.metric] || new Set()).add(r.day); });
    const out = Object.fromEntries(SUMMABLE.map((m) => [m, sum(m)]));
    return {
      ...out,
      followers: end,
      followers_growth: end != null && start != null ? end - start : null,
      views_organic: organic, views_paid: paid,
      organic_share: organic != null ? ratio(organic, (organic || 0) + (paid || 0)) : null,
      avg_daily_reach: reach.length ? Math.round(reach.reduce((a, r) => a + r.value, 0) / reach.length) : null,
      posts: posts.length,
      avg_post_engagement: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10000) / 10000 : null,
      _coverage: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, v.size])),
    };
  }

  /** {kpi: {current, previous, change_pct}} */
  function compareKpis(cur, prev) {
    const cc = cur._coverage; const pc = (prev && prev._coverage) || {};
    const out = {};
    Object.entries(cur).forEach(([k, v]) => {
      if (k === '_coverage') return;
      let p = prev ? prev[k] : null;
      const m = SOURCE_METRIC[k];
      if (m && (pc[m] || 0) < 0.8 * (cc[m] || 0)) p = null;
      out[k] = { current: v, previous: p ?? null, change_pct: v != null && p ? Math.round(((v - p) / Math.abs(p)) * 1000) / 10 : null };
    });
    return out;
  }

  return {
    periods,

    /** Every account switched on, side by side, with totals. */
    async overview(q) {
      const { from, to } = periods(q);
      const [accounts, sites] = await Promise.all([store.find('accounts', { active: true }, { order: 'id' }), store.find('sites', {})]);
      const site = new Map(sites.map((s) => [s.id, s]));
      const rows = [];
      for (const a of accounts) {
        const k = await kpis(a, from, to);
        const s = site.get(a.site_id);
        rows.push({
          id: a.id, network: a.network, name: a.name, username: a.username, site: s ? s.name : null, market: s ? s.market : null,
          followers: k.followers, followers_growth: k.followers_growth, new_followers: k.new_followers, views: k.views,
          organic_share: k.organic_share, interactions: k.interactions, posts: k.posts, avg_post_engagement: k.avg_post_engagement,
        });
      }
      const total = (key) => { const v = rows.map((r) => r[key]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
      return { period: { from, to }, accounts: rows, totals: { followers: total('followers'), followers_growth: total('followers_growth'), views: total('views'), interactions: total('interactions'), posts: total('posts') } };
    },

    async accountKpis(id, q) {
      const acc = await account(id);
      const p = periods(q);
      const cur = await kpis(acc, p.from, p.to);
      const prev = p.compare ? await kpis(acc, p.compare.from, p.compare.to) : null;
      return { account_id: acc.id, network: acc.network, period: { from: p.from, to: p.to }, compare: p.compare, kpis: compareKpis(cur, prev) };
    },

    /** Daily series of some account metrics: [{day, metric, breakdown, value}]. */
    async series(id, q) {
      const acc = await account(id);
      const { from, to } = periods(q);
      const metrics = String(q.metrics || '').split(',').map((m) => m.trim()).filter(Boolean).slice(0, 12);
      if (!metrics.length) throw badRequest('metrics is required (comma separated)');
      const rows = await store.find('account_metrics', { account_id: acc.id, metric: metrics, day: { gte: from, lte: to } });
      return rows.map(({ day, metric, breakdown, value }) => ({ day, metric, breakdown, value })).sort((a, b) => (a.day < b.day ? -1 : 1));
    },

    /** Posts of the period with their latest metrics, rates and the spend of the ads promoting them. */
    async posts(id, q) {
      const acc = await account(id);
      const { from, to } = periods(q);
      let posts = await postsWithLatest([acc.id], from, to);
      if (q.format) posts = posts.filter((p) => p.format === q.format);
      const ads = posts.length ? await store.find('ads', { post_id: posts.map((p) => p.id) }) : [];
      const spend = new Map();
      if (ads.length) {
        const metrics = await store.find('ad_metrics', { ad_id: ads.map((a) => a.ad_id) });
        const postOf = new Map(ads.map((a) => [a.ad_id, a.post_id]));
        metrics.forEach((m) => {
          const x = spend.get(postOf.get(m.ad_id)) || { spend: {}, impressions: 0, ads: new Set() };
          x.spend[m.currency || '?'] = Math.round(((x.spend[m.currency || '?'] || 0) + m.spend) * 100) / 100;
          x.impressions += m.impressions; x.ads.add(m.ad_id);
          spend.set(postOf.get(m.ad_id), x);
        });
      }
      return posts.sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).slice(0, 500).map((p) => {
        const m = p.snapshot ? p.snapshot.metrics : null;
        const s = spend.get(p.id);
        return {
          id: p.id, external_id: p.external_id, published_at: p.published_at, format: p.format, permalink: p.permalink,
          caption: (p.caption || '').slice(0, 280), ad_active: p.ad_active, snapshot_day: p.snapshot ? p.snapshot.day : null,
          metrics: m && {
            ...m, engagement_rate: ratio(m.interactions, m.reach), save_rate: ratio(m.saves, m.reach),
            share_rate: ratio(m.shares, m.reach), paid_share: ratio(m.views_paid, m.views),
          },
          ads: s ? { spend: s.spend, impressions: s.impressions, count: s.ads.size } : null,
        };
      });
    },

    /** Day-by-day snapshots of one post (cumulative). */
    async postSeries(postId) {
      const [post] = await store.find('posts', { id: Number(postId) });
      if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
      await account(post.account_id);
      const rows = await store.find('post_metrics', { post_id: post.id }, { order: 'day' });
      return rows.map((r) => ({ day: r.day, ...r.metrics }));
    },

    /**
     * TikTok ads of one account: KPIs vs the comparison period, daily series, the posts used in ads
     * and who signs them. Unattributed campaign spend counts in totals, never per post or identity.
     */
    async tiktokAds(id, q) {
      const acc = await account(id);
      if (acc.platform !== 'tiktok') throw badRequest('Only for TikTok accounts');
      const p = periods(q);
      const [adAcc] = await store.find('ad_accounts', { id: acc.external_id });
      const ads = await store.find('ads', { ad_account_id: acc.external_id });
      const adById = new Map(ads.map((a) => [a.ad_id, a]));
      const metricsIn = async (from, to) => (ads.length ? store.find('ad_metrics', { ad_id: ads.map((a) => a.ad_id), day: { gte: from, lte: to } }) : []);
      const KEYS = ['spend', 'impressions', 'clicks', 'plays', 'likes', 'comments', 'shares', 'follows'];
      const totals = (rows) => {
        const t = Object.fromEntries(KEYS.map((k) => [k, rows.length ? 0 : null]));
        rows.forEach((r) => KEYS.forEach((k) => { t[k] += Number(r[k] || 0); }));
        if (t.spend != null) t.spend = Math.round(t.spend * 100) / 100;
        t.ads = new Set(rows.filter((r) => r.spend > 0 && (adById.get(r.ad_id) || {}).identity_type !== UNATTRIBUTED).map((r) => r.ad_id)).size;
        t.ctr = ratio(t.clicks, t.impressions);
        t.cpm = t.spend != null && t.impressions ? Math.round((t.spend / t.impressions) * 100000) / 100 : null;
        t.cost_per_play = t.spend && t.plays ? Math.round((t.spend / t.plays) * 10000) / 10000 : null;
        return t;
      };
      const cur = await metricsIn(p.from, p.to);
      const prev = p.compare ? await metricsIn(p.compare.from, p.compare.to) : [];
      // Same rule as the Meta KPIs: no change when the earlier period has far fewer days loaded.
      const daysWith = (rows) => new Set(rows.map((r) => r.day)).size;
      const comparable = p.compare && daysWith(prev) >= 0.8 * daysWith(cur);
      const now = totals(cur); const before = comparable ? totals(prev) : {};
      const kpis = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, { current: v, previous: before[k] ?? null, change_pct: v != null && before[k] ? Math.round(((v - before[k]) / Math.abs(before[k])) * 1000) / 10 : null }]));
      const group = (keyOf) => {
        const g = new Map();
        cur.forEach((r) => { const k = keyOf(r); if (k == null) return; (g.get(k) || g.set(k, []).get(k)).push(r); });
        return g;
      };
      const series = [...group((r) => r.day)].map(([day, rows]) => ({ day, ...totals(rows) })).sort((a, b) => (a.day < b.day ? -1 : 1));
      const attributed = (r) => (adById.get(r.ad_id) || {}).identity_type !== UNATTRIBUTED;
      const posts = [...group((r) => (attributed(r) && r.impressions > 0 ? (adById.get(r.ad_id) || {}).tt_item_id || null : null))].map(([item, rows]) => {
        const days = rows.map((r) => r.day).sort();
        const sign = rows.map((r) => adById.get(r.ad_id)).find((a) => a && a.identity);
        return { item_id: item, identity: sign ? sign.identity : null, first_day: days[0], last_day: days[days.length - 1], ...totals(rows), ads: new Set(rows.map((r) => r.ad_id)).size };
      }).sort((a, b) => b.spend - a.spend).slice(0, 300);
      const identities = [...group((r) => { const a = adById.get(r.ad_id); return a && attributed(r) && r.impressions > 0 ? `${a.identity || ''}|${a.identity_type || ''}` : null; })]
        .map(([k, rows]) => ({ identity: k.split('|')[0] || null, type: k.split('|')[1] || null, ...totals(rows) })).sort((a, b) => b.spend - a.spend);
      const withSpend = (await store.find('ad_metrics', { ad_id: ads.map((a) => a.ad_id), spend: { gt: 0 } })).map((r) => r.day).sort();
      return {
        account_id: acc.id, currency: adAcc ? adAcc.currency : null, last_spend_day: withSpend.length ? withSpend[withSpend.length - 1] : null,
        period: { from: p.from, to: p.to }, compare: p.compare, kpis, series, posts, identities,
      };
    },

    /** Latest follower demographics snapshot (Instagram). */
    async demographics(id) {
      const acc = await account(id);
      const rows = await store.find('demographics', { account_id: acc.id });
      if (!rows.length) return { day: null, dimensions: {} };
      const day = rows.reduce((a, r) => (r.day > a ? r.day : a), rows[0].day);
      const dimensions = {};
      rows.filter((r) => r.day === day).sort((a, b) => b.value - a.value).forEach((r) => { (dimensions[r.dimension] = dimensions[r.dimension] || []).push({ key: r.key, value: r.value }); });
      return { day, dimensions };
    },
  };
}

module.exports = { createAnalytics, periods };
