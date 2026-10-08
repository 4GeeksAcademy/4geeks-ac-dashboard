'use strict';
/* Proposal Studio — B2B proposals inside the Leads & Deals dashboard.
   Uses the dashboard's globals: $, $$, esc, icon, api, authToken, LANG, showToast.
   The proposal LOOK is fixed by the server renderer (4Geeks brand kit); this UI
   only captures inputs, versions and edits. */

const PS_STR = {
  en: {
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
const psState = { route: 'list', id: null, version: 'latest', busy: null, me: null };
const psDate = (iso) => (iso ? new Date(iso).toLocaleDateString(LANG === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const psBadge = (s) => `<span class="badge ${PS_STATUS_CLASS[s] || 'b-neutral'}">${esc(ps('s_' + s))}</span>`;

async function psJson(url, opts) {
  const r = await api(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function renderProposals(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:180px"></div></div>';
  if (!psState.me) psState.me = await psJson('/api/me').catch(() => ({}));
  try {
    if (psState.route === 'new') return psRenderNew(el);
    if (psState.route === 'detail' && psState.id) return await psRenderDetail(el);
    return await psRenderList(el);
  } catch (e) {
    el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`;
  }
}

// ---------------- list ----------------
async function psRenderList(el) {
  const { proposals, storage } = await psJson('/api/proposals');
  el.innerHTML = `
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
  </form>`;
}
function psProgRow(r = {}) {
  return `<div class="ps-prow"><input data-k="program" placeholder="${esc(ps('program'))}" value="${esc(r.program || '')}"><input data-k="seats" placeholder="${esc(ps('seats'))}" value="${esc(r.seats || '')}"><input data-k="price" placeholder="${esc(ps('price'))}" value="${esc(r.price || '')}"><button type="button" class="icon-btn ps-del" aria-label="remove">×</button></div>`;
}
function psWireIntake(root) {
  $('#ps-addrow', root).addEventListener('click', () => { $('#ps-prog', root).insertAdjacentHTML('beforeend', psProgRow()); psWireDel(root); });
  psWireDel(root);
}
function psWireDel(root) { $$('.ps-del', root).forEach((b) => { b.onclick = () => b.closest('.ps-prow').remove(); }); }
function psReadIntake(root) {
  const form = $('#ps-intake', root); const out = {};
  $$('input[name],textarea[name],select[name]', form).forEach((x) => { out[x.name] = x.value.trim(); });
  out.programs = $$('.ps-prow', form).map((r) => Object.fromEntries($$('input', r).map((x) => [x.dataset.k, x.value.trim()]))).filter((r) => r.program || r.price);
  return out;
}

function psRenderNew(el) {
  el.innerHTML = `<button class="btn ghost sm ps-back" id="ps-back">← ${esc(ps('back'))}</button>
    <div class="panel"><h2 class="ps-h2">${esc(ps('intake'))}</h2><p class="muted">${esc(ps('intakeSub'))}</p>${psIntakeForm({})}
    <div class="ps-actions"><button class="btn primary" id="ps-create">${icon('plus')}${esc(ps('create'))}</button></div></div>`;
  psWireIntake(el);
  $('#ps-back').addEventListener('click', () => { psState.route = 'list'; renderProposals(el); });
  $('#ps-create').addEventListener('click', async () => {
    const intake = psReadIntake(el);
    if (!intake.client) { $('[name=client]', el).focus(); return; }
    const p = await psJson('/api/proposals', { method: 'POST', body: { client: intake.client, country: intake.country, language: intake.language, currency: intake.currency, intake } });
    psState.route = 'detail'; psState.id = p.id; psState.version = 'latest'; renderProposals(el);
  });
}

// ---------------- detail ----------------
async function psRenderDetail(el) {
  const p = await psJson(`/api/proposals/${psState.id}`);
  const versions = p.versions || [];
  const cur = psState.version === 'latest' ? (versions[0] && versions[0].version) : Number(psState.version);
  const viewUrl = cur ? `/proposals/${p.id}/v/${cur}?token=${encodeURIComponent(authToken)}` : null;
  const admin = psState.me && psState.me.admin;
  el.innerHTML = `
    <button class="btn ghost sm ps-back" id="ps-back">← ${esc(ps('back'))}</button>
    <div class="ps-top">
      <div><h2 class="ps-h2">${esc(p.client)}${p.title ? ` <span class="muted">· ${esc(p.title)}</span>` : ''}</h2>
        <div class="muted">${esc(ps('owner'))}: ${esc(p.owner || '—')} · ${esc(psDate(p.updated_at))}</div></div>
      <div class="ps-top-actions">
        <select id="ps-status" class="ps-select">${PS_STATUSES.map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''} ${['approved', 'won', 'lost'].includes(s) && !admin ? 'disabled' : ''}>${esc(ps('s_' + s))}</option>`).join('')}</select>
        ${cur ? `<a class="btn ghost" href="/proposals/${p.id}/v/${cur}/gdoc?token=${encodeURIComponent(authToken)}" title="${esc(ps('gdocHint'))}">${icon('doc')}${esc(ps('gdoc'))}</a>
        <a class="btn soft" href="/proposals/${p.id}/v/${cur}/brief?token=${encodeURIComponent(authToken)}&print=1" target="_blank" rel="noopener" title="${esc(ps('briefHint'))}">${icon('doc')}${esc(ps('brief'))}</a>
        <a class="btn primary" href="${viewUrl}&print=1" target="_blank" rel="noopener">${icon('download')}${esc(ps('pdf'))}</a>` : ''}
      </div>
    </div>
    <div class="ps-cols">
      <div class="ps-left">
        <div class="panel ps-ai">
          <div class="ps-ai-row"><textarea id="ps-instr" rows="2" placeholder="${esc(ps('instructions'))}"></textarea><button class="btn primary" id="ps-draft">${icon('sparkle')}${esc(ps('draft'))}</button></div>
          ${cur ? `<div class="ps-ai-row"><textarea id="ps-rev" rows="2" placeholder="${esc(ps('revisePh'))}"></textarea><button class="btn soft" id="ps-revise">${icon('sparkle')}${esc(ps('revise'))}</button></div>` : ''}
          <div id="ps-busy" class="ps-busy" hidden></div>
        </div>
        <div class="panel">
          <h3 class="ps-h3">${esc(ps('versions'))}</h3>
          ${versions.length ? `<ul class="ps-versions">${versions.map((v) => `<li class="${v.version === cur ? 'on' : ''}" data-v="${v.version}">
            <strong>v${v.version}</strong><span class="ps-src">${esc(ps('src_' + v.source) || v.source || '')}</span>
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
      <div class="ps-right">${cur ? `<iframe class="ps-preview" src="${viewUrl}" title="preview"></iframe>` : `<div class="panel state-card">${icon('doc')}<p>${esc(ps('noVersion'))}</p></div>`}</div>
    </div>`;

  psWireIntake(el);
  $('#ps-back').addEventListener('click', () => { psState.route = 'list'; renderProposals(el); });
  $$('.ps-versions li', el).forEach((li) => li.addEventListener('click', () => { psState.version = li.dataset.v; renderProposals(el); }));
  $('#ps-status').addEventListener('change', async (e) => {
    try { await psJson(`/api/proposals/${p.id}`, { method: 'PATCH', body: { status: e.target.value } }); showToast(ps('saved')); }
    catch (err) { showToast(err.message); e.target.value = p.status; }
  });
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
    try { const r = await psJson(`/api/proposals/${p.id}/draft`, { method: 'POST', body: { instructions: $('#ps-instr').value } }); psState.version = r.version; renderProposals(el); }
    catch (err) { busy(null); showToast(err.message); }
  });
  if ($('#ps-revise')) $('#ps-revise').addEventListener('click', async () => {
    const instruction = $('#ps-rev').value.trim(); if (!instruction) return $('#ps-rev').focus();
    busy(ps('revising'));
    try { const r = await psJson(`/api/proposals/${p.id}/revise`, { method: 'POST', body: { instruction, fromVersion: cur } }); psState.version = r.version; renderProposals(el); }
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
