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

// Facebook page id → site. Its linked Instagram gets the same site unless listed in SITE_BY_IG.
const SITE_BY_PAGE = {
  '100000000000001': 'global', // 4Geeks Academy
  '100000000000002': 'espana', // 4Geeks Academy España
  '100000000000003': 'latam', // 4Geeks Academy Latam
  '100000000000004': 'europa', // 4Geeks Academy Europe
  '100000000000005': 'chile', // 4Geeks Academy Chile
  '100000000000006': 'codigo_y_cambio',
  '100000000000007': 'beyond_the_resume',
};
const SITE_BY_IG = { geeky_valen: 'latam' };

// Accounts switched on the first time they are discovered (Instagram username).
// Their linked Facebook page is switched on too. Every other account starts off,
// so a new account never spends Meta API calls until an admin turns it on.
const ACTIVE_ON_DISCOVERY = ['4geeksacademy', '4geeksacademyes', '4geeksacademylatam'];

// Meta ad accounts whose daily spend is matched to posts.
const AD_ACCOUNTS = [
  { id: 'act_200000000000001', name: '4Geeks USA | USD', site: 'global', active: true },
  { id: 'act_200000000000002', name: '4Geeks España | USD', site: 'espana', active: true },
  { id: 'act_200000000000003', name: '4Geeks LATAM | USD', site: 'latam', active: true },
  { id: 'act_200000000000004', name: 'Backup - España - €', site: 'espana', active: false },
];

// TikTok ad account (advertiser_id) → site when discovered. TikTok accounts start off like any new account.
const SITE_BY_TIKTOK_ADVERTISER = {
  '7000000000000000001': 'espana', // 4Geeks Academy ES0726
  '7000000000000000002': 'latam', // 4Geeks Academy LATAM26
};

module.exports = { SITES, SITE_BY_PAGE, SITE_BY_IG, ACTIVE_ON_DISCOVERY, AD_ACCOUNTS, SITE_BY_TIKTOK_ADVERTISER };
