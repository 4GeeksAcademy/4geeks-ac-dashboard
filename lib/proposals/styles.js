// ---------------------------------------------------------------------------
// Proposal styles. Each proposal picks one from the dropdown in the Studio;
// the newest style marked `current` is the default for every new proposal.
//
// Add a style here when the team settles on a new look (give it a clear
// name, the month it was set and what changed). Older styles stay
// selectable so a proposal already sent can be re-rendered exactly as it was.
// ---------------------------------------------------------------------------
const STYLES = [
  {
    id: 'brand-2026-10-yellow',
    current: true,
    since: '2026-10',
    name: { es: '4Geeks 2026 · Azul + toques amarillos (actual)', en: '4Geeks 2026 · Blue + yellow touches (current)' },
    description: {
      es: 'El estilo de las últimas propuestas: base Deporvillage con los toques amarillos (insignia y banda de portada, contenido numerado, secciones 01–07, círculos y franja amarilla) y página de cierre azul.',
      en: 'The look of the latest proposals: the Deporvillage base with the yellow touches (cover badge and band, numbered contents, 01–07 sections, yellow circles and key strip) and a blue closing page.',
    },
    features: { yellow: true, toc: true, closing: true },
  },
  {
    id: 'brand-2026-10-classic',
    since: '2026-10',
    name: { es: '4Geeks Oct 2026 · Clásico Deporvillage (sin amarillo)', en: '4Geeks Oct 2026 · Classic Deporvillage (no yellow)' },
    description: {
      es: 'Como se envió Deporvillage el 15 de octubre: azul de marca, sin toques amarillos ni página de cierre.',
      en: 'As Deporvillage was sent on Oct 15: brand blue, no yellow touches and no closing page.',
    },
    features: { yellow: false, toc: false, closing: false },
  },
];

const CURRENT = STYLES.find((s) => s.current) || STYLES[0];
const getStyle = (id) => STYLES.find((s) => s.id === id) || CURRENT;
const listStyles = (lang = 'es') => STYLES.map((s) => ({ id: s.id, current: !!s.current, since: s.since, name: s.name[lang] || s.name.es, description: s.description[lang] || s.description.es }));

module.exports = { STYLES, CURRENT, getStyle, listStyles };
