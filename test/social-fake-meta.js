'use strict';
// Fake Graph API for the Social tests: a fetch() that answers from fixed data.
// Never calls Meta. Every request is logged in `calls` (path + params, no headers).

const PAGES = [
  { id: '100000000000001', name: '4Geeks Academy', access_token: 'page-token-usa', ig: { id: 'ig-usa', username: '4geeksacademy', name: '4Geeks Academy' } },
  { id: '100000000000004', name: '4Geeks Academy Europe', access_token: 'page-token-eu', ig: { id: 'ig-eu', username: '4geekseurope', name: '4Geeks Europe' } },
];
const { today, addDays } = require('../lib/social/dates');

const NOW = new Date();
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * 86400000).toISOString().slice(0, 19) + '+0000';
// Meta's end_time for a value of `daysAgo` (team's calendar): 07:00 UTC of the next day.
const endTime = (daysAgo) => `${addDays(today(), 1 - daysAgo)}T07:00:00+0000`;

function createFakeMeta({ failFirst = {} } = {}) {
  const calls = [];
  const fails = { ...failFirst }; // path → number of transient errors to return first

  function answer(path, p) {
    if (fails[path] > 0) { fails[path]--; return [500, { error: { code: -2, message: 'Timeout' } }]; }
    if (path === 'me/accounts') return [200, { data: PAGES.map(({ id, name, access_token }) => ({ id, name, access_token })) }];
    const page = PAGES.find((x) => x.id === path);
    if (page && /instagram_business_account/.test(p.fields)) return [200, { id: page.id, name: page.name, instagram_business_account: page.ig }];
    if (page) return [200, { followers_count: 1200, fan_count: 1100 }];
    if (path === 'ig-usa' || path === 'ig-eu') return [200, { followers_count: 6950, follows_count: 10, media_count: 300 }];

    // Instagram media and its insights
    if (path === 'ig-usa/media') return [200, { data: [
      { id: 'm-reel', timestamp: iso(2), caption: 'A reel', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/AAA/', boost_ads_list: { data: [{ ad_id: 'ad-1' }] } },
      { id: 'm-story', timestamp: iso(1), media_type: 'IMAGE', media_product_type: 'STORY' },
    ] }];
    if (path === 'm-reel/insights') {
      const vals = { views: 1000, total_views: 1300, reach: 800, likes: 50, comments: 4, shares: 6, saved: 9, total_interactions: 69, reposts: 1, total_likes: 55, total_comments: 5, ig_reels_avg_watch_time: 4200, ig_reels_video_view_total_time: 900000, reels_skip_rate: 40 };
      return [200, { data: p.metric.split(',').map((name) => ({ name, period: 'lifetime', values: [{ value: vals[name] }] })) }];
    }
    // Instagram account insights
    // Demographics first: it also sends metric_type=total_value.
    if (path === 'ig-usa/insights' && p.metric === 'follower_demographics') {
      const key = { country: 'ES', city: 'Madrid', 'age,gender': '25-34|M' }[p.breakdown];
      return [200, { data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ results: [{ dimension_values: key.split('|'), value: 300 }] }] } }] }];
    }
    if (path === 'ig-usa/insights' && p.metric_type === 'total_value') {
      return [200, { data: p.metric.split(',').map((name) => ({ name, period: 'day', total_value: { value: 10 } })) }];
    }
    if (path === 'ig-usa/insights') return [200, { data: [{ name: p.metric, period: 'day', values: [{ value: 7, end_time: endTime(1) }] }] }];

    // Facebook page posts and insights
    if (path === '100000000000001/posts') return [200, { data: [
      { id: 'fb-1', created_time: iso(3), message: 'Hello', permalink_url: 'https://facebook.com/1', status_type: 'added_photos', promotion_status: 'inactive', shares: { count: 2 }, reactions: { summary: { total_count: 10 } }, comments: { summary: { total_count: 3 } } },
      { id: 'fb-cover', created_time: iso(3), story: '4Geeks updated their cover photo.' },
    ] }];
    if (path === 'fb-1/insights' && p.breakdown === 'is_from_ads') return [200, { data: [{ period: 'lifetime', values: [{ is_from_ads: '0', value: 400 }, { is_from_ads: '1', value: 100 }] }] }];
    if (path === 'fb-1/insights' && p.breakdown === 'is_from_followers') return [200, { data: [{ period: 'lifetime', values: [{ is_from_followers: '1', value: 150 }] }] }];
    if (path === 'fb-1/insights') return [200, { data: p.metric.split(',').map((name) => ({ name, period: 'lifetime', values: [{ value: name === 'post_clicks_by_type' ? { 'link clicks': 5 } : 500 }] })) }];
    if (path === '100000000000001/insights' && p.breakdown === 'is_from_ads') return [200, { data: [{ values: [{ is_from_ads: '0', value: 90, end_time: endTime(1) }, { is_from_ads: '1', value: 10, end_time: endTime(1) }] }] }];
    if (path === '100000000000001/insights') return [200, { data: [{ name: p.metric, values: [{ value: 3, end_time: endTime(1) }] }] }];

    // Ads
    if (/^act_\d+\/insights$/.test(path)) {
      return [200, { data: path.startsWith('act_200000000000001') ? [{ ad_id: 'ad-1', ad_name: 'Reel boost', campaign_name: 'Boost', spend: '12.50', impressions: '1000', reach: '900', clicks: '20', account_currency: 'USD', date_start: iso(1).slice(0, 10) }] : [] }];
    }
    if (path === 'ad-1') return [200, { creative: { source_instagram_media_id: 'm-reel' } }];
    return [404, { error: { code: 100, message: `fake: no answer for ${path}` } }];
  }

  async function fetch(url, opts) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v[\d.]+\//, '');
    const params = Object.fromEntries(u.searchParams);
    calls.push({ path, params, method: opts.method, auth: opts.headers.Authorization });
    const [status, body] = answer(path, params);
    return { status, json: async () => body };
  }

  return { fetch, calls };
}

module.exports = { createFakeMeta, PAGES };
