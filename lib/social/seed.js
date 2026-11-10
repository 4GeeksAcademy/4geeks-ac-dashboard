'use strict';
// ---------------------------------------------------------------------------
// Social — first boot: creates the sites, Meta ad accounts and inbox categories from defaults.js
// when the tables are empty. Never changes what an admin already edited.
// ---------------------------------------------------------------------------
const D = require('./defaults');

async function seedSocial(store) {
  if (!(await store.find('sites', {}, { limit: 1 })).length) {
    await store.upsert('sites', D.SITES.map((s, i) => ({ slug: s.slug, name: s.name, market: s.market, sort: i })));
  }
  if (!(await store.find('ad_accounts', { platform: 'meta' }, { limit: 1 })).length) {
    const siteId = Object.fromEntries((await store.find('sites', {})).map((s) => [s.slug, s.id]));
    await store.upsert('ad_accounts', D.AD_ACCOUNTS.map((a) => ({
      id: a.id, platform: 'meta', name: a.name, currency: null, site_id: siteId[a.site] || null, active: a.active,
    })));
  }
  if (!(await store.find('categories', {}, { limit: 1 })).length) {
    await store.upsert('categories', D.CATEGORIES.map((c, i) => ({ name: c.name, color: c.color, sort: i, active: true })));
  }
}

module.exports = { seedSocial };
