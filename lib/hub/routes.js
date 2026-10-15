// ---------------------------------------------------------------------------
// Marketing Hub — Events tracker + Social organic calendar. Mounted by
// server.js behind the dashboard login.
//
//   GET    /api/hub/meta                     option lists + settings + Luma status
//   PUT    /api/hub/settings                 save settings (accounts, targets, mixes, links)
//   GET    /api/hub/:kind                    list   (kind: events | posts | metrics)
//   POST   /api/hub/:kind                    create
//   PATCH  /api/hub/:kind/:id                update (shallow merge)
//   DELETE /api/hub/:kind/:id                delete
//   POST   /api/hub/events/:id/promo-posts   create the promo posts for an event in the social calendar
//   POST   /api/hub/luma/lookup              {url} → event fields read from a public Luma page
//   POST   /api/hub/luma/import              import / update every event of the Luma calendar (LUMA_API_KEY)
//   POST   /api/hub/events/:id/luma-sync     registrations + check-ins from Luma (LUMA_API_KEY)
//   POST   /api/hub/ai/plan                  Claude proposes a month of organic posts (returns, does not save)
//   POST   /api/hub/ai/copy                  Claude writes hook / caption / CTA for one post or event
// ---------------------------------------------------------------------------
const { createHubStore } = require('./store');
const D = require('./defaults');
const luma = require('./luma');
const { callClaude } = require('../proposals/ai');

const KIND_OF = { events: 'event', posts: 'post', metrics: 'metric' };
const SETTINGS_ID = 'main';

function addDays(dateStr, n) {
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Calendar day of an ISO instant in the event's time zone (default: 4Geeks HQ, Miami).
function localDate(iso, tz) {
  try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz || 'America/New_York' }); } catch (e) { return String(iso).slice(0, 10); }
}
function parseJsonLoose(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.search(/[[{]/); const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0 || b < a) throw new Error('Claude did not return JSON');
  return JSON.parse(t.slice(a, b + 1));
}

function mountHub(app, requireAuth, store = createHubStore()) {
  console.log(`[hub] storage: ${store.kind}`);
  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error('[hub]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  });
  const who = (req) => (req.user && req.user.name) || 'unknown';

  async function settings() {
    const s = await store.get('settings', SETTINGS_ID);
    const merged = { ...D.DEFAULT_SETTINGS, ...(s || {}) };
    ['weekly_targets', 'funnel_mix', 'pillar_mix', 'funnel_definitions', 'links'].forEach((k) => { merged[k] = { ...D.DEFAULT_SETTINGS[k], ...((s && s[k]) || {}) }; });
    return merged;
  }

  // Seed the weekly Instagram history already reported, once.
  (async () => {
    try {
      if (process.env.HUB_SEED === '0') return;
      const existing = await store.list('metric');
      if (existing.length) return;
      for (const m of D.SEED_METRICS) await store.create('metric', { ...m, source: 'weekly report' }, 'system');
      console.log('[hub] seeded Instagram weekly metrics');
    } catch (e) { console.error('[hub] seed failed:', e.message); }
  })();

  app.get('/api/hub/meta', requireAuth, wrap(async (req, res) => {
    res.json({
      markets: D.MARKETS, programs: D.PROGRAMS,
      event_types: D.EVENT_TYPES, event_statuses: D.EVENT_STATUSES, event_checklist: D.EVENT_CHECKLIST,
      channels: D.CHANNELS, formats: D.FORMATS, post_statuses: D.POST_STATUSES, funnel: D.FUNNEL, pillars: D.PILLARS,
      settings: await settings(), storage: store.kind,
      luma: { api: luma.hasKey() }, ai: !!process.env.ANTHROPIC_API_KEY,
    });
  }));

  app.put('/api/hub/settings', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const allowed = ['accounts', 'weekly_targets', 'funnel_mix', 'pillar_mix', 'funnel_definitions', 'links', 'luma_calendar_url'];
    const patch = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.includes(k)));
    await store.upsert('settings', SETTINGS_ID, patch, who(req));
    res.json(await settings());
  }));

  // ---------------- Luma ----------------
  app.post('/api/hub/luma/lookup', requireAuth, wrap(async (req, res) => {
    res.json(await luma.lookupPublic(String((req.body || {}).url || '').trim()));
  }));

  app.post('/api/hub/luma/import', requireAuth, wrap(async (req, res) => {
    const after = (req.body && req.body.after) || addDays(new Date().toISOString(), -60);
    const incoming = await luma.listCalendarEvents({ after });
    const mine = await store.list('event');
    const byLuma = new Map(mine.filter((e) => e.luma_id).map((e) => [e.luma_id, e]));
    let created = 0; let updated = 0;
    for (const ev of incoming) {
      const clean = Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== undefined));
      const cur = byLuma.get(ev.luma_id);
      if (cur) {
        // Luma owns title/date/place; the team owns everything else.
        await store.update('event', cur.id, { title: clean.title, start_at: clean.start_at, end_at: clean.end_at, timezone: clean.timezone, luma_url: clean.luma_url, cover_url: clean.cover_url, location: clean.location, format: clean.format, capacity: clean.capacity, luma_synced_at: new Date().toISOString() }, who(req));
        updated++;
      } else {
        await store.create('event', { ...clean, type: 'workshop', status: new Date(clean.start_at) < new Date() ? 'done' : 'promoting', checklist: { luma: true }, source: 'luma', luma_synced_at: new Date().toISOString() }, who(req));
        created++;
      }
    }
    res.json({ found: incoming.length, created, updated });
  }));

  app.post('/api/hub/events/:id/luma-sync', requireAuth, wrap(async (req, res) => {
    const ev = await store.get('event', req.params.id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    if (!ev.luma_id) return res.status(400).json({ error: 'This event has no Luma ID — import it from Luma first' });
    const counts = await luma.guestCounts(ev.luma_id);
    res.json(await store.update('event', ev.id, { results: { ...(ev.results || {}), ...counts }, luma_synced_at: new Date().toISOString() }, who(req)));
  }));

  // ---------------- Event → promo posts ----------------
  app.post('/api/hub/events/:id/promo-posts', requireAuth, wrap(async (req, res) => {
    const ev = await store.get('event', req.params.id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    if (!ev.start_at) return res.status(400).json({ error: 'Set the event date first' });
    const s = await settings();
    const accounts = (req.body && req.body.accounts) || s.accounts.filter((a) => a.market === ev.market && (a.channel === 'instagram' || a.channel === 'linkedin')).map((a) => a.key);
    const already = (await store.list('post')).filter((p) => p.event_id === ev.id);
    const created = [];
    for (const tpl of D.EVENT_PROMO_POSTS) {
      for (const acc of accounts) {
        const a = s.accounts.find((x) => x.key === acc); if (!a) continue;
        if (tpl.format === 'story' && a.channel === 'linkedin') continue;
        const date = addDays(localDate(ev.start_at, ev.timezone), tpl.offset);
        if (already.some((p) => p.account === acc && p.date === date)) continue;
        created.push(await store.create('post', {
          date, time: '12:00', account: acc, channel: a.channel, market: a.market, format: tpl.format, funnel: tpl.funnel, pillar: tpl.pillar,
          program: ev.program, status: 'idea', title: tpl.hook, hook: tpl.hook, notes: `Promo for: ${ev.title}`,
          link: ev.registration_url || ev.luma_url || ev.landing_url || '', event_id: ev.id, source: 'event',
        }, who(req)));
      }
    }
    res.json({ created: created.length, posts: created });
  }));

  // ---------------- AI ----------------
  app.post('/api/hub/ai/plan', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const s = await settings();
    const month = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : new Date().toISOString().slice(0, 7);
    const accounts = s.accounts.filter((a) => (b.accounts || []).includes(a.key));
    if (!accounts.length) return res.status(400).json({ error: 'Pick at least one account' });
    const posts = (await store.list('post')).filter((p) => (p.date || '').startsWith(month));
    const events = (await store.list('event')).filter((e) => e.start_at && e.status !== 'cancelled' && e.start_at.slice(0, 7) >= month).slice(0, 12);
    const best = (await store.list('post')).filter((p) => p.status === 'published' && p.results && (p.results.views || p.results.shares))
      .sort((x, y) => ((y.results.views || 0) + 20 * (y.results.shares || 0)) - ((x.results.views || 0) + 20 * (x.results.shares || 0))).slice(0, 8)
      .map((p) => ({ title: p.title, format: p.format, pillar: p.pillar, views: p.results.views, shares: p.results.shares, saves: p.results.saves }));
    const system = `You are the organic social media strategist for 4Geeks Academy, an AI-First tech school (AI Engineering, AI Fluency, AI Flex programs; USA, Spain and LATAM).
Plan organic posts that build trust and bring leads. Sell the dream and the ROI: new career, more income, being the person who masters AI — not features.
Funnel rules: ${JSON.stringify(s.funnel_definitions)}.
Pillars (use these keys): ${JSON.stringify(D.PILLARS)}.
What performs for us: reels with humor about AI/coding life, carousels with practical AI tips (high shares/saves), student stories, behind-the-build demos.
Write in English for USA accounts and neutral Spanish ("tú") for Spain/LATAM accounts.
Return ONLY a JSON array, no prose. Each item:
{"date":"YYYY-MM-DD","time":"HH:MM","account":<account key>,"format":one of ${JSON.stringify(D.FORMATS)},"funnel":"TOFU"|"MOFU"|"BOFU","pillar":<pillar key>,"program":one of ${JSON.stringify(D.PROGRAMS)},"title":str (internal name, <= 8 words),"hook":str (first line / first 2 seconds),"caption":str (ready to post, with line breaks),"cta":str,"hashtags":str,"asset_notes":str (what to film or design)}`;
    const user = `MONTH: ${month}
ACCOUNTS: ${JSON.stringify(accounts)}
WEEKLY TARGETS (posts per week per channel): ${JSON.stringify(s.weekly_targets)}
TARGET FUNNEL MIX %: ${JSON.stringify(s.funnel_mix)}
TARGET PILLAR MIX %: ${JSON.stringify(s.pillar_mix)}
ALREADY PLANNED THIS MONTH (do not duplicate dates/topics): ${JSON.stringify(posts.map((p) => ({ date: p.date, account: p.account, title: p.title })))}
EVENTS TO PROMOTE: ${JSON.stringify(events.map((e) => ({ title: e.title, date: (e.start_at || '').slice(0, 10), market: e.market, program: e.program, link: e.registration_url || e.luma_url || e.landing_url })))}
BEST RECENT POSTS: ${JSON.stringify(best)}
USEFUL LINKS: ${JSON.stringify(s.links)}
FOCUS FROM THE TEAM: ${b.focus || '(none)'}
Plan the whole month for these accounts, hitting the weekly targets and the mixes. Only dates inside ${month}${b.from ? `, from ${b.from} on` : ''}.`;
    const out = parseJsonLoose(await callClaude({ system, user, maxTokens: 24000 }));
    const list = (Array.isArray(out) ? out : out.posts || []).filter((p) => p && p.date && String(p.date).startsWith(month))
      .map((p) => { const a = s.accounts.find((x) => x.key === p.account) || accounts[0]; return { ...p, account: a.key, channel: a.channel, market: a.market, status: 'idea', source: 'ai' }; });
    res.json({ posts: list });
  }));

  app.post('/api/hub/ai/copy', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const s = await settings();
    const item = b.item || {};
    const isEvent = b.type === 'event';
    const spanish = ['Spain', 'LATAM'].includes(item.market) || item.language === 'es';
    const system = `You write social copy for 4Geeks Academy (AI-First tech school). Sell the dream and the ROI, never generic. Short sentences, scroll-stopping first line, one clear CTA. ${spanish ? 'Write in neutral Spanish using "tú".' : 'Write in English.'}
Funnel rules: ${JSON.stringify(s.funnel_definitions)}.
Return ONLY JSON: ${isEvent
    ? '{"tagline":str,"description":str (event page / Luma description, 80-140 words),"announcement":str (social caption),"reminder":str (24h reminder, 1-2 lines),"email_subject":str,"followup":str (post-event follow-up message with replay + next step)}'
    : '{"hook":str,"caption":str,"cta":str,"hashtags":str,"asset_notes":str,"alternatives":[str,str] (two other hooks)}'}`;
    const user = `${isEvent ? 'EVENT' : 'POST'}: ${JSON.stringify(item)}\nINSTRUCTIONS: ${b.instructions || '(none)'}`;
    res.json(parseJsonLoose(await callClaude({ system, user, maxTokens: 4000 })));
  }));

  // ---------------- CRUD ----------------
  const kindOf = (req, res) => { const k = KIND_OF[req.params.kind]; if (!k) res.status(404).json({ error: 'Unknown collection' }); return k; };

  app.get('/api/hub/:kind', requireAuth, wrap(async (req, res) => {
    const k = kindOf(req, res); if (!k) return;
    res.json({ items: await store.list(k), storage: store.kind });
  }));
  app.post('/api/hub/:kind', requireAuth, wrap(async (req, res) => {
    const k = kindOf(req, res); if (!k) return;
    const b = req.body || {};
    if (Array.isArray(b.items)) {
      const out = []; for (const it of b.items.slice(0, 200)) out.push(await store.create(k, it, who(req)));
      return res.json({ items: out });
    }
    if (k === 'event' && !b.title) return res.status(400).json({ error: 'title is required' });
    if (k === 'post' && !b.date) return res.status(400).json({ error: 'date is required' });
    res.json(await store.create(k, b, who(req)));
  }));
  app.patch('/api/hub/:kind/:id', requireAuth, wrap(async (req, res) => {
    const k = kindOf(req, res); if (!k) return;
    const r = await store.update(k, req.params.id, req.body || {}, who(req));
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  }));
  app.delete('/api/hub/:kind/:id', requireAuth, wrap(async (req, res) => {
    const k = kindOf(req, res); if (!k) return;
    await store.remove(k, req.params.id);
    res.json({ success: true });
  }));
}

module.exports = { mountHub };
