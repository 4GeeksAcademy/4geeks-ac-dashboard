// ---------------------------------------------------------------------------
// Proposal Studio — default library (single source of truth for proposals).
//
// Claude drafts ONLY from: the intake the team fills in, this library, and the
// most similar past proposals. Prices, proof points and claims live here so a
// change (a new price, a new client reference) updates every future proposal.
// Admins can override any key from the app (stored in proposal_library); these
// are the defaults when nothing is stored.
//
// Sources: 4geeks-academy skill (programs, terms, market data), 4geeks-brand
// skill (voice, phrasing rules) and the proposals sent in 2025–2026
// (Nueva Masvida, MDC CE Online, AI Flex × MDC, BCP, Deporvillage).
// ---------------------------------------------------------------------------

const DEFAULT_LIBRARY = {
  voice: {
    pitch: 'Lead with the dream, the ROI and the greatness behind it. The client is not buying hours of class: they are buying a company that works with AI, measured person by person.',
    rules: [
      'Short declarative sentences. Every claim is paired with a number.',
      'Every headline has a plain part and ONE italic key phrase (the "accent"), e.g. "180 personas. 12 meses." + "Una Deporvillage AI-First."',
      'Spanish for Spain uses "vosotros"; Spanish for LATAM uses "ustedes"; English is US English.',
      'Say "estudiante/participante", never "proveedor".',
      'Forbes: "among the coding bootcamps to consider" / "entre los coding bootcamps a considerar". Never "top 5" or "best".',
      'Hiring-rate claims need the asterisk and "Not available in all regions. Terms and conditions apply."',
      'Never invent client names, prices, dates or statistics. Unknown facts go in [brackets] for the team to fill.',
      'Internal notes never go on the page.',
    ],
  },
  proof_points: {
    graduates: '+8.000 graduados en EE. UU., España y Latinoamérica',
    since: 'Formando talento tecnológico desde 2015 (11 años)',
    regions: '3 regiones con operación propia: EE. UU., España y Latinoamérica',
    accreditation: 'Certificada por el Florida Department of Education (FLDOE); programas avalados por Clark University',
    recognition: ['Premios Excelencia Educativa', 'Escuela de IA de Europa', 'Miami Dade College', 'Forbes', 'Fortune'],
    chile: '+1.000 graduados chilenos; experiencia con Globant, Accenture, Equifax, Zenta, GetOnBoard y Universidad Católica',
    platform: 'LearnPack (ejercicios prácticos autocorregidos) y Rigobot (tutor IA 24/7 entrenable con el contexto del cliente)',
    references: [
      ['Banco líder en Perú', 'Reskilling de desarrolladores hacia tecnologías modernas, en grupos paralelos con horarios distintos.'],
      ['Miami Dade College (EE. UU.)', 'Catálogo de cursos asíncronos de IA aplicada en un campus propio de la institución.'],
      ['UTEC (Uruguay)', 'Formación de 46 estudiantes en Ciberseguridad y Desarrollo Full Stack con IA, part-time.'],
      ['BID y Gobierno de Bahamas', 'Programas con financiación pública y reporte de desempeño por estudiante para el cliente.'],
    ],
  },
  programs: [
    { key: 'ai_engineering', name: 'AI Engineering', audience: 'Cualquier colaborador con motivación para una transición de carrera, técnico o no', list_price: 'US$3.000 / cupo', format: '6 meses · 3×/semana · 3 h en vivo · cohortes de hasta 20', outcome: 'AI Engineer capaz de construir, integrar y desplegar sistemas AI-First en producción' },
    { key: 'ai_engineering_devs', name: 'AI Engineering for Developers', audience: 'Desarrolladores en activo', list_price: 'US$973 self-paced (MDC) · a medida en B2B', format: '400 h · 12 módulos + capstone', outcome: 'Agentes, MCP, RAG, pipelines de datos, tiempo real y ciberseguridad AI-first, con capstone desplegado' },
    { key: 'ai_fluency', name: 'AI Fluency', audience: 'Profesionales no técnicos de cualquier área', list_price: 'US$1.499 / cupo (8 semanas en vivo). Formato corto de 2 semanas por volumen (Deporvillage, Oct 2026): 1–49 personas 399 €, 50–99 personas 349 €, 100–150 personas 299 € por persona; mostrar los tramos con un bloque tiers', format: 'Part-time en vivo · cohortes de hasta 25', outcome: 'Aplican IA con criterio y salen con una automatización sobre su propio trabajo' },
    { key: 'ai_flex', name: 'AI Flex', audience: 'Toda la organización', list_price: 'US$399 / cupo / año', format: 'Self-paced, modular y a requerimiento', outcome: 'Acceso continuo al catálogo con Rigobot y LearnPack' },
    { key: 'ai_builders', name: 'AI Builders (AI Champions)', audience: 'AI Champions técnicos y de negocio', list_price: 'Precio a medida (Deporvillage: 2.000 € / persona)', format: 'Cohortes por casos de negocio, con Demo Day ante dirección', outcome: 'Agentes y sistemas multiagente en producción sobre casos medibles' },
    { key: 'onboarding_ai', name: 'Onboarding IA', audience: 'Nuevas incorporaciones', list_price: 'Precio a medida (Deporvillage: 500 € / plaza / año, plazas reutilizables)', format: 'Online autoguiado + módulo a medida + test + mentoría 1:1 de 30 min', outcome: 'El nivel base de IA de la empresa desde la primera semana' },
    { key: 'mini_bootcamp', name: 'Mini-bootcamp', audience: 'Grupos de 5+ en el mismo módulo', list_price: 'US$499 / persona adicional (Masvida)', format: '1 mes · 16 h en vivo (12 h con 5–9 personas) · mentorías por pareja', outcome: 'Un módulo acompañado en vivo con profesor senior' },
    { key: 'setup_fee', name: 'Set-up', audience: 'Programas con plataforma propia', list_price: 'US$14.999 estándar (Masvida: US$24.999)', format: 'Pago único a la firma', outcome: 'Plataforma con la marca del cliente, contenido a medida, Rigobot entrenado, portal de administración' },
  ],
  discounts: [
    'Cada programa se puede contratar por separado a precio de lista; contratando todos los programas juntos (plan completo): 20 % de descuento sobre el total (Deporvillage, Oct 2026).',
    'Solo con el plan completo: un workshop gratuito cada 2–3 meses sobre novedades, lanzamientos y casos de éxito de la herramienta de IA del cliente (p. ej. Gemini Enterprise).',
  ],
  payment_terms: [
    ['Set-up', '100 % a la firma del contrato'],
    ['Programas en vivo (AI Engineering, AI Fluency, AI Builders)', '60 % al iniciar, 40 % al finalizar'],
    ['Suscripciones y sillas (AI Flex, Onboarding IA)', 'Anual, pago por adelantado'],
  ],
  market_data: [
    { value: '234 %', label: 'de ROI en organizaciones con capacitación formal en IA', source: 'Enterprise AI Training Report 2025' },
    { value: '80 %', label: 'de empresas que adoptan IA generativa sin formación no ve impacto en resultados', source: 'MIT, The GenAI Divide 2025' },
    { value: '+56 %', label: 'de prima salarial para perfiles con habilidades de IA', source: 'PwC Global AI Jobs Barometer 2025' },
    { value: '2,2 h / semana', label: 'ahorradas de media con IA; 4+ h en usuarios diarios', source: 'Federal Reserve Bank of St. Louis 2025' },
    { value: '40 %', label: 'de los líderes con mejor ROI en IA capacitan formalmente a sus equipos', source: 'Deloitte 2025' },
    { value: 'EU AI Act, art. 4', label: 'obligación de alfabetización en IA del personal desde el 2 de febrero de 2025 (clientes en la UE)', source: 'Reglamento (UE) 2024/1689' },
  ],
  past_proposals: [
    { client: 'Nueva Masvida (Chile)', year: 2026, language: 'es', model: 'Silla anual por persona (US$999) + 1 mini-bootcamp incluido + set-up US$24.999; 30 personas, 7 rutas por perfil, 21 cursos, 7 módulos', total: 'US$54.969 año 1', hooks: '30 personas. 12 meses. Una Gerencia AI-First. · Formar a su equipo cuesta menos que reemplazarlo.' },
    { client: 'Miami Dade College CE — sitio web', year: 2026, language: 'en', model: 'Proyecto único US$35.000, 8 semanas, sin cuota mensual; búsqueda contextual opcional US$50/mes; hosting opcional US$500/mes', total: 'US$35.000', hooks: 'You asked for a simple site that sells. Here it is. · Pay once. Own it.' },
    { client: 'AI Flex × MDC CE', year: 2026, language: 'en', model: 'Reparto de ingresos 40 % MDC / 60 % 4Geeks; curso AI Fluency US$396, AI Engineering for Developers US$973, Annual Pass US$1.499; sin set-up', total: 'Revenue share', hooks: 'AI skills for every MDC learner, on their own schedule. · Lead with the Annual Pass.' },
    { client: 'Banco de Crédito del Perú', year: 2025, language: 'es', model: 'Sillas 4Geeks.com a US$399/año + 1 activación de bootcamp en vivo (30 h) por cada 15 sillas; 30 sillas, React Native', total: 'US$11.970', hooks: 'De un bootcamp puntual a un entorno continuo de aprendizaje diseñado para 1.000 colaboradores.' },
    { client: 'Deporvillage (España)', year: 2026, language: 'es', model: 'Onboarding IA 10.000 €/año (20 plazas reutilizables) + AI Fluency Gemini 40.000 € (150) + AI Builders 60.000 € (30) + AI Engineering for Developers 50.000 € (35)', total: '160.000 €', hooks: 'De usar la IA, a construir con ella. · La única forma de implementar la IA es implementándola.' },
  ],
};

module.exports = { DEFAULT_LIBRARY };
