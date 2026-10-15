'use strict';
/* Marketing Hub — shared helpers for Events and Social.
   Uses the dashboard's globals: $, $$, esc, icon, api, LANG, showToast, openDrawer, closeDrawers. */

const HUB_STR = {
  en: {
    newEvent: 'New event', newPost: 'New post', save: 'Save', saved: 'Saved', del: 'Delete', confirmDel: 'Delete this item? This cannot be undone.', cancel: 'Cancel', close: 'Close',
    calendar: 'Calendar', list: 'List', results: 'Results', plan: 'Plan', history: 'History', board: 'Pipeline', settings: 'Settings', today: 'Today', all: 'All',
    market: 'Market', program: 'Program', status: 'Status', type: 'Type', date: 'Date', time: 'Time', owner: 'Owner', notes: 'Notes', title: 'Title', language: 'Language',
    storageFile: 'Storage: local file (DATABASE_URL is not set, so items are lost on redeploy).', noAI: 'Claude is not configured (ANTHROPIC_API_KEY).', working: 'Working…',
    // events
    upcoming: 'Upcoming (30 days)', thisMonth: 'This month', registrations: 'Registrations', attendees: 'Attendees', showRate: 'Show rate', leads: 'Leads', enrollments: 'Enrollments', cost: 'Cost', costPerAttendee: 'Cost / attendee', regToLead: 'Leads / attendee',
    startAt: 'Starts', endAt: 'Ends', timezone: 'Time zone', format: 'Format', online: 'Online', in_person: 'In person', hybrid: 'Hybrid', location: 'Place / room', meetingUrl: 'Meeting link (Zoom / Meet / YouTube)', capacity: 'Capacity',
    speakers: 'Speakers / hosts', audience: 'Who it is for', goal: 'Goal of the event', description: 'Description', links: 'Links', lumaUrl: 'Luma link', landingUrl: '4Geeks landing / event page', registrationUrl: 'Registration link to promote', recordingUrl: 'Recording / replay', slidesUrl: 'Slides / materials', utm: 'Tracked link',
    budget: 'Budget', checklist: 'Promo plan', checklistSub: 'Due dates are counted from the event day', due: 'due', overdue: 'overdue', done: 'done',
    fromLuma: 'Add from Luma link', fromLumaPh: 'Paste a lu.ma or luma.com event link', fetch: 'Fetch', importLuma: 'Import from Luma', importDone: '{f} events in Luma · {c} new · {u} updated', syncLuma: 'Sync registrations from Luma', lumaNoKey: 'Full Luma sync needs LUMA_API_KEY on the server. You can still paste any Luma link.',
    promoPosts: 'Add promo posts to the social calendar', promoDone: '{n} promo posts added to Social', writeEventCopy: 'Write event copy with Claude', copyReady: 'Copy ready — click a block to copy it',
    noEvents: 'No events here yet. Add one, paste a Luma link, or import your Luma calendar.', progress: 'Promo plan',
    byType: 'By type', byMarket: 'By market', eventsDone: 'Events done', open: 'Open', buildUtm: 'Build link', source: 'Source', medium: 'Medium', campaign: 'Campaign', copy: 'Copy', copied: 'Copied',
    // social
    account: 'Account', channel: 'Channel', funnel: 'Funnel', pillar: 'Pillar', hook: 'Hook (first line / first 2 seconds)', caption: 'Caption', cta: 'Call to action', hashtags: 'Hashtags', link: 'Link in bio / post link', asset: 'Asset (Canva, Figma, Drive, Campaign Studio)', assetNotes: 'What to film / design', postUrl: 'Published post URL', event: 'Linked event', none: '— none —',
    perf: 'Results', views: 'Views / reach', likes: 'Likes', comments: 'Comments', saves: 'Saves', shares: 'Shares', dms: 'DMs / leads', follows: 'New follows', engagement: 'Engagement', engRate: 'Eng. / view',
    postsThisMonth: 'Posts this month', publishedMonth: 'Published', readyNext7: 'Ready for next 7 days', gaps: 'Empty days this week', vsTarget: 'vs target {n}/week',
    planMix: 'Mix this month vs target', funnelMix: 'Funnel mix', pillarMix: 'Pillar mix', weeklyCadence: 'Posts per week vs target', target: 'Target', actual: 'Actual',
    aiPlan: 'Plan the month with Claude', aiPlanSub: 'Claude proposes a full month for the accounts you pick, following your targets, mix and events. Nothing is saved until you add it.', focus: 'Focus for this month (optional)', focusPh: 'e.g. push AI Fluency workshops in LATAM, Black Friday offer from Nov 24, more student stories', generate: 'Generate plan', addSelected: 'Add {n} selected to the calendar', planning: 'Claude is planning the month… (about a minute)',
    writeCopy: 'Write with Claude', alternatives: 'Other hooks', ideas: 'Ideas backlog', noPosts: 'Nothing planned here yet.', week: 'Week', more: '+{n} more',
    accountMetrics: 'Account metrics by week', addWeek: 'Add week', weekStart: 'Week starting', followers: 'Followers', nonFollower: '% non-follower', viewers: 'Viewers', interactions: 'Interactions', accountsEngaged: 'Accounts engaged', profileVisits: 'Profile visits', linkTaps: 'Link taps', topPost: 'Top post',
    topPosts: 'Top posts', settingsSub: 'Accounts, weekly targets and the mix the plan aims for. Shared by the whole team.', accounts: 'Accounts', handle: 'Handle', url: 'URL', addAccount: 'Add account', weeklyTargets: 'Posts per week per channel', funnelDefs: 'What TOFU / MOFU / BOFU mean for us', mixWarn: 'Adds up to {n}% (should be 100%)',
  },
  es: {
    newEvent: 'Nuevo evento', newPost: 'Nuevo post', save: 'Guardar', saved: 'Guardado', del: 'Eliminar', confirmDel: '¿Eliminar este elemento? No se puede deshacer.', cancel: 'Cancelar', close: 'Cerrar',
    calendar: 'Calendario', list: 'Lista', results: 'Resultados', plan: 'Plan', history: 'Historial', board: 'Pipeline', settings: 'Ajustes', today: 'Hoy', all: 'Todos',
    market: 'Mercado', program: 'Programa', status: 'Estado', type: 'Tipo', date: 'Fecha', time: 'Hora', owner: 'Responsable', notes: 'Notas', title: 'Título', language: 'Idioma',
    storageFile: 'Almacenamiento: archivo local (no hay DATABASE_URL, se pierde al redeplegar).', noAI: 'Claude no está configurado (ANTHROPIC_API_KEY).', working: 'Trabajando…',
    upcoming: 'Próximos (30 días)', thisMonth: 'Este mes', registrations: 'Registros', attendees: 'Asistentes', showRate: 'Asistencia', leads: 'Leads', enrollments: 'Matrículas', cost: 'Coste', costPerAttendee: 'Coste / asistente', regToLead: 'Leads / asistente',
    startAt: 'Empieza', endAt: 'Termina', timezone: 'Zona horaria', format: 'Formato', online: 'Online', in_person: 'Presencial', hybrid: 'Híbrido', location: 'Lugar / sala', meetingUrl: 'Enlace de la reunión (Zoom / Meet / YouTube)', capacity: 'Aforo',
    speakers: 'Ponentes / hosts', audience: 'Para quién es', goal: 'Objetivo del evento', description: 'Descripción', links: 'Enlaces', lumaUrl: 'Enlace de Luma', landingUrl: 'Landing / página del evento en 4Geeks', registrationUrl: 'Enlace de registro a promocionar', recordingUrl: 'Grabación / replay', slidesUrl: 'Slides / materiales', utm: 'Enlace con tracking',
    budget: 'Presupuesto', checklist: 'Plan de promoción', checklistSub: 'Las fechas se cuentan desde el día del evento', due: 'vence', overdue: 'atrasado', done: 'hecho',
    fromLuma: 'Añadir desde enlace de Luma', fromLumaPh: 'Pega un enlace de evento de lu.ma o luma.com', fetch: 'Traer', importLuma: 'Importar de Luma', importDone: '{f} eventos en Luma · {c} nuevos · {u} actualizados', syncLuma: 'Sincronizar registros de Luma', lumaNoKey: 'La sincronización completa con Luma necesita LUMA_API_KEY en el servidor. Puedes pegar cualquier enlace de Luma igualmente.',
    promoPosts: 'Añadir posts de promoción al calendario social', promoDone: '{n} posts de promoción añadidos a Social', writeEventCopy: 'Escribir textos del evento con Claude', copyReady: 'Textos listos — haz clic en un bloque para copiarlo',
    noEvents: 'Aún no hay eventos. Crea uno, pega un enlace de Luma o importa tu calendario de Luma.', progress: 'Plan de promo',
    byType: 'Por tipo', byMarket: 'Por mercado', eventsDone: 'Eventos hechos', open: 'Abrir', buildUtm: 'Crear enlace', source: 'Source', medium: 'Medium', campaign: 'Campaña', copy: 'Copiar', copied: 'Copiado',
    account: 'Cuenta', channel: 'Canal', funnel: 'Funnel', pillar: 'Pilar', hook: 'Hook (primera línea / primeros 2 segundos)', caption: 'Copy', cta: 'Llamada a la acción', hashtags: 'Hashtags', link: 'Link en bio / del post', asset: 'Pieza (Canva, Figma, Drive, Campaign Studio)', assetNotes: 'Qué grabar / diseñar', postUrl: 'URL del post publicado', event: 'Evento vinculado', none: '— ninguno —',
    perf: 'Resultados', views: 'Vistas / alcance', likes: 'Likes', comments: 'Comentarios', saves: 'Guardados', shares: 'Compartidos', dms: 'DMs / leads', follows: 'Nuevos seguidores', engagement: 'Interacciones', engRate: 'Interac. / vista',
    postsThisMonth: 'Posts este mes', publishedMonth: 'Publicados', readyNext7: 'Listos próximos 7 días', gaps: 'Días vacíos esta semana', vsTarget: 'vs objetivo {n}/semana',
    planMix: 'Mix del mes vs objetivo', funnelMix: 'Mix de funnel', pillarMix: 'Mix de pilares', weeklyCadence: 'Posts por semana vs objetivo', target: 'Objetivo', actual: 'Real',
    aiPlan: 'Planificar el mes con Claude', aiPlanSub: 'Claude propone un mes completo para las cuentas que elijas, siguiendo tus objetivos, mix y eventos. No se guarda nada hasta que lo añadas.', focus: 'Foco del mes (opcional)', focusPh: 'p. ej. empujar workshops de AI Fluency en LATAM, oferta de Black Friday desde el 24, más historias de alumnos', generate: 'Generar plan', addSelected: 'Añadir {n} seleccionados al calendario', planning: 'Claude está planificando el mes… (cerca de un minuto)',
    writeCopy: 'Escribir con Claude', alternatives: 'Otros hooks', ideas: 'Banco de ideas', noPosts: 'Aún no hay nada planificado aquí.', week: 'Semana', more: '+{n} más',
    accountMetrics: 'Métricas de cuenta por semana', addWeek: 'Añadir semana', weekStart: 'Semana desde', followers: 'Seguidores', nonFollower: '% no seguidores', viewers: 'Espectadores', interactions: 'Interacciones', accountsEngaged: 'Cuentas que interactúan', profileVisits: 'Visitas al perfil', linkTaps: 'Clics en enlace', topPost: 'Post top',
    topPosts: 'Mejores posts', settingsSub: 'Cuentas, objetivos semanales y el mix al que apunta el plan. Compartido por todo el equipo.', accounts: 'Cuentas', handle: 'Usuario', url: 'URL', addAccount: 'Añadir cuenta', weeklyTargets: 'Posts por semana por canal', funnelDefs: 'Qué significa TOFU / MOFU / BOFU para nosotros', mixWarn: 'Suma {n}% (debería ser 100%)',
  },
};
const LABELS = {
  en: {
    workshop: 'Workshop', webinar: 'Webinar', masterclass: 'Masterclass', open_house: 'Open house', info_session: 'Info session', meetup: 'Meetup', hackathon: 'Hackathon', demo_day: 'Demo day', b2b_session: 'B2B session',
    idea: 'Idea', planned: 'Planned', promoting: 'Promoting', live: 'Live', done: 'Done', cancelled: 'Cancelled',
    drafting: 'Drafting', design: 'In design', ready: 'Ready', scheduled: 'Scheduled', published: 'Published', skipped: 'Skipped',
    instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook', youtube: 'YouTube', x: 'X', threads: 'Threads',
    reel: 'Reel', carousel: 'Carousel', static: 'Static post', story: 'Story', short: 'Short', video: 'Video', live_fmt: 'Live', text: 'Text', article: 'Article',
  },
  es: {
    workshop: 'Workshop', webinar: 'Webinar', masterclass: 'Masterclass', open_house: 'Puertas abiertas', info_session: 'Sesión informativa', meetup: 'Meetup', hackathon: 'Hackathon', demo_day: 'Demo day', b2b_session: 'Sesión B2B',
    idea: 'Idea', planned: 'Planificado', promoting: 'En promoción', live: 'En vivo', done: 'Hecho', cancelled: 'Cancelado',
    drafting: 'Redactando', design: 'En diseño', ready: 'Listo', scheduled: 'Programado', published: 'Publicado', skipped: 'Descartado',
    instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook', youtube: 'YouTube', x: 'X', threads: 'Threads',
    reel: 'Reel', carousel: 'Carrusel', static: 'Post estático', story: 'Story', short: 'Short', video: 'Vídeo', live_fmt: 'Directo', text: 'Texto', article: 'Artículo',
  },
};
const hs = (k, vars) => { let s = (HUB_STR[LANG] || HUB_STR.en)[k] ?? HUB_STR.en[k] ?? k; if (vars) Object.entries(vars).forEach(([a, b]) => { s = s.replace(`{${a}}`, b); }); return s; };
const hl = (k) => (LABELS[LANG] || LABELS.en)[k] || LABELS.en[k] || (k ? String(k).replace(/_/g, ' ') : '—');
const hlFormat = (k) => (k === 'live' ? ((LABELS[LANG] || LABELS.en).live_fmt) : hl(k));

const hub = { meta: null };
async function hubJson(url, opts) {
  const r = await api(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
async function hubMeta(force) {
  if (!hub.meta || force) hub.meta = await hubJson('/api/hub/meta');
  return hub.meta;
}

// ---------- dates (all calendar math on YYYY-MM-DD strings, local time) ----------
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDaysStr = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const monthKey = (s) => String(s).slice(0, 7);
const shiftMonth = (key, n) => { const d = parseYmd(key + '-01'); d.setMonth(d.getMonth() + n); return ymd(d).slice(0, 7); };
const weekStart = (s) => { const d = parseYmd(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); }; // Monday
const locale = () => (LANG === 'es' ? 'es-ES' : 'en-US');
const fmtDay = (s, o = { day: 'numeric', month: 'short' }) => (s ? parseYmd(s).toLocaleDateString(locale(), o) : '—');
const monthTitle = (key) => parseYmd(key + '-01').toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
// Event start is stored as ISO; show it in the viewer's local time.
const evDate = (e) => (e.start_at ? ymd(new Date(e.start_at)) : null);
const evTime = (e) => (e.start_at ? new Date(e.start_at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) : '');
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const fmtN = (n) => (n === null || n === undefined || isNaN(n) ? '—' : Number(n).toLocaleString(locale(), { maximumFractionDigits: 1 }));
const hubPct = (a, b) => (a && b ? `${Math.round((100 * a) / b)}%` : '—');
const money = (n) => (n || n === 0 ? `$${Number(n).toLocaleString(locale(), { maximumFractionDigits: 0 })}` : '—');

// ---------- month grid ----------
// items: [{date, html}] → a 7-column month calendar starting Monday.
function hubMonthGrid(key, itemsByDate, { onDay, max = 4 } = {}) {
  const first = parseYmd(key + '-01');
  const start = weekStart(ymd(first));
  const days = [];
  for (let i = 0; i < 42; i++) { const d = addDaysStr(start, i); if (i >= 35 && monthKey(d) !== key) break; days.push(d); }
  const wd = [...Array(7)].map((_, i) => parseYmd(addDaysStr(start, i)).toLocaleDateString(locale(), { weekday: 'short' }));
  const today = todayStr();
  return `<div class="hub-cal">
    ${wd.map((w) => `<div class="hub-cal-wd">${esc(w)}</div>`).join('')}
    ${days.map((d) => { const list = itemsByDate[d] || []; return `<div class="hub-cal-day ${monthKey(d) !== key ? 'out' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
      <div class="hub-cal-num">${parseYmd(d).getDate()}${onDay ? `<button class="hub-cal-add" data-add="${d}" title="+">+</button>` : ''}</div>
      ${list.slice(0, max).map((x) => x.html).join('')}${list.length > max ? `<div class="hub-cal-more" data-more="${d}">${esc(hs('more', { n: list.length - max }))}</div>` : ''}
    </div>`; }).join('')}
  </div>`;
}

// ---------- form builders (data-f = field path, supports "results.views") ----------
function hf(path, label, value, { type = 'text', ph = '', rows, opts, full, step } = {}) {
  const v = value === null || value === undefined ? '' : value;
  let input;
  if (opts) input = `<select data-f="${path}">${opts.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (rows) input = `<textarea data-f="${path}" rows="${rows}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
  else input = `<input type="${type}" data-f="${path}" value="${esc(v)}" placeholder="${esc(ph)}" ${step ? `step="${step}"` : ''}>`;
  return `<label class="hub-f ${full ? 'full' : ''}"><span>${esc(label)}</span>${input}</label>`;
}
function hubReadForm(root) {
  const out = {};
  $$('[data-f]', root).forEach((x) => {
    const path = x.dataset.f.split('.');
    let v = x.type === 'checkbox' ? x.checked : x.value;
    if (x.type === 'number') v = num(v);
    else if (typeof v === 'string') v = v.trim();
    if (x.type === 'datetime-local') v = fromLocalInput(v);
    let o = out; path.slice(0, -1).forEach((p) => { o = o[p] || (o[p] = {}); }); o[path[path.length - 1]] = v;
  });
  return out;
}
function hubDrawer(html) {
  const d = $('#hub-drawer');
  d.innerHTML = html;
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', closeDrawers));
  openDrawer('#hub-drawer');
  d.querySelector('.dr-body').scrollTop = 0;
  return d;
}
function hubCopyable(label, text) {
  return `<div class="hub-copy" data-copy="${esc(text || '')}"><div class="hub-copy-l">${esc(label)} ${icon('doc')}</div><div class="hub-copy-t">${esc(text || '')}</div></div>`;
}
function hubWireCopy(root) {
  $$('.hub-copy', root).forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); showToast(hs('copied')); } catch (e) { /* ignore */ } }));
}
function hubUtm(url, { source, medium, campaign, content }) {
  if (!url) return '';
  try { const u = new URL(url); if (source) u.searchParams.set('utm_source', source); if (medium) u.searchParams.set('utm_medium', medium); if (campaign) u.searchParams.set('utm_campaign', campaign); if (content) u.searchParams.set('utm_content', content); return u.toString(); } catch (e) { return url; }
}
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const MARKET_CLASS = { USA: 'm-usa', Spain: 'm-es', LATAM: 'm-latam' };
const hubBar = (rows) => `<div class="hub-bars">${rows.map((r) => `<div class="hub-bar-row"><span class="hub-bar-l">${esc(r.label)}</span><span class="hub-bar-track"><i style="width:${Math.min(100, r.actual)}%"></i>${r.target !== undefined ? `<b style="left:${Math.min(100, r.target)}%" title="${esc(hs('target'))} ${r.target}%"></b>` : ''}</span><span class="hub-bar-v">${Math.round(r.actual)}%${r.target !== undefined ? ` <em>/ ${r.target}%</em>` : ''}</span></div>`).join('')}</div>`;
