// ---------------------------------------------------------------------------
// Proposal Studio — archive of past proposals + what the team learns from them.
//
// Upload the proposals sent before the Studio existed (PDF, Word, PowerPoint,
// text). Claude reads each one ONCE and stores a digest: client, programs and
// prices, pricing model, structure, best lines, angles, strengths, weaknesses
// and a condensed version. Drafts then learn from them three ways:
//   1. References: the proposals the team pins in the intake, plus the most
//      similar ones (same language, same words, won ranks first).
//   2. Playbook: one document Claude writes from ALL past proposals (archive +
//      Studio, won and lost): price patterns, what wins, what loses, hooks.
//   3. Start from one: a past proposal becomes a new client's starting intake,
//      or is imported as an editable Studio proposal.
// ---------------------------------------------------------------------------
const JSZip = require('jszip');
const { callClaude, extractJson, systemPrompt } = require('./ai');

const MAX_BYTES = 20 * 1024 * 1024;
const OUTCOMES = ['won', 'lost', 'sent', 'unknown'];

const KINDS = [
  { kind: 'pdf', ext: /\.pdf$/i, mime: /pdf/ },
  { kind: 'docx', ext: /\.docx$/i, mime: /wordprocessingml/ },
  { kind: 'pptx', ext: /\.pptx$/i, mime: /presentationml/ },
  { kind: 'html', ext: /\.html?$/i, mime: /html/ },
  { kind: 'text', ext: /\.(txt|md|markdown|csv)$/i, mime: /^text\// },
];
function fileKind(filename, mime) {
  const k = KINDS.find((x) => x.ext.test(filename || '')) || KINDS.find((x) => x.mime.test(mime || ''));
  return k ? k.kind : null;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

async function docxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('Not a Word document');
  const xml = await doc.async('string');
  return tidy(decode(xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')));
}
async function pptxText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]));
  if (!slides.length) throw new Error('No slides found in the PowerPoint');
  const out = [];
  for (const [i, f] of slides.entries()) {
    const xml = await zip.file(f).async('string');
    out.push(`--- Slide ${i + 1} ---\n${decode(xml.replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, ''))}`);
  }
  return tidy(out.join('\n'));
}
const htmlText = (s) => tidy(decode(String(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));

// Returns { text } for anything we can read here, { pdf: base64 } for PDFs
// (Claude reads PDFs directly, layout, tables and all).
async function extract({ buffer, filename, mime }) {
  const kind = fileKind(filename, mime);
  if (!kind) {
    const e = new Error('Unsupported file. Upload a PDF, Word (.docx), PowerPoint (.pptx) or text file. For Google Docs/Slides: File → Download → PDF.');
    e.status = 400; throw e;
  }
  if (kind === 'pdf') return { kind, pdf: buffer.toString('base64') };
  if (kind === 'docx') return { kind, text: await docxText(buffer) };
  if (kind === 'pptx') return { kind, text: await pptxText(buffer) };
  if (kind === 'html') return { kind, text: htmlText(buffer.toString('utf8')) };
  return { kind, text: tidy(buffer.toString('utf8')) };
}

const DIGEST_SCHEMA = `Return ONE JSON object, no prose, no code fences:
{
  "client": str, "country": str|null, "industry": str|null, "language": "es"|"en", "currency": str|null,
  "year": int|null, "date_label": str|null, "title": str|null,
  "summary": str (2-3 sentences: who, what was offered, the core promise),
  "programs": [ {"program": str, "seats": str|null, "price": str|null, "format": str|null} ],
  "total": str|null (as written, with currency), "pricing_model": str|null (e.g. "per seat per year + set-up fee"),
  "terms": str|null (payment terms, discounts),
  "structure": [str] (section titles in order),
  "hooks": [str] (up to 6 of the strongest lines, verbatim),
  "angles": [str] (what the pitch leans on: ROI, compliance, a pain, a dream...),
  "proof_used": [str] (credentials, references, data cited),
  "strengths": [str] (what makes it persuasive), "weaknesses": [str] (what a tough buyer would miss or doubt),
  "condensed": str (<= 900 words: the whole proposal condensed, section by section, keeping every number, price and name)
}
Use only what is in the document. Unknown = null. Never invent prices.`;

async function digestProposal({ extracted, hints = {}, call = callClaude }) {
  const intro = `This is a B2B proposal 4Geeks Academy sent to a client before. Read it and extract a digest the team will learn from.
${hints.client ? `Uploader says the client is: ${hints.client}\n` : ''}${hints.outcome && hints.outcome !== 'unknown' ? `Outcome: ${hints.outcome}\n` : ''}${hints.notes ? `Uploader notes: ${hints.notes}\n` : ''}
${DIGEST_SCHEMA}`;
  const user = extracted.pdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: extracted.pdf } }, { type: 'text', text: intro }]
    : `${intro}\n\nDOCUMENT:\n${String(extracted.text || '').slice(0, 120000)}`;
  const raw = await call({ system: 'You analyse past B2B sales proposals for 4Geeks Academy, an AI-First tech school. You are precise with numbers and never invent facts.', user, maxTokens: 6000 });
  return extractJson(raw, { requireProposal: false });
}

// --------------------------- similarity / references ---------------------------
const wordsOf = (o) => new Set(JSON.stringify(o || {}).toLowerCase().match(/[a-záéíóúñü]{5,}/g) || []);
const OUTCOME_BOOST = { won: 4, sent: 1, unknown: 0, lost: 0 };

// Rank past items (archive digests and Studio proposals) for an intake.
// Pinned references always come first, in the order the team pinned them.
function rankPast(intake, items, k = 3) {
  const pinned = (intake && intake.references) || [];
  const words = wordsOf({ ...intake, references: undefined });
  const scored = items.map((it) => {
    const pin = pinned.indexOf(it.ref);
    if (pin >= 0) return { it, score: 1000 - pin };
    const txt = JSON.stringify(it.digest || it.content || {}).toLowerCase();
    let score = (it.language && it.language === (intake || {}).language) ? 5 : 0;
    words.forEach((w) => { if (txt.includes(w)) score += 1; });
    score += OUTCOME_BOOST[it.outcome] || 0;
    return { it, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(k, pinned.length)).map((x) => ({ ...x.it, pinned: x.score >= 900 }));
}

function digestForPrompt(a) {
  const d = a.digest || {};
  return JSON.stringify({
    ref: a.ref, client: a.client || d.client, outcome: a.outcome, year: a.year || d.year, language: d.language,
    pinned_by_team: !!a.pinned, team_notes: a.notes || undefined,
    summary: d.summary, programs: d.programs, total: d.total, pricing_model: d.pricing_model, terms: d.terms,
    structure: d.structure, hooks: d.hooks, angles: d.angles, strengths: d.strengths, weaknesses: d.weaknesses, condensed: d.condensed,
  });
}

// --------------------------- playbook ---------------------------
async function buildPlaybook({ archive, studio, language = 'es', teamRules = [], call = callClaude }) {
  const user = `Below are ALL the B2B proposals 4Geeks Academy has sent, with their outcome when known.
Write the team's PLAYBOOK: what these proposals teach about writing the next one.

${language === 'en' ? 'Write in English.' : 'Escribe en español (neutro).'}
Format: plain text with "## " headings and "- " bullets only. Be concrete: name clients, programs, prices and lines. 600-900 words.
Sections:
## Precios que usamos (by program: ranges, models, set-up fees, discounts; flag inconsistencies)
## Lo que gana (patterns in won proposals, with examples)
## Lo que falla o falta (patterns in lost ones; weaknesses that repeat)
## Frases y ganchos que funcionan (verbatim, with client)
## Estructura recomendada (section order and density that works best)
## Lo que el equipo cambia de los borradores (from the "edits" of FINAL proposals: compare claude_first_draft with final_sent and read the revision notes; say what Claude should do differently from the start)
## Antes de enviar (a checklist of 6-8 items)
If outcomes are mostly unknown, say so and base "what wins" on strengths instead of pretending.

ARCHIVE (uploaded originals):
${archive.map(digestForPrompt).join('\n') || '(none)'}

${teamRules.length ? `TEAM RULES already in force (do not repeat them as findings):\n${teamRules.map((r) => `- ${r}`).join('\n')}\n\n` : ''}STUDIO PROPOSALS (built in the app; "final": true = the version the team actually sent, the strongest signal):
${studio.map((s) => JSON.stringify(s)).join('\n') || '(none)'}`;
  const text = await call({ system: 'You are 4Geeks Academy\'s head of B2B sales enablement. You turn past proposals into practical, specific guidance.', user, maxTokens: 5000 });
  return String(text || '').replace(/^```\w*\s*|```\s*$/g, '').trim();
}

// --------------------------- start from / import ---------------------------
// A past proposal becomes the intake of a new proposal (same or a new client).
function intakeFromDigest(a, client) {
  const d = a.digest || {};
  return {
    client: client || d.client || a.client || '',
    country: client ? '' : (d.country || ''),
    industry: client ? '' : (d.industry || ''),
    language: d.language || 'es',
    currency: d.currency || (d.language === 'en' ? 'USD' : 'EUR'),
    programs: (d.programs || []).map((p) => ({ program: p.program || '', seats: p.seats || '', price: p.price || '' })),
    notes: `Basada en la propuesta a ${a.client || d.client}${a.year || d.year ? ` (${a.year || d.year})` : ''}${a.outcome && a.outcome !== 'unknown' ? `, ${a.outcome}` : ''}. Adapta precios, personas y contexto al nuevo cliente.`,
    references: [a.ref],
  };
}

async function importAsContent({ archiveItem, extracted, library, call = callClaude }) {
  const intro = `Convert this EXISTING 4Geeks proposal into the JSON format faithfully: keep its words, numbers, prices, names and section order.
Do not improve, shorten or invent; where the format needs a field the document lacks, use [por definir] / [TBD].
Client: ${archiveItem.client || (archiveItem.digest || {}).client || 'unknown'}.`;
  const user = extracted.pdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: extracted.pdf } }, { type: 'text', text: intro }]
    : `${intro}\n\nDOCUMENT:\n${String(extracted.text || '').slice(0, 120000)}`;
  return extractJson(await call({ system: systemPrompt(library), user }));
}

module.exports = { extract, fileKind, digestProposal, rankPast, digestForPrompt, buildPlaybook, intakeFromDigest, importAsContent, docxText, pptxText, MAX_BYTES, OUTCOMES };
