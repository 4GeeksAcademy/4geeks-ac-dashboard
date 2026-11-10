'use strict';
// ---------------------------------------------------------------------------
// Social — daily spend per ad (Marketing API) and the organic post each ad promotes.
//   IG → creative.source_instagram_media_id (the original post).
//   FB → creative.object_story_id / effective_object_story_id.
//   Ads with a brand-new creative (dark posts) don't match any published post.
// ---------------------------------------------------------------------------
const { GraphError } = require('./client');

const CREATIVE_FIELDS = 'creative{source_instagram_media_id,effective_instagram_media_id,object_story_id,effective_object_story_id}';

async function syncAds(cli, store, adAccount, from, to) {
  const rows = await cli.getAll(`${adAccount.id}/insights`, {
    level: 'ad', time_range: JSON.stringify({ since: from, until: to }), time_increment: 1, limit: 500,
    fields: 'ad_id,ad_name,campaign_name,spend,impressions,reach,clicks,account_currency',
  }, null, 50);
  const ids = [...new Set(rows.map((r) => r.ad_id))];
  const known = new Set(ids.length ? (await store.find('ads', { ad_id: ids })).map((a) => a.ad_id) : []);
  // The creative is read once per ad, the first time it shows up.
  const fresh = new Map();
  let noCreative = 0;
  for (const r of rows) {
    if (known.has(r.ad_id) || fresh.has(r.ad_id)) continue;
    let cr = {};
    try { cr = (await cli.get(r.ad_id, { fields: CREATIVE_FIELDS })).creative || {}; } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      noCreative++;
    }
    fresh.set(r.ad_id, {
      ad_id: r.ad_id, ad_account_id: adAccount.id, name: r.ad_name || null, campaign: r.campaign_name || null,
      ig_media_source: cr.source_instagram_media_id || null, ig_media_ad: cr.effective_instagram_media_id || null,
      fb_post: cr.object_story_id || cr.effective_object_story_id || null, fb_post_effective: cr.effective_object_story_id || null,
    });
  }
  await store.upsert('ads', [...fresh.values()]);
  if (rows.length && !adAccount.currency) await store.update('ad_accounts', { id: adAccount.id }, { currency: rows[0].account_currency || null });
  await store.upsert('ad_metrics', rows.map((r) => ({
    ad_id: r.ad_id, day: r.date_start, currency: r.account_currency || null, spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0), reach: Number(r.reach || 0), clicks: Number(r.clicks || 0),
  })));
  return { rows: rows.length, new_ads: fresh.size, no_creative: noCreative };
}

/** Sets post_id on the ads that promote a post we already have. */
async function linkAdsToPosts(store) {
  const pending = (await store.find('ads', { post_id: null })).filter((a) => a.ig_media_source || a.fb_post || a.fb_post_effective);
  if (!pending.length) return 0;
  const externalIds = [...new Set(pending.flatMap((a) => [a.ig_media_source, a.fb_post, a.fb_post_effective].filter(Boolean)))];
  const postByExternal = new Map((await store.find('posts', { external_id: externalIds })).map((p) => [p.external_id, p.id]));
  let linked = 0;
  for (const a of pending) {
    const postId = [a.ig_media_source, a.fb_post, a.fb_post_effective].map((x) => postByExternal.get(x)).find(Boolean);
    if (postId) { await store.update('ads', { ad_id: a.ad_id }, { post_id: postId }); linked++; }
  }
  return linked;
}

module.exports = { syncAds, linkAdsToPosts };
