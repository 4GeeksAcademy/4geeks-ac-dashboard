// ---------------------------------------------------------------------------
// Proposal Studio — HTTP routes. Mounted by server.js behind the dashboard login.
//
//   GET    /api/proposals                    list (latest first)
//   POST   /api/proposals                    create from intake {client, country, language, currency, intake}
//   GET    /api/proposals/:id                proposal + version history
//   PATCH  /api/proposals/:id                update intake / status / owner
//   DELETE /api/proposals/:id                admin only
//   POST   /api/proposals/:id/draft          Claude drafts a new version from the intake
//   POST   /api/proposals/:id/revise         Claude applies one instruction to a version → new version
//   POST   /api/proposals/:id/versions       save edited content JSON as a new version (manual)
//   GET    /api/proposals/:id/versions/:n    one version's content (n or "latest")
//   POST   /api/proposals/:id/clone          new proposal starting from this one's latest version
//   GET    /proposals/:id/v/:n               branded HTML (add ?print=1 to open the print / Save-as-PDF dialog)
//   GET    /api/proposal-library             library (defaults merged with saved overrides)
//   PUT    /api/proposal-library/:key        admin only
// ---------------------------------------------------------------------------
const { createStore, STATUSES } = require('./store');
const { DEFAULT_LIBRARY } = require('./library');
const { renderProposal } = require('./render');
const { draftProposal, reviseProposal } = require('./ai');
const SEED_DEPORVILLAGE = require('./seeds/deporvillage.json');

function mountProposals(app, requireAuth) {
  const store = createStore();
  console.log(`[proposals] storage: ${store.kind}`);

  const library = async () => ({ ...DEFAULT_LIBRARY, ...(await store.getLibrary()) });
  const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
    console.error('[proposals]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  });
  const who = (req) => (req.user && req.user.name) || 'unknown';
  const isAdmin = (req) => !!(req.user && req.user.admin);

  // Seed the first real proposal so the team starts from a finished example.
  (async () => {
    try {
      if (process.env.PROPOSALS_SEED === '0') return;
      const list = await store.listProposals();
      if (list.length) return;
      const p = await store.createProposal({
        client: 'Deporvillage', country: 'España', language: 'es', currency: 'EUR', created_by: 'marcelo', owner: 'victor',
        title: 'AI Culture 2027',
        intake: {
          client: 'Deporvillage', country: 'España', language: 'es', currency: 'EUR', industry: 'E-commerce deportivo',
          contact: 'Anabel Martín-Nieto (Formación)', headcount: '180 en oficina, 35 en IT',
          situation: 'Fase 1 y 2 de AI Culture hechas con Gemini; Fase 3 = Gemini Enterprise y agentes. No saben qué quieren aprender: quieren que la empresa implemente IA.',
          asks: 'Onboarding online para 20–25 incorporaciones/año con test; adopción real de la IA; AI Champions que construyan; revisión de contenidos cada 6 meses.',
          tools: 'Google Workspace, Gemini Enterprise',
          programs: [
            { program: 'Onboarding IA', seats: '20/año reutilizables', price: '10.000 €/año' },
            { program: 'AI Fluency aplicada a Gemini Enterprise', seats: '150 (5 cohortes)', price: '40.000 €' },
            { program: 'AI Builders', seats: '30 (2 cohortes)', price: '60.000 €' },
            { program: 'AI Engineering for Developers', seats: '35', price: '50.000 €' },
          ],
          competitors: 'Otras consultoras; LUTEC con presupuesto elevado',
          notes: 'Incluir actualización semestral, píldoras mensuales y sesión anual con experto.',
        },
      });
      await store.addVersion(p.id, { content: SEED_DEPORVILLAGE, author: 'marcelo', note: 'Versión enviada para revisión', source: 'seed' });
      console.log('[proposals] seeded Deporvillage');
    } catch (e) { console.error('[proposals] seed failed:', e.message); }
  })();

  app.get('/api/proposals', requireAuth, wrap(async (req, res) => res.json({ proposals: await store.listProposals(), storage: store.kind })));

  app.post('/api/proposals', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.client) return res.status(400).json({ error: 'client is required' });
    const p = await store.createProposal({
      client: b.client, country: b.country, language: b.language, currency: b.currency, title: b.title,
      intake: b.intake || {}, owner: b.owner || who(req), created_by: who(req),
    });
    res.json(p);
  }));

  app.get('/api/proposals/:id', requireAuth, wrap(async (req, res) => {
    const p = await store.getProposal(req.params.id);
    return p ? res.json(p) : res.status(404).json({ error: 'Not found' });
  }));

  app.patch('/api/proposals/:id', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    const cur = await store.getProposal(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Not found' });
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
      // Approval gate: only admins approve; a proposal is sent only once approved.
      if (b.status === 'approved' && !isAdmin(req)) return res.status(403).json({ error: 'Only an admin can approve a proposal' });
      if (b.status === 'sent' && cur.status !== 'approved' && !isAdmin(req)) return res.status(403).json({ error: 'Approve the proposal before marking it sent' });
    }
    res.json(await store.updateProposal(req.params.id, b));
  }));

  app.delete('/api/proposals/:id', requireAuth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only an admin can delete proposals' });
    await store.deleteProposal(req.params.id);
    res.json({ success: true });
  }));

  app.post('/api/proposals/:id/draft', requireAuth, wrap(async (req, res) => {
    const p = await store.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const lib = await library();
    // Finished proposals the model imitates: the latest version of every other proposal + the seed.
    const others = await store.listProposals();
    const examples = [{ content: SEED_DEPORVILLAGE }];
    for (const o of others.filter((x) => x.id !== p.id).slice(0, 6)) {
      const v = await store.getVersion(o.id, 'latest');
      if (v && o.client !== 'Deporvillage') examples.push({ content: v.content });
    }
    const intake = { client: p.client, country: p.country, language: p.language, currency: p.currency, ...p.intake };
    const content = await draftProposal({ intake, library: lib, examples, instructions: (req.body || {}).instructions });
    const n = await store.addVersion(p.id, { content, author: who(req), note: (req.body || {}).note || 'Borrador de Claude', source: 'ai_draft' });
    res.json({ version: n, content });
  }));

  app.post('/api/proposals/:id/revise', requireAuth, wrap(async (req, res) => {
    const { instruction, fromVersion = 'latest' } = req.body || {};
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });
    const p = await store.getProposal(req.params.id);
    const v = p && await store.getVersion(p.id, fromVersion);
    if (!v) return res.status(404).json({ error: 'Version not found' });
    const content = await reviseProposal({ content: v.content, instruction, intake: p.intake, library: await library() });
    const n = await store.addVersion(p.id, { content, author: who(req), note: instruction.slice(0, 200), source: 'ai_revise' });
    res.json({ version: n, content });
  }));

  app.post('/api/proposals/:id/versions', requireAuth, wrap(async (req, res) => {
    const { content, note } = req.body || {};
    if (!content || !content.cover || !Array.isArray(content.sections)) return res.status(400).json({ error: 'content must have cover and sections' });
    const p = await store.getProposal(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    const n = await store.addVersion(p.id, { content, author: who(req), note: note || 'Edición manual', source: 'manual' });
    res.json({ version: n });
  }));

  app.get('/api/proposals/:id/versions/:n', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    return v ? res.json(v) : res.status(404).json({ error: 'Version not found' });
  }));

  app.post('/api/proposals/:id/clone', requireAuth, wrap(async (req, res) => {
    const src = await store.getProposal(req.params.id);
    if (!src) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    const p = await store.createProposal({
      client: b.client || `${src.client} (copia)`, country: b.country || src.country, language: src.language, currency: src.currency,
      title: src.title, intake: { ...src.intake, client: b.client || src.intake.client }, owner: who(req), created_by: who(req),
    });
    const v = await store.getVersion(src.id, 'latest');
    if (v) await store.addVersion(p.id, { content: v.content, author: who(req), note: `Clonada de ${src.client} v${v.version}`, source: 'clone' });
    res.json(await store.getProposal(p.id));
  }));

  // Branded document. Same renderer as the CLI PDF build, so on-screen = on-paper.
  app.get('/proposals/:id/v/:n', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    if (!v) return res.status(404).send('Version not found');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderProposal(v.content, { autoPrint: req.query.print === '1' }));
  }));

  app.get('/api/proposal-library', requireAuth, wrap(async (req, res) => res.json(await library())));

  app.put('/api/proposal-library/:key', requireAuth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only an admin can edit the library' });
    if (!(req.params.key in DEFAULT_LIBRARY)) return res.status(400).json({ error: `Unknown library key. Use one of ${Object.keys(DEFAULT_LIBRARY).join(', ')}` });
    await store.setLibrary(req.params.key, (req.body || {}).value, who(req));
    res.json({ success: true });
  }));
}

module.exports = { mountProposals };
