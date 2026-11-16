'use strict';
// ---------------------------------------------------------------------------
// Social — Facebook and Instagram posts with today's metrics snapshot.
//   Post metrics are lifetime (cumulative) values as of the snapshot day.
//   FB views_paid is exact (is_from_ads breakdown of post_media_view).
//   IG views_paid is an estimate: total_views − views (includes views on Facebook).
// ---------------------------------------------------------------------------
const { GraphError } = require('./client');
const { today, addDays, ts, parseMeta } = require('../dates');

const num = (o, k) => (typeof o[k] === 'number' ? o[k] : null);
const short = (e) => String(e.graphMessage || e.message).slice(0, 80);
const cleanText = (s, n = 2000) => String(s || '').replace(/[ \t]+/g, ' ').trim().slice(0, n) || null;
const seconds = (ms, digits) => (ms == null ? null : Number((ms / 1000).toFixed(digits)));

/**
 * Asks for several metrics in one call; if Meta rejects one, asks one by one.
 * Returns {values: {metric: lifetimeValue}, errors: {metric: message}}.
 */
async function insights(cli, objId, metrics, token, extra = {}) {
  const values = {};
  const lifetime = new Set();
  const parse = (data) => (data || []).forEach((it) => {
    // Some metrics come twice (lifetime and day): lifetime wins.
    const vals = it.values || [];
    const v = vals.length ? vals[vals.length - 1].value : (it.total_value || {}).value;
    if (it.period === 'lifetime') { values[it.name] = v; lifetime.add(it.name); } else if (!lifetime.has(it.name) && !(it.name in values)) values[it.name] = v;
  });
  try {
    parse((await cli.get(`${objId}/insights`, { metric: metrics.join(','), ...extra }, token)).data);
    return { values, errors: {} };
  } catch (e) {
    if (!(e instanceof GraphError)) throw e;
    const errors = {};
    for (const m of metrics) {
      try { parse((await cli.get(`${objId}/insights`, { metric: m, ...extra }, token)).data); } catch (e2) {
        if (!(e2 instanceof GraphError)) throw e2;
        errors[m] = short(e2);
      }
    }
    return { values, errors };
  }
}

/** Lifetime value of a metric split by a 0/1 breakdown → [value0, value1]. */
async function split(cli, objId, metric, breakdown, token) {
  const data = (await cli.get(`${objId}/insights`, { metric, breakdown }, token)).data || [];
  let v0 = 0; let v1 = 0;
  data.filter((it) => it.period == null || it.period === 'lifetime').forEach((it) => (it.values || []).forEach((v) => {
    if (String(v[breakdown]) === '0') v0 += v.value || 0;
    else if (String(v[breakdown]) === '1') v1 += v.value || 0;
  }));
  return [v0, v1];
}

async function savePost(store, account, post) {
  const [row] = await store.upsert('posts', [{ account_id: account.id, ...post }]);
  return row.id;
}

// ---------------- Facebook ----------------
const FB_METRICS = ['post_media_view', 'post_total_media_view_unique', 'post_clicks', 'post_clicks_by_type',
  'post_reactions_by_type_total', 'post_video_views', 'post_video_avg_time_watched'];
const FB_POST_FIELDS = 'id,created_time,message,story,permalink_url,status_type,is_published,promotion_status,'
  + 'properties,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)';
const FB_FORMAT = { added_video: 'VIDEO', added_photos: 'PHOTO', shared_story: 'LINK', mobile_status_update: 'TEXT', created_event: 'EVENT' };
// Automatic page posts (new cover / profile picture) are not content.
const AUTOMATIC = /portada|foto del perfil|foto de perfil|cover photo|profile picture/i;

async function syncPostsFb(cli, store, account, token, from) {
  const until = addDays(today(), 1);
  const posts = (await cli.getAll(`${account.external_id}/posts`,
    { fields: FB_POST_FIELDS, limit: 100, since: ts(from), until: ts(until) }, token, 30))
    .filter((p) => !AUTOMATIC.test(p.story || ''));
  const day = today();
  const rows = [];
  let withErrors = 0;
  for (const p of posts) {
    const { values: m, errors } = await insights(cli, p.id, FB_METRICS, token);
    let organic = null; let paid = null; let followers = null;
    try { [organic, paid] = await split(cli, p.id, 'post_media_view', 'is_from_ads', token); } catch (e) { if (!(e instanceof GraphError)) throw e; errors.is_from_ads = short(e); }
    try { [, followers] = await split(cli, p.id, 'post_media_view', 'is_from_followers', token); } catch (e) { if (!(e instanceof GraphError)) throw e; errors.is_from_followers = short(e); }
    const reactions = ((p.reactions || {}).summary || {}).total_count ?? null;
    const comments = ((p.comments || {}).summary || {}).total_count ?? null;
    const shares = (p.shares || {}).count || 0;
    const postId = await savePost(store, account, {
      external_id: p.id, published_at: parseMeta(p.created_time).toISOString(),
      format: FB_FORMAT[p.status_type] || (p.status_type ? String(p.status_type).toUpperCase() : null),
      media_type: p.status_type || null, permalink: p.permalink_url || null, caption: cleanText(p.message),
      duration: ((p.properties || []).find((x) => x.name === 'Length') || {}).text || null,
      promotion_status: p.promotion_status || null, ad_active: p.promotion_status === 'active',
    });
    if (Object.keys(errors).length) withErrors++;
    rows.push({
      post_id: postId, day,
      metrics: {
        views: num(m, 'post_media_view'), views_organic: organic, views_paid: paid, views_followers: followers,
        reach: num(m, 'post_total_media_view_unique'), likes: reactions, comments, shares,
        interactions: (reactions || 0) + (comments || 0) + (shares || 0),
        clicks: num(m, 'post_clicks'), link_clicks: (m.post_clicks_by_type || {})['link clicks'] ?? null,
        video_views: num(m, 'post_video_views'), avg_watch_s: seconds(num(m, 'post_video_avg_time_watched'), 2),
      },
      extra: { reactions: m.post_reactions_by_type_total || {}, clicks_by_type: m.post_clicks_by_type || {}, errors },
    });
  }
  await store.upsert('post_metrics', rows);
  return { posts: posts.length, with_errors: withErrors };
}

// ---------------- Instagram ----------------
const IG_BASE = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'reposts',
  'total_views', 'total_likes', 'total_comments'];
const IG_EXTRA = { REELS: ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate'], FEED: ['profile_visits', 'follows'] };
const IG_MEDIA_FIELDS = 'id,timestamp,caption,media_type,media_product_type,permalink,like_count,comments_count,boost_ads_list';

/** Media published since `from` (manual paging: stops once out of the window). No stories, no ads. */
async function listMediaIg(cli, igId, from, fields = IG_MEDIA_FIELDS) {
  const limit = Date.parse(from + 'T00:00:00Z');
  const media = [];
  const params = { fields, limit: 50 };
  for (let i = 0; i < 40; i++) {
    const res = await cli.get(`${igId}/media`, params);
    const batch = res.data || [];
    media.push(...batch.filter((x) => parseMeta(x.timestamp).getTime() >= limit));
    const after = res.paging && res.paging.cursors && res.paging.cursors.after;
    if (!batch.length || parseMeta(batch[batch.length - 1].timestamp).getTime() < limit || !(res.paging && res.paging.next)) break;
    params.after = after;
  }
  return media.filter((x) => !['STORY', 'AD'].includes(x.media_product_type));
}

async function syncPostsIg(cli, store, account, from) {
  const media = await listMediaIg(cli, account.external_id, from);
  const day = today();
  const rows = [];
  let withErrors = 0;
  for (const x of media) {
    const type = x.media_product_type;
    const { values: m, errors } = await insights(cli, x.id, [...IG_BASE, ...(IG_EXTRA[type] || [])]);
    const views = num(m, 'views'); const total = num(m, 'total_views');
    const ads = ((x.boost_ads_list || {}).data) || [];
    const postId = await savePost(store, account, {
      external_id: x.id, published_at: parseMeta(x.timestamp).toISOString(),
      format: x.media_type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : type || null, media_type: x.media_type || null,
      permalink: x.permalink || null, caption: cleanText(x.caption), ad_active: ads.length > 0,
    });
    if (Object.keys(errors).length) withErrors++;
    rows.push({
      post_id: postId, day,
      metrics: {
        views: total ?? views, views_organic: views,
        views_paid: views != null && total != null ? Math.max(total - views, 0) : null,
        reach: num(m, 'reach'), likes: num(m, 'likes'), comments: num(m, 'comments'), shares: num(m, 'shares'),
        saves: num(m, 'saved'), reposts: num(m, 'reposts'), interactions: num(m, 'total_interactions'),
        likes_total: num(m, 'total_likes'), comments_total: num(m, 'total_comments'),
        avg_watch_s: seconds(num(m, 'ig_reels_avg_watch_time'), 2), total_watch_s: seconds(num(m, 'ig_reels_video_view_total_time'), 1),
        skip_rate: num(m, 'reels_skip_rate'), profile_visits: num(m, 'profile_visits'), follows: num(m, 'follows'),
      },
      extra: { active_ads: ads.map((a) => a.ad_id), errors },
    });
  }
  await store.upsert('post_metrics', rows);
  return { posts: media.length, with_errors: withErrors };
}

module.exports = { insights, split, syncPostsFb, syncPostsIg, listMediaIg };
