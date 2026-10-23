'use strict';
// HTTP API for Pipeline intelligence + the interactive Recommendations queue.
// Every action is logged (who, what, when, ActiveCampaign result), and the
// ones that change the deal are written back to ActiveCampaign.
const { DEAL_FIELD_MAP } = require('../config');

const DAY = 86400000;
const plusDays = (n) => new Date(Date.now() + Math.max(0, Number(n) || 0) * DAY).toISOString();

function mountPipelineRoutes(app, { requireAuth, requireAdmin, intel, client, getRecords, getLookups, patchRecord, acAppUrl }) {
  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[pipeline]', req.method, req.path, e.message);
    res.status(e.status && e.status < 600 ? e.status : 500).json({ error: e.message });
  });
  const record = (id) => (getRecords() || []).find((r) => String(r.id) === String(id)) || null;
  const userOf = (req) => (req.user && (req.user.name || req.user.username)) || 'unknown';

  // Lost-reason options straight from the AC field definition (fallback: values in use).
  let lostReasonCache = { at: 0, list: [] };
  async function lostReasons() {
    if (Date.now() - lostReasonCache.at < 3600 * 1000 && lostReasonCache.list.length) return lostReasonCache.list;
    let list = [];
    try {
      const meta = await client.listDealCustomFieldMeta();
      const f = meta.find((m) => String(m.id) === String(DEAL_FIELD_MAP.lostReason));
      const opts = f && (f.fieldOptions || f.options || f.field_options);
      if (Array.isArray(opts)) list = opts.map((o) => (typeof o === 'string' ? o : o.value || o.label || o.name)).filter(Boolean);
    } catch (e) { /* fall back below */ }
    if (!list.length) {
      const seen = {};
      (getRecords() || []).forEach((r) => (r.reasons || []).forEach((x) => { seen[x] = (seen[x] || 0) + 1; }));
      list = Object.entries(seen).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }
    lostReasonCache = { at: Date.now(), list };
    return list;
  }

  app.get('/api/pipeline/status', requireAuth, (req, res) => res.json(intel.syncStatus()));

  app.get('/api/pipeline/insights', requireAuth, (req, res) => res.json(intel.insights(String(req.query.region || 'all'))));
  // Same numbers for exactly the leads the page's filters show.
  app.post('/api/pipeline/insights', requireAuth, (req, res) => {
    const b = req.body || {};
    res.json(intel.insights(String(b.region || 'all'), Array.isArray(b.ids) ? b.ids : null));
  });

  // Per-lead readings + queue state for the leads on screen.
  app.post('/api/pipeline/summaries', requireAuth, (req, res) => {
    const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).slice(0, 20000).map(String);
    const states = {};
    const now = Date.now();
    ids.forEach((id) => {
      const s = intel.stateFor(id);
      if (s) states[id] = { ...s, hiddenUntil: intel.hiddenUntil(id, now) };
    });
    res.json({ summaries: intel.summaries(ids), states, sync: intel.syncStatus() });
  });

  app.get('/api/pipeline/lead/:id', requireAuth, wrap(async (req, res) => {
    const id = req.params.id;
    const r = record(id);
    if (!r) return res.status(404).json({ error: 'Lead not in the current data window' });
    let row = intel.get(id);
    if (req.query.refresh === '1' || !row) row = await intel.refreshOne(id, { force: req.query.refresh === '1' });
    const actions = await intel.actionsFor(id).catch(() => []);
    res.json({
      dealId: id,
      intel: row ? { fetchedAt: row.fetchedAt, diagnosedAt: row.diagnosedAt || null, metrics: row.metrics, diagnosis: row.diagnosis || null, timeline: row.timeline || [], raw: row.raw || null, stale: !!(row.hash && row.hash !== row.diagnosisHash) } : null,
      state: intel.stateFor(id), hiddenUntil: intel.hiddenUntil(id),
      actions,
      acUrl: acAppUrl ? `${acAppUrl}/app/deals/${encodeURIComponent(id)}` : null,
    });
  }));

  app.get('/api/pipeline/meta', requireAuth, wrap(async (req, res) => {
    const { usersById, stagesById } = getLookups();
    const pipelineId = req.query.pipelineId ? String(req.query.pipelineId) : null;
    const stages = [...stagesById.values()]
      .filter((s) => !pipelineId || String(s.group) === pipelineId)
      .map((s) => ({ id: String(s.id), title: s.title, group: String(s.group), order: Number(s.order || 0) }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order);
    const users = [...usersById.values()].map((u) => ({ id: String(u.id), name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ stages, users, lostReasons: await lostReasons() });
  }));

  // One action on one deal. Returns the updated queue state + what AC said.
  async function runAction({ dealId, type, payload = {}, user }) {
    const r = record(dealId);
    if (!r) { const e = new Error('Lead not in the current data window'); e.status = 404; throw e; }
    const stamp = `— ${user} via Marketing Hub`;
    let ac = null;
    let state = null;
    switch (type) {
      case 'done': {
        if (payload.note) ac = await client.addDealNote(dealId, `${payload.note}\n${stamp}`);
        state = await intel.setState(dealId, { doneUntil: plusDays(payload.days || 2), snoozeUntil: null, lastAction: { type, at: new Date().toISOString(), user } });
        break;
      }
      case 'snooze': {
        state = await intel.setState(dealId, { snoozeUntil: plusDays(payload.days || 1), lastAction: { type, at: new Date().toISOString(), user, days: payload.days } });
        break;
      }
      case 'unhide': {
        state = await intel.setState(dealId, { snoozeUntil: null, doneUntil: null, lastAction: { type, at: new Date().toISOString(), user } });
        break;
      }
      case 'note': {
        const text = String(payload.text || '').trim();
        if (!text) { const e = new Error('Empty note'); e.status = 400; throw e; }
        ac = await client.addDealNote(dealId, `${text}\n${stamp}`);
        state = await intel.setState(dealId, { lastAction: { type, at: new Date().toISOString(), user } });
        break;
      }
      case 'stage': {
        const stageId = String(payload.stageId || '');
        const st = getLookups().stagesById.get(stageId);
        if (!st) { const e = new Error('Unknown stage'); e.status = 400; throw e; }
        ac = await client.updateDeal(dealId, { stage: Number(stageId) });
        patchRecord(dealId, { stageId, stage: st.title });
        state = await intel.setState(dealId, { lastAction: { type, at: new Date().toISOString(), user, to: st.title } });
        if (payload.note) await client.addDealNote(dealId, `${payload.note}\n${stamp}`);
        break;
      }
      case 'owner': {
        const ownerId = String(payload.ownerId || '');
        const u = getLookups().usersById.get(ownerId);
        if (!u) { const e = new Error('Unknown user'); e.status = 400; throw e; }
        ac = await client.updateDeal(dealId, { owner: Number(ownerId) });
        patchRecord(dealId, { ownerId, assignTo: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username });
        state = await intel.setState(dealId, { lastAction: { type, at: new Date().toISOString(), user } });
        break;
      }
      case 'lost': {
        const reason = String(payload.reason || '').trim();
        if (!reason) { const e = new Error('Pick a lost reason'); e.status = 400; throw e; }
        await client.setDealCustomField(dealId, DEAL_FIELD_MAP.lostReason, [reason]);
        ac = await client.updateDeal(dealId, { status: 2 });
        if (payload.note) await client.addDealNote(dealId, `Lost (${reason}): ${payload.note}\n${stamp}`);
        patchRecord(dealId, { bucket: 'Lost - Classified', reasons: [reason], reason, lostDate: new Date().toISOString().slice(0, 10) });
        state = await intel.setState(dealId, { lastAction: { type, at: new Date().toISOString(), user, reason } });
        break;
      }
      case 'script': {
        state = await intel.setState(dealId, { lastAction: { type, at: new Date().toISOString(), user, channel: payload.channel } });
        break;
      }
      default: { const e = new Error(`Unknown action ${type}`); e.status = 400; throw e; }
    }
    if (['note', 'stage', 'owner', 'lost', 'done'].includes(type)) intel.markStale(dealId);
    const logged = await intel.logAction({ dealId, type, payload, result: ac ? { ok: true, id: ac.id || null } : null, user });
    return { ok: true, state: { ...state, hiddenUntil: intel.hiddenUntil(dealId) }, action: logged };
  }

  app.post('/api/pipeline/action', requireAuth, wrap(async (req, res) => {
    const { dealId, type, ...payload } = req.body || {};
    if (!dealId || !type) return res.status(400).json({ error: 'dealId and type are required' });
    const out = await client.interactive(() => runAction({ dealId: String(dealId), type, payload, user: userOf(req) }));
    res.json(out);
  }));

  // Bulk: same actions over many deals, in the background, with progress.
  const jobs = new Map();
  app.post('/api/pipeline/bulk', requireAuth, wrap(async (req, res) => {
    const { ids, type, ...payload } = req.body || {};
    const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 500);
    if (!list.length || !type) return res.status(400).json({ error: 'ids and type are required' });
    if (!['snooze', 'done', 'owner', 'lost', 'stage', 'unhide'].includes(type)) return res.status(400).json({ error: `Bulk ${type} is not allowed` });
    const id = Math.random().toString(36).slice(2, 10);
    const job = { id, type, total: list.length, done: 0, failed: 0, errors: [], startedAt: new Date().toISOString(), finished: false, user: userOf(req) };
    jobs.set(id, job);
    (async () => {
      for (const dealId of list) {
        try { await client.interactive(() => runAction({ dealId, type, payload, user: job.user })); job.done++; } catch (e) { job.failed++; if (job.errors.length < 10) job.errors.push(`#${dealId}: ${e.message.slice(0, 160)}`); }
      }
      job.finished = true;
      job.finishedAt = new Date().toISOString();
      setTimeout(() => jobs.delete(id), 3600 * 1000);
    })();
    res.json({ jobId: id, total: list.length });
  }));
  app.get('/api/pipeline/bulk/:id', requireAuth, (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.post('/api/pipeline/advice', requireAuth, wrap(async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    const b = req.body || {};
    if (!b.group) return res.status(400).json({ error: 'group is required' });
    const out = await intel.advice({
      region: b.region || 'all', group: String(b.group), groupName: String(b.groupName || b.group), rule: String(b.rule || ''),
      ids: (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 2000), lang: b.lang === 'es' ? 'es' : 'en',
      question: String(b.question || '').slice(0, 600), user: userOf(req),
    });
    res.json(out);
  }));
  app.get('/api/pipeline/advice', requireAuth, wrap(async (req, res) => {
    const a = await intel.lastAdvice(String(req.query.region || 'all'), String(req.query.group || ''));
    res.json(a ? { text: a.text, at: a.at, user: a.user, basis: a.basis } : null);
  }));

  // Admin diagnostic: the raw AC shapes behind one lead's timeline.
  app.get('/api/pipeline/diag/:id', requireAdmin, wrap(async (req, res) => {
    const r = record(req.params.id);
    if (!r) return res.status(404).json({ error: 'Lead not in the current data window' });
    const [dealNotes, contactNotes, activities] = await client.interactive(() => Promise.all([
      client.listDealNotes(r.id).catch((e) => ({ error: e.message })),
      r.contactId ? client.listContactNotes(r.contactId).catch((e) => ({ error: e.message })) : [],
      client.listDealActivities(r.id).catch((e) => ({ error: e.message })),
    ]));
    const sample = (x) => (Array.isArray(x) ? { count: x.length, keys: x[0] ? Object.keys(x[0]) : [], first: x.slice(0, 3) } : x);
    res.json({ dealId: r.id, dealNotes: sample(dealNotes), contactNotes: sample(contactNotes), activities: sample(activities) });
  }));
}

module.exports = { mountPipelineRoutes };
