'use strict';
/* Social — shared pieces for the Social section (social-analytics.js, social-settings.js):
   EN/ES strings, period bar, KPI tiles, formatters.
   Uses hub-common.js (hubJson, fmtN, fmtDay…) and dashboard.js ($, esc, icon, charts…). */

const SOC_STR = {
  en: {
    analytics: 'Analytics', allAccounts: 'All accounts', back: 'All accounts', account: 'Account', site: 'Site', market: 'Market',
    noData: 'No data yet. It arrives with the first sync.', noAccounts: 'No accounts switched on. An admin turns them on in Social → Settings.',
    clickAccount: 'Click an account to see its detail', comparison: 'Accounts side by side',
    last7: '7 days', last28: '28 days', last90: '90 days', custom: 'Custom', from: 'From', to: 'To',
    cmpPrev: 'vs previous period', cmpYear: 'vs a year before', cmpNone: 'No comparison', notComparable: 'not comparable',
    tab_ads: 'Ads', tab_promoted: 'Promoted posts', ttImpressions: 'Impressions', ttPlays: 'Video plays', ttClicks: 'Clicks', ttFollows: 'Followers gained', ttAdsWithSpend: 'Ads with spend',
    ttIdentities: 'Who signs the ads', ttIdentitiesHelp: 'The brand account, one authorised through Business Center, or a creator (Spark Ads).', ttIdentity: 'Signed by', ttType: 'Type',
    ttPromotedPosts: 'Promoted posts', ttSpendOnPosts: 'Spend on posts', ttShareOnPosts: '% of spend on posts', ttShareHelp: 'TikTok does not split part of some campaigns\' spend by ad: that part counts in the total, not per post.', ttPost: 'TikTok post', ttDays: 'Days with spend',
    ttNoSpend: 'No spend in this period. Last day with spend: {d}.',
    tab_community: 'Community', tab_account: 'Account', tab_posts: 'Posts', tab_reels: 'Reels', tab_paid: 'Organic vs paid', tab_demographics: 'Demographics',
    followers: 'Followers', followers_growth: 'Net growth', new_followers: 'New followers', unfollows: 'Unfollows', profile_visits: 'Profile visits',
    views: 'Views', views_organic: 'Organic views', views_paid: 'Paid views', organic_share: '% organic', avg_daily_reach: 'Avg daily reach',
    interactions: 'Interactions', accounts_engaged: 'Accounts engaged', posts: 'Posts', avg_post_engagement: 'Avg engagement',
    reach: 'Reach', likes: 'Likes', comments: 'Comments', shares: 'Shares', saves: 'Saves', engagement: 'Engagement', format: 'Format', date: 'Date',
    caption: 'Post', spend: 'Ad spend', open: 'Open', promoted: 'Promoted', all: 'All', sortBy: 'Sort by',
    s_recent: 'Most recent', s_views: 'Most views', s_engagement: 'Highest engagement', s_saves: 'Most saved', s_shares: 'Most shared',
    avgViews: 'Avg views per post', reels: 'Reels', avgWatch: 'Avg watch time', skipRate: 'Skip rate', seconds: 's',
    paidApprox: 'Instagram paid views are an estimate (total views − organic views).',
    growthHelp: 'Change in followers over the period. Instagram only counts from when the account was connected.',
    reachHelp: 'Daily reach is averaged, never summed: the same person counts again every day.',
    countries: 'Countries', cities: 'Cities', ageGender: 'Age and gender', demoAsOf: 'Followers as of {d}', noDemo: 'Meta has not returned demographics for this account yet.',
    dataAsOf: 'Metrics as of {d}', loadError: 'Could not load the data',
    // settings
    settings: 'Settings', syncStatus: 'Sync status', syncOn: 'Sync on', syncOff: 'Sync off', running: 'Running: {t}', lastRun: 'Last {t}',
    neverRun: 'Not run yet', failedSteps: 'Steps that failed', allGood: 'Every step finished well', accounts: 'Accounts', adAccounts: 'Ad accounts',
    active: 'On', network: 'Network', lastSync: 'Last sync', refresh: 'Refresh', refreshQueued: 'Refresh queued: it starts within 20 seconds',
    discover: 'Discover accounts', discoverQueued: 'Discovery queued', history: 'Load history', historyDays: 'Days', historyQueued: 'History load queued',
    switchedOn: '{n} switched on', turnOnNote: 'Switching an account on loads its last 30 days.',
    sites: 'Sites', addSite: 'Add site', siteName: 'Site name', noMarket: 'No market', remove: 'Remove', confirmRemoveSite: 'Remove this site? Its accounts are left without a site.',
    saved: 'Saved', requests: 'Recent requests', r_pending: 'Pending', r_running: 'Running', r_ok: 'Done', r_error: 'Error', currency: 'Currency',
    storageMemory: 'No DATABASE_URL: Social data lives in memory and is lost on restart.',
    adminOnly: 'Read-only: only admins can change these settings.', withPaidViews: 'Posts with paid views', noPosts: 'No posts in this period.',
    calendar: 'Fill Social calendar', calendarQueued: 'Social calendar fill queued',
    calendarHelp: 'Copies Meta results into the Social calendar posts that have a post URL, and fills the weekly account metrics. It also runs every hour.',
  },
  es: {
    analytics: 'Analítica', allAccounts: 'Todas las cuentas', back: 'Todas las cuentas', account: 'Cuenta', site: 'Sede', market: 'Mercado',
    noData: 'Todavía no hay datos. Llegan con la primera sincronización.', noAccounts: 'No hay cuentas encendidas. Un admin las enciende en Social → Ajustes.',
    clickAccount: 'Haz clic en una cuenta para ver su detalle', comparison: 'Cuentas lado a lado',
    last7: '7 días', last28: '28 días', last90: '90 días', custom: 'Personalizado', from: 'Desde', to: 'Hasta',
    cmpPrev: 'vs periodo anterior', cmpYear: 'vs un año antes', cmpNone: 'Sin comparar', notComparable: 'no comparable',
    tab_ads: 'Anuncios', tab_promoted: 'Posts promocionados', ttImpressions: 'Impresiones', ttPlays: 'Reproducciones', ttClicks: 'Clics', ttFollows: 'Seguidores ganados', ttAdsWithSpend: 'Anuncios con gasto',
    ttIdentities: 'Quién firma los anuncios', ttIdentitiesHelp: 'La cuenta de la marca, otra autorizada por Business Center o un creador (Spark Ads).', ttIdentity: 'Firma', ttType: 'Tipo',
    ttPromotedPosts: 'Posts promocionados', ttSpendOnPosts: 'Gasto en posts', ttShareOnPosts: '% del gasto en posts', ttShareHelp: 'TikTok no reparte entre anuncios parte del gasto de algunas campañas: cuenta en el total, no por post.', ttPost: 'Post de TikTok', ttDays: 'Días con gasto',
    ttNoSpend: 'Sin gasto en este periodo. Último día con gasto: {d}.',
    tab_community: 'Comunidad', tab_account: 'Cuenta', tab_posts: 'Publicaciones', tab_reels: 'Reels', tab_paid: 'Orgánico vs pagado', tab_demographics: 'Demografía',
    followers: 'Seguidores', followers_growth: 'Crecimiento neto', new_followers: 'Seguidores nuevos', unfollows: 'Bajas', profile_visits: 'Visitas al perfil',
    views: 'Views', views_organic: 'Views orgánicas', views_paid: 'Views pagadas', organic_share: '% orgánico', avg_daily_reach: 'Alcance medio diario',
    interactions: 'Interacciones', accounts_engaged: 'Cuentas que interactuaron', posts: 'Publicaciones', avg_post_engagement: 'Engagement medio',
    reach: 'Alcance', likes: 'Likes', comments: 'Comentarios', shares: 'Compartidos', saves: 'Guardados', engagement: 'Engagement', format: 'Formato', date: 'Fecha',
    caption: 'Publicación', spend: 'Gasto en anuncios', open: 'Abrir', promoted: 'Promocionada', all: 'Todas', sortBy: 'Ordenar por',
    s_recent: 'Más recientes', s_views: 'Más views', s_engagement: 'Mayor engagement', s_saves: 'Más guardadas', s_shares: 'Más compartidas',
    avgViews: 'Views medias por post', reels: 'Reels', avgWatch: 'Tiempo medio visto', skipRate: 'Skip rate', seconds: 's',
    paidApprox: 'Las views pagadas de Instagram son una estimación (views totales − views orgánicas).',
    growthHelp: 'Variación de seguidores en el periodo. En Instagram solo cuenta desde que la cuenta está conectada.',
    reachHelp: 'El alcance diario se promedia, nunca se suma: la misma persona cuenta otra vez cada día.',
    countries: 'Países', cities: 'Ciudades', ageGender: 'Edad y género', demoAsOf: 'Seguidores a {d}', noDemo: 'Meta aún no ha devuelto la demografía de esta cuenta.',
    dataAsOf: 'Métricas a {d}', loadError: 'No se pudieron cargar los datos',
    settings: 'Ajustes', syncStatus: 'Estado de la sincronización', syncOn: 'Sincronización encendida', syncOff: 'Sincronización apagada', running: 'En curso: {t}', lastRun: 'Última {t}',
    neverRun: 'Aún no se ha ejecutado', failedSteps: 'Pasos que fallaron', allGood: 'Todos los pasos terminaron bien', accounts: 'Cuentas', adAccounts: 'Cuentas de anuncios',
    active: 'Encendida', network: 'Red', lastSync: 'Última sincronización', refresh: 'Actualizar', refreshQueued: 'Actualización en cola: empieza en menos de 20 segundos',
    discover: 'Descubrir cuentas', discoverQueued: 'Descubrimiento en cola', history: 'Cargar histórico', historyDays: 'Días', historyQueued: 'Carga de histórico en cola',
    switchedOn: '{n} encendidas', turnOnNote: 'Al encender una cuenta se cargan sus últimos 30 días.',
    sites: 'Sedes', addSite: 'Añadir sede', siteName: 'Nombre de la sede', noMarket: 'Sin mercado', remove: 'Quitar', confirmRemoveSite: '¿Quitar esta sede? Sus cuentas quedan sin sede.',
    saved: 'Guardado', requests: 'Solicitudes recientes', r_pending: 'Pendiente', r_running: 'En curso', r_ok: 'Hecha', r_error: 'Error', currency: 'Moneda',
    storageMemory: 'Sin DATABASE_URL: los datos de Social viven en memoria y se pierden al reiniciar.',
    adminOnly: 'Solo lectura: solo los admins pueden cambiar estos ajustes.', withPaidViews: 'Publicaciones con views pagadas', noPosts: 'No hay publicaciones en este periodo.',
    calendar: 'Rellenar Calendario social', calendarQueued: 'Relleno del Calendario social en cola',
    calendarHelp: 'Copia los resultados de Meta en los posts del Calendario social que tienen URL, y rellena las métricas semanales de cuenta. También se hace cada hora.',
  },
};
const ss = (k, vars) => { let s = (SOC_STR[LANG] || SOC_STR.en)[k] ?? SOC_STR.en[k] ?? k; if (vars) Object.entries(vars).forEach(([a, b]) => { s = s.replace(`{${a}}`, b); }); return s; };

// Sidebar and page titles live in window.I18N (dashboard.js reads them with t()).
Object.assign(window.I18N.en, {
  navSectionSocial: 'Social', nav_social_analytics: 'Analytics', sub_social_analytics: 'Facebook and Instagram, synced from Meta every hour',
  nav_social_settings: 'Social settings', sub_social_settings: 'Accounts on/off, sites and the Meta sync',
});
Object.assign(window.I18N.es, {
  navSectionSocial: 'Social', nav_social_analytics: 'Analítica', sub_social_analytics: 'Facebook e Instagram, sincronizados con Meta cada hora',
  nav_social_settings: 'Ajustes de Social', sub_social_settings: 'Cuentas encendidas, sedes y la sincronización con Meta',
});

// ---------- period (shared by every Social screen) ----------
const socPeriod = { preset: '28', from: null, to: null, compare: 'prev' };
function socRange() {
  if (socPeriod.preset === 'custom' && socPeriod.from && socPeriod.to) return { from: socPeriod.from, to: socPeriod.to };
  const to = todayStr();
  return { from: addDaysStr(to, -(Number(socPeriod.preset) - 1)), to };
}
const socQuery = (extra = {}) => new URLSearchParams({ ...socRange(), compare: socPeriod.compare, ...extra }).toString();

/** Period + comparison controls. onChange() redraws the screen. */
function socPeriodBar(onChange, { compare = true } = {}) {
  const r = socRange();
  const html = `<div class="soc-period">
    <div class="seg seg-sm" data-soc="preset">${[['7', ss('last7')], ['28', ss('last28')], ['90', ss('last90')], ['custom', ss('custom')]].map(([v, l]) => `<button data-v="${v}" class="${socPeriod.preset === v ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
    ${socPeriod.preset === 'custom' ? `<input type="date" class="ps-select" data-soc-date="from" value="${esc(r.from)}" max="${esc(todayStr())}" aria-label="${esc(ss('from'))}"><input type="date" class="ps-select" data-soc-date="to" value="${esc(r.to)}" max="${esc(todayStr())}" aria-label="${esc(ss('to'))}">` : ''}
    ${compare ? `<select class="ps-select" data-soc="compare">${[['prev', ss('cmpPrev')], ['year', ss('cmpYear')], ['none', ss('cmpNone')]].map(([v, l]) => `<option value="${v}" ${socPeriod.compare === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
  </div>`;
  const wire = (root) => {
    $$('[data-soc=preset] button', root).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.v === 'custom') Object.assign(socPeriod, socRange());
      socPeriod.preset = b.dataset.v; onChange();
    }));
    $$('[data-soc-date]', root).forEach((i) => i.addEventListener('change', () => { if (i.value) { socPeriod[i.dataset.socDate] = i.value; onChange(); } }));
    const c = $('[data-soc=compare]', root); if (c) c.addEventListener('change', () => { socPeriod.compare = c.value; onChange(); });
  };
  return { html, wire };
}

// ---------- formatting ----------
const socPct = (x) => (x == null ? '—' : `${(x * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`);
const socSigned = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmtN(n)}`);
const socAccName = (a) => (a.username ? `@${a.username}` : a.name);
const socNet = (n) => `<span class="soc-net soc-${esc(n)}">${esc({ instagram: 'IG', facebook: 'FB', tiktok: 'TT' }[n] || n)}</span>`;
const socMoney = (spend) => (spend ? Object.entries(spend).map(([cur, v]) => `${Number(v).toLocaleString(locale(), { maximumFractionDigits: 0 })} ${cur}`).join(' · ') : '—');

/** KPI tile. k = {current, previous, change_pct} from the API, or a plain number. */
function socKpi(label, k, { fmt = fmtN, help, compare = true } = {}) {
  const cur = k && typeof k === 'object' ? k.current : k;
  let delta = '';
  if (compare && k && typeof k === 'object' && socPeriod.compare !== 'none') {
    delta = k.change_pct == null
      ? (k.current != null && k.previous == null ? `<span class="delta flat">${esc(ss('notComparable'))}</span>` : '')
      : `<span class="delta ${k.change_pct > 0 ? 'up' : k.change_pct < 0 ? 'down' : 'flat'}">${k.change_pct > 0 ? '▲' : k.change_pct < 0 ? '▼' : ''} ${Math.abs(k.change_pct).toLocaleString(locale(), { maximumFractionDigits: 1 })}%</span>`;
  }
  return `<div class="kpi"><div class="k-lbl"${help ? ` title="${esc(help)}"` : ''}>${esc(label)}${help ? ' ⓘ' : ''}</div><div class="k-val">${cur == null ? '—' : fmt(cur)}</div><div class="k-sub">${delta}</div></div>`;
}

function socError(el, e) {
  el.innerHTML = `<div class="panel state-card">${icon('alert')}<p style="font-weight:700">${esc(ss('loadError'))}</p><p class="muted">${esc(e.message)}</p></div>`;
}
