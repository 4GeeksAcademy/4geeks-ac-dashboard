'use strict';
// ---------------------------------------------------------------------------
// Brevo -> Hub, read-only.
//
// AI Fluency (and AI Flex) leads do not enter ActiveCampaign first: the forms
// add them to Brevo lists, and Brevo automations email them. This reads those
// lists and the emails Brevo sent to them, so the Hub can show the funnel:
//   lead -> enrolled -> first module -> about to finish -> finished
// (Keys named `email(s)` are hashed on the way out by lib/pii.js, so the email
// counters live under `sent` and the per-email table under `messages`.)
// and how each person engaged with the emails (sent, opened, clicked).
//
// Nothing is ever written to Brevo. Env:
//   BREVO_API_KEY       turns it on (Brevo > SMTP & API > API keys)
//   BREVO_LIST_MATCH    regex over list names (default: the AI Fluency / AI Flex
//                       lead + enrolled lists and the three course-progress lists)
//   BREVO_EVENT_DAYS    email history window, max 90 (default 30)
//   BREVO_REFRESH_MIN   minutes between refreshes (default 30)
//
// When the CDP takes over these leads, swap this module for a CDP one that
// returns the same view(): the page does not need to change.
// ---------------------------------------------------------------------------
const nodeFetch = require('node-fetch');

const BASE = 'https://api.brevo.com/v3';
const DEFAULT_MATCH = 'ai fluency|ai flex|first module completed|about to finish course|course finished';
// Funnel step a list stands for, most advanced first.
const STAGE_OF_LIST = [['finished', /course finished/i], ['finishing', /about to finish/i], ['module1', /first module completed/i], ['enrolled', /enrolled/i], ['lead', /./]];
const STAGES = ['lead', 'enrolled', 'module1', 'finishing', 'finished'];
const stageOfList = (name) => STAGE_OF_LIST.find(([, re]) => re.test(name))[0];
const programOfList = (name) => (/flex/i.test(name) ? 'AI Flex' : /fluency/i.test(name) ? 'AI Fluency' : null);
const programOfAttr = (v) => { const s = String(v || '').toLowerCase(); return /flex/.test(s) ? 'AI Flex' : /fluency/.test(s) ? 'AI Fluency' : null; };
const lower = (e) => String(e || '').trim().toLowerCase();
// Brevo names each transactional event; these are the ones the page counts.
const EVENT_KIND = { requests: 'sent', delivered: 'delivered', opened: 'opened', loadedByProxy: 'opened', clicks: 'clicked', hardBounces: 'bounced', softBounces: 'bounced', blocked: 'bounced', invalid: 'bounced', unsubscribed: 'unsubscribed', spam: 'unsubscribed' };

// One line per email a person got: when it was sent and what they did with it.
function addToTimeline(perMessage, email, x, kind, subject) {
  const mine = perMessage.get(email) || new Map();
  const id = x.messageId || `${subject}|${String(x.date || '').slice(0, 10)}`;
  const m = mine.get(id) || { subject, templateId: x.templateId != null ? x.templateId : null, at: null, delivered: false, opened: false, clicked: false, bounced: false, unsubscribed: false };
  if (kind === 'sent') m.at = x.date; else m[kind] = true;
  if (!m.at || (kind === 'sent' && x.date)) m.at = m.at || x.date;
  mine.set(id, m);
  perMessage.set(email, mine);
}
const timelineOf = (mine) => (mine ? [...mine.values()].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))) : []);

function createBrevo({ env = process.env, getRecords = () => [], getEnrollments = () => ({ rows: [] }), log = console, fetch = nodeFetch } = {}) {
  const key = env.BREVO_API_KEY;
  const enabled = !!key;
  let match;
  try { match = new RegExp(env.BREVO_LIST_MATCH || DEFAULT_MATCH, 'i'); } catch (e) { match = new RegExp(DEFAULT_MATCH, 'i'); }
  const days = Math.min(90, Math.max(1, Number(env.BREVO_EVENT_DAYS || 30)));
  const refreshMin = Math.max(5, Number(env.BREVO_REFRESH_MIN || 30));
  const maxEventPages = Math.max(1, Number(env.BREVO_EVENT_PAGES || 40));
  let state = { at: null, error: null, lists: [], people: [], messages: [], eventsTruncated: false };
  let refreshing = null;

  async function get(path, params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    const res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ''}`, { headers: { 'api-key': key, accept: 'application/json' }, timeout: 30000 });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Brevo answered ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  async function pages(path, field, params, size, maxPages = 200) {
    const out = [];
    for (let p = 0; p < maxPages; p++) {
      const d = await get(path, { ...params, limit: size, offset: p * size });
      const chunk = d[field] || [];
      out.push(...chunk);
      if (chunk.length < size) return { items: out, truncated: false };
    }
    return { items: out, truncated: true };
  }

  async function load() {
    const all = (await pages('/contacts/lists', 'lists', {}, 50)).items;
    const lists = all.filter((l) => match.test(l.name || '')).map((l) => ({ id: l.id, name: l.name, stage: stageOfList(l.name), program: programOfList(l.name), count: l.uniqueSubscribers || 0 }));
    const byEmail = new Map();
    for (const l of lists) {
      const { items } = await pages(`/contacts/lists/${l.id}/contacts`, 'contacts', {}, 500);
      l.count = items.length;
      items.forEach((c) => {
        const e = lower(c.email);
        if (!e) return;
        const a = c.attributes || {};
        const p = byEmail.get(e) || { email: e, name: [a.FIRSTNAME, a.LASTNAME].filter(Boolean).join(' ').trim() || a.NAME || null, firstName: a.FIRSTNAME || null, createdAt: c.createdAt || null, lists: [], stage: 'lead', program: programOfAttr(a.PROGRAM), language: a.LANGUAGE || a.UTM_LANGUAGE || null, location: a.UTM_LOCATION || null, source: a.UTM_SOURCE || null, medium: a.UTM_MEDIUM || null, campaign: a.UTM_CAMPAIGN || null, unsubscribed: !!c.emailBlacklisted, sent: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, lastAt: null } };
        p.lists.push(l.name);
        if (STAGES.indexOf(l.stage) > STAGES.indexOf(p.stage)) p.stage = l.stage;
        if (!p.program && l.program) p.program = l.program;
        byEmail.set(e, p);
      });
    }

    // Emails Brevo sent (automation emails are transactional): one row per event.
    const perTemplate = new Map();
    const perMessage = new Map(); // email -> messageId -> one line of that person's timeline
    const seen = new Set(); // one count per message + kind (an open can be reported many times)
    const ev = await pages('/smtp/statistics/events', 'events', { days, sort: 'desc' }, 5000, maxEventPages);
    ev.items.forEach((x) => {
      const p = byEmail.get(lower(x.email));
      const kind = EVENT_KIND[x.event];
      if (!p || !kind) return;
      const k = `${x.messageId || `${x.email}|${x.subject}`}|${kind}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (kind === 'unsubscribed') p.unsubscribed = true; else p.sent[kind] = (p.sent[kind] || 0) + 1;
      if (kind === 'sent' && (!p.sent.lastAt || x.date > p.sent.lastAt)) p.sent.lastAt = x.date;
      // The subject carries the person's first name: take it out so one email is one row.
      const subject = p.firstName ? String(x.subject || '').split(p.firstName).join('{name}') : String(x.subject || '');
      addToTimeline(perMessage, p.email, x, kind, subject);
      const tk = x.templateId != null ? `t${x.templateId}` : subject;
      const t = perTemplate.get(tk) || { templateId: x.templateId != null ? x.templateId : null, subject, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, lastAt: null };
      t[kind] = (t[kind] || 0) + 1;
      if (!t.lastAt || x.date > t.lastAt) t.lastAt = x.date;
      perTemplate.set(tk, t);
    });
    byEmail.forEach((p) => { p.timeline = timelineOf(perMessage.get(p.email)); });
    state = { at: new Date().toISOString(), error: null, lists, people: [...byEmail.values()], messages: [...perTemplate.values()].sort((a, b) => b.sent - a.sent), eventsTruncated: ev.truncated };
    log.log(`[brevo] ${state.people.length} people in ${lists.length} lists, ${ev.items.length} email events (${days}d)`);
  }

  function refresh() {
    if (!enabled) return Promise.resolve();
    if (!refreshing) refreshing = load().catch((e) => { state = { ...state, error: e.message }; log.warn('[brevo] refresh failed:', e.message); }).finally(() => { refreshing = null; });
    return refreshing;
  }

  // What the page shows: each person joined, by email, to their CRM deal and enrollment.
  function view() {
    const dealByEmail = new Map();
    (getRecords() || []).forEach((r) => { const e = lower(r.email); if (e && (!dealByEmail.has(e) || String(r.date || '') > String(dealByEmail.get(e).date || ''))) dealByEmail.set(e, r); });
    const enrByEmail = new Map();
    (((getEnrollments() || {}).rows) || []).forEach((x) => { const e = lower(x.email); if (e) enrByEmail.set(e, x); });
    const rows = state.people.map((p) => {
      const d = dealByEmail.get(p.email);
      const en = enrByEmail.get(p.email);
      const row = { ...p };
      delete row.firstName;
      row.crm = d ? { dealId: String(d.id), region: d.region || null, stage: d.stage || null, bucket: d.bucket || null, score: d.admissionsScore || null, course: d.course || null } : null;
      row.enrollment = en ? { program: en.program || null, converted: en.converted || null, region: en.region || null, status: en.status || null } : null;
      return row;
    });
    const funnel = {};
    STAGES.forEach((s) => { funnel[s] = 0; });
    // A person at a later step also passed the earlier ones.
    rows.forEach((r) => { for (let i = 0; i <= STAGES.indexOf(r.stage); i++) funnel[STAGES[i]]++; });
    return { enabled, at: state.at, error: state.error, refreshing: !!refreshing, days, lists: state.lists, stages: STAGES, funnel, messages: state.messages, eventsTruncated: state.eventsTruncated, rows };
  }

  // The emails Brevo sent to ONE person, newest first: from the funnel data when
  // they are in it, otherwise asked to Brevo live (any lead of the Hub, 90 days).
  const liveCache = new Map();
  async function personEmails(email, firstName) {
    const e = lower(email);
    if (!enabled) return { enabled: false };
    if (!e || !e.includes('@')) return { enabled: true, found: false, reason: 'no_email' };
    const known = state.people.find((p) => p.email === e);
    if (known) return { enabled: true, found: true, inFunnel: true, stage: known.stage, program: known.program, lists: known.lists, unsubscribed: known.unsubscribed, days, timeline: known.timeline || [] };
    const hit = liveCache.get(e);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
    const d = await get('/smtp/statistics/events', { email: e, days: 90, limit: 500, sort: 'desc' });
    const perMessage = new Map();
    const seen = new Set();
    (d.events || []).forEach((x) => {
      const kind = EVENT_KIND[x.event];
      if (!kind) return;
      const k = `${x.messageId || x.subject}|${kind}`;
      if (seen.has(k)) return;
      seen.add(k);
      // Same as the funnel: the person's first name is taken out of the subject.
      const first = String(firstName || '').trim();
      addToTimeline(perMessage, e, x, kind, first.length >= 2 ? String(x.subject || '').split(first).join('{name}') : String(x.subject || ''));
    });
    const timeline = timelineOf(perMessage.get(e));
    const data = { enabled: true, found: timeline.length > 0, inFunnel: false, days: 90, timeline };
    if (liveCache.size > 1000) liveCache.clear();
    liveCache.set(e, { at: Date.now(), data });
    return data;
  }

  function start() {
    if (!enabled) { log.log('[brevo] off (set BREVO_API_KEY to show the AI Fluency funnel from Brevo)'); return; }
    log.log(`[brevo] on: lists matching /${match.source}/, emails of the last ${days} days, every ${refreshMin} min`);
    setTimeout(refresh, 20 * 1000);
    setInterval(refresh, refreshMin * 60 * 1000);
  }

  return { enabled, start, refresh, view, personEmails };
}

module.exports = { createBrevo, STAGES, stageOfList, programOfList };
