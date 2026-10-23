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
//   GET    /proposals/:id/v/:n/brief         one-page brief of that version (?print=1 for PDF)
//   GET    /proposals/:id/v/:n/gdoc          Google Docs version (.html for Drive)
//   GET    /api/proposal-library             library (defaults merged with saved overrides)
//   PUT    /api/proposal-library/:key        admin only (also edits the playbook)
//
//   Past proposals (archive) — upload, learn, build from:
//   GET    /api/proposal-archive              uploaded past proposals (digests, no files)
//   POST   /api/proposal-archive              upload ONE file as the raw body (?filename=&client=&outcome=&notes=)
//   POST   /api/proposal-archive/text         paste a proposal as text {text, client, outcome, notes}
//   GET    /api/proposal-archive/:id          one item, with its extracted text
//   PATCH  /api/proposal-archive/:id          client / outcome / notes / year / country / industry
//   DELETE /api/proposal-archive/:id          admin only
//   GET    /api/proposal-archive/:id/file     original file
//   POST   /api/proposal-archive/:id/reanalyze
//   POST   /api/proposal-archive/:id/use      new proposal for {client} that starts from this one
//   POST   /api/proposal-archive/:id/import   this one as an editable Studio proposal (same client)
//   GET    /api/proposal-references           everything that can be pinned as a reference in an intake
//   GET    /api/proposal-playbook             what the team has learned (Claude-written, admin-editable)
//   POST   /api/proposal-playbook/rebuild     rewrite the playbook from every past proposal
// ---------------------------------------------------------------------------
const { createStore, STATUSES } = require('./store');
const { DEFAULT_LIBRARY } = require('./library');
const { renderProposal, renderBrief } = require('./render');
const { renderDeck } = require('./deck');
const { getStyle, listStyles, CURRENT: CURRENT_STYLE, STYLES } = require('./styles');
const { checkProposal, fixInstruction } = require('./brandcheck');
const brandKit = require('./brand-kit');
const { renderGoogleDocHtml } = require('./gdoc');
const { draftProposal, reviseProposal } = require('./ai');
const SEED_DEPORVILLAGE = require('./seeds/deporvillage.json');
const express = require('express');
const archiveLib = require('./archive');

const studioSummary = (p, v, edits) => ({
  ref: `p:${p.id}`, client: p.client, status: p.status, final: !!p.final_version, title: p.title, language: p.language, edits,
  programs: (p.intake || {}).programs,
  cover: v && v.content && v.content.cover ? { headline: v.content.cover.headline, accent: v.content.cover.accent, subhead: v.content.cover.subhead } : undefined,
  sections: v && v.content && Array.isArray(v.content.sections) ? v.content.sections.map((x) => [x.headline, x.accent].filter(Boolean).join(' ')) : undefined,
});
// A compact outline of a version, to compare Claude's first draft with what the team sent.
const outline = (c) => ({
  cover: c && c.cover ? [c.cover.headline, c.cover.accent].filter(Boolean).join(' ') : undefined,
  sections: ((c && c.sections) || []).map((x) => ({ h: [x.headline, x.accent].filter(Boolean).join(' '), lead: x.lead, blocks: (x.blocks || []).map((b) => b.kind).join(',') })),
  totals: ((c && c.sections) || []).flatMap((x) => (x.blocks || []).filter((b) => b.kind === 'table' && b.total).map((b) => b.total.join(' | '))),
});
const archiveForRank = (a) => ({ ref: `a:${a.id}`, client: a.client, outcome: a.outcome, year: a.year, notes: a.notes, language: a.language || (a.digest || {}).language, digest: a.digest });

function mountProposals(app, requireAuth, store = createStore()) {
  console.log(`[proposals] storage: ${store.kind}`);

  const library = async () => ({ ...DEFAULT_LIBRARY, ...(await store.getLibrary()) });

  // Past proposals are analysed one at a time in the background (each is one Claude call).
  let queue = Promise.resolve();
  async function analyse(id) {
    const a = await store.getArchive(id, { withFile: true });
    if (!a) return;
    try {
      const extracted = a.file ? await archiveLib.extract({ buffer: a.file, filename: a.filename, mime: a.mime }) : { kind: 'text', text: a.text };
      if (extracted.text && !a.text) await store.updateArchive(id, { text: extracted.text });
      const d = await archiveLib.digestProposal({ extracted, hints: a });
      await store.updateArchive(id, {
        digest: d, status: 'ready', error: null, client: a.client || d.client || null, country: a.country || d.country || null,
        language: d.language || null, industry: a.industry || d.industry || null, year: a.year || (Number.isInteger(d.year) ? d.year : null), total: d.total || null,
      });
      console.log(`[proposals] archive ${id} analysed (${d.client || a.filename})`);
    } catch (e) {
      console.error('[proposals] archive analysis failed:', e.message);
      await store.updateArchive(id, { status: 'error', error: e.message.slice(0, 500) }).catch(() => {});
    }
  }
  const enqueue = (id) => { queue = queue.then(() => analyse(id)); return queue; };
  // Anything still "processing" after a restart gets picked up again.
  setTimeout(async () => {
    try { (await store.listArchive()).filter((a) => a.status === 'processing').forEach((a) => enqueue(a.id)); } catch (e) { /* storage not ready */ }
  }, 20000).unref?.();

  // Studio proposals with the version to learn from: the FINAL one the team
  // sent (set when a proposal is marked sent/won), else the latest.
  async function studioPast(excludeId) {
    const out = [];
    for (const o of (await store.listProposals()).filter((x) => x.id !== excludeId)) {
      const v = (o.final_version && await store.getVersion(o.id, o.final_version)) || await store.getVersion(o.id, 'latest');
      if (v) out.push({ o, v });
    }
    return out;
  }
  // What the team changed between Claude's first draft and the final version.
  async function editsFor(o, finalV) {
    const p = await store.getProposal(o.id);
    const vs = (p && p.versions) || [];
    const notes = vs.filter((x) => ['ai_revise', 'manual'].includes(x.source) && x.note && x.version <= finalV.version).map((x) => x.note).reverse().slice(0, 15);
    const first = vs.filter((x) => x.source === 'ai_draft').map((x) => x.version).sort((a, b) => a - b)[0];
    if (!first || first >= finalV.version) return notes.length ? { notes } : undefined;
    const d = await store.getVersion(o.id, first);
    return { notes, claude_first_draft: outline(d && d.content), final_sent: outline(finalV.content) };
  }
  async function rebuildPlaybook(by, language = 'es') {
    const archive = (await store.listArchive()).filter((a) => a.status === 'ready' && a.digest).map(archiveForRank);
    const studio = [];
    for (const { o, v } of await studioPast()) studio.push(studioSummary(o, v, o.final_version ? await editsFor(o, v) : undefined));
    if (!archive.length && !studio.length) { const e = new Error('Upload or build at least one proposal first'); e.status = 400; throw e; }
    const lib = await library();
    const text = await archiveLib.buildPlaybook({ archive, studio, language, teamRules: (lib.team_rules || []).map((r) => r.text || r) });
    const value = { text, built_at: new Date().toISOString(), built_by: by, built_from: { archive: archive.length, studio: studio.length, finals: studio.filter((x) => x.final).length } };
    await store.setLibrary('playbook', value, by);
    return value;
  }
  // Marking a proposal sent/won freezes its final version and refreshes the playbook in the background.
  let pbTimer = null;
  const schedulePlaybook = (by) => {
    if (!process.env.ANTHROPIC_API_KEY || process.env.PROPOSALS_AUTO_PLAYBOOK === '0') return;
    clearTimeout(pbTimer);
    pbTimer = setTimeout(() => rebuildPlaybook(`${by} (auto)`).then(() => console.log('[proposals] playbook rebuilt from final versions')).catch((e) => console.error('[proposals] playbook rebuild failed:', e.message)), 4000);
    pbTimer.unref?.();
  };
  const runCheck = async (content) => checkProposal(content, { library: await library() });
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
      intake: b.intake || {}, owner: b.owner || who(req), created_by: who(req), style: getStyle(b.style).id,
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
      if (['approved', 'won', 'lost'].includes(b.status) && !isAdmin(req)) return res.status(403).json({ error: 'Only an admin can approve or close a proposal' });
      if (b.status === 'sent' && cur.status !== 'approved' && !isAdmin(req)) return res.status(403).json({ error: 'Approve the proposal before marking it sent' });
    }
    if (b.style !== undefined && !STYLES.some((x) => x.id === b.style)) return res.status(400).json({ error: `style must be one of ${STYLES.map((x) => x.id).join(', ')}` });
    const patch = { ...b };
    delete patch.final_version;
    // Sent or won = this is what the client got: freeze it as the final version the Studio learns from.
    if (['sent', 'won'].includes(b.status)) {
      const latest = await store.getVersion(cur.id, 'latest');
      if (latest && (b.status !== cur.status || !cur.final_version)) patch.final_version = latest.version;
    }
    const out = await store.updateProposal(req.params.id, patch);
    if (patch.final_version) schedulePlaybook(who(req));
    res.json(out);
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
    const intake = { client: p.client, country: p.country, language: p.language, currency: p.currency, ...p.intake };
    const refs = intake.references || [];
    // Studio proposals the model imitates (JSON format): pinned ones always, then the latest few + the seed.
    const studio = await studioPast(p.id);
    const examples = [{ content: SEED_DEPORVILLAGE, ref: null }];
    studio.forEach(({ o, v }, i) => {
      const ref = `p:${o.id}`;
      if (refs.includes(ref) || o.final_version || (i < 6 && o.client !== 'Deporvillage')) examples.push({ content: v.content, ref, outcome: o.status, final: !!o.final_version, client: o.client });
    });
    // Uploaded past proposals: pinned ones + the most similar (won first).
    const archive = (await store.listArchive()).filter((a) => a.status === 'ready' && a.digest).map(archiveForRank);
    const past = archiveLib.rankPast(intake, archive, 3);
    const playbook = (lib.playbook && lib.playbook.text) || '';
    const content = await draftProposal({ intake, library: lib, examples, past, playbook, instructions: (req.body || {}).instructions });
    const finals = examples.filter((e) => e.final).map((e) => e.client);
    const used = [...new Set([...past.map((x) => x.client), ...finals].filter(Boolean))];
    const note = (req.body || {}).note || `Borrador de Claude${used.length ? ` · aprende de: ${used.join(', ')}` : ''}${playbook ? ' + playbook' : ''}`;
    let n = await store.addVersion(p.id, { content, author: who(req), note: note.slice(0, 300), source: 'ai_draft' });
    let check = await runCheck(content);
    let finalContent = content;
    // Brand errors (Forbes phrasing, terminology, totals) get one automatic fix pass.
    if (check.errors) {
      try {
        finalContent = await reviseProposal({ content, instruction: fixInstruction(check, ['error']), intake: p.intake, library: lib });
        n = await store.addVersion(p.id, { content: finalContent, author: who(req), note: 'Corrección automática del brand check', source: 'ai_revise' });
        check = await runCheck(finalContent);
      } catch (e) { console.error('[proposals] auto brand fix failed:', e.message); }
    }
    res.json({ version: n, content: finalContent, learnedFrom: used, playbook: !!playbook, check });
  }));

  app.post('/api/proposals/:id/revise', requireAuth, wrap(async (req, res) => {
    const { instruction, fromVersion = 'latest' } = req.body || {};
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });
    const p = await store.getProposal(req.params.id);
    const v = p && await store.getVersion(p.id, fromVersion);
    if (!v) return res.status(404).json({ error: 'Version not found' });
    const lib = await library();
    const content = await reviseProposal({ content: v.content, instruction, intake: p.intake, library: lib });
    const n = await store.addVersion(p.id, { content, author: who(req), note: instruction.slice(0, 200), source: 'ai_revise' });
    // "Make it a rule": the instruction applies to every future proposal.
    if ((req.body || {}).makeRule && isAdmin(req)) {
      const rules = [...(lib.team_rules || []), { text: instruction.slice(0, 400), by: who(req), at: new Date().toISOString(), from: p.client }];
      await store.setLibrary('team_rules', rules, who(req));
    }
    res.json({ version: n, content, check: await runCheck(content), ruleSaved: !!((req.body || {}).makeRule && isAdmin(req)) });
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
      title: src.title, intake: { ...src.intake, client: b.client || src.intake.client }, owner: who(req), created_by: who(req), style: src.style || CURRENT_STYLE.id,
    });
    const v = await store.getVersion(src.id, 'latest');
    if (v) await store.addVersion(p.id, { content: v.content, author: who(req), note: `Clonada de ${src.client} v${v.version}`, source: 'clone' });
    res.json(await store.getProposal(p.id));
  }));

  // Branded document. Same renderer as the CLI PDF build, so on-screen = on-paper.
  // ?style= previews another style without saving it; otherwise the proposal's own style.
  const styleOf = async (req) => req.query.style || ((await store.getProposal(req.params.id)) || {}).style || CURRENT_STYLE.id;
  app.get('/proposals/:id/v/:n', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    if (!v) return res.status(404).send('Version not found');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderProposal(v.content, { autoPrint: req.query.print === '1', style: await styleOf(req) }));
  }));

  // The same version as a 16:9 presentation (?print=1 opens Save as PDF, landscape).
  app.get('/proposals/:id/v/:n/deck', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    if (!v) return res.status(404).send('Version not found');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDeck(v.content, { autoPrint: req.query.print === '1', style: await styleOf(req) }));
  }));

  // One-page brief, derived from the same version (add ?print=1 to save as PDF).
  app.get('/proposals/:id/v/:n/brief', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    if (!v) return res.status(404).send('Version not found');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderBrief(v.content, { autoPrint: req.query.print === '1', style: await styleOf(req) }));
  }));

  // Google Docs version: a .html that Google Drive opens as an editable Google Doc
  // (Drive → New → File upload, then Open with Google Docs).
  app.get('/proposals/:id/v/:n/gdoc', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    if (!v) return res.status(404).send('Version not found');
    const p = await store.getProposal(req.params.id);
    const name = `Propuesta 4Geeks - ${(p && p.client) || 'cliente'} - v${v.version}.html`.replace(/[^\w .\-áéíóúñÁÉÍÓÚÑ]/g, '');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(renderGoogleDocHtml(v.content));
  }));

  // Brand check of one version.
  app.get('/api/proposals/:id/versions/:n/check', requireAuth, wrap(async (req, res) => {
    const v = await store.getVersion(req.params.id, req.params.n);
    if (!v) return res.status(404).json({ error: 'Version not found' });
    res.json(await runCheck(v.content));
  }));

  // "Fix with Claude": every fixable finding becomes one revision → new version.
  app.post('/api/proposals/:id/fix-brand', requireAuth, wrap(async (req, res) => {
    const p = await store.getProposal(req.params.id);
    const v = p && await store.getVersion(p.id, (req.body || {}).fromVersion || 'latest');
    if (!v) return res.status(404).json({ error: 'Version not found' });
    const lib = await library();
    const instruction = fixInstruction(checkProposal(v.content, { library: lib }));
    if (!instruction) return res.json({ version: v.version, nothing: true, check: checkProposal(v.content, { library: lib }) });
    const content = await reviseProposal({ content: v.content, instruction, intake: p.intake, library: lib });
    const n = await store.addVersion(p.id, { content, author: who(req), note: 'Arreglos del brand check', source: 'ai_revise' });
    res.json({ version: n, check: checkProposal(content, { library: lib }) });
  }));

  app.get('/api/proposal-styles', requireAuth, wrap(async (req, res) => res.json({ styles: listStyles(req.query.lang === 'en' ? 'en' : 'es'), current: CURRENT_STYLE.id })));

  // Everything the Studio applies, in one place (Brand kit tab).
  app.get('/api/proposal-brand', requireAuth, wrap(async (req, res) => {
    const lib = await library();
    res.json({ ...brandKit.summary(), styles: listStyles(req.query.lang === 'en' ? 'en' : 'es'), currentStyle: CURRENT_STYLE.id, teamRules: lib.team_rules || [] });
  }));

  app.delete('/api/proposal-team-rules/:i', requireAuth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only an admin can remove team rules' });
    const lib = await library();
    const rules = (lib.team_rules || []).filter((_, i) => i !== Number(req.params.i));
    await store.setLibrary('team_rules', rules, who(req));
    res.json({ teamRules: rules });
  }));

  app.get('/api/proposal-library', requireAuth, wrap(async (req, res) => res.json(await library())));

  app.put('/api/proposal-library/:key', requireAuth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only an admin can edit the library' });
    if (!(req.params.key in DEFAULT_LIBRARY)) return res.status(400).json({ error: `Unknown library key. Use one of ${Object.keys(DEFAULT_LIBRARY).join(', ')}` });
    await store.setLibrary(req.params.key, (req.body || {}).value, who(req));
    res.json({ success: true });
  }));

  // ---------------- Past proposals (archive) ----------------
  const OUT = archiveLib.OUTCOMES;
  const checkOutcome = (o) => (o === undefined || OUT.includes(o));

  app.get('/api/proposal-archive', requireAuth, wrap(async (req, res) => {
    const items = (await store.listArchive()).map((a) => ({ ...a, ref: `a:${a.id}` }));
    res.json({ items, outcomes: OUT });
  }));

  app.post('/api/proposal-archive', requireAuth, express.raw({ type: () => true, limit: archiveLib.MAX_BYTES }), wrap(async (req, res) => {
    const filename = String(req.query.filename || '').slice(0, 200);
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!filename || !buf || !buf.length) return res.status(400).json({ error: 'Send the file as the request body with ?filename=' });
    const mime = req.headers['content-type'] || '';
    if (!archiveLib.fileKind(filename, mime)) return res.status(400).json({ error: 'Unsupported file. Upload a PDF, Word (.docx), PowerPoint (.pptx) or text file. For Google Docs/Slides: File → Download → PDF.' });
    const outcome = req.query.outcome || 'unknown';
    if (!checkOutcome(outcome)) return res.status(400).json({ error: `outcome must be one of ${OUT.join(', ')}` });
    const a = await store.createArchive({ client: req.query.client || null, outcome, notes: req.query.notes || null, filename, mime, size: buf.length, file: buf, uploaded_by: who(req) });
    enqueue(a.id);
    res.json({ ...a, ref: `a:${a.id}` });
  }));

  app.post('/api/proposal-archive/text', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.text || String(b.text).trim().length < 200) return res.status(400).json({ error: 'Paste the full proposal text (at least a few paragraphs)' });
    if (!checkOutcome(b.outcome)) return res.status(400).json({ error: `outcome must be one of ${OUT.join(', ')}` });
    const a = await store.createArchive({ client: b.client || null, outcome: b.outcome || 'unknown', notes: b.notes || null, filename: b.title || 'Texto pegado', mime: 'text/plain', size: String(b.text).length, text: String(b.text).slice(0, 200000), uploaded_by: who(req) });
    enqueue(a.id);
    res.json({ ...a, ref: `a:${a.id}` });
  }));

  app.get('/api/proposal-archive/:id', requireAuth, wrap(async (req, res) => {
    const a = await store.getArchive(req.params.id);
    return a ? res.json({ ...a, ref: `a:${a.id}` }) : res.status(404).json({ error: 'Not found' });
  }));

  app.patch('/api/proposal-archive/:id', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    if (!checkOutcome(b.outcome)) return res.status(400).json({ error: `outcome must be one of ${OUT.join(', ')}` });
    const patch = {};
    ['client', 'outcome', 'notes', 'country', 'industry'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k] || null; });
    if (b.year !== undefined) patch.year = b.year ? Number(b.year) || null : null;
    const a = await store.updateArchive(req.params.id, patch);
    return a ? res.json(a) : res.status(404).json({ error: 'Not found' });
  }));

  app.delete('/api/proposal-archive/:id', requireAuth, wrap(async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Only an admin can delete past proposals' });
    await store.deleteArchive(req.params.id);
    res.json({ success: true });
  }));

  app.get('/api/proposal-archive/:id/file', requireAuth, wrap(async (req, res) => {
    const a = await store.getArchive(req.params.id, { withFile: true });
    if (!a) return res.status(404).send('Not found');
    const name = a.filename || 'propuesta';
    if (!a.file) { res.set('Content-Type', 'text/plain; charset=utf-8'); res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name.replace(/\.\w+$/, '') + '.txt')}`); return res.send(a.text || ''); }
    res.set('Content-Type', a.mime || 'application/octet-stream');
    res.set('Content-Disposition', `${/pdf/.test(a.mime || '') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(a.file);
  }));

  app.post('/api/proposal-archive/:id/reanalyze', requireAuth, wrap(async (req, res) => {
    const a = await store.updateArchive(req.params.id, { status: 'processing', error: null });
    if (!a) return res.status(404).json({ error: 'Not found' });
    enqueue(a.id);
    res.json(a);
  }));

  // Start a NEW client's proposal from this one: its programs and prices become the intake, and it is pinned as the reference.
  app.post('/api/proposal-archive/:id/use', requireAuth, wrap(async (req, res) => {
    const a = await store.getArchive(req.params.id);
    if (!a || !a.digest) return res.status(400).json({ error: 'This past proposal is not analysed yet' });
    const client = String((req.body || {}).client || '').trim();
    if (!client) return res.status(400).json({ error: 'client is required' });
    const intake = archiveLib.intakeFromDigest({ ...a, ref: `a:${a.id}` }, client);
    const p = await store.createProposal({ client, country: intake.country, language: intake.language, currency: intake.currency, intake, owner: who(req), created_by: who(req) });
    res.json(p);
  }));

  // Bring an old proposal into the Studio as-is (same client), so it can be revised, re-sent or cloned.
  app.post('/api/proposal-archive/:id/import', requireAuth, wrap(async (req, res) => {
    const a = await store.getArchive(req.params.id, { withFile: true });
    if (!a || !a.digest) return res.status(400).json({ error: 'This past proposal is not analysed yet' });
    if (a.proposal_id && await store.getProposal(a.proposal_id)) return res.json(await store.getProposal(a.proposal_id));
    const extracted = a.file ? await archiveLib.extract({ buffer: a.file, filename: a.filename, mime: a.mime }) : { text: a.text };
    const content = await archiveLib.importAsContent({ archiveItem: a, extracted, library: await library() });
    const intake = { ...archiveLib.intakeFromDigest({ ...a, ref: `a:${a.id}` }), notes: `Importada de ${a.filename || 'archivo'}` };
    const p = await store.createProposal({ client: a.client || intake.client || 'Cliente', country: intake.country, language: intake.language, currency: intake.currency,
      title: (a.digest || {}).title || null, intake, owner: who(req), created_by: who(req) });
    await store.addVersion(p.id, { content, author: who(req), note: `Importada de ${a.filename || 'archivo'}`, source: 'import' });
    if (isAdmin(req) && ['won', 'lost', 'sent'].includes(a.outcome)) await store.updateProposal(p.id, { status: a.outcome });
    await store.updateArchive(a.id, { proposal_id: p.id });
    res.json(await store.getProposal(p.id));
  }));

  app.get('/api/proposal-references', requireAuth, wrap(async (req, res) => {
    const archive = (await store.listArchive()).filter((a) => a.status === 'ready')
      .map((a) => ({ ref: `a:${a.id}`, kind: 'archive', client: a.client || (a.digest || {}).client, year: a.year, outcome: a.outcome, title: (a.digest || {}).title || a.filename }));
    const studio = (await store.listProposals()).filter((p) => p.latest_version && p.id !== req.query.exclude)
      .map((p) => ({ ref: `p:${p.id}`, kind: 'studio', client: p.client, year: p.created_at ? Number(p.created_at.slice(0, 4)) : null, outcome: p.status, title: p.title }));
    res.json({ references: [...archive, ...studio] });
  }));

  app.get('/api/proposal-playbook', requireAuth, wrap(async (req, res) => {
    const lib = await library();
    const ready = (await store.listArchive()).filter((a) => a.status === 'ready').length;
    res.json({ ...(lib.playbook || {}), archiveReady: ready });
  }));

  app.post('/api/proposal-playbook/rebuild', requireAuth, wrap(async (req, res) => {
    res.json(await rebuildPlaybook(who(req), (req.body || {}).language || 'es'));
  }));
}


module.exports = { mountProposals };
