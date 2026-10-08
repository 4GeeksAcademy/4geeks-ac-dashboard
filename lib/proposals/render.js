// ---------------------------------------------------------------------------
// Proposal Studio — branded renderer.
//
// Turns a proposal "content" object (structured JSON, see schema.js) into a
// print-ready HTML page that follows the 4Geeks brand kit (4geeks-brand skill):
//   - Inter, ink headings, italic brand-blue key phrase in every headline
//   - one dominant blue #2381FF, lots of white, pastels only inside cards
//   - current logo (black + blue "k"), dark variant on light pages
//   - no gradients, no accent stripes, hairline borders, 16px radius
//
// The SAME renderer feeds the in-app preview, the browser "Save as PDF" and the
// server-side/CLI PDF build, so every proposal looks like one company.
// Nothing here should be restyled per client: content changes, the brand does not.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const BRAND_DIR = path.join(__dirname, '..', '..', 'public', 'brand');

function dataUri(file) {
  try {
    const buf = fs.readFileSync(path.join(BRAND_DIR, file));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}

const LABELS = {
  es: { confidential: 'Confidencial', preparedFor: 'Preparada para', page: '', total: 'Total', proposal: 'Propuesta' },
  en: { confidential: 'Confidential', preparedFor: 'Prepared for', page: '', total: 'Total', proposal: 'Proposal' },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Minimal inline markdown: **bold**, *italic*. Everything else is escaped.
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}

// Headline with the italic-blue key phrase (brand signature move).
function nb(s) { return esc(s).replace(/(\w)-(\w)/g, '$1\u2011$2'); } // keep "AI-First" on one line
function headline(tag, text, accent) {
  const a = accent ? ` <em class="acc">${nb(accent)}</em>` : '';
  return `<${tag} class="hl">${nb(text || '')}${a}</${tag}>`;
}

const TONES = new Set(['blue', 'amber', 'red', 'cream', 'gray']);
const tone = (t) => (TONES.has(t) ? t : 'blue');

const BLOCKS = {
  // Roadmap: sequential phases, left to right, never overlapping.
  phases(b) {
    const items = (b.items || []).slice(0, 4);
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<div class="phases n${items.length}">${items.map((i, k) => `
      <div class="phase${i.highlight ? ' hi' : ''}">
        <div class="ph-top"><span class="ph-n">${k + 1}</span><span class="ph-when">${esc(i.when || '')}</span></div>
        <div class="ph-t">${esc(i.title)}</div>
        ${i.goal ? `<div class="ph-g">${inline(i.goal)}</div>` : ''}
        <ul class="ph-l">${(i.items || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>
      </div>${k < items.length - 1 ? '<div class="ph-arrow">›</div>' : ''}`).join('')}</div>`;
  },
  // Time-lapse: one lane per workstream on a shared month axis. start/end are
  // in units from 0 (e.g. 0–0.75 = first three weeks); marks are milestones.
  timeline(b) {
    const units = b.units || 12;
    const pct = (v) => `${Math.max(0, Math.min(100, (v / units) * 100)).toFixed(3)}%`;
    const head = Array.from({ length: units }, (_, k) => `<div class="tl-u">${esc(b.unit_label || '')} ${k + 1}</div>`).join('');
    const lanes = (b.lanes || []).map((l) => `
      <div class="tl-lane">
        <div class="tl-label"><div class="tl-name">${esc(l.label)}</div>${l.sub ? `<div class="tl-sub">${esc(l.sub)}</div>` : ''}</div>
        <div class="tl-track">
          ${Array.from({ length: units }, () => '<div class="tl-cell"></div>').join('')}
          ${(l.items || []).map((i) => `<div class="tl-bar ${tone(i.tone)}" style="left:${pct(i.start)};width:calc(${pct(i.end - i.start)} - 1.2mm)">${esc(i.text || '')}</div>`).join('')}
          ${(l.marks || []).map((m) => `<div class="tl-mark${m.at > units - 2 ? ' end' : m.at < 1.5 ? ' start' : ''}" style="left:${pct(m.at)}"><span class="dia"></span><span class="tl-mt">${esc(m.text)}</span></div>`).join('')}
        </div>
      </div>`).join('');
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<div class="tl"><div class="tl-head"><div class="tl-label"></div><div class="tl-units">${head}</div></div>${lanes}</div>
      ${b.legend ? `<p class="note tl-legend">${inline(b.legend)}</p>` : ''}`;
  },
  text(b) {
    return (Array.isArray(b.paragraphs) ? b.paragraphs : [b.text])
      .filter(Boolean).map((p) => `<p class="body">${inline(p)}</p>`).join('');
  },
  stats(b) {
    const items = (b.items || []).slice(0, 4);
    return `<div class="stats n${items.length}">${items.map((i) => `
      <div class="stat ${tone(i.tone)}"><div class="v">${esc(i.value)}</div><div class="l">${inline(i.label)}</div></div>`).join('')}
    </div>`;
  },
  steps(b) {
    const items = (b.items || []).slice(0, 5);
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<div class="steps n${items.length}">${items.map((i, k) => `
      <div class="step${i.highlight ? ' hi' : ''}">
        <div class="num">${esc(i.n || k + 1)}</div>
        <div class="st-t">${esc(i.title)}</div>
        <div class="st-x">${inline(i.text || '')}</div>
        ${i.when ? `<div class="st-w">${esc(i.when)}</div>` : ''}
      </div>`).join('')}</div>`;
  },
  cards(b) {
    const cols = b.columns === 3 ? 3 : 2;
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<div class="cards c${cols}">${(b.items || []).map((i) => `
      <div class="card${i.featured ? ' featured' : ''}${i.wide ? ' wide' : ''}">
        ${i.tag ? `<span class="pill">${esc(i.tag)}</span>` : ''}
        <div class="c-t">${esc(i.title)}</div>
        ${i.meta ? `<div class="c-m">${inline(i.meta)}</div>` : ''}
        ${i.text ? `<p class="c-x">${inline(i.text)}</p>` : ''}
        ${i.bullets && i.bullets.length ? `<ul class="c-b">${i.bullets.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}
        ${i.foot ? `<div class="c-f">${inline(i.foot)}</div>` : ''}
      </div>`).join('')}</div>`;
  },
  table(b) {
    const al = b.align || [];
    const cell = (v, k, tag) => `<${tag} class="${al[k] === 'r' ? 'r' : ''}">${inline(v)}</${tag}>`;
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<table class="tbl">
      <thead><tr>${(b.columns || []).map((c, k) => cell(c, k, 'th')).join('')}</tr></thead>
      <tbody>${(b.rows || []).map((r) => `<tr>${r.map((c, k) => cell(c, k, 'td')).join('')}</tr>`).join('')}
      ${b.total ? `<tr class="total">${b.total.map((c, k) => cell(c, k, 'td')).join('')}</tr>` : ''}</tbody>
    </table>`;
  },
  bullets(b) {
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<ul class="bl">${(b.items || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
  },
  numbered(b) {
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<ol class="nl">${(b.items || []).map((x, k) => `
      <li><span class="num">${k + 1}</span><div>${x.title ? `<strong>${esc(x.title)}.</strong> ` : ''}${inline(x.text || '')}</div></li>`).join('')}</ol>`;
  },
  checklist(b) {
    return `${b.title ? `<h3>${esc(b.title)}</h3>` : ''}<ul class="ck">${(b.items || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
  },
  panel(b) {
    return `<div class="panel">${headline('div', b.title, b.accent)}${b.text ? `<p>${inline(b.text)}</p>` : ''}</div>`;
  },
  highlight(b) {
    return `<div class="hilite">${inline(b.text)}</div>`;
  },
  note(b) {
    return `<p class="note">${inline(b.text)}</p>`;
  },
  signature(b) {
    return `<div class="sig">${(b.people || []).map((p) => `
      <div><div class="sig-n">${esc(p.name)}</div><div class="sig-r">${esc([p.role, p.email].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>`;
  },
};

function renderBlock(b) {
  const fn = BLOCKS[b && b.kind];
  return fn ? fn(b) : '';
}

function renderCover(c, meta, L, logo) {
  const cover = c.cover || {};
  const client = c.client || {};
  const clientMark = client.logo
    ? `<img class="client-logo" src="${esc(client.logo)}" alt="${esc(client.name)}">`
    : `<span class="client-name">${esc(client.name || '')}</span>`;
  // The cover's one solid-blue panel holds the plan in numbers ("lineup").
  const lineup = (cover.lineup || cover.stats || []).slice(0, 4);
  const proof = (cover.proof || []).slice(0, 3);
  return `<section class="page cover">
    <div class="lockup">${logo ? `<img class="logo" src="${logo}" alt="4Geeks">` : '<strong>4Geeks</strong>'}<span class="x">×</span>${clientMark}</div>
    <div class="cover-main">
      ${cover.badge || cover.eyebrow ? `<span class="cv-badge">${esc(cover.badge || cover.eyebrow)}</span>` : ''}
      ${headline('h1', cover.headline, cover.accent).replace('class="hl"', `class="hl${((cover.headline || '') + (cover.accent || '')).length <= 42 ? ' xl' : ''}"`)}
      ${cover.subhead ? `<p class="sub">${inline(cover.subhead)}</p>` : ''}
    </div>
    ${lineup.length ? `<div class="lineup">
      ${cover.lineup_title ? `<div class="lu-t">${esc(cover.lineup_title)}</div>` : ''}
      <div class="lu-row n${lineup.length}">${lineup.map((i) => `<div class="lu"><div class="v">${esc(i.value)}</div><div class="l">${inline(i.label)}</div></div>`).join('')}</div>
      ${cover.lineup_foot ? `<div class="lu-f">${inline(cover.lineup_foot)}</div>` : ''}
    </div>` : ''}
    <div class="cv-bottom">
      ${proof.length ? `<div class="proof">${proof.map((i) => `<div class="pf"><span class="v">${esc(i.value)}</span><span class="l">${esc(i.label)}</span></div>`).join('')}</div>` : ''}
      ${cover.recognized && cover.recognized.length ? `<div class="recog"><span class="recog-t">${esc(cover.recognized_label || '')}</span>${cover.recognized.map((r) => `<span class="rn">${esc(r)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="cover-foot"><span>${esc(L.preparedFor)} ${esc(client.name || '')}</span><span>4Geeks · ${esc(meta.date_label || '')}</span></div>
  </section>`;
}

function renderSection(s) {
  return `<section class="page sec">
    ${s.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow)}</div>` : ''}
    ${headline('h2', s.headline, s.accent)}
    ${s.lead ? `<p class="lead">${inline(s.lead)}</p>` : ''}
    ${(s.blocks || []).map(renderBlock).join('\n')}
  </section>`;
}

function renderProposal(content, opts = {}) {
  const c = content || {};
  const meta = c.meta || {};
  const lang = meta.language === 'en' ? 'en' : 'es';
  const L = LABELS[lang];
  const pageSize = meta.page_size === 'Letter' ? 'Letter' : 'A4';
  const logo = dataUri('4geeks-logo-dark.png');
  const footerLeft = meta.footer_label || `4Geeks · ${L.proposal} · ${(c.client && c.client.name) || ''} · ${L.confidential}`;
  const fontLink = opts.embedFontsLink === false ? '' :
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800&display=swap">';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'Propuesta 4Geeks')}</title>
${fontLink}
<style>${css(pageSize, footerLeft, logo)}</style>
</head>
<body>
${renderCover(c, meta, L, logo)}
${(c.sections || []).map(renderSection).join('\n')}
${opts.autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),400));</script>' : ''}
</body>
</html>`;
}

// Brand tokens copied from the 4geeks-brand skill (section 2). Do not add colors.
function css(pageSize, footerLeft, logo) {
  const f = footerLeft.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `
:root{--blue:#2381FF;--blue-deep:#1B6FE0;--blue-tint:#EFF6FF;--blue-soft:#E9F2FE;--ink:#0B0B0F;--body:#5C6470;--muted:#8A93A0;
--bg-gray:#F5F7FA;--border:#E6E9EF;--amber:#F5B93E;--amber-soft:#FDF3D7;--amber-ink:#A26A00;--cream:#FFF6E0;--red:#E5484D;--red-soft:#FDECEC;--on-blue:#CFE2FF;}
@page{size:${pageSize};margin:17mm 18mm 18mm 18mm;
  @bottom-left{content:"${f}";font:400 7.5pt Inter,Arial,sans-serif;color:#8A93A0;}
  @bottom-right{content:counter(page);font:400 7.5pt Inter,Arial,sans-serif;color:#8A93A0;}
}
@page:first{@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--ink);font-size:10.4pt;line-height:1.45;background:#fff}
.page{page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.hl{font-weight:800;letter-spacing:-.025em;color:var(--ink);margin:0}
.hl .acc{font-style:italic;color:var(--blue);font-weight:800}
.eyebrow{font-size:7.4pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--blue);margin:0 0 3mm}
h2.hl{font-size:25pt;line-height:1.08;margin-bottom:4mm}
h3{font-size:12pt;font-weight:800;margin:7mm 0 3mm;color:var(--ink)}
.lead{font-size:12pt;line-height:1.45;color:var(--ink);margin:0 0 7mm;max-width:168mm}
p.body{color:var(--body);margin:0 0 3mm}
strong{color:var(--ink);font-weight:700}

/* cover */
.cover{min-height:262mm;display:flex;flex-direction:column}
.lockup{display:flex;align-items:center;gap:5mm}
.lockup .logo{height:9.5mm}
.lockup .x{color:var(--muted);font-size:15pt}
.client-name{font-size:19pt;font-weight:800;letter-spacing:-.02em}
.client-logo{height:12mm}
.cover-main{margin-top:20mm;flex:1;display:flex;flex-direction:column;justify-content:center}
.cover h1.hl.xl{font-size:46pt;line-height:1.02}
.cover h1.hl.xl .acc{display:block}
.cv-badge{align-self:flex-start;display:inline-block;background:var(--blue-tint);color:var(--blue-deep);font-size:8pt;font-weight:800;letter-spacing:.12em;text-transform:uppercase;border-radius:99px;padding:2mm 4.5mm;margin-bottom:8mm}
.cover h1.hl{font-size:47pt;line-height:1;letter-spacing:-.035em;margin-bottom:8mm;max-width:172mm}
.sub{font-size:13.5pt;line-height:1.45;color:var(--body);max-width:150mm;margin:0}
.lineup{background:var(--blue);border-radius:5mm;padding:7mm 8mm 6.5mm;margin:10mm 0 6mm;color:#fff}
.lu-t{font-size:7.6pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--on-blue);margin-bottom:5mm}
.lu-row{display:flex}
.lu{flex:1;padding:0 5mm;border-left:1px solid rgba(255,255,255,.28)}
.lu:first-child{padding-left:0;border-left:none}
.lu .v{font-size:31pt;font-weight:800;letter-spacing:-.03em;line-height:1;margin-bottom:2mm;color:#fff}
.lu .l{font-size:8.6pt;line-height:1.35;color:var(--on-blue)}
.lu-f{margin-top:5.5mm;padding-top:4mm;border-top:1px solid rgba(255,255,255,.28);font-size:9.6pt;font-weight:600;color:#fff}
.cv-bottom{display:flex;flex-direction:column;gap:4mm;margin-bottom:7mm}
.proof{display:flex;gap:3.5mm}
.pf{flex:1;background:var(--bg-gray);border-radius:3.5mm;padding:3.6mm 4.5mm;display:flex;align-items:baseline;gap:2.5mm}
.pf .v{font-size:13pt;font-weight:800;color:var(--ink);white-space:nowrap}
.pf .l{font-size:7.8pt;color:var(--body);line-height:1.3}
.recog{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5mm 3mm;background:var(--bg-gray);border-radius:3.5mm;padding:3mm 5mm}
.recog-t{width:100%;text-align:center;font-size:6.8pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.recog .rn{font-weight:700;font-size:9pt;color:#4A505A;white-space:nowrap}
.cover-foot{display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:3mm;font-size:7.5pt;color:var(--muted)}


/* roadmap phases */
.phases{display:flex;align-items:stretch;gap:0;margin:0 0 7mm}
.phase{flex:1;background:var(--blue-soft);border-radius:4mm;padding:5mm 5mm 4.5mm}
.phase.hi{background:var(--blue)} .phase.hi .ph-t,.phase.hi .ph-when{color:#fff} .phase.hi .ph-g,.phase.hi .ph-l{color:var(--on-blue)} .phase.hi .ph-n{background:#fff}
.ph-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:3mm}
.ph-n{width:6.5mm;height:6.5mm;border-radius:50%;background:#fff;color:var(--blue);font-weight:800;font-size:8pt;display:flex;align-items:center;justify-content:center}
.ph-when{font-size:7.4pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}
.ph-t{font-weight:800;font-size:11pt;margin-bottom:1.5mm}
.ph-g{font-size:8.6pt;color:var(--ink);font-weight:600;margin-bottom:2mm}
.ph-l{margin:0;padding-left:3.8mm;font-size:8.4pt;color:var(--body)} .ph-l li{margin-bottom:.8mm}
.ph-arrow{flex:0 0 5mm;display:flex;align-items:center;justify-content:center;color:var(--blue);font-weight:800;font-size:16pt}

/* time-lapse timeline (gantt) */
.tl{margin:0 0 3mm;border:1px solid var(--border);border-radius:4mm;padding:3mm 4mm 2mm;break-inside:avoid}
.tl-head,.tl-lane{display:flex}
.tl-label{flex:0 0 40mm;padding-right:3mm}
.tl-units{flex:1;display:flex}
.tl-u{flex:1;text-align:center;font-size:6.6pt;font-weight:800;color:var(--muted);letter-spacing:.04em;padding-bottom:2mm;text-transform:uppercase}
.tl-lane{border-top:1px solid var(--border);min-height:12.5mm;align-items:center}
.tl-name{font-weight:800;font-size:8.8pt;line-height:1.2}
.tl-sub{font-size:7.2pt;color:var(--body);margin-top:.6mm;line-height:1.25}
.tl-track{flex:1;position:relative;display:flex;align-self:stretch}
.tl-cell{flex:1;border-left:.5pt dashed var(--border)}
.tl-bar{position:absolute;top:50%;margin-top:-3.2mm;height:6.4mm;border-radius:99px;background:var(--blue);color:#fff;font-size:6.8pt;font-weight:700;line-height:6.4mm;padding:0 1.2mm;white-space:nowrap;overflow:hidden;margin-left:.6mm;text-align:center}
.tl-bar.amber{background:var(--amber);color:var(--ink)} .tl-bar.gray{background:var(--blue-soft);color:var(--blue-deep)} .tl-bar.cream{background:var(--cream);color:var(--amber-ink)}
.tl-mark{position:absolute;top:50%;margin-top:-1.6mm;width:0}
.tl-mark .dia{position:absolute;left:-1.6mm;width:3.2mm;height:3.2mm;background:var(--ink);transform:rotate(45deg);border:.6pt solid #fff}
.tl-mt{position:absolute;left:-12mm;width:24mm;text-align:center;top:-4.2mm;font-size:6pt;font-weight:800;color:var(--ink);white-space:nowrap}
.tl-mark.end .tl-mt{left:auto;right:-3mm;text-align:right}
.tl-mark.start .tl-mt{left:-3mm;text-align:left}
.tl-legend{margin-top:1mm}

/* stats */
.stats{display:flex;gap:4mm;margin:0 0 7mm}
.stat{flex:1;border-radius:4mm;padding:6mm 5.5mm 5.5mm;background:var(--blue-soft)}
.stat .v{font-size:25pt;font-weight:800;letter-spacing:-.02em;color:var(--blue);line-height:1.05;margin-bottom:1.5mm}
.stat .l{font-size:8.8pt;color:var(--body);line-height:1.35}
.stat.amber{background:var(--amber-soft)} .stat.amber .v{color:var(--amber-ink)}
.stat.cream{background:var(--cream)} .stat.cream .v{color:var(--amber-ink)}
.stat.red{background:var(--red-soft)} .stat.red .v{color:var(--red)}
.stat.gray{background:var(--bg-gray)} .stat.gray .v{color:var(--ink)}

/* steps (roadmap) */
.steps{display:flex;gap:3mm;margin:0 0 7mm}
.step{flex:1;background:var(--blue-soft);border-radius:4mm;padding:5mm 4mm}
.step .num{width:6.5mm;height:6.5mm;border-radius:50%;background:#fff;color:var(--blue);font-weight:800;font-size:8pt;display:flex;align-items:center;justify-content:center;margin-bottom:3mm}
.st-t{font-weight:800;font-size:10pt;margin-bottom:1.5mm;line-height:1.25}
.st-x{font-size:8.6pt;color:var(--body);line-height:1.35}
.st-w{margin-top:3mm;font-size:7.4pt;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)}
.step.hi{background:var(--blue)} .step.hi .st-t{color:#fff} .step.hi .st-x{color:var(--on-blue)} .step.hi .st-w{color:#fff}

/* cards */
.cards{display:flex;flex-wrap:wrap;gap:3.5mm;margin:0 0 4mm}
.card{border:1px solid var(--border);border-radius:4mm;padding:5.5mm 6mm;background:#fff;break-inside:avoid}
.cards.c2 .card{width:calc(50% - 1.75mm)} .cards.c3 .card{width:calc(33.33% - 2.34mm)}
.cards .card.wide{width:100%}
.card.featured{background:var(--cream);border-color:var(--cream)}
.pill{display:inline-block;background:var(--blue-tint);color:var(--blue-deep);font-size:6.8pt;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:1mm 3mm;margin-bottom:2.5mm}
.card.featured .pill{background:#fff;color:var(--amber-ink)}
.c-t{font-weight:800;font-size:12pt;margin-bottom:1mm}
.c-m{font-size:8.4pt;font-weight:700;color:var(--blue);margin-bottom:2mm}
.c-x{font-size:9.4pt;color:var(--body);margin:0 0 2mm}
.c-b{margin:0;padding-left:4mm;font-size:9.2pt;color:var(--body)} .c-b li{margin-bottom:.8mm}
.c-f{margin-top:3mm;padding-top:3mm;border-top:1px solid var(--border);font-size:9pt;color:var(--ink)}

/* tables */
.tbl{width:100%;border-collapse:collapse;margin:0 0 6mm;font-size:9.4pt;break-inside:auto}
.tbl th{background:var(--blue-tint);color:var(--ink);font-weight:800;text-align:left;padding:3.2mm 3.5mm;font-size:8.6pt}
.tbl td{padding:3.2mm 3.5mm;border-bottom:.5pt solid var(--border);color:var(--body);vertical-align:top}
.tbl td:first-child{color:var(--ink);font-weight:700}
.tbl .r{text-align:right;white-space:nowrap}
.tbl tr.total td{border-top:1.2pt solid var(--ink);border-bottom:none;color:var(--ink);font-weight:800;font-size:10.4pt;padding-top:3.8mm}
.tbl tr.total td.r:last-child{color:var(--blue);font-size:13.5pt}
.tbl tr{break-inside:avoid}

/* lists */
.bl{margin:0 0 4mm;padding-left:4.5mm;color:var(--body)} .bl li{margin-bottom:1.4mm}
.nl{list-style:none;margin:0 0 4mm;padding:0}
.nl li{display:flex;gap:3.5mm;align-items:flex-start;margin-bottom:3.4mm;color:var(--body)}
.nl .num{flex:0 0 6.5mm;height:6.5mm;border-radius:50%;background:var(--blue-tint);color:var(--blue);font-weight:800;font-size:8pt;display:flex;align-items:center;justify-content:center}
.ck{list-style:none;margin:0 0 4mm;padding:0;color:var(--body)}
.ck li{padding-left:6mm;position:relative;margin-bottom:1.6mm}
.ck li:before{content:"";position:absolute;left:0;top:.6mm;width:3mm;height:3mm;border:1pt solid var(--muted);border-radius:.8mm}

/* panel, highlight, notes */
.panel{background:var(--blue);border-radius:4mm;padding:7mm 8mm;margin:2mm 0 7mm;break-inside:avoid}
.panel .hl{color:#fff;font-size:18pt;line-height:1.15;margin-bottom:2mm}
.panel .hl .acc{color:#fff}
.panel p{color:var(--on-blue);margin:0;font-size:10.4pt}
.hilite{background:var(--amber-soft);border-radius:3mm;padding:4.5mm 6mm;font-weight:700;color:var(--ink);margin:0 0 4mm}
.note{font-size:7.8pt;color:var(--muted);margin:0 0 3mm;line-height:1.4}
.sig{display:flex;gap:14mm;margin-top:6mm}
.sig-n{font-weight:800;font-size:10pt} .sig-r{color:var(--body);font-size:8.4pt}

/* screen preview: show page cards */
@media screen{
  body{background:#EEF1F6;padding:24px 0}
  .page{background:#fff;width:${pageSize === 'Letter' ? '216mm' : '210mm'};min-height:${pageSize === 'Letter' ? '279mm' : '297mm'};margin:0 auto 18px;padding:17mm 18mm;box-shadow:0 1px 3px rgba(11,11,15,.08)}
  .cover{min-height:${pageSize === 'Letter' ? '279mm' : '297mm'}}
}
`;
}

module.exports = { renderProposal, esc };
