'use strict';
// ---------------------------------------------------------------------------
// Social — starting values. Used only to seed an empty database; after that
// admins change sites, markets and on/off switches in the app.
// ---------------------------------------------------------------------------

// Sites (the team's "sedes"). `market` links a site to the Hub's markets
// (USA / Spain / LATAM); null = not tied to a market.
const SITES = [
  { slug: 'global', name: 'Global', market: 'USA' },
  { slug: 'espana', name: 'España', market: 'Spain' },
  { slug: 'latam', name: 'Latam', market: 'LATAM' },
  { slug: 'europa', name: 'Europa', market: null },
  { slug: 'chile', name: 'Chile', market: null },
  { slug: 'codigo_y_cambio', name: 'Código y cambio', market: null },
  { slug: 'beyond_the_resume', name: 'Beyond the Resume', market: null },
];

// Account ids (Facebook pages, Meta ad accounts, TikTok advertisers) are not kept in
// this public repo: they come from SOCIAL_SEED, a JSON env var (see .env.example):
//   { "pages":       { "<facebook page id>": "<site slug>" },
//     "ad_accounts": [ { "id": "act_<id>", "name": "...", "site": "<site slug>", "active": true } ],
//     "tiktok":      { "<tiktok advertiser id>": "<site slug>" } }
// Without it accounts are discovered without a site (admins set it in Social → Settings)
// and no Meta ad spend is loaded. Ad accounts are seeded only while their table is empty.
function readSeed(raw = process.env.SOCIAL_SEED) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { console.warn('[social] SOCIAL_SEED is not valid JSON; ignored'); return {}; }
}
const SEED = readSeed();

// Facebook page id → site. Its linked Instagram gets the same site unless listed in SITE_BY_IG.
const SITE_BY_PAGE = SEED.pages || {};
const SITE_BY_IG = { geeky_valen: 'latam' };

// Accounts switched on the first time they are discovered (Instagram username).
// Their linked Facebook page is switched on too. Every other account starts off,
// so a new account never spends Meta API calls until an admin turns it on.
const ACTIVE_ON_DISCOVERY = ['4geeksacademy', '4geeksacademyes', '4geeksacademylatam'];

// Meta ad accounts whose daily spend is matched to posts.
const AD_ACCOUNTS = SEED.ad_accounts || [];

// TikTok ad account (advertiser_id) → site when discovered. TikTok accounts start off like any new account.
const SITE_BY_TIKTOK_ADVERTISER = SEED.tiktok || {};

// Inbox categories created when there are none (admins rename / add / switch them off later).
// Same names the team used in Central RRSS.
const CATEGORY_COLORS = ['blue', 'teal', 'violet', 'red', 'yellow', 'gray'];
const CATEGORIES = [
  { name: 'Información y precios', color: 'blue' },
  { name: 'Admisión e inscripción', color: 'teal' },
  { name: 'Alumno actual', color: 'violet' },
  { name: 'Queja', color: 'red' },
  { name: 'Elogio', color: 'yellow' },
  { name: 'Spam', color: 'gray' },
  { name: 'Otro', color: 'gray' },
];

module.exports = { readSeed, SITES, SITE_BY_PAGE, SITE_BY_IG, ACTIVE_ON_DISCOVERY, AD_ACCOUNTS, SITE_BY_TIKTOK_ADVERTISER, CATEGORIES, CATEGORY_COLORS };
