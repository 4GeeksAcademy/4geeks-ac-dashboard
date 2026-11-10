'use strict';
// ---------------------------------------------------------------------------
// Social — Facebook and Instagram comments (organic and on ads) for the inbox.
//
// Incremental refresh: for each account, ONE list of its recent posts with their
// comment total; comments are only downloaded for the posts whose total changed
// (comment_objects.count). Ads whose content is not a published post (FB dark
// posts, the IG copy of the ad) are watched the same way, in batches with ?ids=.
//
// Notes (Central RRSS, Oct 2026):
//   - FB: the author (`from`) sometimes doesn't come, and never on ad comments.
//   - IG: `username` always comes. Some ad media are not accessible → error saved, skipped.
//   - Texts are personal data: never logged.
// ---------------------------------------------------------------------------
const { GraphError } = require('./client');
const { listMediaIg } = require('./posts');
const { today, addDays, ts, parseMeta } = require('../dates');

const WINDOW_DAYS = 30; // posts published in the last N days are watched
const AD_WINDOW_DAYS = 14; // and ads with impressions in the last N days
const BATCH = 50;
const OPEN = ['new', 'in_review'];

const FB_COUNT = 'comments.filter(stream).summary(total_count).limit(0)';
const FB_FIELDS = 'id,message,created_time,from{id,name},like_count,comment_count,is_hidden,parent{id},permalink_url';
const IG_REPLY = 'id,text,timestamp,username,from{id,username},like_count,hidden,parent_id';
const IG_FIELDS = `${IG_REPLY},replies.limit(50){${IG_REPLY}}`;
const IG_MEDIA = 'id,timestamp,media_product_type,permalink,comments_count';

const clean = (s, n = 5000) => String(s || '').trim().slice(0, n) || null;
const fbTotal = (x) => (((x.comments || {}).summary) || {}).total_count;
const short = (e) => String(e.graphMessage || e.message).slice(0, 300);
const time = (d) => (d ? new Date(d).getTime() : 0);

/** comment_objects of one network, cached so the store isn't queried per post. */
async function objectCache(store, network) {
  const byExt = new Map((await store.find('comment_objects', { network })).map((o) => [o.external_id, o]));
  return {
    async get(accountId, externalId, origin, fields = {}) {
      let o = byExt.get(externalId);
      const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
      if (!o) {
        o = await store.insert('comment_objects', { account_id: accountId, network, external_id: externalId, origin, post_id: null, ad_id: null, text: null, permalink: null, count: null, checked_at: null, error: null, ...set });
        byExt.set(externalId, o);
      } else if (Object.keys(set).length || o.account_id !== accountId) {
        await store.update('comment_objects', { id: o.id }, { account_id: accountId, ...set });
        Object.assign(o, { account_id: accountId }, set);
      }
      return o;
    },
  };
}

async function postIds(store, accountId) {
  return new Map((await store.find('posts', { account_id: accountId })).map((p) => [p.external_id, p.id]));
}

// ---------------- download and save ----------------
function rowFb(c, account) {
  const author = c.from || {};
  return {
    external_id: c.id, parent_external_id: (c.parent || {}).id || null, author_id: author.id || null, author_name: author.name || null,
    text: clean(c.message), written_at: parseMeta(c.created_time).toISOString(), likes: c.like_count ?? null, replies: c.comment_count ?? null,
    hidden: !!c.is_hidden, permalink: c.permalink_url || null, own: author.id === account.external_id,
  };
}
function rowIg(c, account, parent = null) {
  const author = c.from || {};
  const user = c.username || author.username || null;
  return {
    external_id: c.id, parent_external_id: c.parent_id || parent, author_id: author.id || null, author_name: user,
    text: clean(c.text), written_at: parseMeta(c.timestamp).toISOString(), likes: c.like_count ?? null,
    replies: parent === null ? (((c.replies || {}).data) || []).length : null, hidden: !!c.hidden, permalink: null,
    own: author.id === account.external_id || (!!user && user === account.username),
  };
}

async function download(cli, obj, account, token) {
  if (obj.network === 'facebook') {
    const data = await cli.getAll(`${obj.external_id}/comments`, { fields: FB_FIELDS, filter: 'stream', order: 'reverse_chronological', limit: 100 }, token, 20);
    return data.map((c) => rowFb(c, account));
  }
  const rows = [];
  for (const c of await cli.getAll(`${obj.external_id}/comments`, { fields: IG_FIELDS, limit: 50 }, null, 20)) {
    rows.push(rowIg(c, account));
    (((c.replies || {}).data) || []).forEach((r) => rows.push(rowIg(r, account, c.id)));
  }
  return rows;
}

const UPDATABLE = ['author_id', 'author_name', 'text', 'likes', 'replies', 'hidden', 'permalink', 'own'];

/**
 * Inserts new comments and updates the rest WITHOUT touching status or category. If the account
 * answered an open comment, it becomes 'replied'. Returns how many new (not own) comments there were.
 */
async function save(store, account, obj, rows) {
  if (!rows.length) return 0;
  const ext = [...new Set([...rows.map((r) => r.external_id), ...rows.map((r) => r.parent_external_id).filter(Boolean)])];
  const existing = new Map((await store.find('comments', { network: obj.network, external_id: ext })).map((c) => [c.external_id, c]));
  let fresh = 0;
  for (const r of rows) {
    const cur = existing.get(r.external_id);
    if (!cur) {
      const row = await store.insert('comments', {
        account_id: account.id, object_id: obj.id, network: obj.network, origin: obj.origin, ...r,
        status: r.own ? 'closed' : 'new', category_id: null, replied_at: null, handled_by: null, handled_at: null,
      });
      existing.set(r.external_id, row);
      if (!r.own) fresh++;
    } else {
      const patch = Object.fromEntries(UPDATABLE.filter((k) => r[k] != null || k === 'hidden' || k === 'own').map((k) => [k, r[k]]));
      await store.update('comments', { id: cur.id }, { ...patch, updated_at: new Date().toISOString() });
      Object.assign(cur, patch);
    }
  }
  // The account's own replies mark their parent as answered.
  for (const c of existing.values()) {
    if (!(c.own && c.parent_external_id)) continue;
    const parent = existing.get(c.parent_external_id);
    if (!parent || parent.own) continue;
    const patch = {};
    if (!parent.replied_at || time(c.written_at) < time(parent.replied_at)) patch.replied_at = new Date(c.written_at).toISOString();
    if (OPEN.includes(parent.status)) patch.status = 'replied';
    if (Object.keys(patch).length) { await store.update('comments', { id: parent.id }, patch); Object.assign(parent, patch); }
  }
  return fresh;
}

/** Downloads and saves only if the total changed. Returns [newComments, ok]. */
async function check(cli, store, account, obj, total, token) {
  if (obj.count === total) return [0, true];
  let fresh = 0; let ok = true; const patch = { checked_at: new Date().toISOString() };
  try {
    if (total) fresh = await save(store, account, obj, await download(cli, obj, account, token));
    Object.assign(patch, { count: total, error: null });
  } catch (e) {
    if (!(e instanceof GraphError)) throw e;
    patch.error = short(e); ok = false;
  }
  await store.update('comment_objects', { id: obj.id }, patch);
  Object.assign(obj, patch);
  return [fresh, ok];
}

/** Comments of the account's recent posts (only the posts whose total changed are downloaded). */
async function syncComments(cli, store, account, token, from = addDays(today(), -WINDOW_DAYS)) {
  const cache = await objectCache(store, account.network);
  const ids = await postIds(store, account.id);
  // [{id, permalink, total}] of the posts in the window, from one list call.
  const listed = account.network === 'facebook'
    ? (await cli.getAll(`${account.external_id}/posts`, { fields: `id,permalink_url,${FB_COUNT}`, limit: 100, since: ts(from), until: ts(addDays(today(), 1)) }, token, 30))
      .map((p) => ({ id: p.id, permalink: p.permalink_url, total: fbTotal(p) || 0 }))
    : (await listMediaIg(cli, account.external_id, from, IG_MEDIA)).map((m) => ({ id: m.id, permalink: m.permalink, total: m.comments_count || 0 }));
  const objects = [];
  for (const p of listed) objects.push([await cache.get(account.id, p.id, 'organic', { post_id: ids.get(p.id), permalink: p.permalink }), p.total]);
  let fresh = 0; let checked = 0; let errors = 0;
  for (const [obj, total] of objects) {
    if (total && obj.count !== total) checked++;
    const [n, ok] = await check(cli, store, account, obj, total, token);
    fresh += n; if (!ok) errors++;
  }
  return { objects: objects.length, checked, new: fresh, errors };
}

// ---------------- ads ----------------
/** Several objects with ?ids=. If the batch fails (e.g. one media not accessible), one by one. */
async function byIds(cli, ids, fields, token) {
  const out = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    try { Object.assign(out, await cli.get('', { ids: batch.join(','), fields }, token)); } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      for (const id of batch) {
        try { out[id] = await cli.get(id, { fields }, token); } catch (e2) { if (!(e2 instanceof GraphError)) throw e2; out[id] = e2; }
      }
    }
  }
  return out;
}

/** Comments on ads whose content is not a post already watched. pageToken(pageId) gives a page token. */
async function syncAdComments(cli, store, pageToken, from = addDays(today(), -AD_WINDOW_DAYS)) {
  const accounts = await store.find('accounts', { platform: 'meta', active: true });
  const fbByPage = new Map(accounts.filter((a) => a.network === 'facebook').map((a) => [a.external_id, a]));
  const igByPage = new Map(accounts.filter((a) => a.network === 'instagram' && a.page_id).map((a) => [a.page_id, a]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const accountOfPost = new Map((await store.find('posts', {})).map((p) => [p.external_id, p.account_id]));
  const activeAdIds = [...new Set((await store.find('ad_metrics', { day: { gte: from }, impressions: { gt: 0 } })).map((m) => m.ad_id))];
  const ads = activeAdIds.length ? (await store.find('ads', { ad_id: activeAdIds })).filter((a) => a.ig_media_source || a.ig_media_ad || a.fb_post) : [];

  const fb = new Map(); const ig = new Map(); let noAccount = 0;
  for (const a of ads.sort((x, y) => (x.ad_id < y.ad_id ? -1 : 1))) {
    const fbPost = a.fb_post_effective || a.fb_post;
    const page = fbPost ? fbByPage.get(fbPost.split('_')[0]) : null;
    if (fbPost && !accountOfPost.has(fbPost)) { if (page) { if (!fb.has(fbPost)) fb.set(fbPost, [page, a]); } else noAccount++; }
    const mid = a.ig_media_ad;
    if (mid && !accountOfPost.has(mid)) {
      const acc = byId.get(accountOfPost.get(a.ig_media_source)) || (page ? igByPage.get(page.id) : null);
      if (acc) { if (!ig.has(mid)) ig.set(mid, [acc, a]); } else noAccount++;
    }
  }

  let fresh = 0; let checked = 0; let errors = 0;
  const run = async (cache, ext, info, acc, ad, textKey, permalinkKey, total, token) => {
    const obj = await cache.get(acc.id, ext, 'ad', { ad_id: ad.ad_id });
    if (info instanceof GraphError) { await store.update('comment_objects', { id: obj.id }, { error: short(info), checked_at: new Date().toISOString() }); errors++; return; }
    await store.update('comment_objects', { id: obj.id }, { text: clean(info[textKey], 2000) || obj.text, permalink: info[permalinkKey] || obj.permalink });
    if (total && obj.count !== total) checked++;
    const [n, ok] = await check(cli, store, acc, obj, total, token);
    fresh += n; if (!ok) errors++;
  };
  // Facebook: grouped by page (each with its own page token).
  const pages = new Map();
  for (const [ext, [acc]] of fb) (pages.get(acc.external_id) || pages.set(acc.external_id, []).get(acc.external_id)).push(ext);
  const fbCache = await objectCache(store, 'facebook');
  for (const [pageId, ids] of pages) {
    const tok = await pageToken(pageId);
    if (!tok) { errors += ids.length; continue; }
    for (const [ext, info] of Object.entries(await byIds(cli, ids, `id,message,permalink_url,${FB_COUNT}`, tok))) {
      const [acc, ad] = fb.get(ext);
      await run(fbCache, ext, info, acc, ad, 'message', 'permalink_url', info instanceof GraphError ? 0 : fbTotal(info) || 0, tok);
    }
  }
  const igCache = await objectCache(store, 'instagram');
  for (const [ext, info] of Object.entries(await byIds(cli, [...ig.keys()], 'id,caption,permalink,comments_count'))) {
    const [acc, ad] = ig.get(ext);
    await run(igCache, ext, info, acc, ad, 'caption', 'permalink', info instanceof GraphError ? 0 : info.comments_count || 0, null);
  }
  return { objects: fb.size + ig.size, checked, new: fresh, errors, no_account: noAccount };
}

module.exports = { syncComments, syncAdComments, save, WINDOW_DAYS };
