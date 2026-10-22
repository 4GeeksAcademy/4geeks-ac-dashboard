'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const JSZip = require('jszip');
const { docxText, pptxText, rankPast, fileKind, intakeFromDigest } = require('../lib/proposals/archive');

async function makeDocx(paragraphs) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('reads Word and PowerPoint text, rejects unknown files', async () => {
  assert.equal(await docxText(await makeDocx(['Propuesta AI Culture', 'Inversión: 160.000 &amp; más'])), 'Propuesta AI Culture\nInversión: 160.000 & más');
  const zip = new JSZip();
  zip.file('ppt/slides/slide2.xml', '<p:sld><a:p><a:r><a:t>Precio</a:t></a:r></a:p></p:sld>');
  zip.file('ppt/slides/slide10.xml', '<p:sld><a:p><a:r><a:t>Gracias</a:t></a:r></a:p></p:sld>');
  zip.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>Portada</a:t></a:r></a:p></p:sld>');
  const t = await pptxText(await zip.generateAsync({ type: 'nodebuffer' }));
  assert.ok(t.indexOf('Portada') < t.indexOf('Precio') && t.indexOf('Precio') < t.indexOf('Gracias'));
  assert.equal(fileKind('x.pdf'), 'pdf');
  assert.equal(fileKind('deck.PPTX'), 'pptx');
  assert.equal(fileKind('old.doc', 'application/msword'), null);
});

test('references: pinned first, then won and similar', () => {
  const items = [
    { ref: 'a:1', client: 'Banco', outcome: 'lost', language: 'es', digest: { summary: 'bootcamp react banco' } },
    { ref: 'a:2', client: 'Retail', outcome: 'won', language: 'es', digest: { summary: 'retail gemini fluency' } },
    { ref: 'a:3', client: 'College', outcome: 'unknown', language: 'en', digest: { summary: 'website college' } },
    { ref: 'a:4', client: 'Pinned Co', outcome: 'unknown', language: 'en', digest: { summary: 'nothing in common' } },
  ];
  const r = rankPast({ language: 'es', industry: 'retail', tools: 'gemini', references: ['a:4'] }, items, 2);
  assert.deepEqual(r.map((x) => x.ref), ['a:4', 'a:2']);
  assert.equal(r[0].pinned, true);
  assert.equal(r[1].pinned, false);
  const intake = intakeFromDigest({ ref: 'a:2', client: 'Retail', year: 2025, outcome: 'won', digest: { language: 'es', currency: 'EUR', country: 'España', programs: [{ program: 'AI Fluency', seats: '150', price: '40.000 €' }] } }, 'Nuevo Cliente');
  assert.equal(intake.client, 'Nuevo Cliente');
  assert.equal(intake.country, ''); // a new client does not inherit the old one's country
  assert.deepEqual(intake.references, ['a:2']);
  assert.equal(intake.programs[0].price, '40.000 €');
});

test('upload → Claude digest → playbook → draft learns from it → import', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-'));
  process.env.PROPOSALS_SEED = '0';
  process.env.ANTHROPIC_API_KEY = 'test';
  const { fileStore } = require('../lib/proposals/store');
  const { mountProposals } = require('../lib/proposals/routes');
  const store = fileStore(dir);
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  mountProposals(app, (req, res, next) => { req.user = { name: 'marcelo', admin: true }; next(); }, store);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  // Stub only the Anthropic API; let calls to our own server through.
  const realFetch = global.fetch;
  const claudeCalls = [];
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith('https://api.anthropic.com')) return realFetch(url, opts);
    const body = JSON.parse(opts.body);
    claudeCalls.push(body);
    let text;
    if (/analyse past B2B/.test(body.system)) {
      text = JSON.stringify({ client: 'Retail SA', country: 'España', language: 'es', currency: 'EUR', year: 2025, summary: 'AI Fluency para 150.', programs: [{ program: 'AI Fluency', seats: '150', price: '40.000 €' }], total: '40.000 €', hooks: ['De usar la IA, a construir con ella.'], strengths: ['ROI claro'], weaknesses: ['Sin calendario'], condensed: 'Resumen…' });
    } else if (/sales enablement/.test(body.system)) {
      text = '## Lo que gana\n- ROI por persona (Retail SA)';
    } else {
      text = JSON.stringify({ meta: { title: 'X' }, cover: { headline: 'Hola', accent: 'IA' }, sections: [] });
    }
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }), text: async () => text };
  };
  t.after(() => { global.fetch = realFetch; });

  const j = async (url, method = 'GET', body) => {
    const r = await realFetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  };

  // Upload a .docx as the raw body.
  const docx = await makeDocx(['Propuesta para Retail SA', 'AI Fluency, 150 personas, 40.000 €']);
  const up = await realFetch(`${base}/api/proposal-archive?filename=retail.docx&outcome=won`, { method: 'POST', headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: docx });
  const item = await up.json();
  assert.equal(item.status, 'processing');
  let ready;
  for (let i = 0; i < 50 && !ready; i++) { const a = await j(`/api/proposal-archive/${item.id}`); if (a.status !== 'processing') ready = a; else await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(ready.status, 'ready', ready.error);
  assert.equal(ready.client, 'Retail SA');
  assert.equal(ready.year, 2025);
  assert.equal(ready.outcome, 'won');
  assert.match(ready.text, /150 personas/);
  assert.match(claudeCalls[0].messages[0].content, /Outcome: won/);

  // Unsupported files are refused before storing anything.
  const bad = await realFetch(`${base}/api/proposal-archive?filename=old.doc`, { method: 'POST', headers: { 'content-type': 'application/msword' }, body: Buffer.from('x') });
  assert.equal(bad.status, 400);

  // Original file comes back byte for byte.
  const file = Buffer.from(await (await realFetch(`${base}/api/proposal-archive/${item.id}/file`)).arrayBuffer());
  assert.ok(file.equals(docx));

  // Playbook from everything.
  const pb = await j('/api/proposal-playbook/rebuild', 'POST', {});
  assert.match(pb.text, /Lo que gana/);
  assert.equal(pb.built_from.archive, 1);

  // New client from the past one, then a draft: it gets the pinned digest and the playbook.
  const p = await j(`/api/proposal-archive/${item.id}/use`, 'POST', { client: 'Nuevo Cliente' });
  assert.deepEqual(p.intake.references, [`a:${item.id}`]);
  const refs = await j('/api/proposal-references');
  assert.ok(refs.references.some((r) => r.ref === `a:${item.id}` && r.outcome === 'won'));
  const d = await j(`/api/proposals/${p.id}/draft`, 'POST', {});
  assert.deepEqual(d.learnedFrom, ['Retail SA']);
  const prompt = claudeCalls[claudeCalls.length - 1].messages[0].content;
  assert.match(prompt, /PLAYBOOK/);
  assert.match(prompt, /"pinned_by_team":true/);
  assert.match(prompt, /De usar la IA, a construir con ella/);
  assert.ok(!/"references"/.test(prompt.split('LIBRARY')[0]), 'internal refs stay out of the intake text');

  // Import as an editable Studio proposal (same client), once.
  const imp = await j(`/api/proposal-archive/${item.id}/import`, 'POST');
  assert.equal(imp.client, 'Retail SA');
  assert.equal(imp.status, 'won');
  assert.equal(imp.versions[0].source, 'import');
  const again = await j(`/api/proposal-archive/${item.id}/import`, 'POST');
  assert.equal(again.id, imp.id);

  // Outcome edits are validated.
  await assert.rejects(j(`/api/proposal-archive/${item.id}`, 'PATCH', { outcome: 'maybe' }), /outcome must be/);
  assert.equal((await j(`/api/proposal-archive/${item.id}`, 'PATCH', { outcome: 'lost' })).outcome, 'lost');
});
