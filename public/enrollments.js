'use strict';
/* Enrollments — won deals for USA, Spain and LATAM, live from ActiveCampaign,
   counted by the date they CONVERTED (won date). Replaces the separate
   Enrollment Dashboard (Google Sheet + Notion snapshot) inside the Hub.
   Uses the dashboard's globals: $, $$, esc, icon, api, LANG, t, fmtInt,
   fmtMoney, fmtDate, charts, destroyChart?, chartBase, cssVar, addDays,
   isoLocal, presetRange, showToast, regionLabel. */

const EN_STR = {
  en: {
    region: 'Region', all: 'All', period: 'Converted', p_thisMonth: 'This month', p_lastMonth: 'Last month', p_30d: 'Last 30 days', p_90d: 'Last 90 days', p_ytd: 'This year', p_all: 'All', from: 'From', to: 'To',
    byWeek: 'By week', byMonth: 'By month', currency: 'Show money in', native: 'Native', usd: 'USD', refresh: 'Refresh from AC',
    k_enrollments: 'Enrollments', k_tuition: 'Tuition sold', k_avg: 'Avg ticket', k_dropped: 'Dropped', k_dropRate: 'drop rate', k_days: 'Days to convert', k_daysSub: 'median, lead created → won', k_topSource: 'Top source', k_vsPrev: 'vs previous period', k_net: 'net of drops',
    trend: 'Enrollments over time', trendSub: 'By conversion date — click a bar to filter the table', byProgram: 'By program', bySource: 'By source', byLocation: 'By location', byRep: 'By admissions rep', byCampaign: 'By campaign', byRegion: 'By region',
    clickHint: 'Click any bar or row to filter everything below.', table: 'Enrollments', tableSub: '{n} shown · newest first', csv: 'Download CSV', openAC: 'Open in ActiveCampaign',
    c_converted: 'Converted', c_created: 'Lead created', c_student: 'Student', c_region: 'Region', c_program: 'Program', c_cohort: 'Cohort / plan', c_location: 'Location', c_rep: 'Rep', c_source: 'Source', c_campaign: 'Campaign', c_price: 'Ticket price', c_days: 'Days', c_status: 'Status',
    enrolled: 'Enrolled', dropped: 'Dropped', b2b: 'B2B', notSet: 'Not set', loading: 'Loading enrollments from ActiveCampaign… the first pull takes about a minute after a deploy.', empty: 'No enrollments match these filters.',
    usaSheet: 'USA: "2026 USA DATA" sheet, Attribution Report tab (rep matched from the ActiveCampaign deal by email; the sheet has no drops).', usaErr: 'Could not refresh the USA sheet ({e}) — showing the last copy.', source: 'Spain and LATAM: ActiveCampaign won deals in pipelines {p}, counted by won date (deals created since {s}). Dropped = won, then lost or moved to a "BAJA" stage. EUR → USD at {r}.', updated: 'updated {t}', clear: 'Clear filters', status: 'Status',
  },
  es: {
    region: 'Región', all: 'Todas', period: 'Convertido', p_thisMonth: 'Este mes', p_lastMonth: 'Mes pasado', p_30d: 'Últimos 30 días', p_90d: 'Últimos 90 días', p_ytd: 'Este año', p_all: 'Todo', from: 'Desde', to: 'Hasta',
    byWeek: 'Por semana', byMonth: 'Por mes', currency: 'Mostrar dinero en', native: 'Original', usd: 'USD', refresh: 'Actualizar desde AC',
    k_enrollments: 'Matrículas', k_tuition: 'Matrícula vendida', k_avg: 'Ticket medio', k_dropped: 'Bajas', k_dropRate: 'tasa de baja', k_days: 'Días para convertir', k_daysSub: 'mediana, lead creado → ganado', k_topSource: 'Fuente top', k_vsPrev: 'vs periodo anterior', k_net: 'sin contar bajas',
    trend: 'Matrículas en el tiempo', trendSub: 'Por fecha de conversión — haz clic en una barra para filtrar la tabla', byProgram: 'Por programa', bySource: 'Por fuente', byLocation: 'Por ubicación', byRep: 'Por asesor', byCampaign: 'Por campaña', byRegion: 'Por región',
    clickHint: 'Haz clic en cualquier barra o fila para filtrar todo lo de abajo.', table: 'Matrículas', tableSub: '{n} mostradas · más recientes primero', csv: 'Descargar CSV', openAC: 'Abrir en ActiveCampaign',
    c_converted: 'Convertido', c_created: 'Lead creado', c_student: 'Alumno', c_region: 'Región', c_program: 'Programa', c_cohort: 'Cohorte / plan', c_location: 'Ubicación', c_rep: 'Asesor', c_source: 'Fuente', c_campaign: 'Campaña', c_price: 'Precio', c_days: 'Días', c_status: 'Estado',
    enrolled: 'Matriculado', dropped: 'Baja', b2b: 'B2B', notSet: 'Sin dato', loading: 'Cargando matrículas desde ActiveCampaign… la primera carga tarda cerca de un minuto tras un despliegue.', empty: 'No hay matrículas con estos filtros.',
    usaSheet: 'USA: hoja "2026 USA DATA", pestaña Attribution Report (asesor tomado del deal de ActiveCampaign por email; la hoja no registra bajas).', usaErr: 'No se pudo actualizar la hoja de USA ({e}) — se muestra la última copia.', source: 'España y LATAM: deals ganados en ActiveCampaign, pipelines {p}, contados por fecha de ganado (deals creados desde {s}). Baja = ganado y luego perdido o movido a una etapa "BAJA". EUR → USD a {r}.', updated: 'actualizado {t}', clear: 'Quitar filtros', status: 'Estado',
  },
};
const et = (k, v) => { let s = (EN_STR[LANG] || EN_STR.en)[k] ?? EN_STR.en[k] ?? k; if (v) Object.entries(v).forEach(([a, b]) => { s = s.split(`{${a}}`).join(b); }); return s; };

const ENR_REGIONS = ['USA', 'Spain', 'LATAM'];
const ENR_REGION_VAR = { USA: '--c-a', Spain: '--c-b', LATAM: '--c-c' };
const ENR_DIMS = { program: 'byProgram', source: 'bySource', location: 'byLocation', assignTo: 'byRep', campaign: 'byCampaign' };
const enr = { data: null, loading: false, region: 'all', preset: 'ytd', from: '', to: '', gran: 'month', cur: 'native', filters: {}, status: 'all', sort: { k: 'converted', dir: -1 }, page: 1 };

function enrRange() {
  if (enr.preset === 'custom') return [enr.from, enr.to];
  const today = isoLocal(new Date());
  if (enr.preset === 'ytd') return [`${today.slice(0, 4)}-01-01`, today];
  if (enr.preset === 'all') return ['', ''];
  return presetRange(enr.preset) || ['', ''];
}
function enrPrevRange() {
  const [a, b] = enrRange(); if (!a || !b) return null;
  const len = daysBetween(a, b) + 1;
  return [addDays(a, -len), addDays(a, -1)];
}
const enrVal = (r, k) => (r[k] == null || r[k] === '' ? et('notSet') : String(r[k]));
function enrBase(range) {
  const [a, b] = range || enrRange();
  return (enr.data ? enr.data.rows : []).filter((r) => (enr.region === 'all' || r.region === enr.region)
    && (!a || r.converted >= a) && (!b || r.converted <= b));
}
function enrApplyFilters(rows, skip) {
  return rows.filter((r) => Object.entries(enr.filters).every(([k, v]) => k === skip || !v || (k === 'period' ? (enr.gran === 'week' ? r.week : r.month) === v : enrVal(r, k) === v))
    && (enr.status === 'all' || r.status === enr.status));
}
// Money: one region shows its own currency; "All" (or USD toggle) converts to USD.
function enrMoneyMode() { return enr.cur === 'usd' || enr.region === 'all' ? 'USD' : (enr.region === 'Spain' ? 'EUR' : 'USD'); }
function enrPrice(r) { return enrMoneyMode() === 'USD' ? r.priceUsd : r.price; }
const enrFmtMoney = (n) => fmtMoney(n, enrMoneyMode());
function median(a) { const s = a.filter((x) => x != null).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

async function enrLoad(force) {
  if (enr.loading) return;
  enr.loading = true;
  enr.error = null;
  try {
    const before = enr.data && enr.data.meta.at;
    if (force) await api('/api/enrollments/refresh', { method: 'POST' }).catch(() => {});
    // Poll until the server has a pull (first load) or a newer one (refresh).
    for (let i = 0; i < 45; i++) {
      const r = await api('/api/enrollments'); const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      enr.data = d;
      const done = force ? (d.meta.at && d.meta.at !== before && !d.meta.loading) : (d.meta.at || d.rows.length);
      if (done || (d.meta.error && !d.meta.loading)) break;
      if (state.view === 'enrollments' && !d.rows.length) renderEnrollments(true);
      await new Promise((res) => setTimeout(res, 4000));
    }
  } catch (e) { enr.error = e.message; }
  enr.loading = false;
  if (state.view === 'enrollments') renderEnrollments();
}

function enrBars(rows, key, max = 8) {
  const m = new Map(); let money = new Map();
  rows.forEach((r) => { const k = enrVal(r, key); m.set(k, (m.get(k) || 0) + 1); money.set(k, (money.get(k) || 0) + (enrPrice(r) || 0)); });
  const ns = et('notSet');
  const list = [...m.entries()].sort((a, b) => (a[0] === ns) - (b[0] === ns) || b[1] - a[1]).slice(0, max);
  if (!list.length) return `<div class="empty">${esc(t('noData'))}</div>`;
  const peak = list[0][1];
  const sel = enr.filters[key];
  return `<div class="blist">${list.map(([k, n]) => `<div class="brow ${sel === k ? 'enr-sel' : ''}" data-ef="${key}" data-ev="${esc(k)}" title="${esc(k)}">
    <div class="lab">${esc(key === 'region' ? regionLabel(k) : k)}</div>
    <div class="track"><i style="width:${(n / peak * 100).toFixed(1)}%;background:var(--blue)"></i></div>
    <div class="num"><b>${fmtInt(n)}</b> · ${esc(enrFmtMoney(money.get(k)))}</div></div>`).join('')}</div>`;
}

function renderEnrollments(loadingOnly) {
  const el = $('#tab-enrollments');
  destroyCharts();
  if (!enr.data && !enr.loading) { enrLoad(); }
  if (!enr.data || (loadingOnly && !enr.data.rows.length)) {
    el.innerHTML = `<div class="panel state-card"><span class="dot loading"></span><p>${esc(enr.error || et('loading'))}</p></div>`;
    return;
  }
  const meta = enr.data.meta;
  if (!enr.data.rows.length && meta.loading) { el.innerHTML = `<div class="panel state-card"><p>${esc(et('loading'))}</p></div>`; return; }
  const base = enrBase();
  const rows = enrApplyFilters(base);
  const prevRange = enrPrevRange();
  const prev = prevRange ? enrApplyFilters(enrBase(prevRange)).filter((r) => !enr.filters.period) : null;
  const enrolled = rows.filter((r) => r.status === 'enrolled');
  const dropped = rows.filter((r) => r.status === 'dropped');
  const tuition = enrolled.reduce((a, r) => a + (enrPrice(r) || 0), 0);
  const priced = enrolled.filter((r) => enrPrice(r));
  const prevEnrolled = prev ? prev.filter((r) => r.status === 'enrolled') : null;
  const prevTuition = prevEnrolled ? prevEnrolled.reduce((a, r) => a + (enrPrice(r) || 0), 0) : null;
  const srcCount = {}; rows.forEach((r) => { if (r.source) srcCount[r.source] = (srcCount[r.source] || 0) + 1; });
  const topSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0];
  const [ra, rb] = enrRange();
  const presets = ['thisMonth', 'lastMonth', '30d', '90d', 'ytd', 'all'];
  const months = [...new Set((enr.data.rows || []).filter((r) => enr.region === 'all' || r.region === enr.region).map((r) => r.month))].sort().slice(-12);
  const seg = (key, opts, cur) => `<div class="seg seg-sm" data-eseg="${key}">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${v === cur ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const chips = Object.entries(enr.filters).filter(([, v]) => v).map(([k, v]) => `<span class="cmp-chip">${esc(k === 'period' ? et(enr.gran === 'week' ? 'byWeek' : 'byMonth') : et(ENR_DIMS[k] || 'by' + k[0].toUpperCase() + k.slice(1)))}: <b>${esc(k === 'region' ? regionLabel(v) : v)}</b><button data-unf="${k}">×</button></span>`)
    .concat(enr.status !== 'all' ? [`<span class="cmp-chip">${esc(et('status'))}: <b>${esc(et(enr.status))}</b><button data-unf="status">×</button></span>`] : []);
  const regionSplit = enr.region === 'all' ? ENR_REGIONS.map((g) => `<span><i style="background:var(${ENR_REGION_VAR[g]})"></i>${esc(regionLabel(g))} ${fmtInt(enrolled.filter((r) => r.region === g).length)}</span>`).join('') : '';
  const sorted = enrSort(rows);
  const PAGE = 100; const shown = sorted.slice(0, enr.page * PAGE);
  const acUrl = enr.data.acAppUrl;

  el.innerHTML = `
    <div class="hub-toolbar enr-toolbar">
      ${seg('region', [['all', et('all')], ...ENR_REGIONS.map((g) => [g, regionLabel(g)])], enr.region)}
      <select class="ps-select" id="enr-preset"><option value="" disabled>${esc(et('period'))}</option>${presets.map((p) => `<option value="${p}" ${enr.preset === p ? 'selected' : ''}>${esc(et('period'))}: ${esc(et('p_' + p))}</option>`).join('')}<option value="custom" ${enr.preset === 'custom' ? 'selected' : ''}>${esc(et('from'))}/${esc(et('to'))}…</option></select>
      ${enr.preset === 'custom' ? `<input type="date" id="enr-from" value="${esc(enr.from)}"><input type="date" id="enr-to" value="${esc(enr.to)}">` : ''}
      <span class="hub-spacer"></span>
      ${enr.region !== 'all' && enr.region === 'Spain' ? seg('cur', [['native', 'EUR'], ['usd', 'USD']], enr.cur) : ''}
      <button class="btn ghost sm" id="enr-refresh">${icon('refresh')}${esc(et('refresh'))}</button>
    </div>
    <div class="enr-months">${months.map((m) => `<button class="enr-month ${ra === m + '-01' && enr.preset === 'custom' ? 'active' : ''}" data-month="${m}">${esc(new Date(m + '-01T12:00:00').toLocaleDateString(LANG === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: '2-digit' }))}</button>`).join('')}</div>
    <div class="kpis enr-kpis">
      <div class="kpi hl-blue enr-kpi" data-status="enrolled"><div class="k-lbl">${esc(et('k_enrollments'))}</div><div class="k-val">${fmtInt(enrolled.length)}</div><div class="k-sub">${prevEnrolled ? deltaHtml(enrolled.length, prevEnrolled.length) + `<span>${esc(et('k_vsPrev'))}</span>` : ''}</div>${regionSplit ? `<div class="enr-split">${regionSplit}</div>` : ''}</div>
      <div class="kpi"><div class="k-lbl">${esc(et('k_tuition'))}</div><div class="k-val">${esc(enrFmtMoney(tuition))}</div><div class="k-sub">${prevTuition != null ? deltaHtml(tuition, prevTuition) : ''}<span>${esc(et('k_net'))}</span></div></div>
      <div class="kpi"><div class="k-lbl">${esc(et('k_avg'))}</div><div class="k-val">${esc(enrFmtMoney(priced.length ? tuition / priced.length : null))}</div></div>
      <div class="kpi hl-bad enr-kpi" data-status="dropped"><div class="k-lbl">${esc(et('k_dropped'))}</div><div class="k-val">${fmtInt(dropped.length)}</div><div class="k-sub"><span>${rows.length ? (100 * dropped.length / rows.length).toFixed(0) + '% ' + esc(et('k_dropRate')) : '—'}</span></div></div>
      <div class="kpi"><div class="k-lbl">${esc(et('k_days'))}</div><div class="k-val">${median(rows.map((r) => r.daysToConvert)) == null ? '—' : Math.round(median(rows.map((r) => r.daysToConvert)))}</div><div class="k-sub"><span>${esc(et('k_daysSub'))}</span></div></div>
      <div class="kpi"><div class="k-lbl">${esc(et('k_topSource'))}</div><div class="k-val enr-small">${esc(topSrc ? topSrc[0] : '—')}</div><div class="k-sub"><span>${topSrc ? fmtInt(topSrc[1]) + ' · ' + Math.round(100 * topSrc[1] / rows.length) + '%' : ''}</span></div></div>
    </div>
    ${chips.length ? `<div class="enr-chips">${chips.join('')}<button class="btn ghost sm" id="enr-clear">${esc(et('clear'))}</button></div>` : ''}
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(et('trend'))}</h2><div class="panel-sub">${esc(et('trendSub'))}</div></div>${seg('gran', [['week', et('byWeek')], ['month', et('byMonth')]], enr.gran)}</div>
      <div class="chart-box"><canvas id="c-enr-trend"></canvas></div>
      <div class="legend">${(enr.region === 'all' ? ENR_REGIONS : [enr.region]).map((g) => `<span><i style="background:var(${ENR_REGION_VAR[g]})"></i>${esc(regionLabel(g))}</span>`).join('')}<span><i style="background:var(--bad)"></i>${esc(et('dropped'))}</span></div>
    </div>
    <p class="muted enr-hint">${esc(et('clickHint'))}</p>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(et('byProgram'))}</h2></div>${enrBars(enrApplyFilters(base, 'program'), 'program')}</div>
      <div class="panel"><div class="panel-head"><h2>${esc(et('bySource'))}</h2></div>${enrBars(enrApplyFilters(base, 'source'), 'source')}</div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(et('byLocation'))}</h2></div>${enrBars(enrApplyFilters(base, 'location'), 'location')}</div>
      <div class="panel"><div class="panel-head"><h2>${esc(et('byRep'))}</h2></div>${enrBars(enrApplyFilters(base, 'assignTo'), 'assignTo')}</div>
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(et('byCampaign'))}</h2></div>${enrBars(enrApplyFilters(base, 'campaign'), 'campaign', 10)}</div>
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(et('table'))}</h2><div class="panel-sub">${esc(et('tableSub', { n: fmtInt(rows.length) }))}</div></div><button class="btn ghost sm" id="enr-csv">${icon('download')}${esc(et('csv'))}</button></div>
      ${rows.length ? `<div class="tablewrap"><table class="enr-table"><thead><tr>
        ${[['converted', 'c_converted'], ['created', 'c_created'], ['name', 'c_student'], ['region', 'c_region'], ['program', 'c_program'], ['cohort', 'c_cohort'], ['location', 'c_location'], ['assignTo', 'c_rep'], ['source', 'c_source'], ['campaign', 'c_campaign'], ['price', 'c_price'], ['daysToConvert', 'c_days'], ['status', 'c_status']]
          .map(([k, l]) => `<th data-esort="${k}" class="${['price', 'daysToConvert'].includes(k) ? 'num' : ''}">${esc(et(l))}${enr.sort.k === k ? (enr.sort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('')}</tr></thead><tbody>
        ${shown.map((r) => `<tr>
          <td>${esc(fmtDate(r.converted, { day: 'numeric', month: 'short', year: '2-digit' }))}</td>
          <td class="muted">${esc(r.created ? fmtDate(r.created, { day: 'numeric', month: 'short', year: '2-digit' }) : '—')}</td>
          <td>${acUrl && !/^usa-/.test(r.id) ? `<a href="${esc(acUrl)}/app/deals/${esc(r.id)}" target="_blank" rel="noopener" title="${esc(et('openAC'))}">` : ''}<span class="pii-partial" title="${esc(r.name || r.email || '')}">${esc(r.namePartial || r.emailPartial || '#' + r.id)}</span>${acUrl && !/^usa-/.test(r.id) ? '</a>' : ''}</td>
          <td><span class="hub-mk ${MARKET_CLASS[r.region] || ''}">${esc(regionLabel(r.region))}</span></td>
          <td>${esc(r.program || '—')}</td>
          <td class="truncate" title="${esc(r.stage || r.plan || '')}">${esc(r.cohort || r.plan || r.stage || '—')}</td>
          <td>${esc(r.location || '—')}</td>
          <td>${esc(r.assignTo || '—')}</td>
          <td>${esc(r.source || '—')}</td>
          <td class="truncate" title="${esc(r.campaign || '')}">${esc(r.campaign || '—')}</td>
          <td class="num">${esc(enrFmtMoney(enrPrice(r)))}</td>
          <td class="num">${r.daysToConvert == null ? '—' : fmtInt(r.daysToConvert)}</td>
          <td><span class="badge ${r.status === 'dropped' ? 'b-lostc' : 'b-won'}">${esc(et(r.status))}</span></td>
        </tr>`).join('')}</tbody></table></div>
        ${shown.length < sorted.length ? `<div class="pager"><span>${fmtInt(shown.length)} / ${fmtInt(sorted.length)}</span><button class="btn ghost sm" id="enr-more">+${Math.min(PAGE, sorted.length - shown.length)}</button></div>` : ''}`
      : `<div class="empty">${esc(et('empty'))}</div>`}
      ${meta.usaError ? `<div class="ps-warn">${icon('alert')}<span>${esc(et('usaErr', { e: meta.usaError }))}</span></div>` : ''}
      <p class="muted enr-source">${esc(meta.sources && meta.sources.USA === 'sheet' ? et('usaSheet') + ' ' : '')}${esc(et('source', { p: meta.pipelines.map((p) => `${p.id} (${regionLabel(p.region)})`).join(', '), s: meta.since, r: meta.usdPerEur }))}${meta.at ? ' · ' + esc(et('updated', { t: new Date(meta.at).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })) : ''}</p>
    </div>`;

  // ---- wiring ----
  $$('[data-eseg]', el).forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { enr[g.dataset.eseg] = b.dataset.v; if (g.dataset.eseg !== 'cur') { enr.filters.period = null; } if (g.dataset.eseg === 'region') { delete enr.filters.region; } enr.page = 1; renderEnrollments(); })));
  $('#enr-preset', el).addEventListener('change', (e) => { enr.preset = e.target.value; if (enr.preset === 'custom') { [enr.from, enr.to] = enrRange().map((x) => x || ''); if (!enr.from) { [enr.from, enr.to] = presetRange('90d'); } } enr.filters.period = null; renderEnrollments(); });
  if ($('#enr-from', el)) { $('#enr-from', el).addEventListener('change', (e) => { enr.from = e.target.value; renderEnrollments(); }); $('#enr-to', el).addEventListener('change', (e) => { enr.to = e.target.value; renderEnrollments(); }); }
  $$('[data-month]', el).forEach((b) => b.addEventListener('click', () => { const m = b.dataset.month; const [y, mo] = m.split('-').map(Number); enr.preset = 'custom'; enr.from = m + '-01'; enr.to = isoLocal(new Date(y, mo, 0)); enr.gran = 'week'; enr.filters.period = null; renderEnrollments(); }));
  $('#enr-refresh', el).addEventListener('click', async (e) => { e.currentTarget.disabled = true; await enrLoad(true); showToast(et('updated', { t: new Date().toLocaleTimeString(LANG === 'es' ? 'es-ES' : 'en-US', { hour: '2-digit', minute: '2-digit' }) })); });
  $$('[data-ef]', el).forEach((b) => b.addEventListener('click', () => { const k = b.dataset.ef; enr.filters[k] = enr.filters[k] === b.dataset.ev ? null : b.dataset.ev; enr.page = 1; renderEnrollments(); }));
  $$('[data-unf]', el).forEach((b) => b.addEventListener('click', () => { if (b.dataset.unf === 'status') enr.status = 'all'; else enr.filters[b.dataset.unf] = null; renderEnrollments(); }));
  if ($('#enr-clear', el)) $('#enr-clear', el).addEventListener('click', () => { enr.filters = {}; enr.status = 'all'; renderEnrollments(); });
  $$('.enr-kpi', el).forEach((k) => k.addEventListener('click', () => { enr.status = enr.status === k.dataset.status ? 'all' : k.dataset.status; renderEnrollments(); }));
  $$('[data-esort]', el).forEach((th) => th.addEventListener('click', () => { const k = th.dataset.esort; enr.sort = enr.sort.k === k ? { k, dir: -enr.sort.dir } : { k, dir: ['converted', 'created', 'price', 'daysToConvert'].includes(k) ? -1 : 1 }; renderEnrollments(); }));
  if ($('#enr-more', el)) $('#enr-more', el).addEventListener('click', () => { enr.page++; renderEnrollments(); });
  $('#enr-csv', el).addEventListener('click', () => enrCsv(sorted));

  // ---- trend chart: stacked by region, drops as a line ----
  const keyOf = (r) => (enr.gran === 'week' ? r.week : r.month);
  const trendRows = enrApplyFilters(base, 'period');
  const keys = [...new Set(trendRows.map(keyOf).filter(Boolean))].sort();
  const regs = enr.region === 'all' ? ENR_REGIONS : [enr.region];
  const cb = chartBase();
  const lbl = (k) => (enr.gran === 'week' ? fmtDate(k, { day: 'numeric', month: 'short' }) : new Date(k + '-01T12:00:00').toLocaleDateString(LANG === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: '2-digit' }));
  charts.enrTrend = new Chart($('#c-enr-trend'), {
    data: {
      labels: keys.map(lbl),
      datasets: [
        ...regs.map((g) => ({ type: 'bar', label: regionLabel(g), stack: 'e', data: keys.map((k) => trendRows.filter((r) => keyOf(r) === k && r.region === g && r.status === 'enrolled').length), backgroundColor: keys.map((k) => (enr.filters.period && enr.filters.period !== k ? cssVar(ENR_REGION_VAR[g]) + '55' : cssVar(ENR_REGION_VAR[g]))), borderRadius: 3, maxBarThickness: 44 })),
        { type: 'line', label: et('dropped'), data: keys.map((k) => trendRows.filter((r) => keyOf(r) === k && r.status === 'dropped').length), stack: 'drops', borderColor: cssVar('--bad'), backgroundColor: cssVar('--bad'), borderWidth: 2, pointRadius: 2.5, tension: 0 },
      ],
    },
    options: { ...cb, scales: { x: { ...cb.scales.x, stacked: true }, y: { ...cb.scales.y, stacked: true } },
      plugins: { ...cb.plugins, tooltip: { ...cb.plugins.tooltip, callbacks: { footer: (items) => { const k = keys[items[0].dataIndex]; const rs = trendRows.filter((r) => keyOf(r) === k && r.status === 'enrolled'); return `${et('k_tuition')}: ${enrFmtMoney(rs.reduce((a, r) => a + (enrPrice(r) || 0), 0))}`; } } } },
      onClick: (e, els) => { if (!els.length) return; const k = keys[els[0].index]; enr.filters.period = enr.filters.period === k ? null : k; renderEnrollments(); } },
  });
}

function enrSort(rows) {
  const { k, dir } = enr.sort;
  const v = (r) => (k === 'price' ? enrPrice(r) ?? -1 : k === 'daysToConvert' ? r.daysToConvert ?? -1 : k === 'name' ? (r.namePartial || '') : String(r[k] ?? ''));
  return rows.slice().sort((a, b) => { const x = v(a); const y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
}
function enrCsv(rows) {
  const cols = ['converted', 'created', 'namePartial', 'emailPartial', 'region', 'b2b', 'program', 'course', 'cohort', 'stage', 'location', 'assignTo', 'source', 'medium', 'campaign', 'price', 'currency', 'priceUsd', 'daysToConvert', 'financing', 'status', 'id'];
  const q = (x) => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `4geeks-enrollments-${enr.region}-${isoLocal(new Date())}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

window.renderEnrollments = renderEnrollments;
window.enrReset = () => { enr.data = null; };
