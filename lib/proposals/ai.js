// ---------------------------------------------------------------------------
// Proposal Studio — Claude drafting and revising.
//
// Claude writes CONTENT ONLY, as structured JSON. The look is never up to the
// model: render.js turns the JSON into the 4Geeks brand layout. That is what
// keeps every proposal on brand no matter who on the team builds it.
// ---------------------------------------------------------------------------

const MODEL = () => process.env.PROPOSALS_MODEL || 'claude-opus-5-5';

const SCHEMA = `
Return ONE JSON object, no prose, no code fences:
{
  "meta": { "title": str, "language": "es"|"en", "currency": "EUR"|"USD"|..., "page_size": "A4"|"Letter",
            "date_label": str (e.g. "Octubre 2026"), "footer_label": str ("4Geeks · Propuesta <tema> · <Cliente> · Confidencial") },
  "client": { "name": str, "country": str },
  "cover": {
    "badge": str (short, e.g. "Propuesta AI Culture · Octubre 2026"),
    "headline": str, "accent": str,   // catchy, client-specific title. headline = plain part, accent = italic-blue key phrase. Whole title <= 9 words.
    "subhead": str (<= 40 words: the dream + what they get),
    "lineup_title": str, "lineup": [ {"value": str, "label": str} x 3-4 ],  // the plan in numbers
    "lineup_foot": str (one-sentence promise),
    "proof": [ {"value": str, "label": str} x 3 ],  // 4Geeks credentials from the library
    "recognized_label": str, "recognized": [str]    // from library.proof_points.recognition
  },
  "sections": [ {
    "eyebrow": str (2-4 words), "headline": str, "accent": str, "lead": str (1-2 sentences, the point of the page),
    "blocks": [ one of:
      {"kind":"text","paragraphs":[str]}
      {"kind":"stats","items":[{"value":str,"label":str,"tone":"blue"|"amber"}]}          // 3-4 items, at most one amber
      {"kind":"steps","title"?:str,"items":[{"title":str,"text":str,"when"?:str,"highlight"?:bool}]}  // 3-5, last one may be highlight
      {"kind":"phases","title"?:str,"items":[{"when":str,"title":str,"goal":str,"items":[str x 2-3]}]}  // ROADMAP: 3 sequential, non-overlapping phases (e.g. Semanas 0–4 / Meses 1–6 / Meses 7–12)
      {"kind":"timeline","units":12,"unit_label":"Mes"|"Month","lanes":[{"label":str,"sub":str,"items":[{"start":num,"end":num,"text":str (<= 3 words, fits the bar),"tone":"blue"|"amber"|"gray"}],"marks"?:[{"at":num,"text":str}]}],"legend":str}
          // TIME-LAPSE: one lane per program/workstream on a shared month axis. start/end in months from 0 (0–1 = month 1). blue = live training, amber = builders/champions, gray = continuous. Cohorts as separate short bars. Milestones as marks in their own lane.
      {"kind":"cards","columns":2|3,"title"?:str,"items":[{"tag"?:str,"title":str,"meta"?:str,"text"?:str,"bullets"?:[str],"foot"?:str,"featured"?:bool}]}
      {"kind":"table","title"?:str,"columns":[str],"rows":[[str]],"align"?:["l"|"r"],"total"?:[str]}
      {"kind":"bullets","title"?:str,"items":[str]}
      {"kind":"tiers","title"?:str,"unit":str,"items":[{"range":str,"price":str,"note"?:str,"highlight"?:bool}],"foot"?:str}  // volume pricing; highlight the client's tier. Cards may also carry "tiers":[{"range","price","highlight"?}] as a mini price strip
      {"kind":"numbered","title"?:str,"items":[{"title":str,"text":str}]}
      {"kind":"checklist","title":str,"items":[str]}
      {"kind":"panel","title":str,"accent"?:str,"text"?:str}   // solid blue, max ONE per section
      {"kind":"highlight","text":str}
      {"kind":"note","text":str}                                // sources, fine print
      {"kind":"signature","people":[{"name":str,"role":str,"email"?:str,"phone"?:str}]}
    ] } ]
}
Inline formatting allowed inside strings: **bold** and *italic* only.`;

const STRUCTURE = `
Default section order (adapt to the deal, 6-8 sections, each section = one page, keep each page light enough to fit):
1. Resumen ejecutivo — numbers + ROADMAP (phases block, 3 phases) + one blue panel with the promise.
2. Lo que nos contasteis — their situation and what they asked for, in their words.
3. The programs — one card per program (who, volume, format, bullets, what they leave with).
4. El retorno — ROI stats from the library (with sources in a note), compliance hooks when relevant.
5. Quiénes somos — credentials + references table from the library.
6. Inversión — table with per-person and total, a total row, payment terms table, tax note.
7. Calendario y próximos pasos — TIME-LAPSE (timeline block, every program on the month axis), checklist "Para avanzar, <cliente> confirma", closing blue panel, signature.`;

function systemPrompt(library) {
  return `You write B2B proposals for 4Geeks Academy, an AI-First tech school.
Your job is the CONTENT. Layout and branding are fixed by the template, so never describe colors, fonts or layout.

VOICE
${library.voice.pitch}
${library.voice.rules.map((r) => `- ${r}`).join('\n')}

HARD RULES
- Use ONLY facts from: the intake, the library, and the past proposals given. Prices come from the intake first, then the library.
- If a price, date, volume or name is not given, write it as [por definir] / [TBD] so the team fills it. Never guess.
- Do the arithmetic exactly (per-person = total / seats; totals add up). Round per-person to whole currency units.
- Count PEOPLE, not seats: when one person takes several programs (e.g. Champions or IT also in the company-wide program), the headcount is the unique people (never the sum of program seats). Say so in a note under the investment table.
- Match the intake language and register (Spain = vosotros, LATAM = ustedes, US = English).
- Make the title client-specific and memorable (a play on their industry or their words beats a generic one).
${SCHEMA}
${STRUCTURE}`;
}

function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Claude did not return JSON');
  const obj = JSON.parse(t.slice(a, b + 1));
  if (!obj.cover || !Array.isArray(obj.sections)) throw new Error('Claude returned JSON without cover/sections');
  return obj;
}

async function callClaude({ system, user, maxTokens = 16000 }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY not configured on the server'); e.status = 500; throw e;
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) {
    const err = new Error(`Anthropic API error (${r.status}): ${(await r.text()).slice(0, 300)}`); err.status = 502; throw err;
  }
  const data = await r.json();
  return (data.content || []).map((b) => b.text || '').join('\n');
}

// Pick the past proposals most like this one (same language, then overlapping words).
function similarExamples(intake, examples, k = 2) {
  const words = new Set(JSON.stringify(intake || {}).toLowerCase().match(/[a-záéíóúñ]{5,}/g) || []);
  return examples
    .map((e) => {
      const txt = JSON.stringify(e.content || e).toLowerCase();
      let score = (e.content?.meta?.language === intake?.language) ? 5 : 0;
      words.forEach((w) => { if (txt.includes(w)) score += 1; });
      return { e, score };
    })
    .sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.e);
}

async function draftProposal({ intake, library, examples, instructions }) {
  const ex = similarExamples(intake, examples || []);
  const user = `INTAKE (what the team captured for this deal):
${JSON.stringify(intake, null, 2)}

LIBRARY (approved facts, prices and proof points):
${JSON.stringify({ proof_points: library.proof_points, programs: library.programs, payment_terms: library.payment_terms, discounts: library.discounts, market_data: library.market_data, past_proposals: library.past_proposals }, null, 2)}

EXAMPLES of finished proposals in this exact JSON format (match the quality and density, NOT the content):
${ex.map((e) => JSON.stringify(e.content || e)).join('\n\n')}

${instructions ? `EXTRA INSTRUCTIONS FROM THE TEAM:\n${instructions}\n` : ''}
Write the full proposal JSON now.`;
  return extractJson(await callClaude({ system: systemPrompt(library), user }));
}

async function reviseProposal({ content, instruction, intake, library }) {
  const user = `CURRENT PROPOSAL JSON:
${JSON.stringify(content)}

INTAKE: ${JSON.stringify(intake || {})}

REQUESTED CHANGE (from the team): ${instruction}

Apply ONLY the requested change; keep every other word, number and block as it is. Return the full updated JSON.`;
  return extractJson(await callClaude({ system: systemPrompt(library), user }));
}

module.exports = { draftProposal, reviseProposal, extractJson, similarExamples };
