// ---------------------------------------------------------------------------
// Proposal Studio — the same proposal as a 16:9 presentation.
//
// Follows the deck recipe of the 4geeks-brand skill (13.33" × 7.5", eyebrow →
// one-line headline → subhead → content, footer "4Geeks · <name> ·
// Confidencial" + page number, mostly white slides, solid blue for the ask and
// the closing) plus the yellow touches (yellow badge, agenda with yellow
// numbers, yellow section tags, closing with yellow key words and CTA).
// It reuses the proposal's blocks, so the deck never says anything the
// document doesn't. Slides that would overflow shrink to fit on load.
// ---------------------------------------------------------------------------
const R = require('./render');
const { getStyle } = require('./styles');

const { esc, inline, nb, renderBlock, withStrip, closingFrom, dataUri, LABELS, two } = R;

// How much room a block takes on a slide (a slide holds about 4).
function weight(b) {
  const n = (b.items || b.rows || b.paragraphs || []).length;
  switch (b.kind) {
    case 'timeline': return 4.5;
    case 'table': return n > 5 ? 4.5 : 3;
    case 'cards': return (b.items || []).some((i) => (i.bullets || []).length > 3) ? 4.5 : 3.2;
    case 'phases': return 2.8;
    case 'steps': case 'stats': case 'tiers': return 2;
    case 'numbered': return 1 + n * 0.5;
    case 'bullets': case 'checklist': return 0.8 + n * 0.3;
    case 'text': return 0.7 * Math.max(1, n);
    case 'highlight': return 0.8;
    case 'note': return 0.4;
    case 'signature': return 0.9;
    default: return 1.5;
  }
}

// Big blocks are split so each slide stays legible: cards two at a time,
// long tables six rows at a time (the total stays with the last part).
function expand(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === 'cards' && (b.items || []).length > 2) {
      for (let i = 0; i < b.items.length; i += 2) out.push({ ...b, title: i ? '' : b.title, columns: 2, items: b.items.slice(i, i + 2) });
    } else if (b.kind === 'table' && (b.rows || []).length > 6) {
      for (let i = 0; i < b.rows.length; i += 6) out.push({ ...b, title: i ? '' : b.title, rows: b.rows.slice(i, i + 6), total: i + 6 >= b.rows.length ? b.total : null });
    } else out.push(b);
  }
  return out;
}

function packSection(s) {
  const blocks = expand(withStrip(s.blocks || []));
  const panels = blocks.filter((b) => b.kind === 'panel');
  const rest = blocks.filter((b) => b.kind !== 'panel');
  const slides = []; let cur = []; let w = s.lead ? 0.6 : 0;
  for (const b of rest) {
    const bw = weight(b);
    if (cur.length && w + bw > 4.6) { slides.push(cur); cur = []; w = 0; }
    cur.push(b); w += bw;
  }
  if (cur.length || !slides.length) slides.push(cur);
  // A trailing note or highlight alone is not worth a slide: fold it back.
  if (slides.length > 1 && slides[slides.length - 1].every((b) => ['note', 'highlight'].includes(b.kind))) slides[slides.length - 2].push(...slides.pop());
  return { slides, panels };
}

function renderDeck(content, opts = {}) {
  const c = content || {};
  const meta = c.meta || {};
  const lang = meta.language === 'en' ? 'en' : 'es';
  const L = LABELS[lang];
  const style = getStyle(opts.style);
  const yellow = style.features.yellow;
  const logo = dataUri('4geeks-logo-dark.png');
  const cover = c.cover || {};
  const client = c.client || {};
  const sections = c.sections || [];
  const deckName = meta.title || `${L.proposal} ${client.name || ''}`;
  const foot = (blue) => `<div class="s-foot${blue ? ' on-blue' : ''}"><span>4Geeks · ${esc(deckName)} · ${esc(L.confidential)}</span><span class="pg"></span></div>`;
  const hl = (tag, text, accent, cls = '') => `<${tag} class="hl ${cls}">${nb(text || '')}${accent ? ` <em class="acc">${nb(accent)}</em>` : ''}</${tag}>`;
  const out = [];

  // Cover: white, logo top-left, yellow badge top-right, the plan in numbers, blue band.
  const lineup = (cover.lineup || cover.stats || []).slice(0, 4);
  out.push(`<section class="slide d-cover">
    <div class="s-top"><div class="lockup"><img class="logo" src="${logo}" alt="4Geeks"><span class="x">×</span><span class="client-name">${esc(client.name || '')}</span></div>
      ${cover.badge ? `<span class="badge">${esc(cover.badge)}</span>` : ''}</div>
    <div class="cv-mid">${hl('h1', cover.headline, cover.accent)}${cover.subhead ? `<p class="sub">${inline(cover.subhead)}</p>` : ''}</div>
    ${lineup.length ? `<div class="cv-stats n${lineup.length}">${lineup.map((i) => `<div class="cs"><div class="v">${esc(i.value)}</div><div class="l">${inline(i.label)}</div></div>`).join('')}</div>` : ''}
    <div class="cv-band"><span>${esc(L.preparedFor)} <strong>${esc(client.name || '')}</strong></span><span class="d">4Geeks · ${esc(meta.date_label || '')}</span><span class="ychip">${esc(L.confidential)}</span></div>
  </section>`);

  // Agenda with yellow numbers.
  if (sections.length >= 4) {
    out.push(`<section class="slide agenda">
      <div class="eyebrow">${esc(L.agenda)}</div>${hl('h2', L.contents + '.', '')}
      <div class="ag n${sections.length > 6 ? 2 : 1}">${sections.map((s, k) => `<div class="ag-i"><span class="n">${two(k + 1)}</span><div><div class="ag-e">${esc(s.eyebrow || '')}</div><div class="ag-h">${esc(s.headline || '')}${s.accent ? ` <em>${esc(s.accent)}</em>` : ''}</div></div></div>`).join('')}</div>
      ${foot()}</section>`);
  }

  sections.forEach((s, k) => {
    const { slides, panels } = packSection(s);
    slides.forEach((blocks, i) => {
      let sub = 0;
      const body = blocks.map(renderBlock).join('\n').replace(/<h3>/g, () => `<h3><span class="n">${k + 1}.${++sub}</span>`);
      out.push(`<section class="slide">
        <div class="eyebrow"><span class="sec-n">${two(k + 1)}</span>${esc(s.eyebrow || '')}</div>
        ${hl('h2', s.headline, s.accent)}
        ${i === 0 && s.lead ? `<p class="lead">${inline(s.lead)}</p>` : ''}
        <div class="s-body"><div class="fit">${body}</div></div>
        ${foot()}</section>`);
    });
    // The section's solid-blue panel becomes its own blue slide (the ask, the promise).
    panels.forEach((p) => out.push(`<section class="slide blue">
      <div class="eyebrow"><span class="sec-n">${two(k + 1)}</span>${esc(s.eyebrow || '')}</div>
      <div class="bl-mid">${hl('h2', p.title, p.accent, 'big')}${p.text ? `<p class="bl-x">${inline(p.text)}</p>` : ''}</div>
      ${foot(true)}</section>`));
  });

  // Closing: solid blue, logo in a white chip, key words in yellow, one yellow CTA.
  const x = closingFrom(c, L);
  if (x.headline || x.accent) {
    out.push(`<section class="slide blue d-closing">
      <div class="cl-logo"><img src="${logo}" alt="4Geeks"></div>
      <div class="bl-mid">${hl('h2', x.headline, x.accent, 'big')}${x.text ? `<p class="bl-x">${inline(x.text)}</p>` : ''}<span class="cl-cta">${esc(x.cta)}</span></div>
      ${x.people.length ? `<div class="cl-people">${x.people.map((p) => `<div><div class="cl-n">${esc(p.name)}</div><div class="cl-r">${esc([p.role, p.email, p.phone].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>` : ''}
    </section>`);
  }

  const fontLink = opts.embedFontsLink === false ? '' :
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800&display=swap">';
  return `<!doctype html><html lang="${lang}" class="${yellow ? 'st-yellow' : 'st-classic'}" data-style="${esc(style.id)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deckName)} · ${lang === 'en' ? 'Presentation' : 'Presentación'}</title>${fontLink}
<style>${R.css('A4', '', logo)}${DECK_CSS}</style></head><body class="deck">
${out.join('\n')}
${R.FIT_SCREEN}
<script>
// Number the slides, then shrink any slide body that overflows (never below 60 %).
document.querySelectorAll('.slide .pg').forEach(function(p,i){p.textContent=String(i+2);});
function fit(){document.querySelectorAll('.s-body').forEach(function(b){var f=b.querySelector('.fit');var z=1.45;f.style.zoom=z;
  while((f.scrollHeight*z>b.clientHeight+2||f.scrollWidth*z>b.clientWidth+2)&&z>0.8){z-=0.04;f.style.zoom=z;}});}
fit();(document.fonts&&document.fonts.ready||Promise.resolve()).then(fit);
${opts.autoPrint ? 'window.addEventListener("load",function(){setTimeout(function(){fit();window.print();},500);});' : ''}
</script></body></html>`;
}

const DECK_CSS = `
@page{size:13.333in 7.5in;margin:0;@bottom-left{content:none}@bottom-right{content:none}}
@page:first{margin:0}
body.deck{background:#fff;margin:0}
.slide{position:relative;width:13.333in;height:7.5in;padding:.5in .6in .55in;overflow:hidden;page-break-after:always;break-after:page;display:flex;flex-direction:column;background:#fff}
.slide:last-child{page-break-after:auto;break-after:auto}
.slide .eyebrow{font-size:11pt;margin:0 0 .12in}
.slide .eyebrow .sec-n{font-size:10pt;padding:.4mm 2mm}
.slide h2.hl{font-size:32pt;line-height:1.08;margin:0 0 .12in;white-space:normal}
.slide .lead{font-size:14pt;color:var(--body);margin:0 0 .2in;max-width:11in}
.s-body{flex:1;min-height:0;overflow:hidden;margin-bottom:.15in}
.s-body .fit{zoom:1.45;transform-origin:top left}
.s-foot{position:absolute;left:.6in;right:.6in;bottom:.28in;display:flex;justify-content:space-between;font-size:9pt;color:var(--muted)}
.s-foot.on-blue{color:var(--on-blue)}
/* cover */
.slide.d-cover{padding-bottom:.45in}
.s-top{display:flex;justify-content:space-between;align-items:center}
.d-cover .lockup .logo{height:.52in}
.badge{background:var(--amber);color:var(--ink);font-weight:800;font-size:10pt;letter-spacing:.12em;text-transform:uppercase;border-radius:99px;padding:2.2mm 5mm}
.cv-mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.d-cover h1.hl{font-size:52pt;line-height:1.02;letter-spacing:-.035em;margin:0 0 .18in;max-width:11.5in}
.d-cover .sub{font-size:16pt;line-height:1.42;color:var(--body);max-width:9.8in;margin:0}
.cv-stats{display:flex;gap:.18in;margin:.22in 0 .2in}
.cs{flex:1;background:var(--blue-soft);border-radius:16px;padding:.16in .22in}
.cs .v{font-size:30pt;font-weight:800;color:var(--blue);letter-spacing:-.02em;line-height:1.05}
.cs .l{font-size:10.5pt;color:var(--body);line-height:1.3;margin-top:1mm}
.d-cover .cv-band{font-size:11pt;padding:.1in .1in .1in .22in;border-radius:14px}
.d-cover .cv-band .d{color:var(--on-blue);margin-left:auto}
.d-cover .ychip{font-size:9pt}
/* agenda */
.ag{display:grid;grid-template-columns:1fr;gap:.14in;margin-top:.2in} .ag.n2{grid-template-columns:1fr 1fr;gap:.16in .4in}
.ag-i{display:flex;gap:.16in;align-items:flex-start}
.ag-i .n{flex:0 0 auto;background:var(--amber);color:var(--ink);font-weight:800;font-size:13pt;border-radius:8px;padding:1.2mm 3mm}
.ag-e{font-size:9.5pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}
.ag-h{font-size:16pt;font-weight:800;color:var(--ink);line-height:1.2} .ag-h em{color:var(--blue)}
/* solid-blue slides */
.slide.blue{background:var(--blue);color:#fff}
.slide.blue .eyebrow{color:#fff}
.bl-mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.slide.blue h2.hl.big{color:#fff;font-size:44pt;line-height:1.05;max-width:11in;margin-bottom:.22in}
.slide.blue h2.hl .acc{color:#fff}
.slide.blue.d-closing h2.hl .acc,.st-yellow .slide.blue h2.hl .acc{color:var(--amber)}
.st-classic .slide.blue h2.hl .acc{color:#fff}
.bl-x{font-size:17pt;line-height:1.45;color:var(--on-blue);max-width:10in;margin:0 0 .25in}
.d-closing .cl-logo{align-self:flex-start;background:#fff;border-radius:12px;padding:.1in .16in}
.d-closing .cl-logo img{height:.42in;display:block}
.d-closing .cl-cta{align-self:flex-start;background:var(--amber);color:var(--ink);font-weight:800;font-size:14pt;border-radius:99px;padding:.12in .26in}
.d-closing .cl-people{display:flex;gap:.6in;border-top:1px solid rgba(255,255,255,.28);padding-top:.16in}
.d-closing .cl-n{font-weight:800;font-size:13pt;color:#fff} .d-closing .cl-r{font-size:10.5pt;color:var(--on-blue)}
/* classic style keeps the deck blue + white */
.st-classic .badge{background:var(--amber-soft);color:var(--amber-ink)}
.st-classic .ag-i .n{background:var(--blue-tint);color:var(--blue)}
.st-classic .d-closing .cl-cta{background:#fff;color:var(--blue)}
@media screen{
  body.deck{background:#EEF1F6;padding:24px 0}
  .slide{margin:0 auto 18px;box-shadow:0 1px 3px rgba(11,11,15,.1)}
  .slide.d-cover{min-height:0}
}
`;

module.exports = { renderDeck, packSection, weight, expand };
