'use strict';
// ---------------------------------------------------------------------------
// Social — TikTok ad accounts, their ads and daily spend per ad (Marketing API).
//   - Each ad account is also an account (network 'tiktok') so it shows in Analytics
//     by site. It starts off, like any new account.
//   - Each ad keeps the TikTok post it uses (tt_item_id) and who signs it (identity:
//     the brand account, one authorised through Business Center, or a Spark Ads creator).
//   - The daily report per ad takes at most 30 days per call: longer ranges are chunked.
//   - TikTok doesn't spread all of some campaigns' spend across their ads. The gap per
//     campaign and day is stored as an "Unattributed" ad (ad_id 'c' + campaign_id) so
//     totals match TikTok; per-post numbers only use what is attributed.
// ---------------------------------------------------------------------------
const D = require('../defaults');
const { ranges } = require('../dates');

const AD_FIELDS = ['ad_id', 'ad_name', 'campaign_name', 'identity_type', 'display_name', 'tiktok_item_id'];
const METRICS = ['spend', 'impressions', 'reach', 'clicks', 'video_play_actions', 'likes', 'comments', 'shares', 'follows'];
const UNATTRIBUTED = 'UNATTRIBUTED'; // identity_type of the ad that holds spend not attributed to any ad
const SUMMABLE = ['spend', 'impressions', 'clicks', 'plays', 'likes', 'comments', 'shares', 'follows'];

const int = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && v !== '' && v != null ? n : null; };

/** Creates or updates the ad accounts the token can see. A site an admin changed is kept. */
async function discover(cli, store) {
  const list = (await cli.get('oauth2/advertiser/get/', { app_id: cli.appId, secret: cli.secret })).list || [];
  const ids = list.map((a) => a.advertiser_id);
  const info = ids.length ? Object.fromEntries(((await cli.get('advertiser/info/', { advertiser_ids: ids, fields: ['advertiser_id', 'name', 'currency'] })).list || []).map((a) => [a.advertiser_id, a])) : {};
  const siteId = Object.fromEntries((await store.find('sites', {})).map((s) => [s.slug, s.id]));
  const created = [];
  for (const a of list) {
    const id = a.advertiser_id;
    const name = (info[id] || {}).name || a.advertiser_name || id;
    const site = siteId[D.SITE_BY_TIKTOK_ADVERTISER[id]] || null;
    const [adAcc] = await store.find('ad_accounts', { id });
    if (adAcc) await store.update('ad_accounts', { id }, { name, currency: (info[id] || {}).currency || adAcc.currency });
    else await store.insert('ad_accounts', { id, platform: 'tiktok', name, currency: (info[id] || {}).currency || null, site_id: site, active: true });
    const [acc] = await store.find('accounts', { network: 'tiktok', external_id: id });
    if (acc) await store.update('accounts', { id: acc.id }, { name });
    else { await store.insert('accounts', { platform: 'tiktok', network: 'tiktok', external_id: id, name, username: null, site_id: site, page_id: null, active: false }); created.push(name); }
  }
  return { ad_accounts: list.length, created };
}

function row(adId, f, currency) {
  const d = f.dimensions || {}; const m = f.metrics || {};
  return {
    ad_id: adId, day: String(d.stat_time_day).slice(0, 10), currency, spend: Number(m.spend || 0),
    impressions: int(m.impressions) || 0, reach: int(m.reach) || 0, clicks: int(m.clicks) || 0,
    plays: int(m.video_play_actions), likes: int(m.likes), comments: int(m.comments), shares: int(m.shares), follows: int(m.follows),
  };
}

const report = (cli, adAcc, level, dimension, extra, from, to) => cli.pages('report/integrated/get/', {
  advertiser_id: adAcc.id, report_type: 'BASIC', data_level: level, dimensions: [dimension, 'stat_time_day'],
  metrics: [...METRICS, ...extra], start_date: from, end_date: to,
});

/** Every ad of the account (for its post and identity) and daily metrics in [from, to], plus unattributed campaign spend. */
async function syncAds(cli, store, adAcc, from, to) {
  const ads = (await cli.pages('ad/get/', { advertiser_id: adAcc.id, fields: AD_FIELDS })).map((a) => ({
    ad_id: String(a.ad_id), ad_account_id: adAcc.id, name: a.ad_name || null, campaign: a.campaign_name || null,
    tt_item_id: a.tiktok_item_id || null, identity: a.display_name || null, identity_type: a.identity_type || null,
  }));
  const metrics = []; const gaps = new Map(); const campaigns = {};
  for (const [start, end] of ranges(from, to, 30)) {
    for (const f of await report(cli, adAcc, 'AUCTION_CAMPAIGN', 'campaign_id', ['campaign_name'], start, end)) {
      const cid = String(f.dimensions.campaign_id);
      campaigns[cid] = (f.metrics || {}).campaign_name;
      const r = row(`c${cid}`, f, adAcc.currency);
      gaps.set(`${cid}|${r.day}`, r);
    }
    for (const f of await report(cli, adAcc, 'AUCTION_AD', 'ad_id', ['campaign_id'], start, end)) {
      const m = row(String(f.dimensions.ad_id), f, adAcc.currency);
      metrics.push(m);
      const gap = gaps.get(`${(f.metrics || {}).campaign_id}|${m.day}`);
      if (gap) SUMMABLE.forEach((k) => { gap[k] = (gap[k] || 0) - (m[k] || 0); });
    }
  }
  const unattributed = [...gaps.values()].filter((r) => r.spend > 0.005 || r.impressions > 0).map((r) => {
    const out = { ...r, spend: Math.round(r.spend * 100) / 100, reach: 0 }; // reach is not summable: not subtracted
    SUMMABLE.slice(1).forEach((k) => { out[k] = Math.max(out[k] || 0, 0); });
    return out;
  });
  await store.upsert('ads', ads);
  // Deleted ads (no longer in ad/get/) with spend in the range: kept so the spend isn't lost.
  const known = new Set(ads.map((a) => a.ad_id));
  const deleted = [...new Set(metrics.map((m) => m.ad_id))].filter((id) => !known.has(id));
  const stored = new Set(deleted.length ? (await store.find('ads', { ad_id: deleted })).map((a) => a.ad_id) : []);
  await store.upsert('ads', deleted.filter((id) => !stored.has(id)).map((id) => ({ ad_id: id, ad_account_id: adAcc.id })));
  await store.upsert('ads', [...new Set(unattributed.map((r) => r.ad_id))].map((id) => ({
    ad_id: id, ad_account_id: adAcc.id, name: 'Unattributed (campaign spend not split by ad)', campaign: campaigns[id.slice(1)] || null, identity_type: UNATTRIBUTED,
  })));
  // The gap is recomputed for the whole range, so an old one never stays if TikTok corrects it.
  const oldGapAds = (await store.find('ads', { ad_account_id: adAcc.id, identity_type: UNATTRIBUTED })).map((a) => a.ad_id);
  if (oldGapAds.length) await store.remove('ad_metrics', { ad_id: oldGapAds, day: { gte: from, lte: to } });
  await store.upsert('ad_metrics', [...metrics, ...unattributed]);
  return {
    ads: ads.length, rows: metrics.length, with_spend: metrics.filter((m) => m.spend).length,
    unattributed_spend: Math.round(unattributed.reduce((a, r) => a + r.spend, 0) * 100) / 100,
  };
}

module.exports = { discover, syncAds, UNATTRIBUTED };
