'use strict';
/* Proposal Studio — B2B proposals inside the Leads & Deals dashboard.
   Uses the dashboard's globals: $, $$, esc, icon, api, authToken, LANG, showToast.
   The proposal LOOK is fixed by the server renderer (4Geeks brand kit); this UI
   only captures inputs, versions and edits. */

const PS_STR = {
  en: {
    tabBrand: 'Brand kit', styleLbl: 'Style', styleHint: 'How the document and presentation look. The current style is the default for every new proposal.',
    deck: 'Presentation', deckHint: 'The same version as 16:9 slides (Save as PDF, landscape)', viewDoc: 'Document', viewDeck: 'Presentation',
    checkTitle: 'Brand check', checkOk: 'On brand. Nothing to fix.', fixBrand: 'Fix with Claude', fixing: 'Claude is fixing the brand-check findings…', lv_error: 'Must fix', lv_warn: 'Should fix', lv_info: 'To fill in',
    makeRule: 'Make it a rule for every future proposal', ruleSaved: 'Saved as a team rule', finalBadge: 'Final', finalSaved: 'Saved as the final version: future drafts and the playbook learn from it',
    brandSub: 'What every proposal gets automatically: the 4Geeks brand skills, the yellow touches, the styles and the rules the team has added.', brandVersion: 'Brand kit', styles: 'Styles', current: 'current', colors: 'Colors', logos: 'Logos', yellow: 'Yellow touches', voice: 'Voice and exact phrasing', terms: 'Terminology', avoid: 'Avoid', useT: 'Use', checksT: 'Brand check rules', teamRules: 'Team rules', teamRulesSub: 'Instructions an admin made permanent from a revision. Every draft follows them.', noRules: 'None yet. When you ask Claude for a change that should apply to every proposal, tick "Make it a rule".',
    tabProposals: 'Proposals', tabArchive: 'Past proposals', tabPlaybook: 'Playbook',
    archiveSub: 'Upload proposals sent before. Claude reads each one and every new draft learns from them — prices, structure, the lines that won and what was missing in the ones we lost.',
    drop: 'Drop PDFs, Word or PowerPoint files here, or click to choose', dropHint: 'Google Docs / Slides: File → Download → PDF. Up to 20 MB each.',
    batchClient: 'Client (optional, else Claude reads it)', batchOutcome: 'Outcome', batchNotes: 'Notes for Claude (optional): why it was won or lost, context',
    pasteToggle: 'Or paste the text of a proposal', pasteSave: 'Add pasted proposal', uploading: 'Uploading', uploaded: 'Uploaded — Claude is reading it',
    o_won: 'Won', o_lost: 'Lost', o_sent: 'Sent', o_unknown: 'Unknown',
    st_processing: 'Reading…', st_ready: 'Learned', st_error: 'Failed',
    archiveEmpty: 'No past proposals yet. Upload the ones you have sent — won and lost both teach something.',
    file: 'File', year: 'Year', outcome: 'Outcome', total: 'Total', learned: 'Learned',
    summary: 'Summary', pricing: 'Pricing', programsLbl: 'Programs', hooks: 'Lines that work', angles: 'Angles', strengths: 'Strengths', weaknesses: 'Weaknesses / gaps', structure: 'Structure', condensed: 'Condensed version', proof: 'Proof used', terms: 'Terms',
    useBase: 'Start a new client from this', usePrompt: 'Client name for the new proposal:', importIt: 'Import as editable proposal', importing: 'Claude is converting it into an editable proposal… (about a minute)',
    openImported: 'Open the imported proposal', download: 'Original file', reanalyze: 'Read again', del: 'Delete', confirmDel: 'Delete this past proposal?', errorLbl: 'Error',
    playbookSub: 'What the team has learned from every past proposal, won and lost. Every new draft reads it.', rebuild: 'Rebuild from all proposals', rebuilding: 'Claude is reading every past proposal… (about a minute)',
    builtFrom: 'Built from', archived: 'uploaded', studioN: 'in the Studio', on: 'on', noPlaybook: 'No playbook yet. Upload past proposals, then press "Rebuild".', edit: 'Edit', savePb: 'Save playbook',
    refs: 'Reference proposals (Claude follows these most closely)', refsNone: 'No past proposals yet — upload some in "Past proposals".', refsAuto: 'If you pin none, Claude picks the most similar (won ones first).',
    learnedFromToast: 'Learned from', src_import: 'Imported', saveArch: 'Save changes',
    newProposal: 'New proposal', proposals: 'Proposals', client: 'Client', title: 'Title', owner: 'Owner', status: 'Status', version: 'Version', updated: 'Updated',
    empty: 'No proposals yet. Start one from a client conversation.', storageFile: 'Storage: local file (set DATABASE_URL on Railway to keep proposals across deploys).',
    intake: 'Deal intake', intakeSub: 'Everything Claude needs. Prices you type here win over the library.', country: 'Country', language: 'Language', currency: 'Currency',
    industry: 'Industry', contact: 'Contact (name, role)', headcount: 'Headcount (total, by team)', situation: 'Where they are today', asks: 'What they asked for',
    goals: 'The dream: what success looks like for them', tools: 'Tools they use', programs: 'Programs, people and price', addRow: 'Add program', program: 'Program', seats: 'People / seats', price: 'Price',
    budget: 'Budget signals', competitors: 'Competitors in the deal', timeline: 'Timeline', notes: 'Call notes / transcript / anything else',
    save: 'Save intake', saved: 'Saved', create: 'Create proposal', back: 'All proposals',
    draft: 'Draft with Claude', drafting: 'Claude is writing the proposal… (about a minute)', instructions: 'Optional instructions for this draft (tone, emphasis, what to leave out)',
    revise: 'Ask Claude to change', revising: 'Applying your change…', revisePh: 'e.g. "Make the cover title about sports", "Lower AI Builders to 50.000 €", "Add a page on data privacy"',
    pdf: 'Download PDF', open: 'Open full page', clone: 'Duplicate as new client', clonePrompt: 'Client name for the copy:', editJson: 'Edit content (advanced)', saveVersion: 'Save as new version',
    versions: 'Versions', noVersion: 'No version yet. Fill the intake and press "Draft with Claude".', by: 'by',
    s_draft: 'Draft', s_in_review: 'In review', s_approved: 'Approved', s_sent: 'Sent', s_won: 'Won', s_lost: 'Lost',
    src_ai_draft: 'Claude draft', src_ai_revise: 'Claude edit', src_manual: 'Manual edit', src_clone: 'Cloned', src_seed: 'Imported',
    invalidJson: 'That is not valid JSON', brandNote: 'Always rendered with the 4Geeks brand kit.',
    brief: 'Brief (1 page)', briefHint: 'One-page summary of this version: title, people, roadmap, investment, next steps and contact',
    gdoc: 'Google Docs', gdocHint: 'Downloads a file: upload it to Google Drive and open it with Google Docs to get an editable copy',
    users: 'Users', addUser: 'Add or update user', username: 'Username', role: 'Role', password: 'Password', newPassword: 'New password (10+ characters)', setPassword: 'Set password', remove: 'Remove', noPassword: 'No password yet — set one so they can sign in', fromEnv: 'Set in Railway variables', fromApp: 'Created in the app', role_admin: 'Admin · everything, including approvals, library and users', role_editor: 'Editor · leads + proposals; cannot approve, close, delete or manage users', confirmRemove: 'Remove this user?', saveUser: 'Save user',
  },
  es: {
    tabBrand: 'Kit de marca', styleLbl: 'Estilo', styleHint: 'Cómo se ven el documento y la presentación. El estilo actual es el predeterminado de cada propuesta nueva.',
    deck: 'Presentación', deckHint: 'La misma versión en diapositivas 16:9 (Guardar como PDF, horizontal)', viewDoc: 'Documento', viewDeck: 'Presentación',
    checkTitle: 'Brand check', checkOk: 'Todo en marca. Nada que arreglar.', fixBrand: 'Arreglar con Claude', fixing: 'Claude está arreglando lo que marcó el brand check…', lv_error: 'Obligatorio', lv_warn: 'Recomendado', lv_info: 'Por completar',
    makeRule: 'Convertir en regla para todas las propuestas', ruleSaved: 'Guardada como regla del equipo', finalBadge: 'Final', finalSaved: 'Guardada como versión final: los próximos borradores y el playbook aprenden de ella',
    brandSub: 'Lo que cada propuesta recibe automáticamente: las skills de marca de 4Geeks, los toques amarillos, los estilos y las reglas que ha añadido el equipo.', brandVersion: 'Kit de marca', styles: 'Estilos', current: 'actual', colors: 'Colores', logos: 'Logos', yellow: 'Toques amarillos', voice: 'Voz y frases exactas', terms: 'Terminología', avoid: 'Evitar', useT: 'Usar', checksT: 'Reglas del brand check', teamRules: 'Reglas del equipo', teamRulesSub: 'Instrucciones que un admin convirtió en permanentes desde un cambio. Cada borrador las sigue.', noRules: 'Aún ninguna. Cuando pidas a Claude un cambio que deba valer para todas las propuestas, marca "Convertir en regla".',
    tabProposals: 'Propuestas', tabArchive: 'Propuestas anteriores', tabPlaybook: 'Playbook',
    archiveSub: 'Sube las propuestas enviadas antes. Claude lee cada una y cada borrador nuevo aprende de ellas: precios, estructura, las frases que ganaron y lo que faltó en las que perdimos.',
    drop: 'Arrastra aquí PDFs, Word o PowerPoint, o haz clic para elegir', dropHint: 'Google Docs / Slides: Archivo → Descargar → PDF. Hasta 20 MB cada uno.',
    batchClient: 'Cliente (opcional, si no Claude lo lee)', batchOutcome: 'Resultado', batchNotes: 'Notas para Claude (opcional): por qué se ganó o se perdió, contexto',
    pasteToggle: 'O pega el texto de una propuesta', pasteSave: 'Añadir propuesta pegada', uploading: 'Subiendo', uploaded: 'Subida: Claude la está leyendo',
    o_won: 'Ganada', o_lost: 'Perdida', o_sent: 'Enviada', o_unknown: 'Sin dato',
    st_processing: 'Leyendo…', st_ready: 'Aprendida', st_error: 'Error',
    archiveEmpty: 'Aún no hay propuestas anteriores. Sube las que habéis enviado: las ganadas y las perdidas enseñan algo.',
    file: 'Archivo', year: 'Año', outcome: 'Resultado', total: 'Total', learned: 'Aprendida',
    summary: 'Resumen', pricing: 'Precio', programsLbl: 'Programas', hooks: 'Frases que funcionan', angles: 'Ángulos', strengths: 'Fortalezas', weaknesses: 'Debilidades / lo que falta', structure: 'Estructura', condensed: 'Versión condensada', proof: 'Pruebas usadas', terms: 'Condiciones',
    useBase: 'Usar como base para un cliente nuevo', usePrompt: 'Nombre del cliente de la nueva propuesta:', importIt: 'Importar como propuesta editable', importing: 'Claude la está convirtiendo en una propuesta editable… (cerca de un minuto)',
    openImported: 'Abrir la propuesta importada', download: 'Archivo original', reanalyze: 'Volver a leer', del: 'Eliminar', confirmDel: '¿Eliminar esta propuesta anterior?', errorLbl: 'Error',
    playbookSub: 'Lo que el equipo ha aprendido de todas las propuestas, ganadas y perdidas. Cada borrador nuevo lo lee.', rebuild: 'Rehacer con todas las propuestas', rebuilding: 'Claude está leyendo todas las propuestas… (cerca de un minuto)',
    builtFrom: 'Hecho con', archived: 'subidas', studioN: 'del Studio', on: 'el', noPlaybook: 'Aún no hay playbook. Sube propuestas anteriores y pulsa "Rehacer".', edit: 'Editar', savePb: 'Guardar playbook',
    refs: 'Propuestas de referencia (Claude las sigue más de cerca)', refsNone: 'Aún no hay propuestas anteriores: súbelas en "Propuestas anteriores".', refsAuto: 'Si no fijas ninguna, Claude elige las más parecidas (primero las ganadas).',
    learnedFromToast: 'Aprendió de', src_import: 'Importada', saveArch: 'Guardar cambios',
    newProposal: 'Nueva propuesta', proposals: 'Propuestas', client: 'Cliente', title: 'Título', owner: 'Responsable', status: 'Estado', version: 'Versión', updated: 'Actualizada',
    empty: 'Aún no hay propuestas. Crea una a partir de una conversación con un cliente.', storageFile: 'Almacenamiento: archivo local (configura DATABASE_URL en Railway para conservar las propuestas entre despliegues).',
    intake: 'Datos del deal', intakeSub: 'Todo lo que Claude necesita. Los precios que pongas aquí mandan sobre la biblioteca.', country: 'País', language: 'Idioma', currency: 'Moneda',
    industry: 'Sector', contact: 'Contacto (nombre, cargo)', headcount: 'Plantilla (total, por equipo)', situation: 'Dónde están hoy', asks: 'Qué nos pidieron',
    goals: 'El sueño: cómo se ve el éxito para ellos', tools: 'Herramientas que usan', programs: 'Programas, personas y precio', addRow: 'Añadir programa', program: 'Programa', seats: 'Personas / plazas', price: 'Precio',
    budget: 'Señales de presupuesto', competitors: 'Competidores en el deal', timeline: 'Plazos', notes: 'Notas de la llamada / transcripción / lo que sea',
    save: 'Guardar datos', saved: 'Guardado', create: 'Crear propuesta', back: 'Todas las propuestas',
    draft: 'Redactar con Claude', drafting: 'Claude está escribiendo la propuesta… (cerca de un minuto)', instructions: 'Instrucciones opcionales para este borrador (tono, énfasis, qué dejar fuera)',
    revise: 'Pedir un cambio a Claude', revising: 'Aplicando tu cambio…', revisePh: 'p. ej. "Haz el título de portada sobre deporte", "Baja AI Builders a 50.000 €", "Añade una página de privacidad de datos"',
    pdf: 'Descargar PDF', open: 'Abrir página completa', clone: 'Duplicar para otro cliente', clonePrompt: 'Nombre del cliente para la copia:', editJson: 'Editar contenido (avanzado)', saveVersion: 'Guardar como nueva versión',
    versions: 'Versiones', noVersion: 'Aún no hay versión. Completa los datos y pulsa "Redactar con Claude".', by: 'por',
    s_draft: 'Borrador', s_in_review: 'En revisión', s_approved: 'Aprobada', s_sent: 'Enviada', s_won: 'Ganada', s_lost: 'Perdida',
    src_ai_draft: 'Borrador de Claude', src_ai_revise: 'Cambio de Claude', src_manual: 'Edición manual', src_clone: 'Clonada', src_seed: 'Importada',
    invalidJson: 'Ese JSON no es válido', brandNote: 'Siempre con el kit de marca de 4Geeks.',
    brief: 'Brief (1 página)', briefHint: 'Resumen de una página de esta versión: título, personas, hoja de ruta, inversión, próximos pasos y contacto',
    gdoc: 'Google Docs', gdocHint: 'Descarga un archivo: súbelo a Google Drive y ábrelo con Google Docs para tener una copia editable',
    users: 'Usuarios', addUser: 'Añadir o actualizar usuario', username: 'Usuario', role: 'Rol', password: 'Contraseña', newPassword: 'Nueva contraseña (10+ caracteres)', setPassword: 'Poner contraseña', remove: 'Eliminar', noPassword: 'Sin contraseña: ponle una para que pueda entrar', fromEnv: 'Definido en variables de Railway', fromApp: 'Creado en la app', role_admin: 'Admin · todo, incluidas aprobaciones, biblioteca y usuarios', role_editor: 'Editor · leads + propuestas; no puede aprobar, cerrar, borrar ni gestionar usuarios', confirmRemove: '¿Eliminar este usuario?', saveUser: 'Guardar usuario',
  },
};
const ps = (k) => (PS_STR[LANG] || PS_STR.en)[k] || PS_STR.en[k] || k;
const PS_STATUSES = ['draft', 'in_review', 'approved', 'sent', 'won', 'lost'];
const PS_STATUS_CLASS = { draft: 'b-neutral', in_review: 'b-lostu', approved: 'b-other', sent: 'b-other', won: 'b-won', lost: 'b-lostc' };
const psState = { styles: null, view: 'doc', route: 'list', id: null, archiveId: null, version: 'latest', busy: null, me: null, poll: null };
const PS_OUTCOMES = ['won', 'lost', 'sent', 'unknown'];
const PS_OUTCOME_CLASS = { won: 'b-won', lost: 'b-lostc', sent: 'b-other', unknown: 'b-neutral' };
const psOutcome = (o) => `<span class="badge ${PS_OUTCOME_CLASS[o] || 'b-neutral'}">${esc(ps('o_' + (o || 'unknown')))}</span>`;
const psDate = (iso) => (iso ? new Date(iso).toLocaleDateString(LANG === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const psBadge = (s) => `<span class="badge ${PS_STATUS_CLASS[s] || 'b-neutral'}">${esc(ps('s_' + s))}</span>`;

async function psJson(url, opts) {
  const r = await api(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function psStyles() {
  if (!psState.styles) psState.styles = await psJson(`/api/proposal-styles?lang=${LANG === 'en' ? 'en' : 'es'}`).catch(() => ({ styles: [], current: null }));
  return psState.styles;
}
function psStyleSelect(id, sel) {
  const { styles, current } = psState.styles || { styles: [] };
  const v = sel || current;
  return `<label class="ps-style"><span>${esc(ps('styleLbl'))}</span><select id="${id}" class="ps-select" title="${esc(ps('styleHint'))}">${styles.map((x) => `<option value="${esc(x.id)}" ${x.id === v ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
}
const psStyleDesc = (id) => { const st = ((psState.styles || {}).styles || []).find((x) => x.id === (id || (psState.styles || {}).current)); return st ? st.description : ''; };

async function renderProposals(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:180px"></div></div>';
  if (!psState.me) psState.me = await psJson('/api/me').catch(() => ({}));
  try {
    clearTimeout(psState.poll);
    if (psState.route === 'new') return await psRenderNew(el);
    if (psState.route === 'archive') return await psRenderArchive(el);
    if (psState.route === 'archiveItem' && psState.archiveId) return await psRenderArchiveItem(el);
    if (psState.route === 'playbook') return await psRenderPlaybook(el);
    if (psState.route === 'brand') return await psRenderBrand(el);
    if (psState.route === 'detail' && psState.id) return await psRenderDetail(el);
    return await psRenderList(el);
  } catch (e) {
    el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`;
  }
}

// ---------------- list ----------------
async function psRenderList(el) {
  const { proposals, storage } = await psJson('/api/proposals');
  el.innerHTML = `${psTabs('list')}
    <div class="ps-head">
      <div class="ps-brandnote">${icon('sparkle')}<span>${esc(ps('brandNote'))}</span></div>
      <button class="btn primary" id="ps-new">${icon('plus')}${esc(ps('newProposal'))}</button>
    </div>
    ${storage === 'file' ? `<div class="ps-warn">${icon('alert')}<span>${esc(ps('storageFile'))}</span></div>` : ''}
    <div class="panel ps-list">
      ${proposals.length ? `<table class="tbl ps-tbl"><thead><tr>
        <th>${esc(ps('client'))}</th><th>${esc(ps('title'))}</th><th>${esc(ps('owner'))}</th><th>${esc(ps('status'))}</th><th class="num">${esc(ps('version'))}</th><th>${esc(ps('updated'))}</th></tr></thead>
        <tbody>${proposals.map((p) => `<tr class="ps-row" data-id="${esc(p.id)}">
          <td><strong>${esc(p.client)}</strong><div class="muted">${esc([p.country, (p.language || '').toUpperCase(), p.currency].filter(Boolean).join(' · '))}</div></td>
          <td>${esc(p.title || '—')}</td><td>${esc(p.owner || '—')}</td><td>${psBadge(p.status)}</td>
          <td class="num">${p.latest_version ? 'v' + p.latest_version : '—'}</td><td>${esc(psDate(p.updated_at))}</td></tr>`).join('')}</tbody></table>`
      : `<div class="state-card">${icon('doc')}<p>${esc(ps('empty'))}</p></div>`}
    </div>`;
  psWireTabs(el);
  $('#ps-new').addEventListener('click', () => { psState.route = 'new'; renderProposals(el); });
  $$('.ps-row', el).forEach((r) => r.addEventListener('click', () => { psState.route = 'detail'; psState.id = r.dataset.id; psState.version = 'latest'; renderProposals(el); }));
}

// ---------------- intake form ----------------
function psIntakeForm(i = {}) {
  const f = (k, label, ph = '', area = false) => `<label class="ps-f"><span>${esc(ps(label))}</span>${area
    ? `<textarea name="${k}" rows="${area === true ? 3 : area}" placeholder="${esc(ph)}">${esc(i[k] || '')}</textarea>`
    : `<input name="${k}" value="${esc(i[k] || '')}" placeholder="${esc(ph)}">`}</label>`;
  const sel = (k, label, opts, v) => `<label class="ps-f"><span>${esc(ps(label))}</span><select name="${k}">${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  const rows = (i.programs && i.programs.length ? i.programs : [{}, {}]);
  return `<form class="ps-form" id="ps-intake">
    <div class="ps-grid3">${f('client', 'client', 'Deporvillage')}${f('country', 'country', 'España')}${f('industry', 'industry', 'E-commerce')}</div>
    <div class="ps-grid3">${sel('language', 'language', ['es', 'en'], i.language || 'es')}${sel('currency', 'currency', ['EUR', 'USD', 'CLP', 'PEN', 'MXN', 'COP'], i.currency || 'EUR')}${f('contact', 'contact')}</div>
    ${f('headcount', 'headcount', '180 en oficina · 35 en IT · 30 AI Champions')}
    ${f('situation', 'situation', '', true)}${f('asks', 'asks', '', true)}${f('goals', 'goals', '', true)}
    <div class="ps-grid2">${f('tools', 'tools', 'Google Workspace, Gemini Enterprise')}${f('timeline', 'timeline', 'Arranque en enero')}</div>
    <div class="ps-f"><span>${esc(ps('programs'))}</span>
      <div class="ps-prog" id="ps-prog">${rows.map((r) => psProgRow(r)).join('')}</div>
      <button type="button" class="btn ghost sm" id="ps-addrow">${icon('plus')}${esc(ps('addRow'))}</button></div>
    <div class="ps-grid2">${f('budget', 'budget', '', 2)}${f('competitors', 'competitors', '', 2)}</div>
    ${f('notes', 'notes', '', 6)}
    <div class="ps-f"><span>${esc(ps('refs'))}</span><div class="ps-refs" id="ps-refs" data-sel="${esc(JSON.stringify(i.references || []))}"><div class="skeleton" style="height:34px"></div></div><div class="muted ps-hint">${esc(ps('refsAuto'))}</div></div>
  </form>`;
}
function psProgRow(r = {}) {
  return `<div class="ps-prow"><input data-k="program" placeholder="${esc(ps('program'))}" value="${esc(r.program || '')}"><input data-k="seats" placeholder="${esc(ps('seats'))}" value="${esc(r.seats || '')}"><input data-k="price" placeholder="${esc(ps('price'))}" value="${esc(r.price || '')}"><button type="button" class="icon-btn ps-del" aria-label="remove">×</button></div>`;
}
async function psLoadRefs(root, excludeId) {
  const box = $('#ps-refs', root); if (!box) return;
  let sel = []; try { sel = JSON.parse(box.dataset.sel || '[]'); } catch (e) { /* none */ }
  let refs = [];
  try { refs = (await psJson(`/api/proposal-references${excludeId ? `?exclude=${encodeURIComponent(excludeId)}` : ''}`)).references; } catch (e) { /* keep empty */ }
  if (!refs.length) { box.innerHTML = `<div class="muted">${esc(ps('refsNone'))}</div>`; return; }
  refs.sort((a, b) => (sel.includes(b.ref) - sel.includes(a.ref)) || ((b.outcome === 'won') - (a.outcome === 'won')) || ((b.year || 0) - (a.year || 0)));
  box.innerHTML = refs.map((r) => `<label class="ps-ref ${sel.includes(r.ref) ? 'on' : ''}"><input type="checkbox" value="${esc(r.ref)}" ${sel.includes(r.ref) ? 'checked' : ''}>
    <strong>${esc(r.client || '—')}</strong><span class="muted">${esc([r.year, r.kind === 'archive' ? ps('tabArchive') : 'Studio'].filter(Boolean).join(' · '))}</span>${PS_OUTCOMES.includes(r.outcome) ? psOutcome(r.outcome) : psBadge(r.outcome)}</label>`).join('');
  $$('.ps-ref input', box).forEach((c) => c.addEventListener('change', () => c.closest('.ps-ref').classList.toggle('on', c.checked)));
}
function psWireIntake(root, excludeId) {
  psLoadRefs(root, excludeId);
  $('#ps-addrow', root).addEventListener('click', () => { $('#ps-prog', root).insertAdjacentHTML('beforeend', psProgRow()); psWireDel(root); });
  psWireDel(root);
}
function psWireDel(root) { $$('.ps-del', root).forEach((b) => { b.onclick = () => b.closest('.ps-prow').remove(); }); }
function psReadIntake(root) {
  const form = $('#ps-intake', root); const out = {};
  $$('input[name],textarea[name],select[name]', form).forEach((x) => { out[x.name] = x.value.trim(); });
  const refBox = $('#ps-refs', form);
  if (refBox && $$('.ps-ref', refBox).length) out.references = $$('.ps-ref input:checked', refBox).map((c) => c.value);
  else { try { out.references = JSON.parse((refBox && refBox.dataset.sel) || '[]'); } catch (e) { out.references = []; } }
  out.programs = $$('.ps-prow', form).map((r) => Object.fromEntries($$('input', r).map((x) => [x.dataset.k, x.value.trim()]))).filter((r) => r.program || r.price);
  return out;
}

async function psRenderNew(el) {
  await psStyles();
  el.innerHTML = `<button class="btn ghost sm ps-back" id="ps-back">← ${esc(ps('back'))}</button>
    <div class="panel"><h2 class="ps-h2">${esc(ps('intake'))}</h2><p class="muted">${esc(ps('intakeSub'))}</p>${psIntakeForm({})}
    <div class="ps-actions ps-create-row">${psStyleSelect('ps-new-style')}<button class="btn primary" id="ps-create">${icon('plus')}${esc(ps('create'))}</button></div></div>`;
  psWireIntake(el);
  $('#ps-back').addEventListener('click', () => { psState.route = 'list'; renderProposals(el); });
  $('#ps-create').addEventListener('click', async () => {
    const intake = psReadIntake(el);
    if (!intake.client) { $('[name=client]', el).focus(); return; }
    const p = await psJson('/api/proposals', { method: 'POST', body: { client: intake.client, country: intake.country, language: intake.language, currency: intake.currency, intake, style: $('#ps-new-style') ? $('#ps-new-style').value : undefined } });
    psState.route = 'detail'; psState.id = p.id; psState.version = 'latest'; renderProposals(el);
  });
}

// ---------------- detail ----------------
async function psRenderDetail(el) {
  const [p] = await Promise.all([psJson(`/api/proposals/${psState.id}`), psStyles()]);
  const versions = p.versions || [];
  const cur = psState.version === 'latest' ? (versions[0] && versions[0].version) : Number(psState.version);
  const viewUrl = cur ? `/proposals/${p.id}/v/${cur}?token=${encodeURIComponent(authToken)}` : null;
  const deckUrl = cur ? `/proposals/${p.id}/v/${cur}/deck?token=${encodeURIComponent(authToken)}` : null;
  const admin = psState.me && psState.me.admin;
  el.innerHTML = `
    <button class="btn ghost sm ps-back" id="ps-back">← ${esc(ps('back'))}</button>
    <div class="ps-top">
      <div><h2 class="ps-h2">${esc(p.client)}${p.title ? ` <span class="muted">· ${esc(p.title)}</span>` : ''}</h2>
        <div class="muted">${esc(ps('owner'))}: ${esc(p.owner || '—')} · ${esc(psDate(p.updated_at))}</div>
        <div class="ps-style-row">${psStyleSelect('ps-style', p.style)}<span class="muted ps-style-desc" id="ps-style-desc">${esc(psStyleDesc(p.style))}</span></div></div>
      <div class="ps-top-actions">
        <select id="ps-status" class="ps-select">${PS_STATUSES.map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''} ${['approved', 'won', 'lost'].includes(s) && !admin ? 'disabled' : ''}>${esc(ps('s_' + s))}</option>`).join('')}</select>
        ${cur ? `<a class="btn ghost" href="/proposals/${p.id}/v/${cur}/gdoc?token=${encodeURIComponent(authToken)}" title="${esc(ps('gdocHint'))}">${icon('doc')}${esc(ps('gdoc'))}</a>
        <a class="btn soft" href="/proposals/${p.id}/v/${cur}/brief?token=${encodeURIComponent(authToken)}&print=1" target="_blank" rel="noopener" title="${esc(ps('briefHint'))}">${icon('doc')}${esc(ps('brief'))}</a>
        <a class="btn soft" href="${deckUrl}&print=1" target="_blank" rel="noopener" title="${esc(ps('deckHint'))}">${icon('doc')}${esc(ps('deck'))}</a>
        <a class="btn primary" href="${viewUrl}&print=1" target="_blank" rel="noopener">${icon('download')}${esc(ps('pdf'))}</a>` : ''}
      </div>
    </div>
    <div class="ps-cols">
      <div class="ps-left">
        <div class="panel ps-ai">
          <div class="ps-ai-row"><textarea id="ps-instr" rows="2" placeholder="${esc(ps('instructions'))}"></textarea><button class="btn primary" id="ps-draft">${icon('sparkle')}${esc(ps('draft'))}</button></div>
          ${cur ? `<div class="ps-ai-row"><textarea id="ps-rev" rows="2" placeholder="${esc(ps('revisePh'))}"></textarea>
            ${admin ? `<label class="ps-rule"><input type="checkbox" id="ps-rule"> ${esc(ps('makeRule'))}</label>` : ''}
            <button class="btn soft" id="ps-revise">${icon('sparkle')}${esc(ps('revise'))}</button></div>` : ''}
          <div id="ps-busy" class="ps-busy" hidden></div>
        </div>
        ${cur ? `<div class="panel ps-check" id="ps-check"><div class="skeleton" style="height:60px"></div></div>` : ''}
        <div class="panel">
          <h3 class="ps-h3">${esc(ps('versions'))}</h3>
          ${versions.length ? `<ul class="ps-versions">${versions.map((v) => `<li class="${v.version === cur ? 'on' : ''}" data-v="${v.version}">
            <strong>v${v.version}</strong><span class="ps-src">${esc(ps('src_' + v.source) || v.source || '')}</span>${v.version === p.final_version ? `<span class="ps-final">${esc(ps('finalBadge'))}</span>` : ''}
            <span class="muted">${esc(ps('by'))} ${esc(v.author || '—')} · ${esc(psDate(v.created_at))}</span>
            ${v.note ? `<div class="ps-note">${esc(v.note)}</div>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(ps('noVersion'))}</p>`}
          <div class="ps-actions">${cur ? `<a class="btn ghost sm" href="${viewUrl}" target="_blank" rel="noopener">${icon('external')}${esc(ps('open'))}</a>
            <button class="btn ghost sm" id="ps-json">${esc(ps('editJson'))}</button>` : ''}
            <button class="btn ghost sm" id="ps-clone">${esc(ps('clone'))}</button></div>
          <div id="ps-json-box" hidden><textarea id="ps-json-ta" class="ps-json" spellcheck="false"></textarea><button class="btn primary sm" id="ps-json-save">${esc(ps('saveVersion'))}</button></div>
        </div>
        <details class="panel ps-intake-panel"><summary><h3 class="ps-h3">${esc(ps('intake'))}</h3></summary>
          ${psIntakeForm({ client: p.client, country: p.country, language: p.language, currency: p.currency, ...p.intake })}
          <div class="ps-actions"><button class="btn soft sm" id="ps-save">${esc(ps('save'))}</button></div></details>
      </div>
      <div class="ps-right">${cur ? `<div class="seg ps-viewseg"><button data-v="doc" class="${psState.view !== 'deck' ? 'active' : ''}">${esc(ps('viewDoc'))}</button><button data-v="deck" class="${psState.view === 'deck' ? 'active' : ''}">${esc(ps('viewDeck'))}</button></div>
        <iframe class="ps-preview" id="ps-preview" src="${psState.view === 'deck' ? deckUrl : viewUrl}" title="preview"></iframe>` : `<div class="panel state-card">${icon('doc')}<p>${esc(ps('noVersion'))}</p></div>`}</div>
    </div>`;

  psWireIntake(el, p.id);
  $('#ps-back').addEventListener('click', () => { psState.route = 'list'; renderProposals(el); });
  $$('.ps-versions li', el).forEach((li) => li.addEventListener('click', () => { psState.version = li.dataset.v; renderProposals(el); }));
  $('#ps-status').addEventListener('change', async (e) => {
    try {
      const r = await psJson(`/api/proposals/${p.id}`, { method: 'PATCH', body: { status: e.target.value } });
      if (['sent', 'won'].includes(e.target.value) && r.final_version) { showToast(ps('finalSaved')); renderProposals(el); } else showToast(ps('saved'));
    } catch (err) { showToast(err.message); e.target.value = p.status; }
  });
  $('#ps-style').addEventListener('change', async (e) => {
    try { await psJson(`/api/proposals/${p.id}`, { method: 'PATCH', body: { style: e.target.value } }); $('#ps-style-desc').textContent = psStyleDesc(e.target.value); const f = $('#ps-preview'); if (f) f.src = f.src; showToast(ps('saved')); }
    catch (err) { showToast(err.message); }
  });
  $$('.ps-viewseg button', el).forEach((b) => b.addEventListener('click', () => {
    psState.view = b.dataset.v; $$('.ps-viewseg button', el).forEach((x) => x.classList.toggle('active', x === b));
    $('#ps-preview').src = b.dataset.v === 'deck' ? deckUrl : viewUrl;
  }));
  if (cur) psLoadCheck(el, p, cur);
  $('#ps-save').addEventListener('click', async () => {
    const intake = psReadIntake(el);
    await psJson(`/api/proposals/${p.id}`, { method: 'PATCH', body: { intake, client: intake.client || p.client, country: intake.country, language: intake.language, currency: intake.currency } });
    showToast(ps('saved'));
  });
  const busy = (msg) => { const b = $('#ps-busy'); b.hidden = !msg; b.innerHTML = msg ? `<span class="spinner"></span>${esc(msg)}` : ''; $$('#ps-draft, #ps-revise').forEach((x) => { x.disabled = !!msg; }); };
  $('#ps-draft').addEventListener('click', async () => {
    // Save the intake first so the draft uses what is on screen.
    const intake = psReadIntake(el);
    await psJson(`/api/proposals/${p.id}`, { method: 'PATCH', body: { intake } });
    busy(ps('drafting'));
    try {
      const r = await psJson(`/api/proposals/${p.id}/draft`, { method: 'POST', body: { instructions: $('#ps-instr').value } });
      if (r.learnedFrom && r.learnedFrom.length) showToast(`${ps('learnedFromToast')}: ${r.learnedFrom.join(', ')}${r.playbook ? ' + playbook' : ''}`);
      psState.version = r.version; renderProposals(el);
    }
    catch (err) { busy(null); showToast(err.message); }
  });
  if ($('#ps-revise')) $('#ps-revise').addEventListener('click', async () => {
    const instruction = $('#ps-rev').value.trim(); if (!instruction) return $('#ps-rev').focus();
    busy(ps('revising'));
    try {
      const r = await psJson(`/api/proposals/${p.id}/revise`, { method: 'POST', body: { instruction, fromVersion: cur, makeRule: !!($('#ps-rule') && $('#ps-rule').checked) } });
      if (r.ruleSaved) showToast(ps('ruleSaved'));
      psState.version = r.version; renderProposals(el);
    }
    catch (err) { busy(null); showToast(err.message); }
  });
  if ($('#ps-json')) $('#ps-json').addEventListener('click', async () => {
    const box = $('#ps-json-box'); box.hidden = !box.hidden;
    if (!box.hidden) { const v = await psJson(`/api/proposals/${p.id}/versions/${cur}`); $('#ps-json-ta').value = JSON.stringify(v.content, null, 2); }
  });
  if ($('#ps-json-save')) $('#ps-json-save').addEventListener('click', async () => {
    let content; try { content = JSON.parse($('#ps-json-ta').value); } catch (e) { return showToast(ps('invalidJson')); }
    try { const r = await psJson(`/api/proposals/${p.id}/versions`, { method: 'POST', body: { content, note: `Edición manual de v${cur}` } }); psState.version = r.version; renderProposals(el); }
    catch (err) { showToast(err.message); }
  });
  $('#ps-clone').addEventListener('click', async () => {
    const name = window.prompt(ps('clonePrompt')); if (!name) return;
    const c = await psJson(`/api/proposals/${p.id}/clone`, { method: 'POST', body: { client: name } });
    psState.id = c.id; psState.version = 'latest'; renderProposals(el);
  });
}

// ---------------- brand check (next to the preview) ----------------
async function psLoadCheck(el, p, cur) {
  const box = $('#ps-check', el); if (!box) return;
  let r; try { r = await psJson(`/api/proposals/${p.id}/versions/${cur}/check`); } catch (e) { box.hidden = true; return; }
  const fixable = r.issues.some((i) => i.level !== 'info' && i.fix);
  const tone = r.errors ? 'bad' : r.warnings ? 'mid' : 'ok';
  box.innerHTML = `<div class="ps-check-head"><h3 class="ps-h3">${esc(ps('checkTitle'))}</h3><span class="ps-score ${tone}">${r.score}/100</span></div>
    ${r.issues.length ? `<ul class="ps-issues">${r.issues.map((i) => `<li class="lv-${i.level}"><span class="lv">${esc(ps('lv_' + i.level))}</span><span>${esc(i.text)}${i.where ? ` <span class="muted">· ${esc(i.where)}</span>` : ''}</span></li>`).join('')}</ul>` : `<p class="muted">${esc(ps('checkOk'))}</p>`}
    ${fixable ? `<button class="btn soft sm" id="ps-fix">${icon('sparkle')}${esc(ps('fixBrand'))}</button>` : ''}`;
  const fx = $('#ps-fix', box);
  if (fx) fx.addEventListener('click', async () => {
    fx.disabled = true; fx.innerHTML = `<span class="spinner"></span>${esc(ps('fixing'))}`;
    try { const res = await psJson(`/api/proposals/${p.id}/fix-brand`, { method: 'POST', body: { fromVersion: cur } }); psState.version = res.version; renderProposals(el); }
    catch (e) { showToast(e.message); fx.disabled = false; fx.textContent = ps('fixBrand'); }
  });
}

// ---------------- Brand kit tab ----------------
async function psRenderBrand(el) {
  const b = await psJson(`/api/proposal-brand?lang=${LANG === 'en' ? 'en' : 'es'}`);
  const admin = psState.me && psState.me.admin;
  const list = (arr) => `<ul class="ps-ul">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  el.innerHTML = `${psTabs('brand')}
    <p class="ps-lead">${esc(ps('brandSub'))}</p>
    <div class="ps-brand">
      <div class="panel"><h3 class="ps-h3">${esc(ps('styles'))}</h3>
        ${b.styles.map((st) => `<div class="ps-st-card ${st.current ? 'cur' : ''}"><div class="ps-st-name">${esc(st.name)}${st.current ? ` <span class="ps-final">${esc(ps('current'))}</span>` : ''}</div><div class="muted">${esc(st.description)}</div></div>`).join('')}
        <div class="muted ps-hint">${esc(ps('brandVersion'))}: ${esc(b.version)}</div></div>
      <div class="panel"><h3 class="ps-h3">${esc(ps('colors'))}</h3>
        <div class="ps-swatches">${Object.entries(b.tokens).map(([k, v]) => `<div class="ps-sw" title="${esc(b.tokenRoles[k] || '')}"><span style="background:${esc(v)}"></span><strong>${esc(k)}</strong><code>${esc(v)}</code></div>`).join('')}</div>
        <h3 class="ps-h3">${esc(ps('logos'))}</h3>
        <div class="ps-logos">${b.logos.filter((l) => /logo/.test(l.file)).map((l) => `<div class="ps-logo ${/allwhite/.test(l.file) ? 'on-blue' : /white/.test(l.file) ? 'on-navy' : ''}"><img src="/brand/${esc(l.file)}" alt=""><div class="muted">${esc(l.use)}</div></div>`).join('')}</div></div>
      <div class="panel"><h3 class="ps-h3">${esc(ps('yellow'))}</h3>${list(b.yellowTouches)}</div>
      <div class="panel"><h3 class="ps-h3">${esc(ps('voice'))}</h3>${list([...b.voice, ...b.phrasing.map((x) => x.text)])}
        <h3 class="ps-h3">${esc(ps('terms'))}</h3><table class="tbl ps-tbl"><thead><tr><th>${esc(ps('avoid'))}</th><th>${esc(ps('useT'))}</th></tr></thead><tbody>${b.terms.map((t) => `<tr><td>${esc(t.avoid)}</td><td><strong>${esc(t.use)}</strong></td></tr>`).join('')}</tbody></table></div>
      <div class="panel"><h3 class="ps-h3">${esc(ps('checksT'))}</h3>${list(b.checks.map((c) => c.text))}</div>
      <div class="panel"><h3 class="ps-h3">${esc(ps('teamRules'))}</h3><p class="muted">${esc(ps('teamRulesSub'))}</p>
        ${b.teamRules.length ? `<ul class="ps-rules">${b.teamRules.map((r, i) => `<li><span>${esc(r.text || r)}${r.by ? ` <span class="muted">· ${esc(r.by)}${r.from ? `, ${esc(r.from)}` : ''}</span>` : ''}</span>${admin ? `<button class="icon-btn ps-rule-del" data-i="${i}" aria-label="remove">×</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(ps('noRules'))}</p>`}</div>
    </div>`;
  psWireTabs(el);
  $$('.ps-rule-del', el).forEach((x) => x.addEventListener('click', async () => {
    try { await psJson(`/api/proposal-team-rules/${x.dataset.i}`, { method: 'DELETE' }); renderProposals(el); } catch (e) { showToast(e.message); }
  }));
}

// ---------------- tabs: Proposals · Past proposals · Playbook ----------------
function psTabs(active) {
  const t = [['list', 'tabProposals'], ['archive', 'tabArchive'], ['playbook', 'tabPlaybook'], ['brand', 'tabBrand']];
  return `<div class="seg ps-tabs" role="tablist">${t.map(([r, k]) => `<button class="${r === active ? 'active' : ''}" data-r="${r}" role="tab">${esc(ps(k))}</button>`).join('')}</div>`;
}
function psWireTabs(el) {
  $$('.ps-tabs button', el).forEach((b) => b.addEventListener('click', () => { psState.route = b.dataset.r; renderProposals(el); }));
}
const psSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);
const psList = (arr) => (arr && arr.length ? `<ul class="ps-ul">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>');

// ---------------- past proposals (archive) ----------------
async function psRenderArchive(el) {
  const { items } = await psJson('/api/proposal-archive');
  const outcomeOpts = (v) => PS_OUTCOMES.map((o) => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(ps('o_' + o))}</option>`).join('');
  el.innerHTML = `${psTabs('archive')}
    <div class="panel ps-upload">
      <p class="ps-lead">${esc(ps('archiveSub'))}</p>
      <label class="ps-drop" id="ps-drop">
        <input type="file" id="ps-files" multiple accept=".pdf,.docx,.pptx,.txt,.md,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden>
        ${icon('download')}<strong>${esc(ps('drop'))}</strong><span class="muted">${esc(ps('dropHint'))}</span>
      </label>
      <div class="ps-form"><div class="ps-grid3">
        <label class="ps-f"><span>${esc(ps('batchClient'))}</span><input id="ps-b-client" placeholder="Deporvillage"></label>
        <label class="ps-f"><span>${esc(ps('batchOutcome'))}</span><select id="ps-b-outcome">${outcomeOpts('unknown')}</select></label>
        <label class="ps-f"><span>${esc(ps('batchNotes'))}</span><input id="ps-b-notes"></label>
      </div>
      <details class="ps-paste"><summary>${esc(ps('pasteToggle'))}</summary>
        <textarea id="ps-paste-ta" rows="8"></textarea>
        <button class="btn soft sm" id="ps-paste-save">${icon('plus')}${esc(ps('pasteSave'))}</button></details>
      </div>
      <div id="ps-up-status" class="ps-up-status"></div>
    </div>
    <div class="panel ps-list">
      ${items.length ? `<table class="tbl ps-tbl"><thead><tr><th>${esc(ps('client'))}</th><th>${esc(ps('file'))}</th><th class="num">${esc(ps('year'))}</th><th>${esc(ps('outcome'))}</th><th>${esc(ps('total'))}</th><th>${esc(ps('status'))}</th></tr></thead>
        <tbody>${items.map((a) => `<tr class="ps-row" data-a="${esc(a.id)}">
          <td><strong>${esc(a.client || (a.digest || {}).client || '—')}</strong><div class="muted">${esc(((a.digest || {}).title) || a.industry || '')}</div></td>
          <td>${esc(a.filename || '—')}<div class="muted">${esc([a.size ? psSize(a.size) : '', a.uploaded_by].filter(Boolean).join(' · '))}</div></td>
          <td class="num">${esc(a.year || '—')}</td><td>${psOutcome(a.outcome)}</td><td>${esc(a.total || '—')}</td>
          <td>${a.status === 'processing' ? `<span class="ps-st"><span class="spinner"></span>${esc(ps('st_processing'))}</span>` : a.status === 'error' ? `<span class="badge b-lostc" title="${esc(a.error || '')}">${esc(ps('st_error'))}</span>` : `<span class="ps-st ok">${icon('sparkle')}${esc(ps('st_ready'))}</span>`}</td></tr>`).join('')}</tbody></table>`
      : `<div class="state-card">${icon('doc')}<p>${esc(ps('archiveEmpty'))}</p></div>`}
    </div>`;
  psWireTabs(el);
  $$('tr[data-a]', el).forEach((r) => r.addEventListener('click', () => { psState.route = 'archiveItem'; psState.archiveId = r.dataset.a; renderProposals(el); }));

  const status = $('#ps-up-status', el);
  const batch = () => ({ client: $('#ps-b-client', el).value.trim(), outcome: $('#ps-b-outcome', el).value, notes: $('#ps-b-notes', el).value.trim() });
  async function upload(files) {
    const b = batch();
    for (const f of files) {
      status.insertAdjacentHTML('beforeend', `<div class="ps-up-line"><span class="spinner"></span>${esc(ps('uploading'))} ${esc(f.name)}…</div>`);
      const line = status.lastElementChild;
      try {
        const qs = new URLSearchParams({ filename: f.name, outcome: b.outcome, ...(b.client ? { client: b.client } : {}), ...(b.notes ? { notes: b.notes } : {}) });
        const r = await fetch(`/api/proposal-archive?${qs}`, { method: 'POST', headers: { 'x-dashboard-token': authToken || '', 'content-type': f.type || 'application/octet-stream' }, body: f });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        line.innerHTML = `${icon('sparkle')}${esc(f.name)} — ${esc(ps('uploaded'))}`;
      } catch (e) { line.classList.add('err'); line.textContent = `${f.name}: ${e.message}`; }
    }
    setTimeout(() => { if (psState.route === 'archive') renderProposals(el); }, 1200);
  }
  const input = $('#ps-files', el); const drop = $('#ps-drop', el);
  input.addEventListener('change', () => input.files.length && upload([...input.files]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files.length && upload([...e.dataTransfer.files]));
  $('#ps-paste-save', el).addEventListener('click', async () => {
    const text = $('#ps-paste-ta', el).value.trim(); if (!text) return $('#ps-paste-ta', el).focus();
    try { await psJson('/api/proposal-archive/text', { method: 'POST', body: { text, ...batch() } }); renderProposals(el); } catch (e) { showToast(e.message); }
  });
  // Keep the "Reading…" rows fresh while Claude works.
  if (items.some((a) => a.status === 'processing')) psState.poll = setTimeout(() => { if (psState.route === 'archive' && !status.children.length) renderProposals(el); }, 6000);
}

async function psRenderArchiveItem(el) {
  const a = await psJson(`/api/proposal-archive/${psState.archiveId}`);
  const d = a.digest || {};
  const admin = psState.me && psState.me.admin;
  const fileUrl = `/api/proposal-archive/${a.id}/file?token=${encodeURIComponent(authToken)}`;
  el.innerHTML = `
    <button class="btn ghost sm ps-back" id="ps-back">← ${esc(ps('tabArchive'))}</button>
    <div class="ps-top">
      <div><h2 class="ps-h2">${esc(a.client || d.client || '—')}${d.title ? ` <span class="muted">· ${esc(d.title)}</span>` : ''}</h2>
        <div class="muted">${esc([a.year, a.country || d.country, a.industry || d.industry, a.filename].filter(Boolean).join(' · '))}</div></div>
      <div class="ps-top-actions">
        <select id="ps-a-outcome" class="ps-select">${PS_OUTCOMES.map((o) => `<option value="${o}" ${o === a.outcome ? 'selected' : ''}>${esc(ps('o_' + o))}</option>`).join('')}</select>
        <a class="btn ghost" href="${fileUrl}" target="_blank" rel="noopener">${icon('download')}${esc(ps('download'))}</a>
        ${a.status === 'ready' ? `${a.proposal_id ? `<button class="btn soft" id="ps-a-open">${icon('external')}${esc(ps('openImported'))}</button>` : `<button class="btn soft" id="ps-a-import">${icon('doc')}${esc(ps('importIt'))}</button>`}
        <button class="btn primary" id="ps-a-use">${icon('sparkle')}${esc(ps('useBase'))}</button>` : ''}
      </div>
    </div>
    <div id="ps-busy" class="ps-busy" hidden></div>
    ${a.status === 'processing' ? `<div class="panel ps-busy"><span class="spinner"></span>${esc(ps('st_processing'))}</div>` : ''}
    ${a.status === 'error' ? `<div class="ps-warn">${icon('alert')}<span>${esc(ps('errorLbl'))}: ${esc(a.error || '')}</span></div>` : ''}
    ${a.status === 'ready' ? `<div class="ps-arch">
      <div class="panel ps-arch-main">
        <h3 class="ps-h3">${esc(ps('summary'))}</h3><p>${esc(d.summary || '—')}</p>
        <h3 class="ps-h3">${esc(ps('programsLbl'))}</h3>
        ${(d.programs || []).length ? `<table class="tbl ps-tbl"><thead><tr><th>${esc(ps('program'))}</th><th>${esc(ps('seats'))}</th><th>${esc(ps('price'))}</th></tr></thead><tbody>
          ${d.programs.map((x) => `<tr><td><strong>${esc(x.program || '—')}</strong>${x.format ? `<div class="muted">${esc(x.format)}</div>` : ''}</td><td>${esc(x.seats || '—')}</td><td>${esc(x.price || '—')}</td></tr>`).join('')}
          ${d.total ? `<tr class="ps-total"><td colspan="2"><strong>${esc(ps('total'))}</strong></td><td><strong>${esc(d.total)}</strong></td></tr>` : ''}</tbody></table>` : '<p class="muted">—</p>'}
        <div class="ps-grid2"><div><h3 class="ps-h3">${esc(ps('pricing'))}</h3><p>${esc(d.pricing_model || '—')}</p></div><div><h3 class="ps-h3">${esc(ps('terms'))}</h3><p>${esc(d.terms || '—')}</p></div></div>
        <h3 class="ps-h3">${esc(ps('hooks'))}</h3>${(d.hooks || []).length ? d.hooks.map((h) => `<blockquote class="ps-quote">${esc(h)}</blockquote>`).join('') : '<p class="muted">—</p>'}
        <details class="ps-condensed"><summary><h3 class="ps-h3">${esc(ps('condensed'))}</h3></summary><div class="ps-pre">${esc(d.condensed || '')}</div></details>
      </div>
      <div class="ps-arch-side">
        <div class="panel"><h3 class="ps-h3">${esc(ps('strengths'))}</h3>${psList(d.strengths)}<h3 class="ps-h3">${esc(ps('weaknesses'))}</h3>${psList(d.weaknesses)}</div>
        <div class="panel"><h3 class="ps-h3">${esc(ps('angles'))}</h3>${psList(d.angles)}<h3 class="ps-h3">${esc(ps('proof'))}</h3>${psList(d.proof_used)}<h3 class="ps-h3">${esc(ps('structure'))}</h3>${psList(d.structure)}</div>
      </div></div>` : ''}
    <div class="panel"><div class="ps-form">
      <div class="ps-grid3">
        <label class="ps-f"><span>${esc(ps('client'))}</span><input id="ps-a-client" value="${esc(a.client || '')}"></label>
        <label class="ps-f"><span>${esc(ps('year'))}</span><input id="ps-a-year" value="${esc(a.year || '')}" inputmode="numeric"></label>
        <label class="ps-f"><span>${esc(ps('country'))}</span><input id="ps-a-country" value="${esc(a.country || '')}"></label>
      </div>
      <label class="ps-f"><span>${esc(ps('batchNotes'))}</span><textarea id="ps-a-notes" rows="2">${esc(a.notes || '')}</textarea></label>
      <div class="ps-actions"><button class="btn soft sm" id="ps-a-save">${esc(ps('saveArch'))}</button>
        <button class="btn ghost sm" id="ps-a-re">${esc(ps('reanalyze'))}</button>
        ${admin ? `<button class="btn ghost sm" id="ps-a-del">${esc(ps('del'))}</button>` : ''}</div>
    </div></div>`;

  $('#ps-back', el).addEventListener('click', () => { psState.route = 'archive'; renderProposals(el); });
  const patch = async (body) => { try { await psJson(`/api/proposal-archive/${a.id}`, { method: 'PATCH', body }); showToast(ps('saved')); } catch (e) { showToast(e.message); } };
  $('#ps-a-outcome', el).addEventListener('change', (e) => patch({ outcome: e.target.value }));
  $('#ps-a-save', el).addEventListener('click', () => patch({ client: $('#ps-a-client', el).value.trim(), year: $('#ps-a-year', el).value.trim(), country: $('#ps-a-country', el).value.trim(), notes: $('#ps-a-notes', el).value.trim() }));
  $('#ps-a-re', el).addEventListener('click', async () => { await psJson(`/api/proposal-archive/${a.id}/reanalyze`, { method: 'POST' }); renderProposals(el); });
  if ($('#ps-a-del', el)) $('#ps-a-del', el).addEventListener('click', async () => {
    if (!window.confirm(ps('confirmDel'))) return;
    await psJson(`/api/proposal-archive/${a.id}`, { method: 'DELETE' }); psState.route = 'archive'; renderProposals(el);
  });
  const goProposal = (id) => { psState.route = 'detail'; psState.id = id; psState.version = 'latest'; renderProposals(el); };
  if ($('#ps-a-open', el)) $('#ps-a-open', el).addEventListener('click', () => goProposal(a.proposal_id));
  if ($('#ps-a-use', el)) $('#ps-a-use', el).addEventListener('click', async () => {
    const client = window.prompt(ps('usePrompt')); if (!client) return;
    try { const p = await psJson(`/api/proposal-archive/${a.id}/use`, { method: 'POST', body: { client } }); goProposal(p.id); } catch (e) { showToast(e.message); }
  });
  if ($('#ps-a-import', el)) $('#ps-a-import', el).addEventListener('click', async (ev) => {
    const b = $('#ps-busy', el); b.hidden = false; b.innerHTML = `<span class="spinner"></span>${esc(ps('importing'))}`; ev.target.disabled = true;
    try { const p = await psJson(`/api/proposal-archive/${a.id}/import`, { method: 'POST' }); goProposal(p.id); }
    catch (e) { b.hidden = true; ev.target.disabled = false; showToast(e.message); }
  });
  if (a.status === 'processing') psState.poll = setTimeout(() => { if (psState.route === 'archiveItem') renderProposals(el); }, 6000);
}

// ---------------- playbook ----------------
function psMarkdown(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  let html = ''; let inList = false;
  String(text || '').split('\n').forEach((line) => {
    const l = line.trim();
    if (/^[-*•]\s+/.test(l)) { if (!inList) { html += '<ul class="ps-ul">'; inList = true; } html += `<li>${inline(l.replace(/^[-*•]\s+/, ''))}</li>`; return; }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,4}\s+/.test(l)) html += `<h3 class="ps-pb-h">${inline(l.replace(/^#+\s+/, ''))}</h3>`;
    else if (l) html += `<p>${inline(l)}</p>`;
  });
  return html + (inList ? '</ul>' : '');
}
async function psRenderPlaybook(el) {
  const pb = await psJson('/api/proposal-playbook');
  const admin = psState.me && psState.me.admin;
  const from = pb.built_from ? `${ps('builtFrom')} ${pb.built_from.archive} ${ps('archived')} + ${pb.built_from.studio} ${ps('studioN')} · ${pb.built_by || ''} ${ps('on')} ${psDate(pb.built_at)}` : '';
  el.innerHTML = `${psTabs('playbook')}
    <div class="ps-head"><p class="ps-lead" style="margin:0">${esc(ps('playbookSub'))}</p>
      <div class="ps-top-actions">${admin && pb.text ? `<button class="btn ghost" id="ps-pb-edit">${esc(ps('edit'))}</button>` : ''}<button class="btn primary" id="ps-pb-build">${icon('sparkle')}${esc(ps('rebuild'))}</button></div></div>
    <div id="ps-busy" class="ps-busy" hidden></div>
    <div class="panel ps-playbook">${pb.text ? `<div class="muted ps-pb-meta">${esc(from)}</div>${psMarkdown(pb.text)}` : `<div class="state-card">${icon('sparkle')}<p>${esc(ps('noPlaybook'))}</p></div>`}
      <div id="ps-pb-editbox" hidden><textarea id="ps-pb-ta" class="ps-json" spellcheck="false"></textarea><button class="btn primary sm" id="ps-pb-save">${esc(ps('savePb'))}</button></div></div>`;
  psWireTabs(el);
  $('#ps-pb-build', el).addEventListener('click', async (ev) => {
    const b = $('#ps-busy', el); b.hidden = false; b.innerHTML = `<span class="spinner"></span>${esc(ps('rebuilding'))}`; ev.target.disabled = true;
    try { await psJson('/api/proposal-playbook/rebuild', { method: 'POST', body: { language: LANG === 'en' ? 'en' : 'es' } }); renderProposals(el); }
    catch (e) { b.hidden = true; ev.target.disabled = false; showToast(e.message); }
  });
  if ($('#ps-pb-edit', el)) $('#ps-pb-edit', el).addEventListener('click', () => { const box = $('#ps-pb-editbox', el); box.hidden = !box.hidden; $('#ps-pb-ta', el).value = pb.text || ''; });
  if ($('#ps-pb-save', el)) $('#ps-pb-save', el).addEventListener('click', async () => {
    const value = { ...pb, text: $('#ps-pb-ta', el).value, edited_at: new Date().toISOString() }; delete value.archiveReady;
    try { await psJson('/api/proposal-library/playbook', { method: 'PUT', body: { value } }); renderProposals(el); } catch (e) { showToast(e.message); }
  });
}

// ---------------- Admin → Users ----------------
async function renderUsers(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:160px"></div></div>';
  let data;
  try { data = await psJson('/api/users'); } catch (e) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`; return; }
  const roleOpts = (sel) => data.roles.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${esc(r)}</option>`).join('');
  el.innerHTML = `
    <div class="panel ps-list"><table class="tbl ps-tbl"><thead><tr><th>${esc(ps('username'))}</th><th>${esc(ps('role'))}</th><th>${esc(ps('password'))}</th><th></th></tr></thead><tbody>
      ${data.users.map((u) => `<tr data-u="${esc(u.name)}">
        <td><strong>${esc(u.name)}</strong><div class="muted">${esc(u.source === 'env' ? ps('fromEnv') : ps('fromApp'))}</div></td>
        <td>${u.source === 'env' ? esc(u.role) : `<select class="ps-select u-role">${roleOpts(u.role)}</select>`}<div class="muted">${esc(ps('role_' + u.role))}</div></td>
        <td>${u.source === 'env' ? '—' : `${u.has_password ? '' : `<div class="ps-warn" style="margin:0 0 6px">${esc(ps('noPassword'))}</div>`}<input class="u-pass" type="password" autocomplete="new-password" placeholder="${esc(ps('newPassword'))}">`}</td>
        <td>${u.source === 'env' ? '' : `<button class="btn soft sm u-save">${esc(ps('saveUser'))}</button> <button class="btn ghost sm u-del">${esc(ps('remove'))}</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="panel"><h3 class="ps-h3">${esc(ps('addUser'))}</h3>
      <div class="ps-form"><div class="ps-grid3">
        <label class="ps-f"><span>${esc(ps('username'))}</span><input id="nu-name" placeholder="maria"></label>
        <label class="ps-f"><span>${esc(ps('role'))}</span><select id="nu-role">${roleOpts('editor')}</select></label>
        <label class="ps-f"><span>${esc(ps('password'))}</span><input id="nu-pass" type="password" autocomplete="new-password" placeholder="${esc(ps('newPassword'))}"></label>
      </div><div class="ps-actions"><button class="btn primary" id="nu-save">${icon('plus')}${esc(ps('saveUser'))}</button></div></div></div>`;
  const save = async (body) => { try { await psJson('/api/users', { method: 'POST', body }); showToast(ps('saved')); renderUsers(el); } catch (e) { showToast(e.message); } };
  $$('tr[data-u]', el).forEach((tr) => {
    const name = tr.dataset.u;
    const b = $('.u-save', tr); if (b) b.addEventListener('click', () => save({ name, role: $('.u-role', tr).value, password: $('.u-pass', tr).value || undefined }));
    const d = $('.u-del', tr); if (d) d.addEventListener('click', async () => { if (!window.confirm(ps('confirmRemove'))) return; try { await psJson(`/api/users/${encodeURIComponent(name)}`, { method: 'DELETE' }); renderUsers(el); } catch (e) { showToast(e.message); } });
  });
  $('#nu-save', el).addEventListener('click', () => save({ name: $('#nu-name', el).value, role: $('#nu-role', el).value, password: $('#nu-pass', el).value }));
}

window.renderUsers = renderUsers;
window.renderProposals = renderProposals;
window.resetProposals = () => { psState.route = 'list'; psState.id = null; };
