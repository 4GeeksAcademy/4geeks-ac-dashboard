'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { renderProposal } = require('../lib/proposals/render');
const { renderDeck, expand } = require('../lib/proposals/deck');
const { checkProposal, fixInstruction } = require('../lib/proposals/brandcheck');
const { CURRENT, getStyle, STYLES } = require('../lib/proposals/styles');
const { DEFAULT_LIBRARY } = require('../lib/proposals/library');
const SEED = require('../lib/proposals/seeds/deporvillage.json');

test('styles: the current style is the default and the yellow-touches one', () => {
  assert.equal(STYLES.filter((s) => s.current).length, 1);
  assert.equal(getStyle(undefined).id, CURRENT.id);
  assert.equal(getStyle('nope').id, CURRENT.id);
  assert.equal(CURRENT.features.yellow, true);
});

test('renderer: yellow touches + closing in the current style, none in classic', () => {
  const y = renderProposal(SEED, { embedFontsLink: false });
  assert.match(y, /class="st-yellow"/);
  assert.match(y, /<span class="sec-n">01<\/span>/);
  assert.match(y, /class="cv-toc"/);
  assert.match(y, /class="hilite strip"/);
  assert.match(y, /<section class="page closing">/);
  assert.match(y, /Siguiente paso: vgomez@4geeks\.co/);
  const c = renderProposal(SEED, { embedFontsLink: false, style: 'brand-2026-10-classic' });
  assert.match(c, /class="st-classic"/);
  assert.ok(!/<section class="page closing">/.test(c));
  assert.ok(!/class="cv-toc"/.test(c));
});

test('deck: 16:9, cover, agenda, blue slides for panels, closing; dense cards split', () => {
  const d = renderDeck(SEED, { embedFontsLink: false });
  assert.match(d, /size:13\.333in 7\.5in/);
  assert.match(d, /class="slide d-cover"/);
  assert.match(d, /class="slide agenda"/);
  assert.match(d, /class="slide blue d-closing"/);
  const panels = SEED.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'panel').length;
  assert.equal((d.match(/<section class="slide blue">/g) || []).length, panels);
  const parts = expand([{ kind: 'cards', title: 'T', items: [1, 2, 3, 4, 5].map((n) => ({ title: `c${n}` })) }]);
  assert.deepEqual(parts.map((b) => b.items.length), [2, 2, 1]);
  assert.equal(parts[1].title, '');
});

test('brand check: the sent Deporvillage is clean; bad phrasing, terms, totals and register are caught', () => {
  assert.equal(checkProposal(SEED, { library: DEFAULT_LIBRARY }).errors, 0);
  const bad = {
    meta: { language: 'es' }, client: { name: 'X', country: 'Chile' },
    cover: { headline: 'Un titular muy largo que no cabe en una portada bonita', accent: '' },
    sections: [
      { eyebrow: 'Quiénes somos', headline: 'Somos', accent: 'top.', blocks: [
        { kind: 'text', paragraphs: ['Forbes nos eligió entre los top 5 bootcamps.', 'Vuestro equipo y los proveedores del curso: 84 % de inserción laboral.', 'Más de 6.000 graduados.'] },
        { kind: 'table', columns: ['P', 'Total'], rows: [['A', '1.000 €'], ['B', '2.000 €']], total: ['Total', '4.000 €'] },
        { kind: 'panel', title: 'a' }, { kind: 'panel', title: 'b' },
      ] },
    ],
  };
  const r = checkProposal(bad, { library: DEFAULT_LIBRARY });
  const rules = new Set(r.issues.map((i) => i.rule));
  ['forbes', 'terms', 'totals', 'register', 'hiring_disclaimer', 'graduates', 'accent', 'headline_length', 'one_panel', 'closing'].forEach((x) => assert.ok(rules.has(x), x));
  assert.ok(r.score < 50);
  assert.match(fixInstruction(r, ['error']), /Forbes/);
});

test('routes: style dropdown, final version learning, brand check, team rules, deck', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psb-'));
  process.env.PROPOSALS_SEED = '0'; process.env.ANTHROPIC_API_KEY = 'test'; process.env.PROPOSALS_AUTO_PLAYBOOK = '0';
  const { fileStore } = require('../lib/proposals/store');
  const { mountProposals } = require('../lib/proposals/routes');
  const store = fileStore(dir);
  const app = express(); app.use(express.json({ limit: '2mb' }));
  mountProposals(app, (req, res, next) => { req.user = { name: 'marcelo', admin: true }; next(); }, store);
  const server = app.listen(0); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = global.fetch; const calls = [];
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith('https://api.anthropic.com')) return realFetch(url, opts);
    const body = JSON.parse(opts.body); calls.push(body);
    const text = JSON.stringify({ ...SEED, client: { name: 'Nuevo', country: 'España' } });
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }), text: async () => text };
  };
  t.after(() => { global.fetch = realFetch; });
  const j = async (url, method = 'GET', body) => {
    const r = await realFetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
  };

  // Styles: listed, current by default, switchable, validated.
  const st = await j('/api/proposal-styles');
  assert.equal(st.current, CURRENT.id);
  assert.match(st.styles.find((x) => x.current).name, /actual/);
  const a = await j('/api/proposals', 'POST', { client: 'Deporvillage', language: 'es', intake: {} });
  assert.equal(a.style, CURRENT.id);
  await store.addVersion(a.id, { content: SEED, author: 'marcelo', source: 'ai_draft' });
  await store.addVersion(a.id, { content: SEED, author: 'victor', note: 'Baja AI Builders a 50.000 €', source: 'ai_revise' });
  await assert.rejects(j(`/api/proposals/${a.id}`, 'PATCH', { style: 'made-up' }), /style must be/);
  await j(`/api/proposals/${a.id}`, 'PATCH', { style: 'brand-2026-10-classic' });
  const html = await (await realFetch(`${base}/proposals/${a.id}/v/latest`)).text();
  assert.match(html, /st-classic/);
  assert.match(await (await realFetch(`${base}/proposals/${a.id}/v/latest?style=${CURRENT.id}`)).text(), /st-yellow/);
  assert.match(await (await realFetch(`${base}/proposals/${a.id}/v/2/deck`)).text(), /class="slide d-cover"/);

  // Marking it sent freezes the final version.
  const sent = await j(`/api/proposals/${a.id}`, 'PATCH', { status: 'sent' });
  assert.equal(sent.final_version, 2);

  // The playbook compares Claude's first draft with the final the team sent.
  const pb = await j('/api/proposal-playbook/rebuild', 'POST', {});
  assert.equal(pb.built_from.finals, 1);
  const pbPrompt = calls[calls.length - 1].messages[0].content;
  assert.match(pbPrompt, /"claude_first_draft"/);
  assert.match(pbPrompt, /Baja AI Builders a 50\.000 €/);

  // Brand check on a version.
  const chk = await j(`/api/proposals/${a.id}/versions/2/check`);
  assert.equal(chk.errors, 0);

  // A new draft learns from the FINAL version and the brand kit; team rules reach the prompt.
  const b = await j('/api/proposals', 'POST', { client: 'Nuevo', language: 'es', intake: {} });
  await j(`/api/proposals/${b.id}/revise`, 'POST', { instruction: 'x' }).catch(() => {}); // no version yet → 404
  const d = await j(`/api/proposals/${b.id}/draft`, 'POST', {});
  assert.ok(d.learnedFrom.includes('Deporvillage'));
  assert.equal(typeof d.check.score, 'number');
  const prompt = calls[calls.length - 1];
  assert.match(prompt.messages[0].content, /FINAL \(sent, Deporvillage\)/);
  assert.match(prompt.system, /among the coding bootcamps to consider/);
  const rv = await j(`/api/proposals/${b.id}/revise`, 'POST', { instruction: 'Siempre cierra con la fecha de firma propuesta', makeRule: true });
  assert.equal(rv.ruleSaved, true);
  const brand = await j('/api/proposal-brand');
  assert.equal(brand.teamRules[0].text, 'Siempre cierra con la fecha de firma propuesta');
  assert.ok(brand.styles.length >= 2 && brand.tokens.amber === '#F5B93E');
  await j(`/api/proposals/${b.id}/draft`, 'POST', {});
  assert.match(calls[calls.length - 1].system, /TEAM RULES[\s\S]*Siempre cierra con la fecha de firma propuesta/);
  await j('/api/proposal-team-rules/0', 'DELETE');
  assert.equal((await j('/api/proposal-brand')).teamRules.length, 0);
});
