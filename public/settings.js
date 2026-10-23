'use strict';
/* Settings: one place for personal preferences (language, theme) and, for
   admins, user management and the status of the background jobs.
   Loaded before dashboard.js; uses its helpers only at call time. */

(function addSettingsStrings() {
  const en = {
    nav_settings: 'Settings', sub_settings: 'Your preferences, and for admins: users and system status',
    set_prefs: 'Preferences', set_prefsSub: 'Saved in this browser',
    set_users: 'Users', set_usersSub: 'Who can sign in and what they can do (admins only)',
    set_system: 'System status', set_systemSub: 'Background jobs behind the Hub (admins only)',
    set_data: 'ActiveCampaign data', set_dataVal: '{n} deals · updated {t}', set_loading: 'Loading…',
    set_intel: 'Conversation reading (AI)', set_intelVal: '{r} conversations read · {d} diagnosed · {q} in queue', set_paused: 'paused while the main refresh runs',
    set_ads: 'Google Ads sync', set_adsOn: 'On · {u} uploaded · {w} waiting · {f} failed', set_adsOff: 'Off',
    set_open: 'Open', set_lastErr: 'Last error: {e}',
  };
  const es = {
    nav_settings: 'Ajustes', sub_settings: 'Tus preferencias y, para admins: usuarios y estado del sistema',
    set_prefs: 'Preferencias', set_prefsSub: 'Se guardan en este navegador',
    set_users: 'Usuarios', set_usersSub: 'Quién puede entrar y qué puede hacer (solo admins)',
    set_system: 'Estado del sistema', set_systemSub: 'Procesos en segundo plano del Hub (solo admins)',
    set_data: 'Datos de ActiveCampaign', set_dataVal: '{n} deals · actualizado {t}', set_loading: 'Cargando…',
    set_intel: 'Lectura de conversaciones (IA)', set_intelVal: '{r} conversaciones leídas · {d} diagnosticadas · {q} en cola', set_paused: 'en pausa mientras corre la actualización principal',
    set_ads: 'Sync con Google Ads', set_adsOn: 'Activo · {u} subidos · {w} esperando · {f} fallidos', set_adsOff: 'Apagado',
    set_open: 'Abrir', set_lastErr: 'Último error: {e}',
  };
  window.I18N.en = { ...window.I18N.en, ...en };
  window.I18N.es = { ...window.I18N.es, ...es };
})();

function renderSettings(el) {
  const admin = !!window.__isAdmin;
  const themeBtn = (th, ic) => `<button data-theme="${th}" class="${THEME === th ? 'active' : ''}">${icon(ic)}${esc(t('theme' + th[0].toUpperCase() + th.slice(1)))}</button>`;
  el.innerHTML = `
    <div class="panel set-panel">
      <div class="panel-head"><div><h2>${esc(t('set_prefs'))}</h2><div class="panel-sub">${esc(t('set_prefsSub'))}</div></div></div>
      <div class="set-row"><span class="set-label">${icon('regions')}${esc(t('language'))}</span>
        <div class="seg" id="lang-seg"><button data-lang="en" class="${LANG === 'en' ? 'active' : ''}">English</button><button data-lang="es" class="${LANG === 'es' ? 'active' : ''}">Español</button></div></div>
      <div class="set-row"><span class="set-label">${icon('sun')}${esc(t('theme'))}</span>
        <div class="seg" id="theme-seg">${themeBtn('light', 'sun')}${themeBtn('system', 'monitor')}${themeBtn('dark', 'moon')}</div></div>
    </div>
    ${admin ? `
    <div class="panel set-panel">
      <div class="panel-head"><div><h2>${esc(t('set_system'))}</h2><div class="panel-sub">${esc(t('set_systemSub'))}</div></div></div>
      <div id="set-status"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:80%"></div></div>
    </div>
    <div class="set-section-head"><h2>${esc(t('set_users'))}</h2><div class="panel-sub">${esc(t('set_usersSub'))}</div></div>
    <div id="set-users"></div>` : ''}`;
  $$('#lang-seg button', el).forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $$('#theme-seg button', el).forEach((b) => b.addEventListener('click', () => { setTheme(b.dataset.theme); renderSettings(el); }));
  if (!admin) return;
  if (window.renderUsers) window.renderUsers($('#set-users', el));
  loadSettingsStatus(el);
}

async function loadSettingsStatus(el) {
  const box = $('#set-status', el);
  if (!box) return;
  const get = (u) => api(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [intel, ads] = await Promise.all([get('/api/pipeline/status'), get('/api/pipeline/ads-sync')]);
  if (!document.body.contains(box)) return;
  const tm = META.generatedAt ? new Date(META.generatedAt).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const row = (ic, label, val, extra = '', action = '') => `<div class="set-row"><span class="set-label">${icon(ic)}${esc(label)}</span><span class="set-val">${val}${extra}</span>${action}</div>`;
  const c = (ads && ads.counts) || {};
  box.innerHTML = [
    row('refresh', t('set_data'), META.loading ? esc(t('set_loading')) : esc(t('set_dataVal', { n: fmtInt(ALL.length), t: tm }))),
    intel ? row('sparkle', t('set_intel'), esc(t('set_intelVal', { r: fmtInt(intel.conversations), d: fmtInt(intel.diagnosed), q: fmtInt(intel.aiQueue) })),
      `${intel.paused ? ` <span class="muted">· ${esc(t('set_paused'))}</span>` : ''}${intel.lastError ? `<div class="set-err" title="${esc(intel.lastError)}">${esc(t('set_lastErr', { e: intel.lastError.slice(0, 120) }))}</div>` : ''}`,
      `<button class="btn ghost sm" data-go="recommendations">${esc(t('set_open'))}</button>`) : '',
    ads ? row('upload', t('set_ads'), ads.enabled ? esc(t('set_adsOn', { u: fmtInt(c.uploaded || 0), w: fmtInt(c.queued || 0), f: fmtInt(c.failed || 0) })) : esc(t('set_adsOff')),
      ads.lastError ? `<div class="set-err" title="${esc(ads.lastError)}">${esc(t('set_lastErr', { e: ads.lastError.slice(0, 120) }))}</div>` : '',
      `<button class="btn ghost sm" data-go="adsync">${esc(t('set_open'))}</button>`) : '',
  ].join('');
  $$('[data-go]', box).forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}
