'use strict';
// Fake TikTok Marketing API v1.3 for the Social tests: a fetch() that answers the routes
// lib/social/tiktok uses. Never calls TikTok.
const { today, addDays } = require('../lib/social/dates');

const ADV_ES = '7000000000000000001';
const ADV_LATAM = '7000000000000000002';

function createFakeTikTok() {
  const calls = [];
  const ads = {
    [ADV_ES]: [
      { ad_id: 'A1', ad_name: 'AI bootcamp', campaign_name: 'Leads ES', identity_type: 'TT_USER', display_name: '4Geeks Academy ES', tiktok_item_id: 'V1' },
      { ad_id: 'A2', ad_name: 'AI bootcamp 2', campaign_name: 'Leads ES', identity_type: 'TT_USER', display_name: '4Geeks Academy ES', tiktok_item_id: 'V1' },
      { ad_id: 'A3', ad_name: 'Creator', campaign_name: 'Spark', identity_type: 'AUTH_CODE', display_name: 'CreatorDev', tiktok_item_id: 'V2' },
    ],
    [ADV_LATAM]: [],
  };
  // Daily spend per ad (A9 was deleted: in the report, not in ad/get/).
  const spend = { A1: 10, A2: 5, A3: 2.5, A9: 0.5 };
  const campaign = { A1: 'C1', A2: 'C1', A3: 'C2', A9: 'C1' };
  const unattributed = { C1: 4, C2: 0 }; // daily campaign spend TikTok doesn't split by ad

  function data(path, q) {
    if (path === 'oauth2/advertiser/get/') return { list: [{ advertiser_id: ADV_ES, advertiser_name: 'ES0726' }, { advertiser_id: ADV_LATAM, advertiser_name: 'LATAM26' }] };
    if (path === 'advertiser/info/') return { list: JSON.parse(q.advertiser_ids).map((a) => ({ advertiser_id: a, name: a === ADV_ES ? '4Geeks Academy ES0726' : '4Geeks Academy LATAM26', currency: 'EUR' })) };
    if (path === 'ad/get/') return { list: ads[q.advertiser_id], page_info: { total_page: 1 } };
    if (path === 'report/integrated/get/') {
      if (Math.round((Date.parse(q.end_date) - Date.parse(q.start_date)) / 86400000) >= 30) throw new Error('more than 30 days per call');
      const byCampaign = q.data_level === 'AUCTION_CAMPAIGN';
      const list = [];
      if (q.advertiser_id === ADV_ES) {
        for (let d = q.start_date; d <= q.end_date && d <= today(); d = addDays(d, 1)) {
          const rows = Object.entries(spend).map(([ad, s]) => ({ dimensions: { ad_id: ad, stat_time_day: `${d} 00:00:00` }, metrics: { spend: String(s), impressions: String(s * 100), reach: '50', clicks: '3', video_play_actions: String(s * 40), likes: '2', comments: '1', shares: '1', follows: '1', campaign_id: campaign[ad] } }));
          if (!byCampaign) list.push(...rows);
          else {
            Object.entries(unattributed).forEach(([cid, extra]) => {
              const mine = rows.filter((r) => r.metrics.campaign_id === cid);
              const sum = (k) => mine.reduce((a, r) => a + Number(r.metrics[k]), 0);
              list.push({ dimensions: { campaign_id: cid, stat_time_day: `${d} 00:00:00` }, metrics: { spend: String(sum('spend') + extra), impressions: String(sum('impressions') + extra * 100), reach: '80', clicks: String(sum('clicks')), video_play_actions: String(sum('video_play_actions')), likes: String(sum('likes')), comments: String(sum('comments')), shares: String(sum('shares')), follows: String(sum('follows')), campaign_name: `Campaign ${cid}` } });
            });
          }
        }
      }
      return { list, page_info: { total_page: 1 } };
    }
    throw new Error(`fake TikTok: no answer for ${path}`);
  }

  async function fetch(url, opts) {
    const u = new URL(url);
    const path = u.pathname.split('/v1.3/')[1];
    const q = Object.fromEntries(u.searchParams);
    calls.push({ path, q, token: opts.headers['Access-Token'] });
    try { return { json: async () => ({ code: 0, message: 'OK', data: data(path, q) }) }; } catch (e) { return { json: async () => ({ code: 40002, message: e.message }) }; }
  }
  return { fetch, calls };
}

module.exports = { createFakeTikTok, ADV_ES, ADV_LATAM };
