// ---------------------------------------------------------------------------
// Proposal Studio — Google Docs export.
//
// Turns the same proposal JSON into simple HTML that Google Drive converts into
// a native, editable Google Doc (headings, tables, lists keep their structure).
// Docs can't do the PDF's card layouts, so each block maps to its nearest
// Docs-native form, in brand colors and Arial (4geeks-brand: Office/Docs = Arial).
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const C = { blue: '#2381FF', deep: '#1B6FE0', tint: '#EFF6FF', soft: '#E9F2FE', ink: '#0B0B0F', body: '#5C6470', muted: '#8A93A0', amberSoft: '#FDF3D7', amberInk: '#A26A00', border: '#E6E9EF' };
const FONT = '';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
const acc = (t, a) => `${esc(t || '')}${a ? ` <i style="color:${C.blue}">${esc(a)}</i>` : ''}`;
const p = (html, st = '') => `<p style="color:${C.body};${st}">${html}</p>`;
const td = (html, st = '') => `<td style="border:1px solid ${C.border};padding:6pt;vertical-align:top;color:${C.body};${st}">${html}</td>`;
const th = (html) => `<td style="border:1px solid ${C.border};padding:6pt;background-color:${C.tint};font-weight:bold;color:${C.ink}">${html}</td>`;
const table = (rows) => `<table style="border-collapse:collapse;width:100%">${rows.map((r) => `<tr>${r}</tr>`).join('')}</table>${p('')}`;
const h3 = (t) => `<h3 style="${FONT}color:${C.ink}">${esc(t)}</h3>`;
const statCell = (i, bg) => td(`<span style="font-size:20pt;font-weight:bold;color:${i.tone === 'amber' ? C.amberInk : C.blue}">${esc(i.value)}</span><br>${inline(i.label)}`, `background-color:${bg || (i.tone === 'amber' ? C.amberSoft : C.soft)};border-color:#ffffff`);
const fmtMonths = (a, b) => {
  const s = Math.floor(a) + 1; const e = Math.max(s, Math.ceil(b - 0.1));
  return s === e ? `Mes ${s}` : `Meses ${s}–${e}`;
};

const B = {
  text: (b) => (b.paragraphs || [b.text]).filter(Boolean).map((x) => p(inline(x))).join(''),
  stats: (b) => table([(b.items || []).map((i) => statCell(i)).join('')]),
  steps: (b) => (b.title ? h3(b.title) : '') + table([(b.items || []).map((i, k) => td(`<b style="color:${C.ink}">${esc(i.n || k + 1)}. ${esc(i.title)}</b><br>${inline(i.text || '')}${i.when ? `<br><b style="color:${C.blue};font-size:8pt">${esc(i.when).toUpperCase()}</b>` : ''}`, `background-color:${C.soft};border-color:#ffffff`)).join('')]),
  phases: (b) => (b.title ? h3(b.title) : '') + table([(b.items || []).map((i, k) => td(`<b style="color:${C.blue};font-size:8pt">${k + 1} · ${esc(i.when || '').toUpperCase()}</b><br><b style="color:${C.ink};font-size:12pt">${esc(i.title)}</b><br><b style="color:${C.ink}">${inline(i.goal || '')}</b><br>${(i.items || []).map((x) => `• ${inline(x)}`).join('<br>')}`, `background-color:${C.soft};border-color:#ffffff`)).join('')]),
  timeline: (b) => (b.title ? h3(b.title) : '') + table([
    th('Programa') + th('Cuándo') + th('Qué pasa'),
    ...(b.lanes || []).map((l) => {
      const when = (l.items || []).length
        ? fmtMonths(Math.min(...l.items.map((i) => i.start)), Math.max(...l.items.map((i) => i.end)))
        : (() => { const ms = (l.marks || []).map((m) => Math.floor(m.at) + 1); return ms.length > 1 ? `Meses ${ms.slice(0, -1).join(', ')} y ${ms[ms.length - 1]}` : `Mes ${ms[0]}`; })();
      const what = [...(l.items || []).map((i) => i.text).filter((t, k, a) => a.length < 4 || k === 0), ...(l.marks || []).map((m) => m.text)];
      const cohorts = (l.items || []).length >= 4 ? `${l.items.length} cohortes (${l.items.map((i) => `mes ${Math.floor(i.start) + 1}`).join(', ')})` : null;
      return td(`<b style="color:${C.ink}">${esc(l.label)}</b><br><span style="font-size:9pt">${esc(l.sub || '')}</span>`) + td(`<b style="color:${C.blue}">${esc(when)}</b>`) + td(esc(cohorts || what.join(' · ')));
    }),
  ]) + (b.legend ? p(inline(b.legend.split(' Azul:')[0]), `font-size:8.5pt;color:${C.muted}`) : ''),
  cards: (b) => (b.title ? h3(b.title) : '') + (b.items || []).map((i) => `
    <h3 style="${FONT}color:${C.ink}">${esc(i.title)}${i.tag ? ` <span style="color:${C.blue};font-size:9pt;font-weight:normal">· ${esc(i.tag)}</span>` : ''}</h3>
    ${i.meta ? p(`<b style="color:${C.blue}">${inline(i.meta)}</b>`) : ''}
    ${i.tiers ? table([i.tiers.map((x) => td(`${esc(x.range)}<br><b style="color:${x.highlight ? C.amberInk : C.deep};font-size:12pt">${esc(x.price)}</b>`, `text-align:center;background-color:${x.highlight ? C.amberSoft : C.tint};border-color:#ffffff`)).join('')]) : ''}
    ${i.text ? p(inline(i.text)) : ''}
    ${i.bullets ? `<ul>${i.bullets.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}
    ${i.foot ? p(`<b style="color:${C.ink}">${inline(i.foot)}</b>`) : ''}`).join(''),
  table: (b) => (b.title ? h3(b.title) : '') + table([
    (b.columns || []).map(th).join(''),
    ...(b.rows || []).map((r) => r.map((c, k) => td(k === 0 ? `<b style="color:${C.ink}">${inline(c)}</b>` : inline(c), (b.align || [])[k] === 'r' ? 'text-align:right' : '')).join('')),
    ...(b.total ? [b.total.map((c, k) => td(`<b style="color:${k === b.total.length - 1 ? C.blue : C.ink}">${inline(c)}</b>`, `border-top:2px solid ${C.ink};${(b.align || [])[k] === 'r' ? 'text-align:right' : ''}`)).join('')] : []),
  ]),
  tiers: (b) => (b.title ? h3(b.title) : '') + table([(b.items || []).map((i) => td(`<b style="font-size:8pt">${esc(i.range).toUpperCase()}</b><br><span style="font-size:20pt;font-weight:bold;color:${i.highlight ? C.amberInk : C.blue}">${esc(i.price)}</span> ${esc(b.unit || '')}${i.note ? `<br><b style="color:${C.ink}">${inline(i.note)}</b>` : ''}`, `background-color:${i.highlight ? C.amberSoft : '#ffffff'}`)).join('')]) + (b.foot ? p(inline(b.foot), `font-size:8.5pt;color:${C.muted}`) : ''),
  bullets: (b) => (b.title ? h3(b.title) : '') + `<ul>${(b.items || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`,
  numbered: (b) => (b.title ? h3(b.title) : '') + `<ol>${(b.items || []).map((x) => `<li>${x.title ? `<b style="color:${C.ink}">${esc(x.title)}.</b> ` : ''}${inline(x.text || '')}</li>`).join('')}</ol>`,
  checklist: (b) => (b.title ? h3(b.title) : '') + (b.items || []).map((x) => p(`☐ ${inline(x)}`)).join(''),
  panel: (b) => table([td(`<span style="font-size:15pt;font-weight:bold;color:#ffffff">${esc(b.title || '')} <i>${esc(b.accent || '')}</i></span>${b.text ? `<br><span style="color:#CFE2FF">${inline(b.text)}</span>` : ''}`, `background-color:${C.blue};border-color:${C.blue};padding:12pt 14pt`)]),
  highlight: (b) => table([td(`<b style="color:${C.ink}">${inline(b.text)}</b>`, `background-color:${C.amberSoft};border-color:${C.amberSoft}`)]),
  note: (b) => p(inline(b.text), `font-size:8.5pt;color:${C.muted}`),
  signature: (b) => (b.people || []).map((x) => p(`<b style="color:${C.ink}">${esc(x.name)}</b><br>${esc([x.role, x.email, x.phone].filter(Boolean).join(' · '))}`)).join(''),
};

function renderGoogleDocHtml(c) {
  const cover = c.cover || {};
  let logo = '';
  try { logo = `<img src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'brand', '4geeks-logo-dark.png')).toString('base64')}" width="120" height="26">`; } catch (e) {}
  const pageBreak = '<p style="page-break-before:always"></p>';
  const out = [];
  out.push(p(`${logo || '<b style="color:#0B0B0F;font-size:16pt">4Geeks</b>'} <span style="color:${C.muted}">×</span> <b style="color:${C.ink};font-size:16pt">${esc((c.client || {}).name || '')}</b>`));
  if (cover.badge) out.push(p(`<b style="color:${C.deep};font-size:9pt">${esc(cover.badge).toUpperCase()}</b>`));
  out.push(`<h1 style="${FONT}color:${C.ink};font-size:34pt">${acc(cover.headline, cover.accent)}</h1>`);
  if (cover.subhead) out.push(p(inline(cover.subhead), 'font-size:13pt'));
  const lineup = cover.lineup || cover.stats || [];
  if (lineup.length) {
    if (cover.lineup_title) out.push(p(`<b style="color:${C.blue};font-size:9pt">${esc(cover.lineup_title).toUpperCase()}</b>`));
    out.push(table([lineup.map((i) => td(`<span style="font-size:24pt;font-weight:bold;color:#ffffff">${esc(i.value)}</span><br><span style="color:#CFE2FF">${inline(i.label)}</span>`, `background-color:${C.blue};border-color:${C.blue}`)).join('')]));
    const m = cover.multiplier;
    if (m) out.push(table([td(`<span style="font-size:24pt;font-weight:bold;color:#ffffff">${esc(m.from)} × ${esc(m.factor)} = ${esc(m.to)}</span><br><span style="color:#CFE2FF">${inline(m.note || '')}</span>`, `background-color:${C.blue};border-color:${C.blue}`)]));
    if (cover.lineup_foot) out.push(p(`<b style="color:${C.ink}">${inline(cover.lineup_foot)}</b>`));
  }
  if (cover.proof) out.push(table([cover.proof.map((i) => td(`<b style="color:${C.ink};font-size:13pt">${esc(i.value)}</b> ${esc(i.label)}`, `background-color:#F5F7FA;border-color:#ffffff`)).join('')]));
  if (cover.recognized) out.push(p(`<b style="color:${C.muted};font-size:8pt">${esc(cover.recognized_label || '').toUpperCase()}</b>   ${cover.recognized.map((r) => `<b style="color:#4A505A">${esc(r)}</b>`).join('  ·  ')}`));
  for (const s of c.sections || []) {
    out.push(pageBreak);
    if (s.eyebrow) out.push(p(`<b style="color:${C.blue};font-size:9pt">${esc(s.eyebrow).toUpperCase()}</b>`));
    out.push(`<h2 style="${FONT}color:${C.ink};font-size:22pt">${acc(s.headline, s.accent)}</h2>`);
    if (s.lead) out.push(p(inline(s.lead), `font-size:12pt;color:${C.ink}`));
    for (const b of s.blocks || []) out.push((B[b.kind] || (() => ''))(b));
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc((c.meta || {}).title || 'Propuesta 4Geeks')}</title></head><body style="font-family:Arial,sans-serif">${out.join('\n')}</body></html>`;
}

module.exports = { renderGoogleDocHtml };
