// ---------------------------------------------------------------------------
// 4Geeks brand kit, bundled with the app.
//
// The same rules the team's Claude skills use for every 4Geeks document, deck
// and PDF, so the Proposal Studio comes with them and never drifts:
//   - 4geeks-brand         tokens, logo, type, components, voice, exact phrasing
//   - 4geeks-yellow-touches the yellow accent layer (badge, cover band, section
//                           tags, number circles, key strip, closing page)
//   - 4geeks-logo-pack      current logo files and which variant goes where
//   - 4geeks-academy        terminology and commercial facts (→ library.js)
//
// render.js draws with TOKENS; ai.js writes with VOICE + PHRASING + TERMS;
// brandcheck.js checks every version against CHECKS. When a skill changes,
// update this file and bump VERSION — every new proposal picks it up.
// ---------------------------------------------------------------------------

const VERSION = '2026.10 · 4geeks-brand + yellow-touches + logo-pack + academy';

const TOKENS = {
  blue: '#2381FF', 'blue-deep': '#1B6FE0', 'blue-tint': '#EFF6FF', 'blue-soft': '#E9F2FE',
  ink: '#0B0B0F', body: '#5C6470', muted: '#8A93A0', bg: '#FFFFFF', 'bg-gray': '#F5F7FA', border: '#E6E9EF',
  amber: '#F5B93E', 'amber-soft': '#FDF3D7', 'amber-ink': '#8A5A00', cream: '#FFF6E0',
  red: '#E5484D', 'red-soft': '#FDECEC', navy: '#0E1B2C', 'on-blue': '#CFE2FF',
};

// Which token does what (shown in the Brand kit tab).
const TOKEN_ROLES = {
  blue: 'The brand color: key numbers, italic headline accent, one solid-blue panel per section',
  'blue-tint': 'Badges, table headers, light bands',
  'blue-soft': 'Pastel data cards',
  ink: 'Headings and all text on yellow',
  body: 'Paragraph text',
  amber: 'Yellow touches: cover badge, section tags, number circles, key strip, CTA on blue',
  'amber-soft': 'Last step of a flow, secondary callouts, the client\'s price tier',
  cream: 'AI Engineering featured card',
  red: 'Warning stats only',
  navy: 'Dark media cards, sparingly',
};

const LOGOS = [
  { file: '4geeks-logo-dark.png', use: 'White and light backgrounds (every proposal page)' },
  { file: '4geeks-logo-white.png', use: 'Navy and dark backgrounds' },
  { file: '4geeks-logo-allwhite.png', use: 'Brand-blue backgrounds (the blue "k" would vanish)' },
  { file: '4geeks-head-dark.png', use: 'Icon only (favicons, tight corners)' },
];

const YELLOW_TOUCHES = [
  'Cover badge: solid yellow pill, ink text',
  'Cover band: blue rounded band at the bottom of the cover with a yellow chip at its right end',
  'Cover contents: "En esta propuesta" list with yellow number tags (4+ sections)',
  'Section numbers: every eyebrow starts with a yellow tag (01, 02…) matching the contents',
  'Number circles: steps, phases and numbered lists use yellow circles with ink numbers',
  'Subsection tags: block titles carry a small yellow tag (3.1, 3.2…)',
  'Key strip: the one most important line on a page is a solid yellow bar (max one per page)',
  'Flows: the last step of a step flow is pale yellow',
  'Closing page: solid blue, logo in a white chip, key word in yellow, one yellow pill CTA',
  'Yellow stays an accent (<10% of a page); blue stays the headline accent',
];

const VOICE = [
  'Confident, stats-first, no fluff. Short declarative sentences. Every claim is paired with a number.',
  'Headlines are short stacked statements ending in periods, with ONE italic key phrase (the "accent").',
  'Lead with the dream, the ROI and the greatness behind it.',
  'Institutional names as proof (IDB, Government of the Bahamas, Miami Dade College, Clark University, UTEC…) — "and many others".',
  'Company-wide numbers (graduates, hiring rate) are labeled company-wide when the proposal is about one program.',
  'Internal notes, open questions and things to verify never go on the page.',
];

const PHRASING = [
  { rule: 'Forbes', text: 'Forbes: "among the coding bootcamps to consider" / "entre los coding bootcamps a considerar". Never "top 5", "best" or "mejores".' },
  { rule: 'Hiring rate', text: 'Hiring-rate or Job Guarantee claims carry an asterisk and the fine print "Not available in all regions. Terms and conditions apply." / "No disponible en todas las regiones. Aplican términos y condiciones."' },
];

// From the 4geeks-academy skill ("Terminología obligatoria").
const TERMS = [
  { avoid: 'proveedor / proveedores (for learners)', use: 'estudiante / participante' },
  { avoid: 'mejores 5 bootcamps / Top-5 mundial', use: '5 coding bootcamps a considerar (Forbes)' },
  { avoid: 'AI Flex como "catálogo a elección"', use: 'AI Flex: "modular y a requerimiento"' },
];

// Shown in the Brand kit tab; brandcheck.js implements each id.
const CHECKS = [
  { id: 'placeholders', text: 'No [bracketed] fields left to fill' },
  { id: 'accent', text: 'Every headline has one italic key phrase' },
  { id: 'headline_length', text: 'Headlines stay short (cover ≤ 9 words, pages ≤ 12)' },
  { id: 'forbes', text: 'Forbes phrasing is exact' },
  { id: 'hiring_disclaimer', text: 'Hiring-rate claims carry the disclaimer' },
  { id: 'terms', text: 'Mandatory terminology (no "proveedor", AI Flex is modular)' },
  { id: 'register', text: 'Spain uses vosotros, LATAM uses ustedes' },
  { id: 'one_panel', text: 'At most one solid-blue panel and one key strip per page' },
  { id: 'totals', text: 'Investment tables add up' },
  { id: 'graduates', text: 'Company numbers match the library (graduates)' },
  { id: 'closing', text: 'Ends with next steps and a contact' },
];

function promptRules() {
  return [
    ...VOICE,
    ...PHRASING.map((p) => p.text),
    ...TERMS.map((t) => `Say "${t.use}", never ${t.avoid}.`),
  ];
}

function summary() {
  return { version: VERSION, tokens: TOKENS, tokenRoles: TOKEN_ROLES, logos: LOGOS, yellowTouches: YELLOW_TOUCHES, voice: VOICE, phrasing: PHRASING, terms: TERMS, checks: CHECKS,
    sources: ['4geeks-brand', '4geeks-yellow-touches', '4geeks-logo-pack', '4geeks-academy'] };
}

module.exports = { VERSION, TOKENS, LOGOS, YELLOW_TOUCHES, VOICE, PHRASING, TERMS, CHECKS, promptRules, summary };
