'use strict';
// Where a visit came from: one channel group (Paid Search, Paid Social,
// Organic Search, AI Assistant, Organic Social, Email, Referral, Partner,
// Messaging, Direct, Internal) plus the source inside it (Google, Meta…).
//
// Rules of thumb that matter for 4Geeks:
//   - gclid / gbraid / wbraid = a Google Ads click, even without UTMs.
//   - fbclid alone is NOT paid: Meta adds it to organic link clicks too.
//     It counts as paid only with paid UTMs (medium cpc / paid / paid_social).
//   - Paid search with "4geeks" in the keyword (utm_term) is BRANDED: people
//     already looking for you, often after seeing something else first.
//   - ChatGPT, Perplexity, Gemini, Copilot, Claude = "AI Assistant" (a
//     growing organic channel worth seeing on its own).

const PAID = new Set(['Paid Search', 'Paid Social', 'Paid Display/Video']);
const SITE = /(^|\.)(4geeks\.com|4geeksacademy\.com|4geeks\.co)$/i;
const SEARCH = [[/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/duckduckgo\.com$/, 'DuckDuckGo'], [/(^|\.)yahoo\./, 'Yahoo'], [/ecosia\.org$/, 'Ecosia'], [/search\.brave\.com$/, 'Brave'], [/yandex\./, 'Yandex'], [/baidu\.com$/, 'Baidu']];
const AI = [[/(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'], [/perplexity\.ai$/, 'Perplexity'], [/gemini\.google\.com$/, 'Gemini'], [/copilot\.microsoft\.com$/, 'Copilot'], [/claude\.ai$/, 'Claude'], [/(^|\.)meta\.ai$/, 'Meta AI'], [/deepseek\.com$/, 'DeepSeek'], [/you\.com$/, 'You.com']];
const SOCIAL = [[/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com)$/, 'Facebook'], [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X'], [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'], [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)reddit\.com$/, 'Reddit'], [/(^|\.)threads\.net$/, 'Threads'], [/(^|\.)pinterest\./, 'Pinterest']];
const MAIL = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/;
const BRAND = /4\s?geeks|four\s?geeks|4geek/i;

const SRC_NAMES = { fb: 'Meta', facebook: 'Meta', instagram: 'Meta', ig: 'Meta', meta: 'Meta', google: 'Google', adwords: 'Google', youtube: 'YouTube', tiktok: 'TikTok', bing: 'Bing', microsoft: 'Bing', linkedin: 'LinkedIn', twitter: 'X', x: 'X', reddit: 'Reddit', chatgpt: 'ChatGPT', 'chatgpt.com': 'ChatGPT' };
// The paid platform the click came from, as specific as the UTM / click ID allows:
// Instagram and Facebook apart when the source says so, "Meta (IG/FB)" when it doesn't.
const PLATFORMS = [
  [/^(instagram|ig|insta)$|instagram/, 'Instagram'], [/^(facebook|fb)$|facebook/, 'Facebook'], [/^(meta|an|msg|messenger)$/, 'Meta (IG/FB)'],
  [/tiktok/, 'TikTok'], [/youtube|^yt$/, 'YouTube'], [/google|adwords|^gads$/, 'Google Ads'], [/bing|microsoft/, 'Microsoft Ads'],
  [/linkedin/, 'LinkedIn'], [/chatgpt|openai/, 'ChatGPT'], [/perplexity/, 'Perplexity'], [/^(x|twitter)$|twitter/, 'X'], [/reddit/, 'Reddit'],
  [/pinterest/, 'Pinterest'], [/snapchat/, 'Snapchat'], [/spotify/, 'Spotify'], [/quora/, 'Quora'], [/taboola/, 'Taboola'], [/outbrain/, 'Outbrain'],
];
const CLICK_PLATFORM = { gclid: 'Google Ads', gbraid: 'Google Ads', wbraid: 'Google Ads', msclkid: 'Microsoft Ads', ttclid: 'TikTok', li_fat_id: 'LinkedIn', twclid: 'X', fbclid: 'Meta (IG/FB)' };
function platformOf(rawSource, clickType) {
  const s = String(rawSource || '').trim().toLowerCase();
  if (s) { const hit = PLATFORMS.find(([re]) => re.test(s)); if (hit) return hit[1]; }
  if (clickType && CLICK_PLATFORM[clickType]) return CLICK_PLATFORM[clickType];
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Other';
}
const srcName = (s) => { const k = String(s || '').trim().toLowerCase(); return SRC_NAMES[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : ''); };
const match = (list, host) => { const hit = list.find(([re]) => re.test(host)); return hit ? hit[1] : null; };
const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; } };

function classify({ utm = {}, clickType = null, referrer = '', host = '' } = {}) {
  const medium = String(utm.medium || '').toLowerCase();
  const source = String(utm.source || '').toLowerCase();
  const term = String(utm.term || '');
  const ref = hostOf(referrer);
  const out = (group, src, extra = {}) => {
    const o = { group, source: src || '', ...extra };
    if (PAID.has(group)) o.platform = platformOf(source, clickType);
    return o;
  };

  if (['gclid', 'gbraid', 'wbraid'].includes(clickType)) {
    if (/display|video|youtube|demand|pmax/.test(medium + source)) return out('Paid Display/Video', srcName(source) || 'Google');
    return out('Paid Search', 'Google', { branded: BRAND.test(term) || BRAND.test(String(utm.campaign || '')) });
  }
  if (clickType === 'msclkid') return out('Paid Search', 'Bing', { branded: BRAND.test(term) });
  if (clickType === 'ttclid') return out('Paid Social', 'TikTok');
  if (clickType === 'li_fat_id') return out('Paid Social', 'LinkedIn');
  if (clickType === 'twclid') return out('Paid Social', 'X');

  if (medium || source) {
    if (/^(cpc|ppc|paid|paidsearch|paid_search|sem|search)$/.test(medium)) {
      if (/facebook|instagram|^fb$|^ig$|meta|tiktok|linkedin|twitter|reddit/.test(source)) return out('Paid Social', srcName(source));
      return out('Paid Search', srcName(source) || 'Google', { branded: BRAND.test(term) });
    }
    if (/paid[_-]?social|social[_-]?paid|paidsocial|cpm|cpv|paid_?video|ads?$/.test(medium)) return out('Paid Social', srcName(source));
    if (/display|banner|programmatic/.test(medium)) return out('Paid Display/Video', srcName(source));
    if (/e-?mail|newsletter/.test(medium) || /activecampaign|brevo|mailchimp|newsletter/.test(source)) return out('Email', srcName(source) || 'Email');
    if (/sms|whatsapp|wa$/.test(medium + ' ' + source)) return out('Messaging', srcName(source) || 'WhatsApp');
    if (/affiliate|partner|referral/.test(medium)) return out('Partner', srcName(source));
    if (/social|organic_social|bio|post|story|reel/.test(medium)) return out('Organic Social', srcName(source));
    if (/organic|seo/.test(medium)) return out('Organic Search', srcName(source) || 'Google');
    if (/chatgpt|perplexity|gemini|copilot|claude/.test(source)) return out('AI Assistant', srcName(source));
    if (clickType === 'fbclid') return out('Organic Social', srcName(source) || 'Meta');
    return out('Other campaign', srcName(source) || medium);
  }

  if (ref) {
    if (SITE.test(ref)) return out('Internal', ref);
    const ai = match(AI, ref); if (ai) return out('AI Assistant', ai);
    const se = match(SEARCH, ref); if (se) return out('Organic Search', se);
    const so = match(SOCIAL, ref); if (so) return out('Organic Social', so);
    if (MAIL.test(ref)) return out('Email', 'Webmail');
    return out('Referral', ref.replace(/^www\./, ''));
  }
  if (clickType === 'fbclid') return out('Organic Social', 'Meta');
  return out('Direct', '');
}

// "Paid · Instagram", "Paid · Google Ads"…; any other channel keeps its group name.
const channelName = (c) => (c && PAID.has(c.group) ? `Paid · ${c.platform || platformOf(c.source)}` : (c ? c.group : ''));
module.exports = { classify, PAID, hostOf, BRAND, platformOf, channelName };
