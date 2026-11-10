'use strict';
// ---------------------------------------------------------------------------
// Social — Instagram direct messages (Messenger API for Instagram, with the page
// token of the linked Facebook page).
//   - Conversations list: GET {pageId}/conversations?platform=instagram, newest first.
//     Messages are only downloaded for conversations whose updated_time changed.
//   - Meta only gives the 20 most recent messages of a conversation.
//   - Big inboxes answer "(#-2) Timeout": retried with smaller pages; each account
//     runs on its own so a slow one never blocks the rest.
//   - The IG account must have "Allow access to messages" switched on.
//   - Replying is only possible within 24 h of the person's last message (window_until).
//   - Texts are personal data: never logged; erased after 60 days (purgeTexts).
// ---------------------------------------------------------------------------
const { GraphError } = require('./client');
const { today, addDays, parseMeta } = require('../dates');

const WINDOW_DAYS = 30; // first load: conversations with activity in the last N days
const PAGE_SIZES = [25, 10, 5, 2]; // if Meta times out, try the next one
const MAX_PAGES = 20;
// No `participants`: on big inboxes Meta times out even for few conversations.
// The person comes from the messages themselves (from / to).
const CONV_FIELDS = 'id,updated_time';
const MSG_FIELDS = 'id,created_time,from,to,message';
const TIMEOUT = new Set([-2, 1, 2]);
const RETENTION_DAYS = 60;
const REPLY_WINDOW_H = 24;
const OPEN = ['new', 'in_review'];
const time = (d) => (d ? new Date(d).getTime() : 0);
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/** GET with smaller and smaller pages while Meta times out. */
async function ask(cli, endpoint, params, token) {
  let last;
  for (const limit of PAGE_SIZES) {
    try { return await cli.get(endpoint, { ...params, limit }, token, 0); } catch (e) {
      if (!(e instanceof GraphError) || (!TIMEOUT.has(e.code) && e.status < 500)) throw e;
      last = e;
    }
  }
  throw last;
}

/** Conversations with activity after `since` (manual paging: stops once out of the window). */
async function listConversations(cli, pageId, token, since) {
  const out = []; const params = { platform: 'instagram', fields: CONV_FIELDS };
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await ask(cli, `${pageId}/conversations`, params, token);
    const batch = res.data || [];
    out.push(...batch.filter((c) => parseMeta(c.updated_time).getTime() > since));
    const after = res.paging && res.paging.cursors && res.paging.cursors.after;
    if (!batch.length || parseMeta(batch[batch.length - 1].updated_time).getTime() <= since || !(res.paging && res.paging.next) || !after) break;
    params.after = after;
  }
  return out;
}

/** Conversations with given people (ids from the webhook). Much faster than listing a big inbox. */
async function conversationsWith(cli, pageId, token, users) {
  const out = []; let last = null;
  for (const u of users) {
    try { out.push(...((await ask(cli, `${pageId}/conversations`, { platform: 'instagram', user_id: u, fields: CONV_FIELDS }, token)).data || [])); } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      last = e;
    }
  }
  if (last && !out.length) throw last;
  return out;
}

const isAccount = (person, account) => person.id === account.external_id || (!!person.username && person.username === account.username);
/** The other person: the author of a message that isn't the account, or the recipient. */
function participant(messages, account) {
  for (const m of messages) {
    const people = [m.from || {}, ...(((m.to || {}).data) || [])];
    const p = people.find((x) => x && Object.keys(x).length && !isAccount(x, account));
    if (p) return p;
  }
  return {};
}

/**
 * Inserts new messages and recomputes the conversation. If the person writes again, it reopens;
 * if the account answered last, it becomes replied. Returns how many new messages from the person.
 */
async function saveMessages(store, account, conv, data) {
  const known = new Set((await store.find('messages', { conversation_id: conv.id })).map((m) => m.external_id));
  let fromUser = 0;
  for (const m of data) {
    if (known.has(m.id)) continue;
    const mine = isAccount(m.from || {}, account);
    await store.insert('messages', {
      conversation_id: conv.id, external_id: m.id, from_account: mine, author_id: (m.from || {}).id || null,
      text: String(m.message || '').trim() || null, written_at: parseMeta(m.created_time).toISOString(), text_deleted_at: null,
    });
    known.add(m.id);
    if (!mine) fromUser++;
  }
  await recompute(store, conv, fromUser > 0);
  return fromUser;
}

async function recompute(store, conv, reopen) {
  const msgs = await store.find('messages', { conversation_id: conv.id });
  const last = (mine) => Math.max(0, ...msgs.filter((m) => m.from_account === mine).map((m) => time(m.written_at)));
  const user = last(false); const acc = last(true);
  const answered = acc > 0 && (!user || acc >= user);
  const patch = {
    last_user_at: iso(user), last_account_at: iso(acc), last_message_at: iso(Math.max(user, acc)),
    window_until: user ? iso(user + REPLY_WINDOW_H * 3600 * 1000) : null, updated_at: new Date().toISOString(),
  };
  if (reopen && !answered && ['replied', 'closed'].includes(conv.status)) patch.status = 'new';
  else if (answered && OPEN.includes(conv.status)) patch.status = 'replied';
  await store.update('conversations', { id: conv.id }, patch);
  Object.assign(conv, patch);
}

/** DMs of one IG account. First time: the last 30 days; then only what changed. With `users` (webhook): only those people. */
async function syncMessages(cli, store, account, pageId, token, users) {
  let convs;
  if (users && users.length) convs = await conversationsWith(cli, pageId, token, users);
  else {
    const mine = await store.find('conversations', { account_id: account.id });
    const latest = Math.max(0, ...mine.map((c) => time(c.meta_updated_at)));
    const start = Date.parse(addDays(today(), -WINDOW_DAYS) + 'T00:00:00Z');
    // 10 minutes of margin for Meta's clocks.
    convs = await listConversations(cli, pageId, token, latest ? Math.max(latest - 10 * 60000, start) : start);
  }
  const existing = new Map(convs.length ? (await store.find('conversations', { network: 'instagram', external_id: convs.map((c) => c.id) })).map((c) => [c.external_id, c]) : []);
  let checked = 0; let fresh = 0; let errors = 0;
  for (const c of convs) {
    const updated = parseMeta(c.updated_time).getTime();
    let conv = existing.get(c.id);
    if (conv && time(conv.meta_updated_at) >= updated && !conv.error) continue;
    if (!conv) {
      conv = await store.insert('conversations', {
        account_id: account.id, network: 'instagram', external_id: c.id, participant_id: null, participant_name: null, meta_updated_at: null,
        last_message_at: null, last_user_at: null, last_account_at: null, window_until: null, status: 'new', category_id: null,
        handled_by: null, handled_at: null, checked_at: null, error: null,
      });
    }
    checked++;
    const patch = { checked_at: new Date().toISOString() };
    try {
      const data = (await ask(cli, `${c.id}/messages`, { fields: MSG_FIELDS }, token)).data || [];
      const p = participant(data, account);
      patch.participant_id = p.id || conv.participant_id;
      patch.participant_name = p.username || p.name || conv.participant_name;
      await store.update('conversations', { id: conv.id }, patch);
      Object.assign(conv, patch);
      fresh += await saveMessages(store, account, conv, data);
      await store.update('conversations', { id: conv.id }, { meta_updated_at: iso(updated), error: null });
    } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      await store.update('conversations', { id: conv.id }, { ...patch, error: String(e.graphMessage || e.message).slice(0, 300) });
      errors++;
    }
  }
  return { conversations: convs.length, checked, new: fresh, errors };
}

/** Erases the text of messages older than `days` (date and author stay, for the numbers). */
async function purgeTexts(store, days = RETENTION_DAYS) {
  const limit = new Date(Date.now() - days * 86400000).toISOString();
  return store.update('messages', { written_at: { lt: limit }, text_deleted_at: null }, { text: null, text_deleted_at: new Date().toISOString() });
}

module.exports = { syncMessages, purgeTexts, RETENTION_DAYS };
