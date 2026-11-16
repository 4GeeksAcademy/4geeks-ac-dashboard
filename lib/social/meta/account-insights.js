'use strict';
// ---------------------------------------------------------------------------
// Social — daily account metrics (Facebook page, Instagram profile) and
// Instagram follower demographics.
//   FB page_media_view includes ads; split with is_from_ads. page_follows is the running TOTAL.
//   IG daily reach can't be summed across days (the same person counts again).
//   IG follower_count = gross new followers per day; only the last 30 days exist.
//   IG views/likes/… per account only come with metric_type=total_value → asked day by day.
// Metric names stored: followers, new_followers, unfollows, views, reach, interactions,
// accounts_engaged, profile_visits, likes, comments, shares, saves.
// ---------------------------------------------------------------------------
const { GraphError } = require('./client');
const { today, addDays, ts, dayOfEndTime, ranges } = require('../dates');

const short = (e) => String(e.graphMessage || e.message).slice(0, 100);
const row = (account, day, metric, value, breakdown = '') => ({
  account_id: account.id, day, metric, breakdown, value: typeof value === 'number' ? value : null,
});

/** Saves rows; if a metric comes twice for the same day, the last one wins. */
async function save(store, rows) {
  const unique = new Map(rows.map((r) => [`${r.day}|${r.metric}|${r.breakdown}`, r]));
  await store.upsert('account_metrics', [...unique.values()]);
}
async function safe(errors, key, fn) {
  try { return await fn(); } catch (e) {
    if (!(e instanceof GraphError)) throw e;
    errors[key] = short(e);
    return null;
  }
}

// ---------------- Facebook ----------------
const FB_DAILY = {
  page_total_media_view_unique: 'reach',
  page_post_engagements: 'interactions',
  page_follows: 'followers',
  page_daily_follows_unique: 'new_followers',
  page_daily_unfollows_unique: 'unfollows',
};

async function syncAccountFb(cli, store, account, token, from, to) {
  const rows = [];
  const errors = {};
  for (const [start, end] of ranges(from, to, 90)) {
    const range = { period: 'day', since: ts(start), until: ts(addDays(end, 1)) };
    // Views split into organic / paid.
    const views = await safe(errors, 'page_media_view', () => cli.get(`${account.external_id}/insights`, { metric: 'page_media_view', breakdown: 'is_from_ads', ...range }, token));
    if (views) {
      const byDay = {};
      (views.data || []).forEach((it) => (it.values || []).forEach((v) => {
        const key = { 0: 'organic', 1: 'paid' }[String(v.is_from_ads)];
        if (!key) return;
        const d = dayOfEndTime(v.end_time);
        byDay[d] = byDay[d] || { organic: 0, paid: 0 };
        byDay[d][key] += v.value || 0;
      }));
      Object.entries(byDay).forEach(([d, x]) => rows.push(row(account, d, 'views', x.organic, 'organic'), row(account, d, 'views', x.paid, 'paid'), row(account, d, 'views', x.organic + x.paid)));
    }
    for (const [metric, name] of Object.entries(FB_DAILY)) {
      const res = await safe(errors, metric, () => cli.get(`${account.external_id}/insights`, { metric, ...range }, token));
      if (res) (res.data || []).forEach((it) => (it.values || []).forEach((v) => rows.push(row(account, dayOfEndTime(v.end_time), name, v.value))));
    }
  }
  // Today's snapshot: current followers.
  const info = await safe(errors, 'followers_count', () => cli.get(account.external_id, { fields: 'followers_count,fan_count' }, token));
  if (info && info.followers_count != null) rows.push(row(account, today(), 'followers', info.followers_count));
  await save(store, rows);
  return { rows: rows.length, errors };
}

// ---------------- Instagram ----------------
const IG_SERIES = { reach: 'reach', follower_count: 'new_followers' };
const IG_TOTALS = {
  views: 'views', accounts_engaged: 'accounts_engaged', total_interactions: 'interactions', profile_views: 'profile_visits',
  likes: 'likes', comments: 'comments', shares: 'shares', saves: 'saves',
};

async function syncAccountIg(cli, store, account, from, to) {
  const rows = [];
  const errors = {};
  const ig = account.external_id;
  const followerCountFrom = addDays(today(), -30); // follower_count only exists for the last 30 days
  for (const [start, end] of ranges(from, to, 30)) {
    const range = { period: 'day', since: ts(start), until: ts(addDays(end, 1)) };
    for (const [metric, name] of Object.entries(IG_SERIES)) {
      if (metric === 'follower_count' && end < followerCountFrom) continue;
      const res = await safe(errors, metric, () => cli.get(`${ig}/insights`, { metric, ...range }));
      if (res) (res.data || []).forEach((it) => (it.values || []).forEach((v) => rows.push(row(account, dayOfEndTime(v.end_time), name, v.value))));
    }
  }
  // Day totals (one call per day; one per metric if Meta rejects any).
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const params = { metric: Object.keys(IG_TOTALS).join(','), metric_type: 'total_value', period: 'day', since: ts(d), until: ts(addDays(d, 1)) };
    let data;
    try { data = (await cli.get(`${ig}/insights`, params)).data || []; } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      data = [];
      for (const m of Object.keys(IG_TOTALS)) {
        const res = await safe(errors, m, () => cli.get(`${ig}/insights`, { ...params, metric: m }));
        if (res) data.push(...(res.data || []));
      }
    }
    data.forEach((it) => { if (IG_TOTALS[it.name]) rows.push(row(account, d, IG_TOTALS[it.name], (it.total_value || {}).value)); });
  }
  const info = await safe(errors, 'followers_count', () => cli.get(ig, { fields: 'followers_count,follows_count,media_count' }));
  if (info && info.followers_count != null) rows.push(row(account, today(), 'followers', info.followers_count));
  await save(store, rows);
  return { rows: rows.length, errors };
}

// ---------------- Demographics (Instagram) ----------------
const DEMOGRAPHICS = { 'age,gender': 'age_gender', country: 'country', city: 'city' };
// Meta has changed the `timeframe` parameter several times: try each variant.
const TIMEFRAMES = [null, 'this_month', 'last_90_days', 'last_30_days'];

async function syncDemographicsIg(cli, store, account) {
  const rows = [];
  const errors = {};
  const day = today();
  for (const [breakdown, dimension] of Object.entries(DEMOGRAPHICS)) {
    let data = null; let last = null;
    for (const tf of TIMEFRAMES) {
      const params = { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown, ...(tf ? { timeframe: tf } : {}) };
      try { data = (await cli.get(`${account.external_id}/insights`, params)).data || []; break; } catch (e) {
        if (!(e instanceof GraphError)) throw e;
        last = e;
      }
    }
    if (!data) { errors[dimension] = last ? short(last) : 'no data'; continue; }
    data.forEach((it) => ((it.total_value || {}).breakdowns || []).forEach((b) => (b.results || []).forEach((r) => rows.push({
      account_id: account.id, day, dimension, key: (r.dimension_values || []).join('|').slice(0, 100), value: Math.round(r.value || 0),
    }))));
  }
  await store.upsert('demographics', rows);
  return { rows: rows.length, errors };
}

module.exports = { syncAccountFb, syncAccountIg, syncDemographicsIg };
