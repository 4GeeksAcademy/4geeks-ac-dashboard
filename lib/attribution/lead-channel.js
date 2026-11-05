'use strict';
// ---------------------------------------------------------------------------
// Every lead's channel, including the ones with no UTM source.
//
// 1. What the CRM recorded: UTM source / medium / campaign, the click ID in the
//    GCLID field (Google, or a Meta fbclid that landed there) and the form's
//    landing URL (its utm_* / gclid / fbclid parameters).
// 2. Nothing recorded → the Google Analytics visits linked to the lead (GA4
//    sync): the last non-direct visit before the form (Organic Search · Google,
//    Organic Social · Instagram, AI Assistant · ChatGPT…). channelBy = 'GA4'.
// 3. Still nothing → "Organic · no source": came to the site on its own
//    (typed the address, bookmark, untagged link). Counted as organic, never
//    dropped from the charts.
//
// type: Paid | Organic | Owned & other (email, WhatsApp, partners, untyped campaigns)
// Paid leads are named by platform: channel = "Paid · Instagram", "Paid · TikTok", "Paid · Google Ads"…
// (channelGroup keeps the group: Paid Social / Paid Search / Paid Display/Video).
// ---------------------------------------------------------------------------
const { classify, PAID, channelName } = require('./channel');

const NO_SOURCE = 'Organic · no source';
const ORGANIC = new Set(['Organic Search', 'Organic Social', 'AI Assistant', 'Referral', 'Direct', NO_SOURCE]);
const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id', 'twclid'];
const isMetaClick = (id) => /^(IwA|IwZ|IwY|PAZ|AbZ)/.test(String(id || ''));

function typeOf(group) {
  if (PAID.has(group)) return 'Paid';
  if (ORGANIC.has(group)) return 'Organic';
  return 'Owned & other';
}

function fromUrl(url) {
  try {
    const u = new URL(url);
    const p = u.searchParams;
    const utm = {};
    ['source', 'medium', 'campaign', 'term', 'content'].forEach((k) => { const v = p.get(`utm_${k}`); if (v) utm[k] = v; });
    const click = CLICK_PARAMS.find((k) => p.get(k));
    return { utm, clickType: click || null };
  } catch (e) { return { utm: {}, clickType: null }; }
}

// rec: a lead record (source, medium, campaign; gclid and landingUrl are server-side fields).
function recordedChannel(rec) {
  const url = rec.landingUrl ? fromUrl(rec.landingUrl) : { utm: {}, clickType: null };
  const utm = {
    source: rec.source || url.utm.source || '', medium: rec.medium || url.utm.medium || '',
    campaign: rec.campaign || url.utm.campaign || '', term: url.utm.term || '',
  };
  let clickType = url.clickType;
  if (rec.gclid) clickType = isMetaClick(rec.gclid) ? (clickType || 'fbclid') : 'gclid';
  const blank = (v) => !v || /^\(?(direct|none|not set|not provided)\)?$|^(null|undefined|-)$/i.test(String(v).trim());
  if (blank(utm.source)) utm.source = '';
  if (blank(utm.medium)) utm.medium = '';
  if (!utm.source && !utm.medium && !clickType) return { channel: NO_SOURCE, channelSource: '', channelType: 'Organic', channelBy: 'none' };
  // A source with no medium (common in forms): read the source itself.
  if (utm.source && !utm.medium && !clickType) {
    const s = utm.source.toLowerCase();
    const guess = /^(organic|seo|website|web|site|home|4geeks(\.com)?|4geeksacademy(\.com)?|blog)$/.test(s) ? [NO_SOURCE, '']
      : /facebook|instagram|^fb$|^ig$|tiktok|linkedin|youtube|twitter|^x$|reddit|threads/.test(s) ? ['Organic Social', null]
      : /google|bing|yahoo|duckduckgo|ecosia/.test(s) ? ['Organic Search', null]
      : /chatgpt|perplexity|gemini|copilot|claude/.test(s) ? ['AI Assistant', null] : null;
    if (guess) {
      const raw = utm.source.replace(/\.(com|ai|net|org)$/i, '');
      const src = guess[1] === null ? (guess[0] === 'Organic Social' ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : classify({ utm: { source: utm.source, medium: 'social' } }).source) : guess[1];
      // "website" & co. say nothing about how they found the site: let Google Analytics tell.
      return { channel: guess[0], channelSource: src || '', channelType: typeOf(guess[0]), channelBy: guess[0] === NO_SOURCE ? 'none' : 'CRM' };
    }
  }
  const c = classify({ utm, clickType });
  if (/^(organic|seo|social|referral|website|web)$/i.test(c.source || '')) c.source = ''; // generic words, not a source
  return { channel: channelName(c), channelGroup: c.group, channelPlatform: c.platform || null, channelSource: c.source || '', channelType: typeOf(c.group), channelBy: 'CRM', branded: !!c.branded };
}

// GA journey -> the channel to show for a lead the CRM has nothing on.
function gaChannel(touches) {
  if (!touches || !touches.length) return null;
  const nd = touches.filter((t) => t.group !== 'Direct');
  const t = nd.length ? nd[nd.length - 1] : touches[touches.length - 1];
  const group = t.group === 'Direct' ? NO_SOURCE : t.group;
  return { channel: channelName({ ...t, group }), channelGroup: group, channelPlatform: t.platform || null, channelSource: t.source || '', channelType: typeOf(group), channelBy: 'GA4', branded: !!t.branded };
}

// Apply on a set of records: CRM first, GA4 (map dealId -> gaChannel) when the CRM has nothing.
function applyChannels(records, gaById = new Map()) {
  for (const r of records || []) {
    let c = recordedChannel(r);
    if (c.channelBy === 'none' && gaById.has(String(r.id))) c = gaById.get(String(r.id));
    r.channel = c.channel;
    r.channelGroup = c.channelGroup || c.channel;
    r.channelPlatform = c.channelPlatform || null;
    r.channelSource = c.channelSource || null;
    r.channelType = c.channelType;
    r.channelBy = c.channelBy;
    // Paid already names its platform; organic adds where it came from (Organic Search · Google).
    r.channelLabel = c.channelType !== 'Paid' && c.channelSource && c.channel !== NO_SOURCE ? `${c.channel} · ${c.channelSource}` : c.channel;
  }
  return records;
}

module.exports = { recordedChannel, gaChannel, applyChannels, typeOf, NO_SOURCE, ORGANIC };
