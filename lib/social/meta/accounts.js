'use strict';
// ---------------------------------------------------------------------------
// Social — discovers the Facebook pages and Instagram profiles the token can
// see and saves them as accounts.
//   New accounts get their site from defaults.js and start OFF, except the
//   ones in ACTIVE_ON_DISCOVERY (and their Facebook page).
//   Existing accounts keep the site and switch an admin set; only their
//   name / username / linked page are refreshed.
// ---------------------------------------------------------------------------
const D = require('../defaults');

/** {pageId: {id, name, access_token}}. Page tokens are asked for on every run, never stored. */
async function pagesWithToken(cli) {
  const pages = await cli.getAll('me/accounts', { fields: 'id,name,access_token', limit: 100 });
  return Object.fromEntries(pages.map((p) => [p.id, p]));
}

async function discover(cli, store, pages) {
  pages = pages || (await pagesWithToken(cli));
  const siteId = Object.fromEntries((await store.find('sites', {})).map((s) => [s.slug, s.id]));
  const existing = new Map((await store.find('accounts', { platform: 'meta' })).map((a) => [`${a.network}:${a.external_id}`, a]));
  const created = [];
  let updated = 0;

  async function save(network, externalId, name, username, siteSlug, active, page) {
    const cur = existing.get(`${network}:${externalId}`);
    if (cur) {
      await store.update('accounts', { id: cur.id }, { name, username, ...(page ? { page_id: page.id } : {}) });
      updated++;
      return cur;
    }
    const row = await store.insert('accounts', {
      platform: 'meta', network, external_id: externalId, name, username,
      site_id: siteId[siteSlug] || null, page_id: page ? page.id : null, active,
    });
    existing.set(`${network}:${externalId}`, row);
    created.push(`${network}:${username || name}${active ? ' (on)' : ''}`);
    return row;
  }

  for (const [pageId, p] of Object.entries(pages)) {
    const info = await cli.get(pageId, { fields: 'id,name,instagram_business_account{id,username,name}' }, p.access_token);
    const ig = info.instagram_business_account;
    const on = !!(ig && D.ACTIVE_ON_DISCOVERY.includes(ig.username));
    const site = D.SITE_BY_PAGE[pageId];
    const page = await save('facebook', pageId, info.name || p.name, null, site, on);
    if (ig) await save('instagram', ig.id, ig.name || ig.username, ig.username, D.SITE_BY_IG[ig.username] || site, on, page);
  }
  return { pages: Object.keys(pages).length, created, updated };
}

module.exports = { pagesWithToken, discover };
