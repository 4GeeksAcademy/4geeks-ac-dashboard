'use strict';
/* 4Geeks Leads & Deals dashboard — client.
   Sections: helpers · i18n/theme · auth/api · state & filters · shell ·
   overview · regions · pivot · leads table · lead drawer · recommendations ·
   ads · AI insights · boot. */

// ───────────────────────── helpers ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, d, digits = 1) => (d ? (n / d * 100).toFixed(digits) + '%' : '—');
const pctNum = (n, d) => (d ? n / d * 100 : null);
const fmtInt = (n) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US'));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
function showToast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
}
function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '—';
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(LANG === 'es' ? 'es-ES' : 'en-US', opts);
}
function fmtMoney(n, cur = 'USD') {
  if (n == null || isNaN(n)) return '—';
  const sym = cur === 'EUR' ? '€' : '$';
  return sym + Number(n).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 });
}

const I = { // inline icons (24px, stroke)
  overview: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  recommendations: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  regions: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  grouped: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  individual: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 11h5M19.5 8.5v5"/>',
  ads: '<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  ai: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  collapse: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  status: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.5 18a9 9 0 1 1 17 0"/>',
  xcircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2-5.3A8.4 8.4 0 1 1 21 11.5z"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5"/>',
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
};
const icon = (name) => `<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg></span>`;
function paintIcons(root = document) { $$('[data-icon]', root).forEach((el) => { el.outerHTML = icon(el.dataset.icon); }); }

// ───────────────────────── i18n & theme ─────────────────────────
let LANG = (() => { try { const s = localStorage.getItem('dashLang'); if (s) return s; } catch (e) {} return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'; })();
function t(key, vars) {
  let s = (window.I18N[LANG] && window.I18N[LANG][key]) ?? window.I18N.en[key] ?? key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split('{' + k + '}').join(v); });
  return s;
}
function applyStaticI18n() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
  $$('#lang-seg button, .lang-mini').forEach((b) => b.classList.toggle('active', (b.dataset.lang || b.dataset.setlang) === LANG));
}
function setLang(l) { LANG = l; try { localStorage.setItem('dashLang', l); } catch (e) {} applyStaticI18n(); if (booted) { buildNav(); buildFilterBar(); renderAll(); } }

let THEME = (() => { try { return localStorage.getItem('dashTheme') || 'system'; } catch (e) { return 'system'; } })();
function setTheme(th) {
  THEME = th; try { localStorage.setItem('dashTheme', th); } catch (e) {}
  if (th === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
  $$('#theme-seg button').forEach((b) => b.classList.toggle('active', b.dataset.theme === th));
  if (booted) renderAll();
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (THEME === 'system' && booted) renderAll(); });

// ───────────────────────── auth & api ─────────────────────────
let authToken = (() => { try { return localStorage.getItem('dashboardToken'); } catch (e) { return null; } })();
function logout() { try { localStorage.removeItem('dashboardToken'); } catch (e) {} authToken = null; location.reload(); }
async function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}), 'x-dashboard-token': authToken || '' };
  if (opts.body && typeof opts.body !== 'string') { headers['content-type'] = 'application/json'; opts = { ...opts, body: JSON.stringify(opts.body) }; }
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}
async function handleLogin(e) {
  e.preventDefault();
  const username = $('#username').value; const password = $('#password').value;
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (!r.ok) throw new Error(t('invalidCreds'));
    const data = await r.json();
    authToken = data.token; localStorage.setItem('dashboardToken', authToken);
    location.reload();
  } catch (err) { const el = $('#login-error'); el.textContent = err.message; el.hidden = false; }
}

// ───────────────────────── data & state ─────────────────────────
let ALL = [];
let META = { generatedAt: null, loading: true, error: null, acAppUrl: null };
let booted = false;

const BUCKETS = ['Won', 'Active / Other', 'Lost - Classified', 'Lost - Unclassified'];
const BUCKET_CLASS = { 'Won': 'b-won', 'Lost - Classified': 'b-lostc', 'Lost - Unclassified': 'b-lostu', 'Active / Other': 'b-other' };
const BUCKET_VAR = { 'Won': '--s-won', 'Active / Other': '--s-active', 'Lost - Classified': '--s-lostc', 'Lost - Unclassified': '--s-lostu' };
const REGIONS = ['USA', 'Spain', 'LATAM'];
const SCORE_BANDS = ['High engagement', 'Moderate engagement', 'Light engagement', 'Minimal engagement', 'No engagement', 'Negative signal'];
const SCORE_BANDS_ES = { 'High engagement': 'Engagement alto', 'Moderate engagement': 'Engagement moderado', 'Light engagement': 'Engagement ligero', 'Minimal engagement': 'Engagement mínimo', 'No engagement': 'Sin engagement', 'Negative signal': 'Señal negativa' };
const regionLabel = (r) => (r === 'Spain' && LANG === 'es' ? 'España' : r);
const isWon = (r) => r.bucket === 'Won';
const isLost = (r) => r.bucket === 'Lost - Classified' || r.bucket === 'Lost - Unclassified';
const isActive = (r) => r.bucket === 'Active / Other';

// Filter definitions. `primary` ones sit in the bar; the rest live in the
// "More filters" drawer. `vals(r)` returns the record's values (arrays let
// multi-valued fields like lost reasons match any of their values).
const FILTERS = [
  { key: 'bucket', icon: 'status', primary: true, order: BUCKETS, label: (v) => t('b_' + v) },
  { key: 'assignTo', icon: 'user', primary: true },
  { key: 'scoreBand', icon: 'gauge', primary: true, order: SCORE_BANDS, label: (v) => (LANG === 'es' ? SCORE_BANDS_ES[v] || v : v) },
  { key: 'admissionsScore', icon: 'star', primary: true },
  { key: 'reason', icon: 'xcircle', primary: true, vals: (r) => r.reasons || [] },
  { key: 'leadSentiment', group: 'grpAdmissions' },
  { key: 'classification', group: 'grpAdmissions' },
  { key: 'admissionsConversationType', group: 'grpAdmissions' },
  { key: 'source', group: 'grpAttribution' },
  { key: 'medium', group: 'grpAttribution' },
  { key: 'campaign', group: 'grpAttribution' },
  { key: 'location', group: 'grpAttribution' },
  { key: 'course', group: 'grpOther' },
  { key: 'stage', group: 'grpOther' },
];
const FILTER_BY_KEY = Object.fromEntries(FILTERS.map((f) => [f.key, f]));
const fVals = (f, r) => (f.vals ? f.vals(r) : (r[f.key] != null && r[f.key] !== '' ? [String(r[f.key])] : []));
const fLabel = (f, v) => (f.label ? f.label(v) : v);

const VIEWS = ['overview', 'recommendations', 'regions', 'grouped', 'individual', 'ads', 'ai'];
const state = { view: 'overview', region: 'all', q: '', dateFrom: '', dateTo: '', preset: '', gran: 'auto', page: 1, sort: { field: 'date', dir: 'desc' }, groupBy: 'assignTo', aiScope: 'both', adsRegion: 'US' };
FILTERS.forEach((f) => { state[f.key] = []; });

function presetRange(p) {
  const today = isoLocal(new Date());
  const d = new Date();
  switch (p) {
    case 'today': return [today, today];
    case 'yesterday': { const y = addDays(today, -1); return [y, y]; }
    case '7d': return [addDays(today, -6), today];
    case '30d': return [addDays(today, -29), today];
    case '90d': return [addDays(today, -89), today];
    case 'thisWeek': { const mon = addDays(today, -((d.getDay() + 6) % 7)); return [mon, today]; }
    case 'thisMonth': return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), today];
    case 'lastMonth': return [isoLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoLocal(new Date(d.getFullYear(), d.getMonth(), 0))];
    case 'all': return ['', ''];
    default: return null;
  }
}
const PRESETS = ['today', 'yesterday', '7d', '30d', 'thisWeek', 'thisMonth', 'lastMonth', '90d', 'all'];

function syncStateFromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.has('view') && VIEWS.includes(p.get('view'))) state.view = p.get('view');
  else if (p.has('tab') && VIEWS.includes(p.get('tab'))) state.view = p.get('tab');
  ['region', 'q', 'dateFrom', 'dateTo', 'preset', 'gran', 'groupBy', 'aiScope'].forEach((k) => { if (p.has(k)) state[k] = p.get(k); });
  FILTERS.forEach((f) => { const v = p.getAll(f.key).filter((x) => x && x !== 'all'); if (v.length) state[f.key] = v; });
  // Relative presets stay relative: a link to "last 7 days" means last 7 days
  // when opened, not the 7 days it was copied on.
  if (state.preset && state.preset !== 'custom') { const r = presetRange(state.preset); if (r) [state.dateFrom, state.dateTo] = r; }
  if (!state.dateFrom && !state.dateTo && !p.has('preset')) { state.preset = '30d'; [state.dateFrom, state.dateTo] = presetRange('30d'); }
}
function syncStateToUrl() {
  const p = new URLSearchParams();
  if (state.view !== 'overview') p.set('view', state.view);
  if (state.region !== 'all') p.set('region', state.region);
  if (state.q) p.set('q', state.q);
  if (state.preset && state.preset !== 'custom') p.set('preset', state.preset);
  else { if (state.dateFrom) p.set('dateFrom', state.dateFrom); if (state.dateTo) p.set('dateTo', state.dateTo); if (state.preset) p.set('preset', 'custom'); }
  if (state.gran !== 'auto') p.set('gran', state.gran);
  FILTERS.forEach((f) => state[f.key].forEach((v) => p.append(f.key, v)));
  const qs = p.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

// match(r, {skip, skipDate, skipRegion}) — skip lets a facet count its own
// options against everything else that's filtered.
function match(r, o = {}) {
  if (!o.skipRegion && state.region !== 'all' && r.region !== state.region) return false;
  if (!o.skipDate) {
    if (state.dateFrom && (!r.date || r.date < state.dateFrom)) return false;
    if (state.dateTo && (!r.date || r.date > state.dateTo)) return false;
  }
  for (const f of FILTERS) {
    if (f.key === o.skip) continue;
    const sel = state[f.key];
    if (!sel.length) continue;
    const vals = fVals(f, r);
    if (!vals.some((v) => sel.includes(v))) return false;
  }
  if (state.q) {
    const q = state.q.toLowerCase();
    const hay = [r.name, r.email, r.phone, r.id, r.campaign, r.location, r.course, r.reason, r.assignTo].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
const filtered = () => ALL.filter((r) => match(r));
function previousRows() {
  if (!state.dateFrom || !state.dateTo) return null;
  const len = daysBetween(state.dateFrom, state.dateTo) + 1;
  const from = addDays(state.dateFrom, -len); const to = addDays(state.dateFrom, -1);
  return ALL.filter((r) => r.date && r.date >= from && r.date <= to && match(r, { skipDate: true }));
}
function stats(rows) {
  const s = { total: rows.length, won: 0, lost: 0, lostc: 0, lostu: 0, active: 0 };
  rows.forEach((r) => { if (isWon(r)) s.won++; else if (r.bucket === 'Lost - Classified') { s.lost++; s.lostc++; } else if (r.bucket === 'Lost - Unclassified') { s.lost++; s.lostu++; } else s.active++; });
  s.closed = s.won + s.lost;
  s.winRate = pctNum(s.won, s.total); s.lossRate = pctNum(s.lost, s.total); s.closeWin = pctNum(s.won, s.closed);
  return s;
}
function groupStats(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => {
    const keys = keyFn(r);
    (keys.length ? keys : ['(none)']).forEach((k) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
  });
  return [...m.entries()].map(([k, rs]) => ({ key: k, ...stats(rs) }));
}

// ───────────────────────── loading ─────────────────────────
async function loadData() {
  META.loading = true; META.error = null; renderFreshness();
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await api('/api/summary');
    if (res.status === 202) {
      const body = await res.json().catch(() => ({}));
      META.loadingMsg = body.lastError ? t('loadingRetry', { e: body.lastError }) : t('loadingAC');
      renderFreshness();
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || res.statusText); }
    const data = await res.json();
    ALL = data.records || [];
    META = { ...META, generatedAt: data.generatedAt, cacheAgeSeconds: data.cacheAgeSeconds, acAppUrl: data.acAppUrl || null, loading: false };
    renderFreshness();
    return;
  }
  throw new Error('Timed out waiting for ActiveCampaign data');
}
function renderFreshness() {
  const el = $('#freshness'); if (!el) return;
  if (META.error) { el.innerHTML = `<span class="dot" style="background:var(--bad)"></span>${esc(META.error)}`; return; }
  if (META.loading) { el.innerHTML = `<span class="dot loading"></span>${esc(META.loadingMsg || t('loadingAC'))}`; return; }
  const d = META.generatedAt ? new Date(META.generatedAt) : null;
  const tm = d ? d.toLocaleTimeString(LANG === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
  el.innerHTML = `<span class="dot"></span>${esc(t('dataAsOf', { t: tm }))}`;
}

// ───────────────────────── shell ─────────────────────────
const NAV = [
  { section: 'navSectionPipeline' },
  { view: 'overview', icon: 'overview' },
  { view: 'individual', icon: 'individual' },
  { view: 'recommendations', icon: 'recommendations' },
  { view: 'regions', icon: 'regions' },
  { view: 'grouped', icon: 'grouped' },
  { section: 'navSectionMarketing' },
  { view: 'ads', icon: 'ads' },
  { view: 'ai', icon: 'ai' },
];
function buildNav() {
  $('#nav').innerHTML = NAV.map((n) => (n.section
    ? `<div class="sb-section">${esc(t(n.section))}</div>`
    : `<button class="sb-item ${state.view === n.view ? 'active' : ''}" data-view="${n.view}" title="${esc(t('nav_' + n.view))}">${icon(n.icon)}<span class="sb-text">${esc(t('nav_' + n.view))}</span></button>`)).join('');
  $$('#nav .sb-item').forEach((b) => b.addEventListener('click', () => { go(b.dataset.view); $('#app').classList.remove('menu-open'); }));
}
function go(view) {
  state.view = view; state.page = 1;
  $$('#nav .sb-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  buildFilterBar();
  renderAll();
  window.scrollTo({ top: 0 });
}

// ───────────────────────── filter bar ─────────────────────────
function dateLabel() {
  if (state.preset && state.preset !== 'custom') return t('p_' + state.preset);
  if (state.dateFrom || state.dateTo) return `${state.dateFrom ? fmtDate(state.dateFrom) : '…'} – ${state.dateTo ? fmtDate(state.dateTo) : '…'}`;
  return t('p_all');
}
function filterBtnHtml(f) {
  const sel = state[f.key];
  const val = !sel.length ? t('all') : sel.length === 1 ? fLabel(f, sel[0]) : t('selected', { n: sel.length });
  return `<button class="fbtn ${sel.length ? 'on' : ''}" data-filter="${f.key}">${f.icon ? icon(f.icon) : ''}<span>${esc(t('f_' + f.key))}:</span><span class="fval">${esc(val)}</span><span class="caret">${icon('caret')}</span></button>`;
}
function buildFilterBar() {
  const bar = $('#filterbar');
  const adsView = state.view === 'ads';
  const regionOpts = ['all', ...REGIONS];
  const moreCount = FILTERS.filter((f) => !f.primary && state[f.key].length).length;
  bar.innerHTML = `
    <div class="seg" id="region-seg">${regionOpts.map((r) => `<button data-region="${r}" class="${state.region === r ? 'active' : ''}">${esc(r === 'all' ? t('allRegions') : (r === 'Spain' && LANG === 'es' ? 'España' : r))}</button>`).join('')}</div>
    <button class="fbtn ${state.dateFrom || state.dateTo ? 'on' : ''}" id="date-btn">${icon('calendar')}<span class="fval">${esc(dateLabel())}</span><span class="caret">${icon('caret')}</span></button>
    ${adsView ? '' : `<div class="fb-divider"></div>
    ${FILTERS.filter((f) => f.primary).map(filterBtnHtml).join('')}
    <button class="fbtn ${moreCount ? 'on' : ''}" id="more-btn">${icon('filter')}<span>${esc(t('moreFilters'))}</span>${moreCount ? `<span class="badge-n">${moreCount}</span>` : ''}</button>
    <div class="fb-spacer"></div>
    <div class="fb-search">${icon('search')}<input type="search" id="f-q" placeholder="${esc(t('search'))}" value="${esc(state.q)}"></div>`}
  `;
  $$('#region-seg button').forEach((b) => b.addEventListener('click', () => { state.region = b.dataset.region; if (state.region !== 'all') state.adsRegion = REGION_TO_CENTER[state.region]; onFiltersChanged(); }));
  $('#date-btn').addEventListener('click', (e) => openDatePopover(e.currentTarget));
  $$('#filterbar [data-filter]').forEach((b) => b.addEventListener('click', (e) => openFilterPopover(e.currentTarget, FILTER_BY_KEY[b.dataset.filter])));
  const more = $('#more-btn'); if (more) more.addEventListener('click', openFilterDrawer);
  const q = $('#f-q');
  if (q) { let tmr; q.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { state.q = q.value.trim(); onFiltersChanged({ keepBar: true }); }, 200); }); }
  renderChips();
}
function renderChips() {
  const el = $('#active-chips');
  if (state.view === 'ads') { el.innerHTML = ''; return; }
  const chips = [];
  FILTERS.forEach((f) => state[f.key].forEach((v) => chips.push(`<span class="chip">${esc(t('f_' + f.key))}: <b>${esc(fLabel(f, v))}</b><button data-rm="${f.key}" data-v="${esc(v)}" aria-label="remove">${icon('x')}</button></span>`)));
  if (state.q) chips.push(`<span class="chip">“<b>${esc(state.q)}</b>”<button data-rm="q" aria-label="remove">${icon('x')}</button></span>`);
  el.innerHTML = chips.length ? chips.join('') + `<button class="chip-clear" id="clear-all">${esc(t('clearAll'))}</button>` : '';
  $$('#active-chips [data-rm]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.rm === 'q') state.q = ''; else state[b.dataset.rm] = state[b.dataset.rm].filter((x) => x !== b.dataset.v);
    onFiltersChanged();
  }));
  const ca = $('#clear-all'); if (ca) ca.addEventListener('click', () => { FILTERS.forEach((f) => { state[f.key] = []; }); state.q = ''; onFiltersChanged(); });
}
function onFiltersChanged(o = {}) {
  state.page = 1;
  if (o.keepBar) renderChips(); else buildFilterBar();
  renderAll(o);
}

let popEl = null;
function closePopover() { if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('mousedown', outsidePop, true); } }
function outsidePop(e) { if (popEl && !popEl.contains(e.target) && !e.target.closest('.fbtn')) closePopover(); }
function placePopover(anchor, el) {
  document.getElementById('popover-root').appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  let left = Math.min(r.left, window.innerWidth - w - 12);
  el.style.left = Math.max(12, left) + 'px';
  el.style.top = (r.bottom + 6) + 'px';
  setTimeout(() => document.addEventListener('mousedown', outsidePop, true), 0);
}
function facetOptions(f) {
  const rows = ALL.filter((r) => match(r, { skip: f.key }));
  const counts = new Map();
  rows.forEach((r) => fVals(f, r).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
  state[f.key].forEach((v) => { if (!counts.has(v)) counts.set(v, 0); });
  let opts = [...counts.entries()];
  if (f.order) opts.sort((a, b) => { const ia = f.order.indexOf(a[0]); const ib = f.order.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
  else opts.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return opts;
}
function openFilterPopover(anchor, f) {
  const wasOpen = popEl && popEl.dataset.key === f.key; closePopover(); if (wasOpen) return;
  const el = document.createElement('div'); el.className = 'popover'; el.dataset.key = f.key; popEl = el;
  const opts = facetOptions(f);
  const draw = (q = '') => {
    const list = opts.filter(([v]) => !q || fLabel(f, v).toLowerCase().includes(q.toLowerCase()));
    el.querySelector('.pop-list').innerHTML = list.length ? list.map(([v, n]) => `<div class="pop-opt ${state[f.key].includes(v) ? 'sel' : ''}" data-v="${esc(v)}"><span class="cb">${state[f.key].includes(v) ? icon('check') : ''}</span><span class="lbl" title="${esc(fLabel(f, v))}">${esc(fLabel(f, v))}</span><span class="cnt">${fmtInt(n)}</span></div>`).join('') : `<div class="pop-empty">${esc(t('noOptions'))}</div>`;
    $$('.pop-opt', el).forEach((o) => o.addEventListener('click', () => {
      const v = o.dataset.v; const s = state[f.key];
      state[f.key] = s.includes(v) ? s.filter((x) => x !== v) : [...s, v];
      draw(el.querySelector('input').value);
      onFiltersChanged({ keepBar: true, keepPopover: true });
      const btn = $(`#filterbar [data-filter="${f.key}"]`); if (btn) btn.outerHTML = filterBtnHtml(f);
      const nb = $(`#filterbar [data-filter="${f.key}"]`); if (nb) nb.addEventListener('click', (e) => openFilterPopover(e.currentTarget, f));
    }));
  };
  el.innerHTML = `<div class="pop-head"><input type="search" placeholder="${esc(t('filterSearch'))}"></div><div class="pop-list"></div><div class="pop-foot"><button data-act="clear">${esc(t('clearAll'))}</button><button data-act="done">${esc(t('apply'))}</button></div>`;
  draw();
  el.querySelector('input').addEventListener('input', (e) => draw(e.target.value));
  el.querySelector('[data-act=clear]').addEventListener('click', () => { state[f.key] = []; closePopover(); onFiltersChanged(); });
  el.querySelector('[data-act=done]').addEventListener('click', () => { closePopover(); buildFilterBar(); });
  placePopover(anchor, el);
  if (opts.length > 8) el.querySelector('input').focus();
}
function openDatePopover(anchor) {
  const wasOpen = popEl && popEl.dataset.key === '__date'; closePopover(); if (wasOpen) return;
  const el = document.createElement('div'); el.className = 'popover'; el.dataset.key = '__date'; popEl = el;
  el.innerHTML = `<div class="pop-list">${PRESETS.map((p) => `<div class="pop-opt ${state.preset === p ? 'sel' : ''}" data-p="${p}"><span class="cb radio">${state.preset === p ? icon('check') : ''}</span><span class="lbl">${esc(t('p_' + p))}</span></div>`).join('')}</div>
    <div class="pop-dates"><div><label>${esc(t('from'))}</label><input type="date" id="pd-from" value="${esc(state.dateFrom)}"></div><div><label>${esc(t('to'))}</label><input type="date" id="pd-to" value="${esc(state.dateTo)}"></div></div>`;
  $$('.pop-opt', el).forEach((o) => o.addEventListener('click', () => {
    state.preset = o.dataset.p; [state.dateFrom, state.dateTo] = presetRange(o.dataset.p);
    closePopover(); onFiltersChanged();
  }));
  const custom = () => { state.dateFrom = $('#pd-from').value; state.dateTo = $('#pd-to').value; state.preset = 'custom'; onFiltersChanged(); };
  el.querySelector('#pd-from').addEventListener('change', custom);
  el.querySelector('#pd-to').addEventListener('change', custom);
  placePopover(anchor, el);
}
function openDrawer(id) { $('#drawer-scrim').classList.add('open'); $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false'); }
function closeDrawers() { $('#drawer-scrim').classList.remove('open'); $$('.drawer').forEach((d) => { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }); }
function openFilterDrawer() {
  closePopover();
  const d = $('#filter-drawer');
  const groups = ['grpMain', 'grpAdmissions', 'grpAttribution', 'grpOther'];
  d.innerHTML = `<div class="dr-head"><div class="dr-titles"><h2>${esc(t('moreFilters'))}</h2></div><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="dr-body">${groups.map((g) => `<div class="dr-group ${g === 'grpMain' ? 'only-mobile-block' : ''}"><h4>${esc(t(g))}</h4><div class="dr-grid">${FILTERS.filter((f) => (g === 'grpMain' ? f.primary : f.group === g)).map(filterBtnHtml).join('')}</div></div>`).join('')}</div>
    <div class="dr-foot"><button class="btn ghost" data-clear>${esc(t('clearAll'))}</button><button class="btn primary" data-close>${esc(t('apply'))}</button></div>`;
  $$('[data-filter]', d).forEach((b) => { b.style.maxWidth = 'none'; b.addEventListener('click', (e) => openFilterPopover(e.currentTarget, FILTER_BY_KEY[b.dataset.filter])); });
  $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => { closePopover(); closeDrawers(); buildFilterBar(); }));
  $('[data-clear]', d).addEventListener('click', () => { FILTERS.filter((f) => !f.primary || window.innerWidth <= 900).forEach((f) => { state[f.key] = []; }); openFilterDrawer(); onFiltersChanged({ keepBar: true }); });
  openDrawer('#filter-drawer');
}

// ───────────────────────── charts ─────────────────────────
const charts = {};
function destroyCharts() { Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; }); }
function chartBase() {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = cssVar('--axis');
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: cssVar('--surface'), titleColor: cssVar('--ink'), bodyColor: cssVar('--body'), footerColor: cssVar('--ink'),
        borderColor: cssVar('--border'), borderWidth: 1, padding: 12, cornerRadius: 10, boxPadding: 5, usePointStyle: true,
        titleFont: { weight: '700' }, footerFont: { weight: '700' },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: cssVar('--border') }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
      y: { beginAtZero: true, grid: { color: cssVar('--grid') }, border: { display: false }, ticks: { precision: 0, padding: 6 } },
    },
  };
}
function periodKey(r, g) { return g === 'day' ? r.date : g === 'week' ? r.week : r.date ? r.date.slice(0, 7) : null; }
function resolveGran(rows) {
  if (state.gran !== 'auto') return state.gran;
  let a = state.dateFrom; let b = state.dateTo;
  if (!a || !b) { const ds = rows.map((r) => r.date).filter(Boolean).sort(); a = a || ds[0]; b = b || ds[ds.length - 1]; }
  if (!a || !b) return 'week';
  const span = daysBetween(a, b);
  return span <= 45 ? 'day' : span <= 210 ? 'week' : 'month';
}
function periodKeys(rows, g) {
  const present = rows.map((r) => periodKey(r, g)).filter(Boolean).sort();
  let a = present[0]; let b = present[present.length - 1];
  if (g === 'day') { a = state.dateFrom || a; b = state.dateTo || b; }
  if (!a || !b) return [];
  const keys = [];
  if (g === 'day') { for (let k = a; k <= b && keys.length < 800; k = addDays(k, 1)) keys.push(k); }
  else if (g === 'week') { for (let k = a; k <= b && keys.length < 400; k = addDays(k, 7)) keys.push(k); }
  else { let [y, m] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number); while ((y < by || (y === by && m <= bm)) && keys.length < 120) { keys.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } } }
  return keys;
}
function periodLabel(k, g) {
  if (g === 'month') return new Date(k + '-01T12:00:00').toLocaleDateString(LANG === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: '2-digit' });
  return fmtDate(k, g === 'day' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
}

// ───────────────────────── KPI cards ─────────────────────────
function deltaHtml(cur, prev, { invert = false, points = false } = {}) {
  if (prev == null || cur == null) return '';
  const diff = points ? cur - prev : (prev ? (cur - prev) / prev * 100 : null);
  if (diff == null || !isFinite(diff)) return '';
  const good = invert ? diff < 0 : diff > 0;
  const cls = Math.abs(diff) < 0.5 ? 'flat' : good ? 'up' : 'down';
  const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
  return `<span class="delta ${cls}" title="${esc(t('k_vsPrev'))}">${sign} ${Math.abs(diff).toFixed(1)}${points ? 'pp' : '%'}</span>`;
}
function kpiCards(rows) {
  const s = stats(rows);
  const prevRows = previousRows();
  const p = prevRows ? stats(prevRows) : null;
  const vs = p ? `<span>${esc(t('k_vsPrev'))}</span>` : '';
  const card = (cls, dotVar, label, val, sub, delta, bar) => `<div class="kpi ${cls}"><div class="k-lbl">${dotVar ? `<span class="dot" style="background:var(${dotVar})"></span>` : ''}${esc(label)}</div><div class="k-val">${val}</div><div class="k-sub">${delta || ''}${sub}</div>${bar != null ? `<div class="k-bar"><i style="width:${Math.min(100, bar).toFixed(1)}%;background:var(${dotVar || '--blue'})"></i></div>` : ''}</div>`;
  return `<div class="kpis">
    ${card('hl-blue', null, t('k_deals'), fmtInt(s.total), vs, p && deltaHtml(s.total, p.total))}
    ${card('', '--s-won', t('k_won'), fmtInt(s.won), vs, p && deltaHtml(s.won, p.won))}
    ${card('hl-good', '--s-won', t('k_winRate'), s.winRate == null ? '—' : s.winRate.toFixed(1) + '%', `<span>${esc(t('k_ofClosed', { p: s.closeWin == null ? '—' : s.closeWin.toFixed(1) + '%' }))}</span>`, p && deltaHtml(s.winRate, p.winRate, { points: true }), s.winRate)}
    ${card('', '--s-lostc', t('k_lost'), fmtInt(s.lost), vs, p && deltaHtml(s.lost, p.lost, { invert: true }))}
    ${card('hl-bad', '--s-lostc', t('k_lossRate'), s.lossRate == null ? '—' : s.lossRate.toFixed(1) + '%', `<span>${esc(t('k_ofDeals'))}</span>`, p && deltaHtml(s.lossRate, p.lossRate, { invert: true, points: true }), s.lossRate)}
    ${card('', '--s-active', t('k_active'), fmtInt(s.active), `<span>${esc(t('k_open'))}</span>`)}
    ${card('', '--s-lostu', t('k_noReason'), fmtInt(s.lostu), `<span>${esc(t('k_ofLost', { p: pct(s.lostu, s.lost) }))}</span>`)}
  </div>`;
}

// ───────────────────────── overview ─────────────────────────
function barList(groups, { field, max = 8, emptyText } = {}) {
  const top = groups.filter((g) => g.key !== '(none)').sort((a, b) => b.total - a.total).slice(0, max);
  if (!top.length) return `<div class="empty">${esc(emptyText || t('noData'))}</div>`;
  const peak = top[0].total || 1;
  return `<div class="blist">${top.map((g) => {
    const wr = g.winRate;
    return `<div class="brow" data-field="${field}" data-value="${esc(g.key)}" title="${esc(g.key)}">
      <div class="lab">${esc(field === 'scoreBand' ? fLabel(FILTER_BY_KEY.scoreBand, g.key) : g.key)}</div>
      <div class="track"><i style="width:${(g.won / peak * 100).toFixed(1)}%;background:var(--s-won)"></i><i style="width:${((g.total - g.won) / peak * 100).toFixed(1)}%;background:var(--s-active);opacity:.55"></i></div>
      <div class="num"><b>${fmtInt(g.total)}</b> · ${wr == null ? '—' : wr.toFixed(1) + '%'} ${esc(t('winShort'))}</div></div>`;
  }).join('')}</div>`;
}
function wireBarLists(root) {
  $$('.brow[data-field]', root).forEach((row) => row.addEventListener('click', () => {
    const f = row.dataset.field; const v = row.dataset.value;
    if (FILTER_BY_KEY[f]) { if (!state[f].includes(v)) state[f] = [...state[f], v]; onFiltersChanged(); }
  }));
}
function renderOverview(rows) {
  const el = $('#tab-overview');
  const g = resolveGran(rows);
  const gl = t('gl_' + g);
  const owners = groupStats(rows, (r) => [r.assignTo || t('unassigned')]).sort((a, b) => b.total - a.total);
  const lostRows = rows.filter((r) => r.bucket === 'Lost - Classified');
  const reasonCounts = {}; lostRows.forEach((r) => (r.reasons || []).forEach((x) => { reasonCounts[x] = (reasonCounts[x] || 0) + 1; }));
  const reasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const rPeak = reasons.length ? reasons[0][1] : 1;
  el.innerHTML = `
    ${kpiCards(rows)}
    <div class="panel">
      <div class="panel-head">
        <div><h2>${esc(t('trendTitle'))}</h2><div class="panel-sub">${esc(t('trendSub', { g: gl }))}</div></div>
        <div class="seg" id="gran-seg">${['auto', 'day', 'week', 'month'].map((x) => `<button data-g="${x}" class="${state.gran === x ? 'active' : ''}">${esc(t('g_' + x))}</button>`).join('')}</div>
      </div>
      <div class="chart-box"><canvas id="c-trend"></canvas></div>
      <div class="legend">${BUCKETS.map((b) => `<span><i style="background:var(${BUCKET_VAR[b]})"></i>${esc(t('b_' + b))}</span>`).join('')}</div>
    </div>
    <div class="grid-65">
      <div class="panel">
        <div class="panel-head"><div><h2>${esc(t('ownersTitle'))}</h2><div class="panel-sub">${esc(t('ownersSub'))}</div></div><span class="count-tag">${owners.length}</span></div>
        ${owners.length ? `<div class="tablewrap" style="max-height:340px"><table><thead><tr><th>${esc(t('colOwner'))}</th><th class="num">${esc(t('colDeals'))}</th><th class="num">${esc(t('colWon'))}</th><th>${esc(t('colWinRate'))}</th><th class="num">${esc(t('colLost'))}</th><th class="num">${esc(t('colLossRate'))}</th><th class="num">${esc(t('colActive'))}</th></tr></thead><tbody>
          ${owners.map((o) => `<tr class="clickrow" data-owner="${esc(o.key)}"><td><div class="cell-lead"><span class="avatar">${esc(initials(o.key))}</span><span class="nm">${esc(o.key)}</span></div></td><td class="num">${fmtInt(o.total)}</td><td class="num">${fmtInt(o.won)}</td><td><span class="minibar"><i style="width:${Math.min(100, (o.winRate || 0) * 4)}%"></i></span>${o.winRate == null ? '—' : o.winRate.toFixed(1) + '%'}</td><td class="num">${fmtInt(o.lost)}</td><td class="num">${o.lossRate == null ? '—' : o.lossRate.toFixed(1) + '%'}</td><td class="num">${fmtInt(o.active)}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">${esc(t('noData'))}</div>`}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>${esc(t('rateTitle'))}</h2><div class="panel-sub">${esc(t('rateSub', { g: gl }))}</div></div></div>
        <div class="chart-box sm" style="height:280px"><canvas id="c-rate"></canvas></div>
        <div class="legend"><span><i style="background:var(--s-won)"></i>${esc(t('k_winRate'))}</span><span><i style="background:var(--s-lostc)"></i>${esc(t('k_lossRate'))}</span></div>
      </div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(t('campaignsTitle'))}</h2></div>${barList(groupStats(rows, (r) => (r.campaign ? [r.campaign] : [])), { field: 'campaign' })}</div>
      <div class="panel"><div class="panel-head"><h2>${esc(t('sourcesTitle'))}</h2></div>${barList(groupStats(rows, (r) => (r.source ? [r.source] : [])), { field: 'source' })}</div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><div><h2>${esc(t('reasonsTitle'))}</h2><div class="panel-sub">${esc(t('reasonsSub'))}</div></div></div>
        ${reasons.length ? `<div class="blist">${reasons.map(([k, v]) => `<div class="brow" data-field="reason" data-value="${esc(k)}" title="${esc(k)}"><div class="lab">${esc(k)}</div><div class="track"><i style="width:${(v / rPeak * 100).toFixed(1)}%;background:var(--s-lostc)"></i></div><div class="num"><b>${fmtInt(v)}</b> · ${pct(v, lostRows.length)}</div></div>`).join('')}</div>` : `<div class="empty">${icon('inbox')}<div>${esc(t('noData'))}</div></div>`}
      </div>
      <div class="panel"><div class="panel-head"><h2>${esc(t('coursesTitle'))}</h2></div>${barList(groupStats(rows, (r) => (r.course ? [r.course] : [])), { field: 'course' })}</div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(t('locationsTitle'))}</h2></div>${barList(groupStats(rows, (r) => (r.location ? [r.location] : [])), { field: 'location' })}</div>
      <div class="panel"><div class="panel-head"><h2>${esc(t('f_scoreBand'))}</h2></div>${barList(groupStats(rows, (r) => (r.scoreBand ? [r.scoreBand] : [])), { field: 'scoreBand' })}</div>
    </div>`;

  $$('#gran-seg button').forEach((b) => b.addEventListener('click', () => { state.gran = b.dataset.g; renderAll(); }));
  $$('tr[data-owner]', el).forEach((tr) => tr.addEventListener('click', () => { const v = tr.dataset.owner; if (v !== t('unassigned') && !state.assignTo.includes(v)) { state.assignTo = [...state.assignTo, v]; onFiltersChanged(); } }));
  wireBarLists(el);

  // Trend: stacked outcome bars per period (one axis, counts).
  const keys = periodKeys(rows, g);
  const byKey = new Map(keys.map((k) => [k, { Won: 0, 'Active / Other': 0, 'Lost - Classified': 0, 'Lost - Unclassified': 0 }]));
  rows.forEach((r) => { const k = periodKey(r, g); if (byKey.has(k)) byKey.get(k)[r.bucket]++; });
  const surface = cssVar('--surface');
  const base = chartBase();
  charts.trend = new Chart($('#c-trend'), {
    type: 'bar',
    data: { labels: keys.map((k) => periodLabel(k, g)), datasets: BUCKETS.map((b) => ({ label: t('b_' + b), data: keys.map((k) => byKey.get(k)[b]), backgroundColor: cssVar(BUCKET_VAR[b]), borderColor: surface, borderWidth: { top: 2 }, borderRadius: 3, borderSkipped: 'bottom', maxBarThickness: 44, categoryPercentage: .8, barPercentage: .9 })) },
    options: { ...base, scales: { x: { ...base.scales.x, stacked: true }, y: { ...base.scales.y, stacked: true } },
      plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { footer: (items) => { const tot = items.reduce((a, i) => a + i.parsed.y, 0); const won = items.find((i) => i.datasetIndex === 0)?.parsed.y || 0; return `${t('colTotal')}: ${tot} · ${t('k_winRate')}: ${pct(won, tot)}`; } } } },
      onClick: (e, els) => { if (g === 'day' && els.length) { const k = keys[els[0].index]; state.dateFrom = k; state.dateTo = k; state.preset = 'custom'; onFiltersChanged(); } } },
  });
  // Win / loss rate: both are % of deals created in the period — same scale, one axis.
  const rate = keys.map((k) => { const v = byKey.get(k); const tot = BUCKETS.reduce((a, b) => a + v[b], 0); return { win: pctNum(v.Won, tot), loss: pctNum(v['Lost - Classified'] + v['Lost - Unclassified'], tot) }; });
  charts.rate = new Chart($('#c-rate'), {
    type: 'line',
    data: { labels: keys.map((k) => periodLabel(k, g)), datasets: [
      { label: t('k_winRate'), data: rate.map((x) => x.win), borderColor: cssVar('--s-won'), backgroundColor: cssVar('--s-won'), borderWidth: 2, pointRadius: keys.length > 40 ? 0 : 2.5, pointHoverRadius: 5, tension: .3, spanGaps: true },
      { label: t('k_lossRate'), data: rate.map((x) => x.loss), borderColor: cssVar('--s-lostc'), backgroundColor: cssVar('--s-lostc'), borderWidth: 2, pointRadius: keys.length > 40 ? 0 : 2.5, pointHoverRadius: 5, tension: .3, spanGaps: true },
    ] },
    options: { ...base, scales: { x: base.scales.x, y: { ...base.scales.y, max: 100, ticks: { callback: (v) => v + '%' } } },
      plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (i) => `${i.dataset.label}: ${i.parsed.y == null ? '—' : i.parsed.y.toFixed(1) + '%'}` } } } },
  });
}

// ───────────────────────── regions ─────────────────────────
function renderRegions() {
  const el = $('#tab-regions');
  const base = ALL.filter((r) => match(r, { skipRegion: true }));
  el.innerHTML = `<div class="grid3">${REGIONS.map((region) => {
    const rows = base.filter((r) => r.region === region);
    const s = stats(rows);
    const seg = (n, v) => (s.total ? `<i style="width:${(n / s.total * 100).toFixed(2)}%;background:var(${v})"></i>` : '');
    const lostRows = rows.filter((r) => r.bucket === 'Lost - Classified');
    const rc = {}; lostRows.forEach((r) => (r.reasons || []).forEach((x) => { rc[x] = (rc[x] || 0) + 1; }));
    const reasonGroups = Object.entries(rc).map(([key, total]) => ({ key, total, won: 0, winRate: null }));
    return `<div class="panel">
      <div class="panel-head"><h2>${esc(region === 'Spain' && LANG === 'es' ? 'España' : region)}</h2><span class="count-tag">${fmtInt(s.total)} ${esc(t('deals'))}</span></div>
      <div class="stat-row" style="grid-template-columns:repeat(3,1fr)">
        <div class="stat"><div class="l">${esc(t('k_won'))}</div><div class="v">${fmtInt(s.won)}</div></div>
        <div class="stat"><div class="l">${esc(t('k_winRate'))}</div><div class="v" style="color:var(--good-ink)">${s.winRate == null ? '—' : s.winRate.toFixed(1) + '%'}</div></div>
        <div class="stat"><div class="l">${esc(t('k_lossRate'))}</div><div class="v" style="color:var(--bad-ink)">${s.lossRate == null ? '—' : s.lossRate.toFixed(1) + '%'}</div></div>
      </div>
      <div class="brow" style="grid-template-columns:1fr;padding:12px 0 4px;cursor:default"><div class="track" style="height:12px">${seg(s.won, '--s-won')}${seg(s.active, '--s-active')}${seg(s.lostc, '--s-lostc')}${seg(s.lostu, '--s-lostu')}</div></div>
      <div class="legend" style="margin-top:4px">${BUCKETS.map((b) => `<span><i style="background:var(${BUCKET_VAR[b]})"></i>${esc(t('b_' + b))}</span>`).join('')}</div>
      <h3>${esc(t('reasonsTitle'))}</h3>
      ${reasonGroups.length ? (() => { const top = reasonGroups.sort((a, b) => b.total - a.total).slice(0, 5); const pk = top[0].total; return `<div class="blist">${top.map((g) => `<div class="brow" data-field="reason" data-value="${esc(g.key)}" title="${esc(g.key)}"><div class="lab">${esc(g.key)}</div><div class="track"><i style="width:${(g.total / pk * 100).toFixed(1)}%;background:var(--s-lostc)"></i></div><div class="num"><b>${g.total}</b> · ${pct(g.total, lostRows.length)}</div></div>`).join('')}</div>`; })() : `<div class="muted" style="font-size:12.5px">${esc(t('noData'))}</div>`}
      <h3>${esc(t('ownersTitle'))}</h3>
      ${barList(groupStats(rows, (r) => (r.assignTo ? [r.assignTo] : [])), { field: 'assignTo', max: 5 })}
      <h3>${esc(t('campaignsTitle'))}</h3>
      ${barList(groupStats(rows, (r) => (r.campaign ? [r.campaign] : [])), { field: 'campaign', max: 5 })}
    </div>`;
  }).join('')}</div>`;
  wireBarLists(el);
}

// ───────────────────────── pivot ─────────────────────────
const GROUP_DIMS = [
  ['assignTo', 'f_assignTo'], ['region', 'dimRegion'], ['source', 'f_source'], ['medium', 'f_medium'], ['campaign', 'f_campaign'], ['location', 'f_location'], ['course', 'f_course'], ['stage', 'f_stage'],
  ['day', 'dimDay'], ['week', 'dimWeek'], ['month', 'dimMonth'], ['reason', 'f_reason'], ['bucket', 'f_bucket'], ['scoreBand', 'f_scoreBand'], ['admissionsScore', 'f_admissionsScore'], ['leadSentiment', 'f_leadSentiment'], ['classification', 'f_classification'], ['admissionsConversationType', 'f_admissionsConversationType'],
];
let groupSort = { field: 'total', dir: 'desc' };
function renderGrouped(rows) {
  const el = $('#tab-grouped');
  el.innerHTML = `<div class="panel">
    <div class="panel-head"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2>${esc(t('groupBy'))}</h2>
      <select id="grp-field">${GROUP_DIMS.map(([k, l]) => `<option value="${k}" ${state.groupBy === k ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select></div>
      <span class="count-tag">${esc(t('dealsInFilter', { n: fmtInt(rows.length) }))}</span></div>
    <div class="tablewrap" id="grp-table"></div></div>`;
  $('#grp-field').addEventListener('change', (e) => { state.groupBy = e.target.value; drawGroupTable(rows); });
  drawGroupTable(rows);
}
function drawGroupTable(rows) {
  const f = state.groupBy;
  const keyFn = f === 'reason' ? (r) => r.reasons || [] : f === 'day' ? (r) => (r.date ? [r.date] : []) : f === 'month' ? (r) => (r.date ? [r.date.slice(0, 7)] : []) : (r) => (r[f] ? [String(r[f])] : []);
  const groups = groupStats(rows, keyFn);
  const sortVal = (g) => (groupSort.field === 'key' ? String(g.key) : g[groupSort.field] ?? -1);
  groups.sort((a, b) => { const av = sortVal(a); const bv = sortVal(b); return (av < bv ? -1 : av > bv ? 1 : 0) * (groupSort.dir === 'asc' ? 1 : -1); });
  const lbl = (k) => (f === 'bucket' ? t('b_' + k) : f === 'scoreBand' ? fLabel(FILTER_BY_KEY.scoreBand, k) : k);
  const cols = [['key', GROUP_DIMS.find((d) => d[0] === f)[1], false], ['total', 'colTotal', true], ['won', 'colWon', true], ['winRate', 'colWinRate', true], ['lostc', 'colLostReason', true], ['lostu', 'colNoReason', true], ['lossRate', 'colLossRate', true], ['active', 'colActive', true]];
  $('#grp-table').innerHTML = `<table><thead><tr>${cols.map(([k, l, n]) => `<th class="${n ? 'num' : ''}" data-sort="${k}">${esc(t(l))}${groupSort.field === k ? (groupSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${groups.map((g) => `<tr class="clickrow" data-k="${esc(g.key)}"><td class="truncate" title="${esc(lbl(g.key))}">${esc(lbl(g.key))}</td><td class="num">${fmtInt(g.total)}</td><td class="num">${fmtInt(g.won)}</td><td class="num"><span class="minibar"><i style="width:${Math.min(100, (g.winRate || 0) * 4)}%"></i></span>${g.winRate == null ? '—' : g.winRate.toFixed(1) + '%'}</td><td class="num">${fmtInt(g.lostc)}</td><td class="num">${fmtInt(g.lostu)}</td><td class="num">${g.lossRate == null ? '—' : g.lossRate.toFixed(1) + '%'}</td><td class="num">${fmtInt(g.active)}</td></tr>`).join('')}</tbody></table>`;
  $$('#grp-table th').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.sort; groupSort = groupSort.field === k ? { field: k, dir: groupSort.dir === 'asc' ? 'desc' : 'asc' } : { field: k, dir: k === 'key' ? 'asc' : 'desc' }; drawGroupTable(rows); }));
  $$('#grp-table tr[data-k]').forEach((tr) => tr.addEventListener('click', () => {
    const v = tr.dataset.k; if (v === '(none)') return;
    if (f === 'day') { state.dateFrom = v; state.dateTo = v; state.preset = 'custom'; }
    else if (f === 'month') { const [y, m] = v.split('-').map(Number); state.dateFrom = `${v}-01`; state.dateTo = isoLocal(new Date(y, m, 0)); state.preset = 'custom'; }
    else if (f === 'week') { state.dateFrom = v; state.dateTo = addDays(v, 6); state.preset = 'custom'; }
    else if (f === 'region') { state.region = v; }
    else if (FILTER_BY_KEY[f]) { if (!state[f].includes(v)) state[f] = [...state[f], v]; }
    state.view = 'individual'; buildNav(); onFiltersChanged();
  }));
}

// ───────────────────────── leads table ─────────────────────────
const PAGE_SIZE = 50;
const LEAD_COLS = [
  ['name', 'c_name'], ['date', 'c_date'], ['region', 'c_region'], ['course', 'c_course'], ['source', 'c_source'], ['campaign', 'c_campaign'], ['assignTo', 'c_owner'], ['stage', 'c_stage'], ['bucket', 'c_status'], ['reason', 'c_reason'], ['admissionsScore', 'c_score'], ['scoreBand', 'c_engagement'], ['dealValue', 'c_value'],
];
function statusBadge(bucket) { return `<span class="badge ${BUCKET_CLASS[bucket] || 'b-neutral'}">${esc(t('b_' + bucket))}</span>`; }
function renderIndividual(rows) {
  const el = $('#tab-individual');
  const sorted = rows.slice().sort((a, b) => {
    const f = state.sort.field; let av = a[f]; let bv = b[f];
    if (f === 'dealValue') { av = Number(av) || 0; bv = Number(bv) || 0; } else { av = av == null ? '' : String(av).toLowerCase(); bv = bv == null ? '' : String(bv).toLowerCase(); }
    return (av < bv ? -1 : av > bv ? 1 : 0) * (state.sort.dir === 'asc' ? 1 : -1);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const slice = sorted.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  el.innerHTML = `${kpiCards(rows)}<div class="panel">
    <div class="panel-head"><div style="display:flex;gap:10px;align-items:center"><h2>${esc(t('leadsTitle'))}</h2><span class="count-tag">${esc(t('matching', { n: fmtInt(rows.length) }))}</span></div>
      <button class="btn ghost sm" id="btn-export">${esc(t('exportCsv'))}</button></div>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr>${LEAD_COLS.map(([f, l]) => `<th data-sort="${f}" class="${f === 'dealValue' ? 'num' : ''}">${esc(t(l))}${state.sort.field === f ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${slice.map((r) => `<tr class="clickrow" data-id="${esc(r.id)}">
      <td><div class="cell-lead"><span class="avatar">${esc(initials(r.name))}</span><div><div class="nm">${esc(r.name || '—')}</div><div class="em">${esc(r.email || '')}</div></div></div></td>
      <td>${fmtDate(r.date)}</td><td>${esc(r.region || '—')}</td><td class="truncate">${esc(r.course || '—')}</td><td>${esc(r.source || '—')}</td><td class="truncate" title="${esc(r.campaign || '')}">${esc(r.campaign || '—')}</td>
      <td>${r.assignTo ? esc(r.assignTo) : `<span class="muted">${esc(t('unassigned'))}</span>`}</td><td class="truncate">${esc(r.stage || '—')}</td>
      <td>${statusBadge(r.bucket)}</td><td class="truncate" title="${esc(r.reasons && r.reasons.length ? r.reasons.join(', ') : '')}">${r.reasons && r.reasons.length ? esc(r.reasons.join(', ')) : '<span class="muted">—</span>'}</td>
      <td>${esc(r.admissionsScore || '—')}</td><td>${r.scoreBand ? `<span class="badge plain b-neutral">${esc(fLabel(FILTER_BY_KEY.scoreBand, r.scoreBand))}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num">${r.dealValue ? fmtMoney(r.dealValue) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <div class="pager"><span>${esc(t('page', { p: state.page, t: pages }))}</span><div style="display:flex;gap:8px"><button class="btn ghost sm" id="pg-prev" ${state.page <= 1 ? 'disabled' : ''}>${esc(t('prev'))}</button><button class="btn ghost sm" id="pg-next" ${state.page >= pages ? 'disabled' : ''}>${esc(t('next'))}</button></div></div>`
    : `<div class="empty">${icon('inbox')}<div>${esc(t('noData'))}</div></div>`}
  </div>`;
  $('#btn-export').addEventListener('click', () => exportCsv(sorted));
  $$('th[data-sort]', el).forEach((th) => th.addEventListener('click', () => { const f = th.dataset.sort; state.sort = state.sort.field === f ? { field: f, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { field: f, dir: 'asc' }; renderIndividual(rows); }));
  $$('tr[data-id]', el).forEach((tr) => tr.addEventListener('click', () => openLead(tr.dataset.id)));
  const pp = $('#pg-prev'); if (pp) pp.addEventListener('click', () => { state.page--; renderIndividual(rows); el.scrollIntoView(); });
  const pn = $('#pg-next'); if (pn) pn.addEventListener('click', () => { state.page++; renderIndividual(rows); el.scrollIntoView(); });
}
function exportCsv(rows) {
  const cols = ['id', 'name', 'email', 'phone', 'date', 'region', 'course', 'source', 'medium', 'campaign', 'location', 'assignTo', 'stage', 'dealValue', 'bucket', 'reason', 'admissionsConversationType', 'admissionsScore', 'leadSentiment', 'classification', 'dealQuality', 'scoreBand', 'feedback'];
  const lines = [cols.join(',')];
  rows.forEach((r) => lines.push(cols.map((c) => { let v = r[c] == null ? '' : String(r[c]).replace(/"/g, '""'); if (/[",\n]/.test(v)) v = `"${v}"`; return v; }).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `deals_${state.region}_${state.dateFrom || 'all'}_${state.dateTo || ''}.csv`; a.click();
}

// ───────────────────────── lead drawer ─────────────────────────
// Renders instantly from the record already in memory; engagement and AI
// coaching fill in afterwards without blocking anything.
function mdToHtml(md) {
  const lines = esc(md || '').split('\n');
  let html = ''; let inList = false;
  lines.forEach((ln) => {
    const l = ln.trim();
    const b = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>');
    if (/^[-•*]\s+/.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${b(l.replace(/^[-•*]\s+/, ''))}</li>`; return; }
    if (/^\d+\.\s+/.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${b(l.replace(/^\d+\.\s+/, ''))}</li>`; return; }
    if (inList) { html += '</ul>'; inList = false; }
    if (!l) return;
    if (/^#{1,4}\s/.test(l)) { html += `<h4>${b(l.replace(/^#+\s/, ''))}</h4>`; return; }
    html += `<p>${b(l)}</p>`;
  });
  if (inList) html += '</ul>';
  return html;
}
function parseCoaching(text) {
  const out = { analysis: '', nextSteps: '', email: '', sms: '' }; let cur = null;
  (text || '').split('\n').forEach((line) => {
    const L = line.trim();
    if (/^\*\*Analysis:?\*\*/i.test(L)) { cur = 'analysis'; return; }
    if (/^\*\*Next Steps:?\*\*/i.test(L)) { cur = 'nextSteps'; return; }
    if (/^\*\*EMAIL TEMPLATE:?\*\*/i.test(L)) { cur = 'email'; return; }
    if (/^\*\*SMS TEMPLATE:?\*\*/i.test(L)) { cur = 'sms'; return; }
    if (cur) out[cur] += line + '\n';
  });
  Object.keys(out).forEach((k) => { out[k] = out[k].trim(); });
  if (!out.analysis && !out.nextSteps) out.analysis = (text || '').trim();
  return out;
}
const kvRow = (label, val, wide) => `<div class="${wide ? 'wide' : ''}"><dt>${esc(label)}</dt><dd>${val == null || val === '' ? '<span class="muted">—</span>' : val}</dd></div>`;
async function openLead(id) {
  const r = ALL.find((x) => String(x.id) === String(id));
  const d = $('#lead-drawer');
  if (!r) { d.innerHTML = `<div class="dr-head"><div class="dr-titles"><h2>#${esc(id)}</h2></div><button class="icon-btn" data-close>${icon('x')}</button></div><div class="dr-body"><p class="muted">${esc(t('notInWindow'))}</p></div>`; $('[data-close]', d).addEventListener('click', closeDrawers); openDrawer('#lead-drawer'); return; }
  const phoneDigits = String(r.phone || '').replace(/[^\d+]/g, '');
  const acLink = META.acAppUrl ? `${META.acAppUrl}/app/deals/${encodeURIComponent(r.id)}` : null;
  d.innerHTML = `
    <div class="dr-head"><div class="dr-titles"><div class="lead-hero"><span class="avatar">${esc(initials(r.name))}</span><div style="min-width:0"><h2>${esc(r.name || '—')}</h2>
      <div class="lead-meta">${statusBadge(r.bucket)}${r.region ? `<span class="badge plain b-neutral">${esc(regionLabel(r.region))}</span>` : ''}${r.scoreBand ? `<span class="badge plain b-neutral">${icon('gauge')}${esc(fLabel(FILTER_BY_KEY.scoreBand, r.scoreBand))}</span>` : ''}<span class="badge plain b-neutral">#${esc(r.id)}</span></div></div></div></div>
      <button class="icon-btn" data-close aria-label="${esc(t('close'))}">${icon('x')}</button></div>
    <div class="dr-body">
      <div class="contact-actions">
        ${r.email ? `<a class="btn ghost sm" href="mailto:${esc(r.email)}">${icon('mail')}${esc(r.email)}</a>` : ''}
        ${phoneDigits ? `<a class="btn ghost sm" href="tel:${esc(phoneDigits)}">${icon('phone')}${esc(r.phone)}</a><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${esc(phoneDigits.replace(/^\+/, ''))}">${icon('chat')}${esc(t('whatsapp'))}</a>` : ''}
        ${acLink ? `<a class="btn soft sm" target="_blank" rel="noopener" href="${esc(acLink)}">${icon('external')}${esc(t('openInAC'))}</a>` : ''}
      </div>
      <div class="lsec"><h3>${icon('briefcase')}${esc(t('leadDeal'))}</h3><dl class="kv">
        ${kvRow(t('owner'), r.assignTo ? esc(r.assignTo) : esc(t('unassigned')))}${kvRow(t('stage'), esc(r.stage))}
        ${kvRow(t('created'), fmtDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' }))}${kvRow(t('value'), r.dealValue ? fmtMoney(r.dealValue) : null)}
        ${kvRow(t('course'), esc(r.course))}${kvRow(t('region'), esc(r.region))}</dl></div>
      <div class="lsec"><h3>${icon('target')}${esc(t('leadAttribution'))}</h3><dl class="kv">
        ${kvRow(t('f_source'), esc(r.source))}${kvRow(t('f_medium'), esc(r.medium))}${kvRow(t('f_campaign'), esc(r.campaign), true)}${kvRow(t('f_location'), esc(r.location))}</dl></div>
      <div class="lsec"><h3>${icon('star')}${esc(t('leadQualification'))}</h3><dl class="kv">
        ${kvRow(t('f_admissionsScore'), esc(r.admissionsScore))}${kvRow(t('f_scoreBand'), r.dealQuality != null ? `${esc(r.dealQuality)} · ${esc(fLabel(FILTER_BY_KEY.scoreBand, r.scoreBand || ''))}` : null)}
        ${kvRow(t('f_leadSentiment'), esc(r.leadSentiment))}${kvRow(t('f_classification'), esc(r.classification))}${kvRow(t('f_admissionsConversationType'), esc(r.admissionsConversationType), true)}</dl></div>
      <div class="lsec"><h3>${icon('flag')}${esc(t('leadOutcome'))}</h3><dl class="kv">
        ${kvRow(t('reasons'), r.reasons && r.reasons.length ? r.reasons.map((x) => `<span class="badge plain b-lostc" style="margin:0 4px 4px 0">${esc(x)}</span>`).join('') : null, true)}
        ${kvRow(t('offerSent'), r.offerSentDate ? fmtDate(r.offerSentDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null)}${kvRow(r.bucket === 'Won' ? t('wonDate') : t('lostDate'), r.bucket === 'Won' ? (r.wonDate ? fmtDate(r.wonDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null) : (r.lostDate ? fmtDate(r.lostDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null))}
        ${kvRow(t('feedback'), r.feedback ? esc(r.feedback) : null, true)}</dl></div>
      <div class="lsec" id="ld-eng"><h3>${icon('mail')}${esc(t('leadEngagement'))}</h3><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:85%"></div><div class="muted" style="font-size:12px">${esc(t('loadingEngagement'))}</div></div>
      <div class="lsec" id="ld-coach"><h3>${icon('sparkle')}${esc(t('leadCoach'))}</h3><p class="muted" style="margin:0 0 10px;font-size:13px">${esc(t('coachIntro'))}</p><button class="btn primary sm" id="ld-coach-btn">${icon('sparkle')}${esc(t('coachGenerate'))}</button><div id="ld-coach-out"></div></div>
      <div class="lsec"><h3>${icon('note')}${esc(t('leadNotes'))}</h3>
        <textarea id="ld-notes" rows="3" style="width:100%" placeholder="${esc(t('notesPlaceholder'))}"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;flex-wrap:wrap"><label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="ld-email-sent">${esc(t('emailSent'))}</label><button class="btn ghost sm" id="ld-save">${esc(t('saveNotes'))}</button></div>
        <div class="muted" style="font-size:11px;margin-top:6px">${esc(t('notesSession'))}</div></div>
    </div>`;
  $('[data-close]', d).addEventListener('click', closeDrawers);
  openDrawer('#lead-drawer');
  d.querySelector('.dr-body').scrollTop = 0;

  // Engagement (background).
  const t0 = performance.now();
  api(`/api/lead/${encodeURIComponent(r.id)}/engagement`).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    const box = $('#ld-eng'); if (!box || !d.classList.contains('open')) return;
    box.innerHTML = `<h3>${icon('mail')}${esc(t('leadEngagement'))} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500;margin-left:auto">${esc(t('loadedIn', { s: ((performance.now() - t0) / 1000).toFixed(1) }))}</span></h3>` + engagementHtml(data);
  }).catch((e) => { const box = $('#ld-eng'); if (box) box.innerHTML = `<h3>${icon('mail')}${esc(t('leadEngagement'))}</h3><p class="muted">${esc(t('engagementFailed', { e: e.message }))}</p>`; });

  // Notes.
  api(`/api/lead-notes/${encodeURIComponent(r.contactId)}`).then((res) => (res.ok ? res.json() : null)).then((n) => { if (!n) return; const ta = $('#ld-notes'); if (ta) ta.value = n.notes || ''; const cb = $('#ld-email-sent'); if (cb) cb.checked = !!n.emailSent; }).catch(() => {});
  $('#ld-save').addEventListener('click', async () => {
    const res = await api('/api/lead-notes', { method: 'POST', body: { leadId: r.id, contactId: r.contactId, notes: $('#ld-notes').value, emailSent: $('#ld-email-sent').checked } }).catch(() => null);
    if (res && res.ok) { showToast(t('saved')); }
  });
  $('#ld-coach-btn').addEventListener('click', () => runCoach(r));
}
function engagementHtml(e) {
  if (!e.trackingAvailable) return `<p class="muted">${esc(t('trackingNA'))}</p>`;
  const scores = (e.scores || []).map((s) => {
    const tone = s.interpretation ? s.interpretation.tone : null;
    const col = tone === 'great' || tone === 'good' ? 'var(--good-ink)' : tone === 'bad' ? 'var(--bad-ink)' : tone === 'ok' || tone === 'weak' ? 'var(--warn-ink)' : 'var(--ink)';
    return `<div class="stat"><div class="l">${esc(s.name)}</div><div class="v" style="color:${col}">${esc(s.value)}</div>${s.interpretation ? `<div class="muted" style="font-size:11px">${esc(s.interpretation.label)}</div>` : ''}</div>`;
  }).join('');
  return `<div class="stat-row">
      <div class="stat"><div class="l">${esc(t('emailsSent'))}</div><div class="v">${fmtInt(e.emailsSent)}</div></div>
      <div class="stat"><div class="l">${esc(t('likelyOpens'))}</div><div class="v">${fmtInt(e.emailsOpened)}</div><div class="muted" style="font-size:11px">${esc(e.emailOpenRate)}%</div></div>
      <div class="stat"><div class="l">${esc(t('likelyClicks'))}</div><div class="v">${fmtInt(e.linksClicked)}</div></div>
      <div class="stat"><div class="l">${esc(t('lastEmail'))}</div><div class="v" style="font-size:13px">${e.lastEmailDate ? fmtDate(e.lastEmailDate) : '—'}</div></div></div>
    ${scores ? `<div class="stat-row" style="margin-top:8px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">${scores}</div>` : ''}
    ${e.engagementBasis === 'campaign-aggregate' ? `<p class="muted" style="font-size:11.5px;margin:10px 0 0">${esc(t('aggregateNote'))}</p>` : ''}
    ${(e.timeline || []).length ? `<div class="timeline">${e.timeline.slice(0, 10).map((ev) => `<div><span class="d">${fmtDate(ev.date)}</span>${esc(ev.detail)}</div>`).join('')}</div>` : `<p class="muted" style="font-size:12.5px;margin:10px 0 0">${esc(t('noEvents'))}</p>`}`;
}
async function runCoach(r) {
  const out = $('#ld-coach-out'); const btn = $('#ld-coach-btn');
  btn.disabled = true;
  out.innerHTML = `<div style="margin-top:12px" class="muted"><span class="dots"><span></span><span></span><span></span></span> ${esc(t('coachThinking'))}</div>`;
  try {
    const res = await api('/api/lead-coach', { method: 'POST', body: { leadId: r.id, lang: LANG } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    const c = parseCoaching(data.aiCoaching.fullAnalysis);
    out.innerHTML = `<div class="md" style="margin-top:12px">${c.analysis ? `<h4>${esc(t('analysis'))}</h4>${mdToHtml(c.analysis)}` : ''}${c.nextSteps ? `<h4>${esc(t('nextSteps'))}</h4>${mdToHtml(c.nextSteps)}` : ''}</div>
      ${c.email ? `<div class="template"><div class="template-head">${esc(t('emailTemplate'))}<button class="btn ghost sm" data-copy="email">${esc(t('copy'))}</button></div><pre>${esc(c.email)}</pre></div>` : ''}
      ${c.sms ? `<div class="template"><div class="template-head">${esc(t('smsTemplate'))}<button class="btn ghost sm" data-copy="sms">${esc(t('copy'))}</button></div><pre>${esc(c.sms)}</pre></div>` : ''}`;
    $$('[data-copy]', out).forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(c[b.dataset.copy]); b.textContent = t('copied'); } catch (e) { showToast(t('copyFailed')); } }));
    btn.innerHTML = `${icon('refresh')}${esc(t('coachRegenerate'))}`;
  } catch (e) { out.innerHTML = `<p style="color:var(--bad-ink);margin-top:10px">${esc(e.message)}</p>`; }
  btn.disabled = false;
}

// ───────────────────────── recommendations ─────────────────────────
const recCache = new Map();
const REC_META = { needsContact: ['phone', '--s-active'], needsFollowUp: ['mail', '--s-2'], atRisk: ['alert', '--s-lostu'], readyToClose: ['target', '--s-won'], wonRecently: ['trophy', '--s-won'], lostNeedAnalysis: ['xcircle', '--s-lostc'] };
async function renderRecommendations(rows) {
  const el = $('#tab-recommendations');
  const key = JSON.stringify([LANG, rows.length, rows.slice(0, 50).map((r) => r.id)]);
  let data = recCache.get(key);
  if (!data) {
    el.innerHTML = `<div class="panel state-card"><span class="dots"><span></span><span></span><span></span></span><p class="muted">${esc(t('recLoading'))}</p></div>`;
    try {
      const res = await api('/api/recommendations', { method: 'POST', body: { ids: rows.map((r) => r.id), lang: LANG } });
      data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      recCache.set(key, data);
    } catch (e) { if (state.view === 'recommendations') el.innerHTML = `<div class="panel state-card"><p style="color:var(--bad-ink)">${esc(t('recError', { e: e.message }))}</p></div>`; return; }
    if (state.view !== 'recommendations') return;
  }
  el.innerHTML = `${kpiCards(rows)}<div class="rec-grid">${(data.groups || []).map((g) => {
    const [ic, col] = REC_META[g.name] || ['target', '--blue'];
    return `<div class="rec-card"><div class="rc-head"><span class="rc-ico" style="background:color-mix(in srgb, var(${col}) 16%, transparent);color:var(${col})">${icon(ic)}</span><h3>${esc(t('g_' + g.name))}</h3><span class="rc-n">${fmtInt(g.count)}</span></div>
      <div class="md" style="font-size:13px;color:var(--body)">${g.recommendation ? mdToHtml(g.recommendation) : `<p class="muted">${esc(t('noRecommendation'))}</p>`}</div>
      <details><summary>${esc(t('viewLeads', { n: Math.min(g.count, (g.leads || []).length) }))}</summary><div class="rec-leads">${(g.leads || []).map((l) => `<div class="rec-lead" data-id="${esc(l.id)}"><span class="avatar">${esc(initials(l.name))}</span><div style="flex:1;min-width:0"><div style="font-weight:600">${esc(l.name || '—')}</div><div class="muted" style="font-size:11.5px">${esc([l.assignTo, l.course].filter(Boolean).join(' · '))}</div></div>${statusBadge(l.bucket)}</div>`).join('')}</div></details></div>`;
  }).join('')}</div>`;
  $$('.rec-lead', el).forEach((x) => x.addEventListener('click', () => openLead(x.dataset.id)));
}

// ───────────────────────── ads (4Geeks Center) ─────────────────────────
const REGION_TO_CENTER = { USA: 'US', Spain: 'ES', LATAM: 'LATAM', all: 'US' };
const CENTER_LABEL = { US: 'USA', ES: 'España', LATAM: 'LATAM', CL: 'Chile' };
const adsCache = new Map();
const adsRegion = () => (state.region !== 'all' ? REGION_TO_CENTER[state.region] : state.adsRegion);
async function fetchAds(region, from, to) {
  const k = `${region}|${from}|${to}`;
  if (adsCache.has(k) && Date.now() - adsCache.get(k).at < 5 * 60 * 1000) return adsCache.get(k).res;
  const params = new URLSearchParams({ region }); if (from) params.set('start_date', from); if (to) params.set('end_date', to);
  const res = await api('/api/ads-performance?' + params.toString());
  const data = await res.json().catch(() => ({}));
  const out = { ok: res.ok, data };
  if (res.ok) adsCache.set(k, { at: Date.now(), res: out });
  return out;
}
const aNum = (n) => (n == null || isNaN(n) ? '—' : fmtInt(n));
const aRoas = (n) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(2) + '×');
const aPct = (n) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(2) + '%');
function aIS(v) { if (v == null || isNaN(v)) return '—'; const n = Number(v); if (n <= 0) return '—'; if (n < 0.10) return '<10%'; return Math.round(n * 100) + '%'; }
function qsBadge(q) { if (q == null || isNaN(q)) return '—'; const n = Number(q); const cls = n >= 8 ? 'b-won' : n >= 5 ? 'b-lostu' : 'b-lostc'; return `<span class="badge plain ${cls}">${n.toFixed(1)}/10</span>`; }
function landingExp(e) { const m = { ABOVE_AVERAGE: ['good', 'b-won'], AVERAGE: ['avg', 'b-lostu'], BELOW_AVERAGE: ['poor', 'b-lostc'] }[String(e || '').toUpperCase()]; if (!m) return e ? `<span class="badge plain b-neutral">${esc(e)}</span>` : '—'; return `<span class="badge plain ${m[1]}">${esc(t(m[0]))}</span>`; }
function adsStatusBadge(st) { const s = String(st || '').toUpperCase(); if (s.includes('ENABLE') || s.includes('ACTIV')) return `<span class="badge b-won">${esc(t('st_active'))}</span>`; if (s.includes('PAUSE')) return `<span class="badge b-lostu">${esc(t('st_paused'))}</span>`; if (s.includes('REMOVE') || s.includes('END')) return `<span class="badge b-lostc">${esc(t('st_ended'))}</span>`; return `<span class="badge b-neutral">${esc(st || '—')}</span>`; }
function makeSortable(root) {
  $$('table.sortable', root).forEach((tbl) => {
    const ths = $$('thead th', tbl);
    ths.forEach((th, idx) => {
      th.title = t('sortBy');
      th.addEventListener('click', () => {
        const tbody = tbl.querySelector('tbody'); const all = $$('tr', tbody);
        const total = all.find((r) => r.classList.contains('total')); const rows = all.filter((r) => r !== total);
        const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        ths.forEach((h) => { h.dataset.dir = ''; h.textContent = h.textContent.replace(/ [▲▼]$/, ''); });
        th.dataset.dir = dir; th.textContent += dir === 'asc' ? ' ▲' : ' ▼';
        const parse = (s) => { s = (s || '').trim(); const cut = s.split('→')[0]; const x = cut.replace(/[€$%×\s.]/g, '').replace(',', '.'); const n = parseFloat(x); return x !== '' && !isNaN(n) ? n : cut.toLowerCase(); };
        rows.sort((a, b) => { const av = parse(a.cells[idx]?.textContent); const bv = parse(b.cells[idx]?.textContent); return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === 'asc' ? 1 : -1); });
        rows.forEach((r) => tbody.appendChild(r)); if (total) tbody.appendChild(total);
      });
    });
  });
}
let adsCampAll = []; let adsCur = 'USD';
function renderCampTable(channel) {
  const el = $('#ads-camp-table'); if (!el) return;
  const cur = adsCur;
  let rows = adsCampAll.slice();
  if (channel && channel !== 'all') rows = rows.filter((c) => String(c.channel || '').toLowerCase().includes(channel.toLowerCase()));
  rows.sort((a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0));
  if (!rows.length) { el.innerHTML = `<div class="empty">${esc(t('noCampaigns'))}</div>`; return; }
  const T = rows.reduce((a, c) => ({ spend: a.spend + (+c.spend || 0), impr: a.impr + (+c.impressions || 0), clicks: a.clicks + (+c.clicks || 0), leads: a.leads + (+c.leads || 0), won: a.won + (+c.won || 0), rev: a.rev + (+c.revenue || 0) }), { spend: 0, impr: 0, clicks: 0, leads: 0, won: 0, rev: 0 });
  const isDen = rows.reduce((a, c) => a + (c.impression_share != null && +c.elig_impr > 0 ? +c.elig_impr : 0), 0);
  const isNum = rows.reduce((a, c) => a + (c.impression_share != null && +c.elig_impr > 0 ? (+c.impression_share) * (+c.elig_impr) : 0), 0);
  el.innerHTML = `<table class="sortable"><thead><tr><th>${esc(t('a_campaign'))}</th><th>${esc(t('a_start'))}</th><th>${esc(t('a_status'))}</th><th class="num">${esc(t('a_spend'))}</th><th class="num">${esc(t('a_impr'))}</th><th class="num">${esc(t('a_is'))}</th><th class="num">${esc(t('a_clicks'))}</th><th class="num">${esc(t('a_ctr'))}</th><th class="num">${esc(t('a_cpc'))}</th><th class="num">${esc(t('a_leads'))}</th><th class="num">${esc(t('a_cpl'))}</th><th class="num">${esc(t('a_sales'))}</th><th class="num">${esc(t('a_cpa'))}</th><th class="num">${esc(t('a_revenue'))}</th><th class="num">${esc(t('a_roas'))}</th></tr></thead>
    <tbody>${rows.map((c) => `<tr><td class="truncate" title="${esc(c.campaign)}">${esc(c.campaign || '—')}</td><td>${esc(c.start_date || '—')}</td><td>${adsStatusBadge(c.status)}</td><td class="num">${fmtMoney(c.spend, cur)}</td><td class="num">${aNum(c.impressions)}</td><td class="num">${aIS(c.impression_share)}</td><td class="num">${aNum(c.clicks)}</td><td class="num">${aPct(c.ctr)}</td><td class="num">${fmtMoney(c.cpc, cur)}</td><td class="num">${aNum(c.leads)}</td><td class="num">${fmtMoney(c.cpl, cur)}</td><td class="num">${aNum(c.won)}</td><td class="num">${fmtMoney(c.cpa, cur)}</td><td class="num">${fmtMoney(c.revenue, cur)}</td><td class="num">${aRoas(c.roas)}</td></tr>`).join('')}
    <tr class="total"><td>TOTAL</td><td></td><td></td><td class="num">${fmtMoney(T.spend, cur)}</td><td class="num">${aNum(T.impr)}</td><td class="num">${aIS(isDen ? isNum / isDen : null)}</td><td class="num">${aNum(T.clicks)}</td><td class="num">${aPct(T.impr ? T.clicks / T.impr * 100 : null)}</td><td class="num">${fmtMoney(T.clicks ? T.spend / T.clicks : null, cur)}</td><td class="num">${aNum(T.leads)}</td><td class="num">${fmtMoney(T.leads ? T.spend / T.leads : null, cur)}</td><td class="num">${aNum(T.won)}</td><td class="num">${fmtMoney(T.won ? T.spend / T.won : null, cur)}</td><td class="num">${fmtMoney(T.rev, cur)}</td><td class="num">${aRoas(T.spend ? T.rev / T.spend : null)}</td></tr></tbody></table>`;
  makeSortable(el);
}
let sessionAdsData = {};
async function renderAds() {
  const el = $('#tab-ads');
  const region = adsRegion();
  el.innerHTML = `<div class="panel"><div class="ads-bar">
      <div class="ads-status" id="ads-status"><span class="dots"><span></span><span></span><span></span></span></div>
      ${state.region === 'all' ? `<div style="display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:12px">${esc(t('adsRegionNote'))}</span><div class="seg" id="ads-rg">${['US', 'ES', 'LATAM'].map((rg) => `<button data-rg="${rg}" class="${rg === region ? 'active' : ''}">${CENTER_LABEL[rg]}</button>`).join('')}</div></div>` : ''}
    </div></div><div id="ads-body"><div class="panel"><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:220px"></div></div></div>`;
  $$('#ads-rg button').forEach((b) => b.addEventListener('click', () => { state.adsRegion = b.dataset.rg; renderAds(); }));
  let out;
  try { out = await fetchAds(region, state.dateFrom, state.dateTo); } catch (e) { $('#ads-body').innerHTML = `<div class="panel state-card"><p>${esc(t('networkError'))}</p><p class="muted">${esc(e.message)}</p></div>`; return; }
  if (state.view !== 'ads') return;
  const body = $('#ads-body'); const st = $('#ads-status');
  const data = out.data;
  if (!out.ok) { st.innerHTML = ''; body.innerHTML = `<div class="panel state-card">${icon('alert')}<p style="font-weight:700">${esc(data.needsKey ? t('adsNeedsKey') : t('adsError'))}</p><p class="muted">${esc(data.error || '')}</p></div>` + uploadHtml(); wireUpload(); return; }
  const cur = data.currency || 'USD'; const c = data._cache || {};
  const dot = c.demo ? `<span class="badge plain b-lostu">${esc(t('adsDemo'))}</span>` : c.stale ? `<span class="badge plain b-lostu">${esc(t('adsStale'))}</span>` : `<span class="badge b-won">${esc(t('adsLive'))}</span>`;
  st.innerHTML = `${dot}<b>${esc(CENTER_LABEL[data.region] || data.region)}</b> · ${esc(t('adsCurrency', { c: cur }))}${data.period ? ` · ${esc(t('adsPeriod', { a: data.period.start_date || '…', b: data.period.end_date || '…' }))}` : ''}`;
  const s = data.summary || {};
  const cps = (data.campaignsPerf && data.campaignsPerf.campaigns) || [];
  const chs = data.channels || [];
  const leadsPaid = chs.filter((x) => (x.spend || 0) > 0).reduce((a, x) => a + (x.leads || 0), 0);
  const leadsOrg = chs.filter((x) => !((x.spend || 0) > 0)).reduce((a, x) => a + (x.leads || 0), 0);
  const activeCamp = cps.filter((x) => /enable|activ/i.test(String(x.status || ''))).length;
  const cpaPaid = s.wonPaid ? s.spend / s.wonPaid : null;
  const roasPaid = s.spend ? (s.revenue || 0) / s.spend : null;
  const topSrc = chs.slice().sort((a, b) => (b.leads || 0) - (a.leads || 0))[0];
  const topCamp = cps.slice().sort((a, b) => ((b.won || 0) - (a.won || 0)) || ((b.revenue || 0) - (a.revenue || 0)))[0];
  const k = (lbl, val, cls = '', title = '') => `<div class="kpi ${cls}"><div class="k-lbl">${esc(lbl)}</div><div class="k-val" ${title ? `title="${esc(title)}" style="font-size:15px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"` : ''}>${val}</div></div>`;
  const kpis = `<div class="kpis">${k(t('a_spend'), fmtMoney(s.spend, cur), 'hl-blue')}${k(t('a_leads'), aNum(s.leads))}${k(t('a_cpl'), fmtMoney(s.cpl, cur))}${k(t('a_sales'), aNum(s.wonPaid), 'hl-good')}${k(t('a_cpa'), fmtMoney(cpaPaid, cur))}${k(t('a_roas'), aRoas(roasPaid))}${k(t('a_revenue'), fmtMoney(s.revenue, cur))}</div>
    <div class="kpis k8">${k(t('a_impr'), aNum(s.impressions))}${k(t('a_clicks'), aNum(s.clicks))}${k(t('a_ctr'), aPct(s.ctr))}${k(t('a_paidLeads'), aNum(leadsPaid))}${k(t('a_orgLeads'), aNum(leadsOrg))}${k(t('a_activeCamps'), aNum(activeCamp))}${k(t('a_topSource'), esc(topSrc ? topSrc.name : '—'), '', topSrc ? topSrc.name : '')}${k(t('a_topCamp'), esc(topCamp ? topCamp.campaign || '—' : '—'), '', topCamp ? topCamp.campaign : '')}</div>`;
  const daily = data.daily || [];
  const dailySection = daily.length ? `<div class="grid3">
    <div class="panel"><div class="panel-head"><h2>${esc(t('adsSpendDay'))}</h2></div><div class="chart-box sm"><canvas id="c-ads-spend"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h2>${esc(t('adsLeadsDay'))}</h2></div><div class="chart-box sm"><canvas id="c-ads-leads"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h2>${esc(t('adsCplDay'))}</h2></div><div class="chart-box sm"><canvas id="c-ads-cpl"></canvas></div></div></div>
    <p class="muted" style="font-size:12px;margin:-6px 0 16px">${esc(t('efficiency'))}: <b>${fmtMoney(s.spend, cur)}</b> · CPL ${fmtMoney(s.cpl, cur)} · CPA ${fmtMoney(cpaPaid, cur)} · ROAS ${aRoas(roasPaid)} · CTR ${aPct(s.ctr)} · ${aNum(s.conversions)} ${esc(t('conversions'))} · ${aNum(s.wonPaid)} ${esc(t('paidSales'))}</p>` : '';
  const paid = chs.filter((x) => (x.spend || 0) > 0);
  const channelsTable = paid.length ? `<div class="panel"><div class="panel-head"><h2>${esc(t('adsByChannel'))} <span class="count-tag">${esc(t('paidOnly'))}</span></h2></div><div class="tablewrap"><table class="sortable">
    <thead><tr><th>${esc(t('a_channel'))}</th><th class="num">${esc(t('a_spend'))}</th><th class="num">${esc(t('a_impr'))}</th><th class="num">${esc(t('a_clicks'))}</th><th class="num">${esc(t('a_ctr'))}</th><th class="num">${esc(t('a_cpc'))}</th><th class="num">${esc(t('a_leads'))}</th><th class="num">${esc(t('a_sales'))}</th><th class="num">${esc(t('a_conv'))}</th><th class="num">${esc(t('a_cpl'))}</th><th class="num">${esc(t('a_cpa'))}</th><th class="num">${esc(t('a_revenue'))}</th><th class="num">${esc(t('a_roas'))}</th></tr></thead>
    <tbody>${paid.map((ch) => { const ctr = ch.impressions ? ch.clicks / ch.impressions * 100 : null; const cpc = ch.clicks ? ch.spend / ch.clicks : null; const conv = ch.conv != null ? ch.conv : (ch.leads ? ch.won / ch.leads * 100 : null); return `<tr><td>${esc(ch.name)}</td><td class="num">${fmtMoney(ch.spend, cur)}</td><td class="num">${aNum(ch.impressions)}</td><td class="num">${aNum(ch.clicks)}</td><td class="num">${aPct(ctr)}</td><td class="num">${fmtMoney(cpc, cur)}</td><td class="num">${aNum(ch.leads)}</td><td class="num">${aNum(ch.won)}</td><td class="num">${aPct(conv)}</td><td class="num">${fmtMoney(ch.cpl, cur)}</td><td class="num">${fmtMoney(ch.cpa, cur)}</td><td class="num">${fmtMoney(ch.revenue, cur)}</td><td class="num">${aRoas(ch.roas)}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">${esc(t('adsChannelNote'))}</p></div>` : '';
  adsCampAll = cps; adsCur = cur;
  const presentNames = [...cps.map((x) => x.channel), ...chs.map((x) => x.name)].map((x) => String(x || '').toLowerCase());
  const platforms = ['Google', 'Meta', 'TikTok'].filter((p) => presentNames.some((n) => n.includes(p.toLowerCase())));
  const campaignPanel = cps.length ? `<div class="panel"><div class="panel-head"><h2>${esc(t('adsDetail'))} <span class="count-tag">${esc(t('withSpend', { n: cps.length }))}</span></h2>
    <div class="seg" id="ads-ct"><button class="active" data-ch="all">${esc(t('allChannels'))}</button>${platforms.map((p) => `<button data-ch="${p}">${p}</button>`).join('')}</div></div><div class="tablewrap" id="ads-camp-table"></div></div>` : '';
  const conv = (data.campaigns || []).filter((x) => (x.leads || 0) > 0).sort((a, b) => (+b.leads || 0) - (+a.leads || 0));
  const convSection = conv.length ? `<div class="panel"><div class="panel-head"><h2>${esc(t('adsConversion'))} <span class="count-tag">${esc(t('withLeads', { n: conv.length }))}</span></h2></div><div class="tablewrap" style="max-height:420px"><table class="sortable"><thead><tr><th>${esc(t('a_channel'))}</th><th>${esc(t('a_campaign'))}</th><th class="num">${esc(t('leadsToSales'))}</th><th class="num">${esc(t('a_revenue'))}</th></tr></thead>
    <tbody>${conv.map((x) => `<tr><td>${esc(x.channel || '—')}</td><td class="truncate" title="${esc(x.name)}">${esc(x.name)}</td><td class="num">${aNum(x.leads)} → ${aNum(x.won)}</td><td class="num">${fmtMoney(x.revenue, cur)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const landings = (data.landings && data.landings.campaigns) || [];
  const landSection = landings.length ? `<div class="panel"><div class="panel-head"><h2>${esc(t('adsLandings'))}</h2></div><div class="tablewrap"><table class="sortable"><thead><tr><th>${esc(t('a_campaign'))}</th><th>${esc(t('landing'))}</th><th>${esc(t('qs'))}</th><th>${esc(t('experience'))}</th><th class="num">${esc(t('keywords'))}</th></tr></thead>
    <tbody>${landings.map((l) => `<tr><td class="truncate" title="${esc(l.campaign)}">${esc(l.campaign || '—')}</td><td class="truncate">${esc(String(l.landing || '').replace(/^https?:\/\//, '') || '—')}</td><td>${qsBadge(l.quality_score)}</td><td>${landingExp(l.landing_exp)}</td><td class="num">${aNum(l.keywords)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const capt = (data.leadProgress && data.leadProgress.captacion) || [];
  const targetSection = capt.length ? `<div class="panel"><div class="panel-head"><h2>${esc(t('adsTargets'))}${data.leadProgress.month_label ? ` <span class="count-tag">${esc(data.leadProgress.month_label)}</span>` : ''}</h2></div><div class="blist">${capt.map((x) => { const p = x.objetivo ? Math.min(100, x.acumulado / x.objetivo * 100) : null; return `<div class="brow" style="cursor:default"><div class="lab">${esc(x.course || '—')}</div><div class="track">${p != null ? `<i style="width:${p.toFixed(1)}%;background:${p >= 100 ? 'var(--s-won)' : 'var(--s-active)'}"></i>` : ''}</div><div class="num"><b>${aNum(x.acumulado)}</b> / ${x.objetivo ? aNum(x.objetivo) : esc(t('noTarget'))} · ${aNum(x.vendidos)} ${esc(t('wonShort'))}</div></div>`; }).join('')}</div></div>` : '';
  const funnels = ((data.emailFunnels && data.emailFunnels.automations) || []).filter((f) => f.aplica_al_pais !== false);
  const funnelsSection = funnels.length ? `<div class="panel"><div class="panel-head"><h2>${esc(t('adsFunnels'))} <span class="count-tag">${funnels.length}</span></h2></div><div class="tablewrap"><table class="sortable"><thead><tr><th>${esc(t('funnel'))}</th><th>${esc(t('scope'))}</th><th class="num">${esc(t('contacts'))}</th><th class="num">${esc(t('completed'))}</th><th class="num">${esc(t('withSale'))}</th><th class="num">${esc(t('attribRevenue'))}</th></tr></thead>
    <tbody>${funnels.map((f) => `<tr><td class="truncate" title="${esc(f.name)}">${esc(f.name || '—')}</td><td>${esc(f.scope || '—')}</td><td class="num">${aNum(f.contactos)}</td><td class="num">${aNum(f.completados)}</td><td class="num">${aNum(f.con_venta)}</td><td class="num">${fmtMoney(f.revenue_atribuido, cur)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const missing = []; if (!landings.length) missing.push(t('adsLandings')); if (!capt.length) missing.push(t('adsTargets')); if (!funnels.length) missing.push(t('adsFunnels'));
  body.innerHTML = kpis + dailySection + channelsTable + campaignPanel + `<div class="grid2">${convSection || ''}${targetSection || ''}</div>` + landSection + funnelsSection
    + (missing.length ? `<p class="muted" style="font-size:12px">${esc(t('pendingCenter', { x: missing.join(' · ') }))}</p>` : '')
    + `<p class="muted" style="font-size:12px">${esc(t('adsDefs'))}</p>` + uploadHtml();
  if (cps.length) { renderCampTable('all'); $$('#ads-ct button').forEach((b) => b.addEventListener('click', () => { $$('#ads-ct button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); renderCampTable(b.dataset.ch); })); }
  if (daily.length) {
    const base = chartBase(); const labels = daily.map((d) => fmtDate(d.date));
    const mk = (id, type, label, vals, colVar, money) => { charts[id] = new Chart($('#' + id), { type, data: { labels, datasets: [{ label, data: vals, backgroundColor: cssVar(colVar), borderColor: cssVar(colVar), borderRadius: 3, maxBarThickness: 26, borderWidth: type === 'line' ? 2 : 0, pointRadius: daily.length > 30 ? 0 : 2.5, tension: .3, spanGaps: true }] }, options: { ...base, scales: { x: base.scales.x, y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, callback: money ? (v) => fmtMoney(v, cur) : undefined } } }, plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (i) => `${label}: ${money ? fmtMoney(i.parsed.y, cur) : fmtInt(i.parsed.y)}` } } } } }); };
    mk('c-ads-spend', 'bar', t('a_spend'), daily.map((d) => d.spend), '--s-1', true);
    mk('c-ads-leads', 'bar', t('a_leads'), daily.map((d) => d.leads), '--s-3', false);
    mk('c-ads-cpl', 'line', t('a_cpl'), daily.map((d) => (d.leads ? d.spend / d.leads : null)), '--s-2', true);
  }
  makeSortable(body);
  wireUpload();
}
function uploadHtml() {
  return `<div class="panel"><details><summary style="cursor:pointer;font-weight:600">${esc(t('uploadTitle'))}</summary><p class="muted" style="font-size:12.5px">${esc(t('uploadNote'))}</p>
    <div class="upload-zone" id="dropZone">${esc(t('uploadDrop'))}<input type="file" id="fileInput" accept=".csv,image/*" multiple hidden></div><div id="fileList"></div></details></div>`;
}
function wireUpload() {
  const dz = $('#dropZone'); if (!dz) return;
  const input = $('#fileInput'); const list = $('#fileList');
  const draw = () => { const names = Object.keys(sessionAdsData); list.innerHTML = names.length ? names.map((n) => `<div class="file-row"><span class="name">${esc(n)}</span><span class="muted">${esc(sessionAdsData[n].platform)}</span><button class="btn ghost sm" data-rm="${esc(n)}">${esc(t('remove'))}</button></div>`).join('') : `<p class="muted" style="font-size:12.5px">${esc(t('noFiles'))}</p>`; $$('[data-rm]', list).forEach((b) => b.addEventListener('click', () => { delete sessionAdsData[b.dataset.rm]; draw(); })); };
  const parseCSV = (txt) => { const lines = txt.trim().split('\n'); if (lines.length < 2) return null; const h = lines[0].split(',').map((x) => x.trim()); return lines.slice(1).map((l) => { const v = l.split(','); const o = {}; h.forEach((k, i) => { o[k] = (v[i] || '').trim(); }); return o; }); };
  const add = async (files) => { for (const f of Array.from(files)) { const platform = /google/i.test(f.name) ? 'Google Ads' : /meta|facebook|fb/i.test(f.name) ? 'Meta Ads' : 'Ads'; const isCsv = f.name.endsWith('.csv') || f.type === 'text/csv'; const data = isCsv ? parseCSV(await f.text()) : { filename: f.name, size: f.size, type: f.type }; if (data) { sessionAdsData[f.name] = { platform, data, uploadedAt: new Date().toISOString() }; api('/api/ads-data', { method: 'POST', body: { filename: f.name, platform, data: JSON.stringify(data) } }).catch(() => {}); } } draw(); showToast(t('uploaded', { n: Object.keys(sessionAdsData).length })); };
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => add(e.target.files));
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); });
  draw();
}

// ───────────────────────── AI insights ─────────────────────────
let aiHistory = [];
function buildLeadContext(rows) {
  const top = (keyFn, n) => groupStats(rows, keyFn).sort((a, b) => b.total - a.total).slice(0, n).map((g) => ({ value: g.key, deals: g.total, won: g.won, lost: g.lost, active: g.active, winRatePct: g.winRate == null ? null : +g.winRate.toFixed(1) }));
  const s = stats(rows);
  const g = resolveGran(rows);
  const lostRows = rows.filter((r) => r.bucket === 'Lost - Classified');
  const rc = {}; lostRows.forEach((r) => (r.reasons || []).forEach((x) => { rc[x] = (rc[x] || 0) + 1; }));
  const prev = previousRows();
  return {
    filters: { region: state.region, dateFrom: state.dateFrom || null, dateTo: state.dateTo || null, ...Object.fromEntries(FILTERS.filter((f) => state[f.key].length).map((f) => [f.key, state[f.key]])), search: state.q || null },
    definitions: { winRate: 'won / all deals created in period', lossRate: 'lost / all deals created in period', closeWinRate: 'won / (won + lost)' },
    totals: { deals: s.total, won: s.won, lost: s.lost, lostWithReason: s.lostc, lostWithoutReason: s.lostu, active: s.active, winRatePct: s.winRate && +s.winRate.toFixed(1), lossRatePct: s.lossRate && +s.lossRate.toFixed(1), closeWinRatePct: s.closeWin && +s.closeWin.toFixed(1) },
    previousPeriod: prev ? (() => { const p = stats(prev); return { deals: p.total, won: p.won, lost: p.lost, winRatePct: p.winRate && +p.winRate.toFixed(1) }; })() : null,
    byRegion: top((r) => [r.region], 5),
    byRep: top((r) => [r.assignTo || 'Unassigned'], 20),
    bySource: top((r) => (r.source ? [r.source] : []), 12),
    byMedium: top((r) => (r.medium ? [r.medium] : []), 8),
    byCampaign: top((r) => (r.campaign ? [r.campaign] : []), 20),
    byCourse: top((r) => (r.course ? [r.course] : []), 10),
    byLocation: top((r) => (r.location ? [r.location] : []), 10),
    byLeadScore: top((r) => (r.admissionsScore ? [r.admissionsScore] : []), 10),
    byEngagementBand: top((r) => (r.scoreBand ? [r.scoreBand] : []), 6),
    lostReasons: Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([reason, count]) => ({ reason, count })),
    timeSeries: { granularity: g, periods: periodKeys(rows, g).slice(-60).map((k) => { const rs = rows.filter((r) => periodKey(r, g) === k); const x = stats(rs); return { period: k, deals: x.total, won: x.won, lost: x.lost }; }) },
    sampleDeals: rows.slice(0, 20).map((r) => ({ date: r.date, region: r.region, course: r.course, source: r.source, campaign: r.campaign, rep: r.assignTo, status: r.bucket, reasons: r.reasons, leadScore: r.admissionsScore, engagement: r.scoreBand, feedback: r.feedback })),
  };
}
function compactAds(d) {
  if (!d) return null;
  const pickC = (c) => ({ campaign: c.campaign, channel: c.channel, status: c.status, spend: c.spend, impressions: c.impressions, clicks: c.clicks, ctr: c.ctr, cpc: c.cpc, leads: c.leads, cpl: c.cpl, sales: c.won, cpa: c.cpa, revenue: c.revenue, roas: c.roas });
  const camps = ((d.campaignsPerf && d.campaignsPerf.campaigns) || []).slice().sort((a, b) => (+b.spend || 0) - (+a.spend || 0)).slice(0, 30).map(pickC);
  return { region: d.region, currency: d.currency, period: d.period, summary: d.summary, channels: d.channels, campaigns: camps, conversionByCampaign: (d.campaigns || []).filter((c) => (c.leads || 0) > 0).slice(0, 30), daily: (d.daily || []).slice(-62), leadTargets: d.leadProgress && d.leadProgress.captacion, definitions: 'CPL = spend/leads; CPA = spend/paid sales; ROAS = paid revenue/spend. Sales/revenue are paid-attributed (won_paid).' };
}
async function getAdsContext() {
  const regions = state.region === 'all' ? ['US', 'ES', 'LATAM'] : [REGION_TO_CENTER[state.region]];
  const results = await Promise.all(regions.map((rg) => fetchAds(rg, state.dateFrom, state.dateTo).catch(() => null)));
  const ok = results.filter((r) => r && r.ok).map((r) => compactAds(r.data));
  if (!ok.length) return null;
  return ok.length === 1 ? ok[0] : { note: 'One entry per region; currencies differ by region.', regions: ok };
}
const AI_SUGG = { leads: ['summary', 'loss', 'reps', 'trend'], ads: ['adsEff', 'adsWaste', 'summary'], both: ['bothQuality', 'bothMatch', 'adsWaste', 'summary'] };
function renderAI(rows) {
  const el = $('#tab-ai');
  el.innerHTML = `<div class="panel">
    <div class="panel-head"><div><h2>${esc(t('aiTitle'))}</h2><div class="panel-sub">${esc(t('aiEmpty'))}</div></div>
      <div style="display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:12px">${esc(t('aiScope'))}</span><div class="seg" id="ai-scope">${[['leads', 'scopeLeads'], ['ads', 'scopeAds'], ['both', 'scopeBoth']].map(([k, l]) => `<button data-s="${k}" class="${state.aiScope === k ? 'active' : ''}">${esc(t(l))}</button>`).join('')}</div></div></div>
    <div class="ai-ctx" id="ai-ctx">${icon('filter')}<span>${esc(t('aiContext'))}:</span>
      <span class="count-tag">${esc(state.region === 'all' ? t('allRegions') : state.region)}</span><span class="count-tag">${esc(dateLabel())}</span>
      ${state.aiScope !== 'ads' ? `<span class="count-tag">${fmtInt(rows.length)} ${esc(t('deals'))}</span>` : ''}
      ${state.aiScope !== 'leads' ? `<span class="count-tag" id="ai-ads-ctx">${esc(t('adsLoading'))}</span>` : ''}</div>
    <div class="ai-compose"><textarea id="ai-q" placeholder="${esc(t('aiPlaceholder'))}"></textarea><button class="btn primary" id="ai-ask">${icon('send')}${esc(t('ask'))}</button></div>
    <div class="ai-sugg">${AI_SUGG[state.aiScope].map((k) => `<button data-q="${k}">${icon('sparkle')}${esc(t('s_' + k))}</button>`).join('')}</div>
  </div>
  <div class="panel" id="ai-thread-panel" ${aiHistory.length ? '' : 'hidden'}><div class="panel-head"><h2>${esc(t('nav_ai'))}</h2><button class="btn ghost sm" id="ai-clear">${esc(t('aiClear'))}</button></div><div class="ai-thread" id="ai-thread"></div></div>`;
  $$('#ai-scope button').forEach((b) => b.addEventListener('click', () => { state.aiScope = b.dataset.s; renderAI(rows); }));
  $$('.ai-sugg button').forEach((b) => b.addEventListener('click', () => { $('#ai-q').value = t('q_' + b.dataset.q); askAI(rows); }));
  $('#ai-ask').addEventListener('click', () => askAI(rows));
  $('#ai-q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) { e.preventDefault(); askAI(rows); } });
  $('#ai-clear').addEventListener('click', () => { aiHistory = []; renderAI(rows); });
  drawThread();
  if (state.aiScope !== 'leads') {
    getAdsContext().then((ctx) => {
      const tag = $('#ai-ads-ctx'); if (!tag) return;
      if (!ctx) { tag.textContent = t('adsUnavailable'); return; }
      const list = ctx.regions || [ctx];
      tag.textContent = list.map((a) => t('adsCtx', { spend: fmtMoney(a.summary && a.summary.spend, a.currency), leads: fmtInt(a.summary && a.summary.leads) })).join(' | ');
    });
  }
}
function drawThread() {
  const el = $('#ai-thread'); if (!el) return;
  $('#ai-thread-panel').hidden = !aiHistory.length;
  el.innerHTML = aiHistory.slice().reverse().map((h) => `<div class="ai-msg q"><span class="who">${icon('user')}</span><div class="bubble">${esc(h.question)}<div class="scope-tag">${esc(t(h.scope === 'leads' ? 'scopeLeads' : h.scope === 'ads' ? 'scopeAds' : 'scopeBoth'))} · ${esc(h.ctx)}</div></div></div>
    <div class="ai-msg a"><span class="who">AI</span><div class="bubble md">${h.loading ? `<span class="dots"><span></span><span></span><span></span></span> ${esc(t('thinking'))}` : h.error ? `<span style="color:var(--bad-ink)">${esc(h.error)}</span>` : mdToHtml(h.answer)}</div></div>`).join('');
}
async function askAI(rows) {
  const qEl = $('#ai-q'); const question = (qEl.value || '').trim(); if (!question) return;
  const scope = state.aiScope;
  const entry = { question, scope, loading: true, ctx: `${state.region === 'all' ? t('allRegions') : state.region} · ${dateLabel()}` };
  aiHistory.push(entry); qEl.value = ''; drawThread();
  try {
    const adsContext = scope !== 'leads' ? await getAdsContext() : null;
    const res = await api('/api/ask', { method: 'POST', body: { question, scope, lang: LANG, context: scope !== 'ads' ? buildLeadContext(rows) : null, adsContext, adsData: sessionAdsData, history: aiHistory.filter((h) => h.answer).slice(-6) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    entry.answer = data.answer || '—';
  } catch (e) { entry.error = e.message; }
  entry.loading = false; drawThread();
}

// ───────────────────────── render orchestration ─────────────────────────
function renderAll(o = {}) {
  syncStateToUrl();
  if (!o.keepPopover) closePopover();
  destroyCharts();
  $('#page-title').textContent = t('nav_' + state.view);
  $('#page-sub').textContent = t('sub_' + state.view);
  VIEWS.forEach((v) => $('#tab-' + v).classList.toggle('active', v === state.view));
  const el = $('#tab-' + state.view);
  const needsLeads = !['ads'].includes(state.view);
  if (needsLeads && !ALL.length) {
    el.innerHTML = META.loading
      ? `<div class="kpis">${'<div class="kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="height:28px;width:70%"></div></div>'.repeat(5)}</div><div class="panel"><div class="skeleton" style="height:260px"></div></div>`
      : `<div class="panel state-card">${icon('alert')}<p>${esc(META.error || t('acUnavailable'))}</p></div>`;
    if (state.view !== 'ai') return;
  }
  const rows = filtered();
  if (state.view === 'overview') renderOverview(rows);
  else if (state.view === 'recommendations') renderRecommendations(rows);
  else if (state.view === 'regions') renderRegions();
  else if (state.view === 'grouped') renderGrouped(rows);
  else if (state.view === 'individual') renderIndividual(rows);
  else if (state.view === 'ads') renderAds();
  else if (state.view === 'ai') renderAI(rows);
}

// ───────────────────────── boot ─────────────────────────
(async function init() {
  paintIcons();
  applyStaticI18n();
  $$('#theme-seg button').forEach((b) => { b.innerHTML = icon(b.dataset.theme === 'light' ? 'sun' : b.dataset.theme === 'dark' ? 'moon' : 'monitor'); b.classList.toggle('active', b.dataset.theme === THEME); b.addEventListener('click', () => setTheme(b.dataset.theme)); });
  $$('#lang-seg button, .lang-mini').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang || b.dataset.setlang)));

  if (!authToken) {
    $('#login-screen').hidden = false;
    $('#login-form').addEventListener('submit', handleLogin);
    return;
  }
  $('#app').hidden = false;
  try { if (localStorage.getItem('dashSidebar') === 'collapsed') $('#app').classList.add('collapsed'); } catch (e) {}
  $('#btn-collapse').addEventListener('click', () => { const c = $('#app').classList.toggle('collapsed'); try { localStorage.setItem('dashSidebar', c ? 'collapsed' : 'open'); } catch (e) {} setTimeout(() => Object.values(charts).forEach((ch) => ch.resize()), 220); });
  $('#btn-menu').addEventListener('click', () => $('#app').classList.add('menu-open'));
  $('#sb-scrim').addEventListener('click', () => $('#app').classList.remove('menu-open'));
  $('#btn-logout').addEventListener('click', logout);
  $('#drawer-scrim').addEventListener('click', () => { closePopover(); closeDrawers(); buildFilterBar(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (popEl) closePopover(); else closeDrawers(); } });
  window.addEventListener('resize', closePopover);
  $('#btn-refresh').addEventListener('click', async () => {
    const b = $('#btn-refresh'); b.disabled = true;
    await api('/api/refresh', { method: 'POST' }).catch(() => {});
    adsCache.clear(); recCache.clear();
    try { await loadData(); } catch (e) { META.error = e.message; }
    b.disabled = false; renderAll();
  });
  $('#btn-copy-link').addEventListener('click', async () => { syncStateToUrl(); try { await navigator.clipboard.writeText(location.href); showToast(t('linkCopied')); } catch (e) { showToast(t('copyFailed')); } });

  syncStateFromUrl();
  booted = true;
  buildNav();
  buildFilterBar();
  renderAll();
  // Lead data loads in the background; Ads renders independently meanwhile.
  loadData().then(() => { buildFilterBar(); renderAll(); }).catch((e) => { META.loading = false; META.error = e.message; renderFreshness(); renderAll(); });
})();
