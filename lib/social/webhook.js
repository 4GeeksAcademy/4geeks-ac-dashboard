'use strict';
// ---------------------------------------------------------------------------
// Social — Meta webhook for Instagram DMs. It only QUEUES work: it never calls
// Meta and never stores the notice (it carries the DM text).
//
//   GET  /api/social/webhook/meta   subscription check (hub.mode / hub.verify_token / hub.challenge)
//   POST /api/social/webhook/meta   checks X-Hub-Signature-256 with the App Secret, then queues one
//                                   'messages' request per IG account with the ids of the people
//                                   who wrote (params.users). The scheduler asks Meta for just those
//                                   conversations (listing a big inbox times out). Repeated or
//                                   out-of-order notices are harmless (the load is idempotent) and
//                                   the 5-minute refresh stays as a safety net.
//
// Mounted by server.js BEFORE express.json(): the signature is computed on the raw body.
// Env: META_APP_SECRET (signature; without it the webhook answers 503) and
// META_WEBHOOK_VERIFY_TOKEN (the one typed in the Meta app when subscribing).
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const express = require('express');

const PATH = '/api/social/webhook/meta';
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function validSignature(body, header, secret) {
  if (!header || !String(header).startsWith('sha256=')) return false;
  return safeEqual(crypto.createHmac('sha256', secret).update(body).digest('hex'), String(header).slice(7));
}

/**
 * {IG account id (entry.id): Set of the people it talks with | null}. Other fields are ignored.
 * The person is the sender, or the recipient when the account itself sent it (echo). If any event
 * doesn't say who, null = sync the whole account.
 */
function accountsWithMessages(payload) {
  const out = new Map();
  if (!payload || payload.object !== 'instagram') return out;
  for (const e of payload.entry || []) {
    const account = String(e.id || '');
    const events = [...(e.messaging || []), ...(e.changes || []).filter((c) => c.field === 'messages').map((c) => c.value || {})];
    if (!account || !events.length) continue;
    if (!out.has(account)) out.set(account, new Set());
    for (const ev of events) {
      const from = String((ev.sender || {}).id || ''); const to = String((ev.recipient || {}).id || '');
      const person = from === account ? to : from;
      if (!person) out.set(account, null);
      else if (out.get(account)) out.get(account).add(person);
    }
  }
  return out;
}

function mountSocialWebhook(app, { store }) {
  app.get(PATH, (req, res) => {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
    if (!expected || req.query['hub.mode'] !== 'subscribe' || !safeEqual(req.query['hub.verify_token'] || '', expected)) return res.status(403).send('Verification refused');
    res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
  });

  app.post(PATH, express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
    const secret = process.env.META_APP_SECRET;
    if (!secret) return res.status(503).json({ error: 'Webhook not configured (META_APP_SECRET)' });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!validSignature(body, req.get('X-Hub-Signature-256'), secret)) return res.status(403).json({ error: 'Invalid signature' });
    let payload;
    try { payload = JSON.parse(body.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'Body is not JSON' }); }
    try {
      const ids = accountsWithMessages(payload);
      if (!ids.size) return res.json({ queued: 0 });
      const accounts = await store.find('accounts', { network: 'instagram', active: true, external_id: [...ids.keys()] });
      let queued = 0;
      for (const acc of accounts) {
        const people = ids.get(acc.external_id);
        // One pending request is enough: new people are added to it. If one is running, a new one is
        // queued (the message may have arrived after it asked Meta). null users = whole account.
        const [pending] = await store.find('requests', { type: 'messages', account_id: acc.id, status: 'pending' }, { limit: 1 });
        if (pending) {
          const prev = (pending.params || {}).users;
          const users = prev === undefined || people === null ? null : [...new Set([...prev, ...people])].sort();
          await store.update('requests', { id: pending.id }, { params: { origin: 'webhook', ...(users ? { users } : {}) } });
          continue;
        }
        await store.insert('requests', { type: 'messages', account_id: acc.id, params: { origin: 'webhook', ...(people ? { users: [...people].sort() } : {}) }, user_name: 'webhook', status: 'pending', progress: null, error: null });
        queued++;
      }
      res.json({ queued });
    } catch (e) {
      console.error('[social] webhook failed:', e.message); // never the payload: it carries DM text
      res.status(500).json({ error: 'Webhook failed' });
    }
  });
}

module.exports = { mountSocialWebhook, accountsWithMessages, validSignature, PATH };
