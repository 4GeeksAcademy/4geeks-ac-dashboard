'use strict';
// ---------------------------------------------------------------------------
// Social — inbox: comments (organic and on ads) and Instagram DMs, with status,
// category, bulk changes and the counters for browser notifications.
// Only accounts switched on. The app never calls Meta: it reads what the sync saved.
// Every change is audited (who, before → after; never the texts).
// ---------------------------------------------------------------------------
const STATUSES = ['new', 'in_review', 'replied', 'closed'];
const OPEN = ['new', 'in_review'];
const NOTIFY_HOURS = 24; // only comments / DMs written in the last 24 h notify (not the initial load)
const MAX_BULK = 200;

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const time = (d) => (d ? new Date(d).getTime() : 0);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const cut = (s, n) => (!s || s.length <= n ? s || null : s.slice(0, n - 1).trimEnd() + '…');
const statusFilter = (s) => {
  if (!s) return null;
  const list = s === 'open' ? OPEN : String(s).split(',').map((x) => x.trim());
  if (!list.every((x) => STATUSES.includes(x))) throw bad(`Invalid status. Options: ${STATUSES.join(', ')} or open`);
  return list;
};
const page = (rows, q) => {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  return { total: rows.length, items: rows.slice(offset, offset + limit) };
};

function createInbox(store, { audit } = {}) {
  /** Ids of the accounts switched on (optionally just one of them). */
  async function accountIds(accountId) {
    const ids = (await store.find('accounts', { platform: 'meta', active: true })).map((a) => a.id);
    if (accountId == null || accountId === '') return ids;
    if (!ids.includes(Number(accountId))) throw bad('Account not found', 404);
    return [Number(accountId)];
  }

  // ---------------- comments ----------------
  /** Post or ad each comment belongs to. */
  async function objectsOf(objectIds, len = 160) {
    if (!objectIds.length) return new Map();
    const objs = await store.find('comment_objects', { id: objectIds });
    const posts = new Map((await store.find('posts', { id: objs.map((o) => o.post_id).filter(Boolean) })).map((p) => [p.id, p]));
    const ads = new Map((await store.find('ads', { ad_id: objs.map((o) => o.ad_id).filter(Boolean) })).map((a) => [a.ad_id, a]));
    return new Map(objs.map((o) => {
      const p = posts.get(o.post_id); const a = ads.get(o.ad_id);
      return [o.id, {
        id: o.id, origin: o.origin, text: cut((p && p.caption) || o.text, len), permalink: (p && p.permalink) || o.permalink,
        format: p ? p.format : null, published_at: p ? iso(p.published_at) : null,
        ad: a ? { ad_id: a.ad_id, name: a.name, campaign: a.campaign } : null,
      }];
    }));
  }
  const commentRow = (c, objs) => ({
    id: c.id, account_id: c.account_id, network: c.network, origin: c.origin, is_reply: !!c.parent_external_id,
    author_name: c.author_name, text: c.text, written_at: iso(c.written_at), likes: c.likes, replies: c.replies, hidden: c.hidden,
    permalink: c.permalink, status: c.status, category_id: c.category_id, replied_at: iso(c.replied_at),
    handled_by: c.handled_by, handled_at: iso(c.handled_at), object: objs.get(c.object_id) || null,
  });
  async function rowsOf(list, len) {
    const objs = await objectsOf([...new Set(list.map((c) => c.object_id))], len);
    return list.map((c) => commentRow(c, objs));
  }
  async function visibleComment(id) {
    const [c] = await store.find('comments', { id: Number(id) });
    if (!c || !(await accountIds()).includes(c.account_id)) throw bad('Comment not found', 404);
    return c;
  }

  async function listComments(q = {}) {
    const ids = await accountIds(q.account_id);
    if (!ids.length) return { total: 0, items: [] };
    const where = { account_id: ids, own: false };
    if (q.network) where.network = q.network;
    if (q.origin) where.origin = q.origin;
    const st = statusFilter(q.status); if (st) where.status = st;
    if (q.category_id != null && q.category_id !== '') where.category_id = Number(q.category_id) === 0 ? null : Number(q.category_id);
    let rows = await store.find('comments', where);
    if (q.unanswered === 'true' || q.unanswered === true) rows = rows.filter((c) => !c.replied_at);
    if (q.q && String(q.q).trim()) { const s = String(q.q).trim().toLowerCase(); rows = rows.filter((c) => (c.text || '').toLowerCase().includes(s) || (c.author_name || '').toLowerCase().includes(s)); }
    rows.sort((a, b) => time(b.written_at) - time(a.written_at) || b.id - a.id);
    const p = page(rows, q);
    return { total: p.total, items: await rowsOf(p.items) };
  }

  /** The comment with its thread (root and replies, the account's included) and the post or ad. */
  async function commentDetail(id) {
    const c = await visibleComment(id);
    const root = c.parent_external_id || c.external_id;
    const thread = [...await store.find('comments', { network: c.network, external_id: root }), ...await store.find('comments', { network: c.network, parent_external_id: root })]
      .sort((a, b) => time(a.written_at) - time(b.written_at) || a.id - b.id);
    const [row] = await rowsOf([c], 2000);
    return { ...row, thread: thread.map((x) => ({ id: x.id, author_name: x.author_name, text: x.text, written_at: iso(x.written_at), likes: x.likes, own: x.own, hidden: x.hidden, is_reply: !!x.parent_external_id, status: x.status })) };
  }

  // ---------------- conversations (Instagram DMs) ----------------
  /** Business Suite inbox link of each IG account (to answer outside the app). */
  async function inboxLinks(accountIdsList) {
    const accs = await store.find('accounts', { id: accountIdsList });
    const pages = new Map((await store.find('accounts', { id: accs.map((a) => a.page_id).filter(Boolean) })).map((p) => [p.id, p.external_id]));
    return new Map(accs.filter((a) => pages.has(a.page_id)).map((a) => [a.id, `https://business.facebook.com/latest/inbox/instagram_direct?asset_id=${pages.get(a.page_id)}`]));
  }
  const unanswered = (c) => !!c.last_user_at && (!c.last_account_at || time(c.last_account_at) < time(c.last_user_at));
  async function convRows(list) {
    if (!list.length) return [];
    const msgs = await store.find('messages', { conversation_id: list.map((c) => c.id) });
    const last = new Map();
    msgs.forEach((m) => { const cur = last.get(m.conversation_id); if (!cur || time(m.written_at) > time(cur.written_at) || (time(m.written_at) === time(cur.written_at) && m.id > cur.id)) last.set(m.conversation_id, m); });
    const links = await inboxLinks([...new Set(list.map((c) => c.account_id))]);
    const now = Date.now();
    return list.map((c) => {
      const m = last.get(c.id);
      return {
        id: c.id, account_id: c.account_id, network: c.network, participant_name: c.participant_name, last_message_at: iso(c.last_message_at),
        window_until: iso(c.window_until), window_open: time(c.window_until) > now, unanswered: unanswered(c), status: c.status,
        category_id: c.category_id, handled_by: c.handled_by, handled_at: iso(c.handled_at), link: links.get(c.account_id) || null, error: !!c.error,
        last: m ? { text: cut(m.text, 160), from_account: m.from_account, erased: !!m.text_deleted_at, written_at: iso(m.written_at) } : null,
      };
    });
  }
  async function visibleConversation(id) {
    const [c] = await store.find('conversations', { id: Number(id) });
    if (!c || !(await accountIds()).includes(c.account_id)) throw bad('Conversation not found', 404);
    return c;
  }

  async function listConversations(q = {}) {
    const ids = await accountIds(q.account_id);
    if (!ids.length) return { total: 0, items: [] };
    const where = { account_id: ids };
    const st = statusFilter(q.status); if (st) where.status = st;
    if (q.category_id != null && q.category_id !== '') where.category_id = Number(q.category_id) === 0 ? null : Number(q.category_id);
    let rows = (await store.find('conversations', where)).filter((c) => c.last_message_at);
    if (q.unanswered === 'true' || q.unanswered === true) rows = rows.filter(unanswered);
    if (q.window_open === 'true') rows = rows.filter((c) => time(c.window_until) > Date.now());
    if (q.q && String(q.q).trim()) {
      const s = String(q.q).trim().toLowerCase();
      const withText = new Set(rows.length ? (await store.find('messages', { conversation_id: rows.map((c) => c.id) })).filter((m) => (m.text || '').toLowerCase().includes(s)).map((m) => m.conversation_id) : []);
      rows = rows.filter((c) => (c.participant_name || '').toLowerCase().includes(s) || withText.has(c.id));
    }
    rows.sort((a, b) => time(b.last_message_at) - time(a.last_message_at) || b.id - a.id);
    const p = page(rows, q);
    return { total: p.total, items: await convRows(p.items) };
  }

  async function conversationDetail(id) {
    const c = await visibleConversation(id);
    const msgs = (await store.find('messages', { conversation_id: c.id })).sort((a, b) => time(a.written_at) - time(b.written_at) || a.id - b.id);
    const [row] = await convRows([c]);
    return { ...row, messages: msgs.map((m) => ({ id: m.id, from_account: m.from_account, text: m.text, written_at: iso(m.written_at), erased: !!m.text_deleted_at })) };
  }

  // ---------------- classification ----------------
  async function validate(change) {
    if (change.status != null && !STATUSES.includes(change.status)) throw bad(`Invalid status. Options: ${STATUSES.join(', ')}`);
    if (change.category_id != null) {
      const [cat] = await store.find('categories', { id: Number(change.category_id) });
      if (!cat || !cat.active) throw bad('Invalid category');
    }
    if (change.status == null && change.category_id == null && !change.clear_category) throw bad('Nothing to change');
  }
  /** Applies the change to one row; returns {before, after} or null if nothing changed. */
  async function apply(table, row, change, user) {
    const before = { status: row.status, category_id: row.category_id };
    const after = { status: change.status ?? row.status, category_id: change.clear_category ? null : change.category_id != null ? Number(change.category_id) : row.category_id };
    if (before.status === after.status && before.category_id === after.category_id) return null;
    await store.update(table, { id: row.id }, { ...after, handled_by: user, handled_at: new Date().toISOString() });
    return { before, after };
  }
  async function classify(kind, id, change, user) {
    await validate(change);
    const table = kind === 'comment' ? 'comments' : 'conversations';
    const row = kind === 'comment' ? await visibleComment(id) : await visibleConversation(id);
    if (row.own) throw bad("The account's own comments are not classified");
    const diff = await apply(table, row, change, user);
    if (diff && audit) await audit(user, 'classify', kind, row.id, diff);
    return kind === 'comment' ? (await rowsOf(await store.find('comments', { id: row.id })))[0] : (await convRows(await store.find('conversations', { id: row.id })))[0];
  }
  async function classifyBulk(kind, ids, change, user) {
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_BULK) throw bad(`ids: 1 to ${MAX_BULK}`);
    await validate(change);
    const table = kind === 'comment' ? 'comments' : 'conversations';
    const visible = await accountIds();
    const rows = (await store.find(table, { id: [...new Set(ids.map(Number))] })).filter((r) => visible.includes(r.account_id) && !r.own);
    const changed = [];
    for (const r of rows) if (await apply(table, r, change, user)) changed.push(r.id);
    if (changed.length && audit) await audit(user, 'classify_bulk', kind, null, { ids: changed, status: change.status ?? null, category_id: change.clear_category ? null : change.category_id ?? null });
    return { updated: changed.length, ignored: new Set(ids).size - changed.length };
  }

  // ---------------- counters and notifications ----------------
  async function summary() {
    const ids = await accountIds();
    const comments = ids.length ? await store.find('comments', { account_id: ids, own: false }) : [];
    const convs = ids.length ? (await store.find('conversations', { account_id: ids })).filter((c) => c.last_message_at) : [];
    const count = (rows, extra = () => true) => {
      const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      const byAccount = {};
      rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; if (OPEN.includes(r.status)) byAccount[r.account_id] = (byAccount[r.account_id] || 0) + 1; });
      const open = rows.filter((r) => OPEN.includes(r.status));
      return { by_status: byStatus, open: open.length, unanswered: open.filter(extra).length, by_account: byAccount };
    };
    const c = count(comments, (r) => !r.replied_at); const m = count(convs, unanswered);
    return { comments: c, messages: m, total_open: c.open + m.open };
  }

  /**
   * For the browser notifications (the page asks every 30 s). Without `after_*` it only returns the
   * current marks. Notifies new comments / DMs saved after the mark and written in the last 24 h.
   */
  async function news(q = {}) {
    const ids = await accountIds();
    const since = Date.now() - NOTIFY_HOURS * 3600 * 1000;
    const comments = ids.length ? await store.find('comments', { account_id: ids, own: false }) : [];
    const lastComment = Math.max(0, ...comments.map((c) => c.id));
    const convs = ids.length ? await store.find('conversations', { account_id: ids }) : [];
    const convById = new Map(convs.map((c) => [c.id, c]));
    const msgs = convs.length ? (await store.find('messages', { conversation_id: convs.map((c) => c.id), from_account: false })) : [];
    const lastMessage = Math.max(0, ...msgs.map((m) => m.id));
    const out = { after_comment: lastComment, after_message: lastMessage, comments: { total: 0, items: [] }, messages: { total: 0, items: [] } };
    if (q.after_comment != null && q.after_comment !== '') {
      const fresh = comments.filter((c) => c.id > Number(q.after_comment) && c.status === 'new' && time(c.written_at) >= since).sort((a, b) => b.id - a.id);
      out.comments = { total: fresh.length, items: fresh.slice(0, 5).map((c) => ({ id: c.id, account_id: c.account_id, network: c.network, origin: c.origin, author_name: c.author_name, text: cut(c.text, 120) })) };
      out.after_comment = Math.max(lastComment, Number(q.after_comment));
    }
    if (q.after_message != null && q.after_message !== '') {
      const fresh = msgs.filter((m) => m.id > Number(q.after_message) && time(m.written_at) >= since).sort((a, b) => b.id - a.id);
      out.messages = { total: fresh.length, items: fresh.slice(0, 5).map((m) => { const c = convById.get(m.conversation_id); return { id: m.id, conversation_id: c.id, account_id: c.account_id, author_name: c.participant_name, text: cut(m.text, 120) }; }) };
      out.after_message = Math.max(lastMessage, Number(q.after_message));
    }
    return out;
  }

  return { listComments, commentDetail, listConversations, conversationDetail, classify, classifyBulk, summary, news, STATUSES };
}

module.exports = { createInbox, STATUSES };
