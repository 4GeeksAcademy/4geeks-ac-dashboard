// ---------------------------------------------------------------------------
// Brand check: every proposal version against the 4Geeks brand kit and the
// 4geeks-academy rules (see brand-kit.js CHECKS). Returns plain findings the
// Studio shows next to the preview; "Fix with Claude" turns them into one
// revision instruction. level: 'error' (must fix before sending),
// 'warn' (should fix), 'info' (fill-ins left for the team).
// ---------------------------------------------------------------------------
const { money } = require('../money');

function texts(c) {
  // Every string in the proposal with where it lives, for the text rules.
  const out = [];
  const walk = (v, where) => {
    if (typeof v === 'string') out.push({ text: v, where });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, where));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'logo') walk(x, where); });
  };
  walk(c.cover, 'Portada');
  walk(c.closing, 'Cierre');
  (c.sections || []).forEach((s, k) => walk(s, `${String(k + 1).padStart(2, '0')} ${s.eyebrow || s.headline || ''}`.trim()));
  return out;
}

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function checkProposal(content, { library = {} } = {}) {
  const c = content || {};
  const lang = (c.meta || {}).language === 'en' ? 'en' : 'es';
  const country = String((c.client || {}).country || '').toLowerCase();
  const T = texts(c);
  const all = T.map((t) => t.text).join('\n');
  const issues = [];
  const add = (level, rule, where, text, fix) => issues.push({ level, rule, where, text, fix });

  // Fill-ins left for the team.
  const ph = T.filter((t) => /\[(por definir|tbd|to be defined|pendiente|fill in|[A-ZÁÉÍÓÚ][^\]]{0,40})\]/i.test(t.text));
  if (ph.length) add('info', 'placeholders', [...new Set(ph.map((t) => t.where))].join(', '), `${ph.length} ${lang === 'en' ? 'fields still in [brackets]' : 'campos aún entre [corchetes]'}`, null);

  // Headlines: one italic key phrase, short.
  const cover = c.cover || {};
  if (!cover.accent) add('warn', 'accent', 'Portada', 'El titular de portada no tiene frase clave en itálica azul', 'Add an italic key phrase (accent) to the cover headline.');
  if (words(cover.headline) + words(cover.accent) > 9) add('warn', 'headline_length', 'Portada', `Titular de portada de ${words(cover.headline) + words(cover.accent)} palabras (máx. 9)`, 'Shorten the cover headline to 9 words or fewer, keeping the italic key phrase.');
  (c.sections || []).forEach((s, k) => {
    const where = `${String(k + 1).padStart(2, '0')} ${s.eyebrow || ''}`.trim();
    if (!s.accent) add('warn', 'accent', where, 'Titular sin frase clave en itálica azul', `Give section ${k + 1}'s headline one italic key phrase (accent).`);
    if (words(s.headline) + words(s.accent) > 12) add('warn', 'headline_length', where, `Titular de ${words(s.headline) + words(s.accent)} palabras (máx. 12)`, `Shorten section ${k + 1}'s headline to 12 words or fewer.`);
    const panels = (s.blocks || []).filter((b) => b.kind === 'panel').length;
    if (panels > 1) add('warn', 'one_panel', where, `${panels} paneles azules en una página (máx. 1)`, `Section ${k + 1} has ${panels} solid-blue panels; keep only the most important one (turn the others into a highlight or text).`);
  });

  // Exact phrasing.
  if (/forbes[^.\n]{0,80}\b(top[\s-]?\d|best|mejor(es)?|#\s?1|número uno)\b|\b(top[\s-]?\d|best|mejor(es)?)\b[^.\n]{0,60}forbes/i.test(all)) {
    add('error', 'forbes', '', 'Frase de Forbes incorrecta ("top"/"mejores")', 'Fix the Forbes claim: it must read "among the coding bootcamps to consider" / "entre los coding bootcamps a considerar", never "top" or "best/mejores".');
  }
  const hiring = /(84\s?%|job guarantee|garant[ií]a de empleo|tasa de (contrataci[oó]n|inserci[oó]n|empleabilidad)|hiring rate|inserci[oó]n laboral)/i.test(all);
  if (hiring && !/(not available in all regions|no disponible en todas las regiones)/i.test(all)) {
    add('warn', 'hiring_disclaimer', '', 'Cifra de contratación sin la letra pequeña obligatoria', lang === 'en'
      ? 'Add an asterisk to the hiring-rate claim and a note: "Not available in all regions. Terms and conditions apply."'
      : 'Añade un asterisco a la cifra de inserción y una nota: "No disponible en todas las regiones. Aplican términos y condiciones."');
  }

  // Terminology (4geeks-academy).
  const prov = T.filter((t) => /\bproveedor(es)?\b/i.test(t.text) && /(estudiante|alumn|formaci|curso|programa|particip)/i.test(t.text));
  if (prov.length) add('error', 'terms', prov[0].where, 'Usa "proveedor" para referirse a estudiantes', 'Replace "proveedor(es)" with "estudiante(s)" or "participante(s)" where it refers to learners.');
  if (/ai flex[^.\n]{0,80}cat[aá]logo a elecci[oó]n/i.test(all)) add('warn', 'terms', '', 'AI Flex descrito como "catálogo a elección"', 'Describe AI Flex as "modular y a requerimiento", not "catálogo a elección".');

  // Register: Spain = vosotros, LATAM = ustedes.
  if (lang === 'es') {
    const spain = /espa[nñ]a|spain/.test(country);
    const latam = country && !spain;
    if (spain && /\bustedes\b/i.test(all)) add('warn', 'register', '', 'Propuesta para España con "ustedes"', 'Use "vosotros" (Spain) consistently instead of "ustedes".');
    if (latam && /\bvosotros\b|\bvuestr[oa]s?\b|\bos\b/i.test(all)) add('warn', 'register', '', 'Propuesta para LATAM con "vosotros"', 'Use "ustedes" (LATAM) consistently instead of "vosotros/vuestro".');
  }

  // Key strips: one per page.
  (c.sections || []).forEach((s, k) => {
    const n = (s.blocks || []).filter((b) => b.kind === 'highlight').length;
    if (n > 1) add('info', 'one_panel', `${String(k + 1).padStart(2, '0')}`, `${n} franjas destacadas (solo la primera va en amarillo sólido)`, null);
  });

  // Tables add up.
  (c.sections || []).forEach((s, k) => (s.blocks || []).filter((b) => b.kind === 'table' && Array.isArray(b.total)).forEach((b) => {
    const col = (b.total || []).length - 1;
    const vals = (b.rows || []).map((r) => money(r[col]));
    const tot = money(b.total[col]);
    if (tot == null || !vals.length || vals.some((v) => v == null)) return;
    const sum = vals.reduce((a, x) => a + x, 0);
    // A total can legitimately carry a discount: only flag when it is ABOVE the sum, or off by a non-round amount below it.
    const discountLike = sum > tot && /descuento|discount|%/i.test(JSON.stringify(s));
    if (Math.abs(sum - tot) > 1 && !discountLike) add('error', 'totals', `${String(k + 1).padStart(2, '0')} ${s.eyebrow || ''}`.trim(), `La tabla suma ${sum.toLocaleString('es-ES')} pero el total dice ${b.total[col]}`, `In section ${k + 1}, the table's rows add up to ${sum}; fix the total row or the rows so they match.`);
  }));

  // Company numbers match the library.
  const grads = String(((library.proof_points || {}).graduates) || '');
  const libN = (grads.match(/(\d[\d.,]*)/) || [])[1];
  if (libN) {
    const n = Number(libN.replace(/[.,]/g, ''));
    const found = [...all.matchAll(/\+?\s?(\d{1,2}[.,]\d{3})\s?\+?\s*(graduad|graduates|egresad)/gi)].map((m) => Number(m[1].replace(/[.,]/g, '')));
    if (found.some((x) => x !== n)) add('warn', 'graduates', '', `Cifra de graduados distinta a la biblioteca (${libN})`, `Use the library's graduate count everywhere: ${grads}.`);
  }

  // Ends with next steps and a contact.
  const kinds = new Set((c.sections || []).flatMap((s) => (s.blocks || []).map((b) => b.kind)));
  if (!kinds.has('signature') && !((c.closing || {}).people || []).length) add('warn', 'closing', '', 'Falta el contacto (firma) al final', 'End the proposal with a signature block (name, role, email) of the 4Geeks owner.');
  if (!kinds.has('checklist')) add('info', 'closing', '', 'Sin checklist de próximos pasos', null);

  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  const score = Math.max(0, 100 - issues.reduce((a, i) => a + (i.level === 'error' ? 20 : i.level === 'warn' ? 7 : 0), 0));
  return { score, issues, errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warn').length };
}

// One revision instruction from the fixable findings.
function fixInstruction(result, only = ['error', 'warn']) {
  const fixes = result.issues.filter((i) => only.includes(i.level) && i.fix).map((i) => `- ${i.fix}`);
  return fixes.length ? `Fix these brand-check findings and change nothing else:\n${[...new Set(fixes)].join('\n')}` : '';
}

module.exports = { checkProposal, fixInstruction };
