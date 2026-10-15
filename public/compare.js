'use strict';
/* Compare — pick a dimension (region, campaign, source, rep, location, course,
   score or period) and up to 4 sets of values, then see them side by side:
   scorecard, trend, outcome mix and a breakdown by a second dimension.
   Uses the dashboard's globals: ALL, match, stats, state, t, esc, fmtInt, icon,
   charts, chartBase, cssVar, resolveGran, periodKeys, periodKey, periodLabel,
   presetRange, addDays, scoreLabel, regionLabel, renderAll, syncStateToUrl. */

const CMP_STR = {
  en: {
    compareBy: 'Compare', breakdownBy: 'Break down by', set: 'Set', add: 'Add', clear: 'Clear', addSet: 'Add a set', removeSet: 'Remove set',
    pickValues: 'Pick one or more values — several values in a set are added together', searchValues: 'Search…', noValues: 'No values in the current filters',
    emptySets: 'Pick at least one value in two sets to compare them.', presets: 'Quick comparisons', p_regions: 'USA vs Spain vs LATAM', p_topCampaigns: 'Top 2 campaigns', p_topSources: 'Top 2 sources', p_topReps: 'Top 2 reps', p_months: 'This month vs last month', p_weeks: 'This week vs last week',
    scorecard: 'Scorecard', best: 'best', vsA: 'vs A', metric: 'Metric',
    m_deals: 'Leads / deals', m_won: 'Won', m_winRate: 'Win rate', m_closeWin: 'Win rate of closed', m_lost: 'Lost', m_lossRate: 'Loss rate', m_active: 'Open', m_noReason: 'Lost without reason', m_good: 'Good test score', m_junk: 'Junk (invalid / fake / duplicate)', m_value: 'Won value', m_avgValue: 'Avg won deal', m_perDay: 'Leads per day',
    trend: 'Leads over time', trendWin: 'Win rate over time', mix: 'Outcome mix', breakdown: 'Side by side', share: 'share',
    d_region: 'Region', d_campaign: 'Campaign', d_source: 'UTM source', d_medium: 'UTM medium', d_location: 'Location', d_course: 'Course', d_assignTo: 'Admissions rep', d_admissionsScore: 'Test score', d_reason: 'Lost reason', d_period: 'Period (date ranges)', d_stage: 'Stage',
    from: 'From', to: 'To', note: 'Uses every filter above except the one you compare by. For periods, the dates come from each set.',
    askAI: 'Explain the difference with AI', aiQ: 'Compare these sets ({dim}): {sets}. Using the scorecard below, explain the most important differences, the likely reasons and one action for each set. Max 6 bullets.',
  },
  es: {
    compareBy: 'Comparar', breakdownBy: 'Desglosar por', set: 'Grupo', add: 'Añadir', clear: 'Limpiar', addSet: 'Añadir grupo', removeSet: 'Quitar grupo',
    pickValues: 'Elige uno o varios valores — si un grupo tiene varios, se suman', searchValues: 'Buscar…', noValues: 'No hay valores con los filtros actuales',
    emptySets: 'Elige al menos un valor en dos grupos para compararlos.', presets: 'Comparaciones rápidas', p_regions: 'USA vs España vs LATAM', p_topCampaigns: 'Top 2 campañas', p_topSources: 'Top 2 fuentes', p_topReps: 'Top 2 asesores', p_months: 'Este mes vs mes pasado', p_weeks: 'Esta semana vs la pasada',
    scorecard: 'Comparativa', best: 'mejor', vsA: 'vs A', metric: 'Métrica',
    m_deals: 'Leads / deals', m_won: 'Ganados', m_winRate: 'Tasa de cierre', m_closeWin: 'Cierre sobre cerrados', m_lost: 'Perdidos', m_lossRate: 'Tasa de pérdida', m_active: 'Abiertos', m_noReason: 'Perdidos sin motivo', m_good: 'Test score bueno', m_junk: 'Basura (inválido / falso / duplicado)', m_value: 'Valor ganado', m_avgValue: 'Deal medio ganado', m_perDay: 'Leads por día',
    trend: 'Leads en el tiempo', trendWin: 'Tasa de cierre en el tiempo', mix: 'Mix de resultados', breakdown: 'Lado a lado', share: 'peso',
    d_region: 'Región', d_campaign: 'Campaña', d_source: 'UTM source', d_medium: 'UTM medium', d_location: 'Ubicación', d_course: 'Curso', d_assignTo: 'Asesor de admisiones', d_admissionsScore: 'Test score', d_reason: 'Motivo de pérdida', d_period: 'Periodo (rangos de fechas)', d_stage: 'Etapa',
    from: 'Desde', to: 'Hasta', note: 'Usa todos los filtros de arriba menos el que comparas. En periodos, las fechas salen de cada grupo.',
    askAI: 'Explicar la diferencia con IA', aiQ: 'Compara estos grupos ({dim}): {sets}. Con la comparativa de abajo, explica las diferencias más importantes, las causas probables y una acción para cada grupo. Máximo 6 viñetas.',
  },
};
const ct = (k, vars) => { let s = (CMP_STR[LANG] || CMP_STR.en)[k] ?? CMP_STR.en[k] ?? k; if (vars) Object.entries(vars).forEach(([a, b]) => { s = s.split(`{${a}}`).join(b); }); return s; };

const CMP_DIMS = ['region', 'campaign', 'source', 'medium', 'location', 'course', 'assignTo', 'admissionsScore', 'reason', 'stage', 'period'];
const CMP_COLORS = ['--c-a', '--c-b', '--c-c', '--c-d'];
const CMP_LETTERS = ['A', 'B', 'C', 'D'];
const cmp = { dim: 'region', by: 'course', sets: [], open: null, q: '' };

const cmpVals = (r, dim) => (dim === 'reason' ? r.reasons || [] : r[dim] != null && r[dim] !== '' ? [String(r[dim])] : []);
const cmpLabel = (dim, v) => (dim === 'region' ? regionLabel(v) : dim === 'admissionsScore' || dim === 'by:admissionsScore' ? scoreLabel(v) : v);
// Rows the comparison starts from: everything filtered, except the compared dimension (and dates for periods).
function cmpBase() {
  const skip = { region: { skipRegion: true }, period: { skipDate: true } }[cmp.dim] || { skip: cmp.dim };
  return ALL.filter((r) => match(r, skip));
}
function cmpRows(base, set) {
  if (cmp.dim === 'period') return set.from && set.to ? base.filter((r) => r.date && r.date >= set.from && r.date <= set.to) : [];
  if (!set.values.length) return [];
  return base.filter((r) => cmpVals(r, cmp.dim).some((v) => set.values.includes(v)));
}
function cmpSetLabel(set, i) {
  if (cmp.dim === 'period') return set.from && set.to ? `${fmtDate(set.from)} – ${fmtDate(set.to)}` : `${ct('set')} ${CMP_LETTERS[i]}`;
  if (!set.values.length) return `${ct('set')} ${CMP_LETTERS[i]}`;
  const first = cmpLabel(cmp.dim, set.values[0]);
  return set.values.length > 1 ? `${first} +${set.values.length - 1}` : first;
}
function cmpValueCounts(base) {
  const m = new Map();
  base.forEach((r) => cmpVals(r, cmp.dim).forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function cmpMetrics(rows, set) {
  const s = stats(rows);
  const won = rows.filter((r) => r.bucket === 'Won');
  const value = won.reduce((a, r) => a + (Number(r.dealValue) || 0), 0);
  const scored = rows.filter((r) => r.admissionsScore);
  let days = null;
  if (cmp.dim === 'period' && set.from && set.to) days = daysBetween(set.from, set.to) + 1;
  else if (state.dateFrom && state.dateTo) days = daysBetween(state.dateFrom, state.dateTo) + 1;
  return {
    deals: s.total, won: s.won, winRate: s.winRate, closeWin: s.closeWin, lost: s.lost, lossRate: s.lossRate, active: s.active,
    noReason: s.lost ? (100 * s.lostu) / s.lost : null,
    good: scored.length ? (100 * scored.filter((r) => GOOD_SCORES.includes(r.admissionsScore)).length) / scored.length : null,
    junk: scored.length ? (100 * scored.filter((r) => JUNK_SCORES.includes(r.admissionsScore)).length) / scored.length : null,
    value: value || null, avgValue: won.length && value ? value / won.length : null, perDay: days ? s.total / days : null,
  };
}
// [key, kind, higherIsBetter]
const CMP_METRICS = [['deals', 'int', true], ['perDay', 'dec', true], ['won', 'int', true], ['winRate', 'pct', true], ['closeWin', 'pct', true], ['lost', 'int', false], ['lossRate', 'pct', false], ['active', 'int', null], ['noReason', 'pct', false], ['good', 'pct', true], ['junk', 'pct', false], ['value', 'money', true], ['avgValue', 'money', true]];
const cmpFmt = (v, kind) => (v == null ? '—' : kind === 'pct' ? v.toFixed(1) + '%' : kind === 'dec' ? v.toFixed(1) : kind === 'money' ? '$' + Math.round(v).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US') : fmtInt(v));

function cmpDefaults() {
  const base = cmpBase();
  const top = cmpValueCounts(base);
  if (cmp.dim === 'period') {
    const [a1, a2] = presetRange('thisMonth'); const [b1, b2] = presetRange('lastMonth');
    return [{ from: a1, to: a2, values: [] }, { from: b1, to: b2, values: [] }];
  }
  if (cmp.dim === 'region') return REGIONS.map((r) => ({ values: [r] }));
  return top.slice(0, 2).map(([v]) => ({ values: [v] })).concat(top.length < 2 ? [{ values: [] }] : []);
}
function cmpPreset(k) {
  const [dim, sets] = {
    regions: ['region', null], topCampaigns: ['campaign', null], topSources: ['source', null], topReps: ['assignTo', null],
    months: ['period', [presetRange('thisMonth'), presetRange('lastMonth')]],
    weeks: ['period', [presetRange('thisWeek'), (() => { const [a] = presetRange('thisWeek'); return [addDays(a, -7), addDays(a, -1)]; })()]],
  }[k];
  cmp.dim = dim;
  cmp.sets = sets ? sets.map(([from, to]) => ({ from, to, values: [] })) : cmpDefaults();
  if (cmp.by === dim) cmp.by = dim === 'course' ? 'source' : 'course';
  renderCompare();
}

// URL: cmp=<dim>~<by>~A1|A2~B1~… (periods: from..to)
function cmpToUrl() {
  const enc = (s) => (cmp.dim === 'period' ? `${s.from || ''}..${s.to || ''}` : s.values.map(encodeURIComponent).join('|'));
  return [cmp.dim, cmp.by, ...cmp.sets.map(enc)].join('~');
}
function cmpFromUrl(v) {
  if (!v) return;
  const [dim, by, ...sets] = v.split('~');
  if (!CMP_DIMS.includes(dim)) return;
  cmp.dim = dim; cmp.by = by || 'course';
  cmp.sets = sets.slice(0, 4).map((s) => (dim === 'period' ? { from: s.split('..')[0], to: s.split('..')[1], values: [] } : { values: s ? s.split('|').map(decodeURIComponent) : [] }));
}

function renderCompare() {
  const el = $('#tab-compare');
  destroyCharts();
  if (!cmp.sets.length) cmp.sets = cmpDefaults();
  state.cmp = cmpToUrl(); syncStateToUrl();
  const base = cmpBase();
  const counts = cmpValueCounts(base);
  const per = cmp.sets.map((s) => cmpRows(base, s));
  const ready = per.filter((r) => r.length).length >= 2 || (cmp.sets.filter((s) => (cmp.dim === 'period' ? s.from && s.to : s.values.length)).length >= 2);
  const mets = cmp.sets.map((s, i) => cmpMetrics(per[i], s));
  const byOpts = CMP_DIMS.filter((d) => d !== 'period' && d !== cmp.dim);
  if (!byOpts.includes(cmp.by)) cmp.by = byOpts[0];

  const setCard = (s, i) => `<div class="cmp-set" style="--c:var(${CMP_COLORS[i]})" data-i="${i}">
    <div class="cmp-set-h"><span class="cmp-letter">${CMP_LETTERS[i]}</span><b>${esc(cmpSetLabel(s, i))}</b><span class="muted">${fmtInt(per[i].length)}</span>
      ${cmp.sets.length > 2 ? `<button class="icon-btn cmp-x" data-rm="${i}" title="${esc(ct('removeSet'))}">${icon('x')}</button>` : ''}</div>
    ${cmp.dim === 'period'
    ? `<div class="cmp-dates"><label><span>${esc(ct('from'))}</span><input type="date" data-from="${i}" value="${esc(s.from || '')}"></label><label><span>${esc(ct('to'))}</span><input type="date" data-to="${i}" value="${esc(s.to || '')}"></label></div>`
    : `<div class="cmp-chips">${s.values.map((v) => `<span class="cmp-chip">${esc(cmpLabel(cmp.dim, v))}<button data-unpick="${i}" data-v="${esc(v)}">×</button></span>`).join('')}
        <button class="cmp-addv" data-open="${i}">${icon('plus')}${esc(ct('add'))}</button></div>
      ${cmp.open === i ? `<div class="cmp-picker"><input type="search" id="cmp-q" placeholder="${esc(ct('searchValues'))}" value="${esc(cmp.q)}">
        <div class="cmp-list">${(() => { const q = cmp.q.toLowerCase(); const list = counts.filter(([v]) => !q || cmpLabel(cmp.dim, v).toLowerCase().includes(q)).slice(0, 150); return list.length ? list.map(([v, n]) => `<label class="cmp-opt"><input type="checkbox" data-pick="${i}" value="${esc(v)}" ${s.values.includes(v) ? 'checked' : ''}><span>${esc(cmpLabel(cmp.dim, v))}</span><em>${fmtInt(n)}</em></label>`).join('') : `<div class="muted cmp-none">${esc(ct('noValues'))}</div>`; })()}</div></div>` : ''}`}
  </div>`;

  // Scorecard: best value per metric in bold, delta vs set A.
  const score = () => `<div class="tablewrap"><table class="cmp-table"><thead><tr><th>${esc(ct('metric'))}</th>${cmp.sets.map((s, i) => `<th class="num"><span class="cmp-dot" style="background:var(${CMP_COLORS[i]})"></span>${esc(CMP_LETTERS[i])} · ${esc(cmpSetLabel(s, i))}</th>`).join('')}</tr></thead><tbody>
    ${CMP_METRICS.map(([k, kind, hib]) => {
    const vals = mets.map((m) => m[k]);
    const valid = vals.filter((v) => v != null);
    const bestV = hib == null || valid.length < 2 ? null : (hib ? Math.max(...valid) : Math.min(...valid));
    return `<tr><td>${esc(ct('m_' + k))}</td>${vals.map((v, i) => {
      let d = '';
      if (i > 0 && v != null && vals[0] != null) {
        const diff = kind === 'pct' ? v - vals[0] : vals[0] ? ((v - vals[0]) / vals[0]) * 100 : null;
        if (diff != null && isFinite(diff) && Math.abs(diff) >= 0.05) { const good = hib == null ? null : (hib ? diff > 0 : diff < 0); d = `<span class="delta ${good == null ? 'flat' : good ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}${kind === 'pct' ? 'pp' : '%'}</span>`; }
      }
      return `<td class="num ${bestV != null && v === bestV ? 'cmp-best' : ''}">${cmpFmt(v, kind)} ${d}</td>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;

  // Outcome mix: one 100% bar per set.
  const mix = () => `<div class="cmp-mix">${cmp.sets.map((s, i) => { const st = stats(per[i]); const seg = (n, v) => (st.total ? `<i style="width:${(n / st.total * 100).toFixed(2)}%;background:var(${v})" title="${esc(fmtInt(n))}"></i>` : ''); return `<div class="cmp-mix-row"><span class="cmp-letter" style="--c:var(${CMP_COLORS[i]})">${CMP_LETTERS[i]}</span><div class="track">${seg(st.won, '--s-won')}${seg(st.active, '--s-active')}${seg(st.lostc, '--s-lostc')}${seg(st.lostu, '--s-lostu')}</div><span class="num">${st.winRate == null ? '—' : st.winRate.toFixed(1) + '%'}</span></div>`; }).join('')}
    <div class="legend">${BUCKETS.map((b) => `<span><i style="background:var(${BUCKET_VAR[b]})"></i>${esc(t('b_' + b))}</span>`).join('')}</div></div>`;

  // Breakdown by a second dimension: share of each set's leads + win rate.
  const breakdown = () => {
    const keys = new Map();
    per.forEach((rows) => rows.forEach((r) => cmpVals(r, cmp.by).forEach((v) => keys.set(v, (keys.get(v) || 0) + 1))));
    const top = [...keys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
    if (!top.length) return `<div class="empty">${esc(t('noData'))}</div>`;
    return `<div class="tablewrap"><table class="cmp-table"><thead><tr><th>${esc(ct('d_' + cmp.by))}</th>${cmp.sets.map((s, i) => `<th class="num"><span class="cmp-dot" style="background:var(${CMP_COLORS[i]})"></span>${CMP_LETTERS[i]} · ${esc(ct('share'))}</th><th class="num">${CMP_LETTERS[i]} · ${esc(t('k_winRate'))}</th>`).join('')}</tr></thead><tbody>
      ${top.map((k) => `<tr><td class="truncate" title="${esc(k)}">${esc(cmpLabel(cmp.by === 'admissionsScore' ? 'admissionsScore' : cmp.by, k))}</td>${per.map((rows, i) => { const sub = rows.filter((r) => cmpVals(r, cmp.by).includes(k)); const s = stats(sub); const share = rows.length ? (100 * sub.length) / rows.length : 0; return `<td class="num"><span class="minibar"><i style="width:${Math.min(100, share)}%;background:var(${CMP_COLORS[i]})"></i></span>${fmtInt(sub.length)} · ${share.toFixed(0)}%</td><td class="num">${s.winRate == null ? '—' : s.winRate.toFixed(1) + '%'}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  };

  el.innerHTML = `
    <div class="panel cmp-head">
      <div class="cmp-controls">
        <label class="cmp-ctl"><span>${esc(ct('compareBy'))}</span><select id="cmp-dim">${CMP_DIMS.map((d) => `<option value="${d}" ${d === cmp.dim ? 'selected' : ''}>${esc(ct('d_' + d))}</option>`).join('')}</select></label>
        <div class="cmp-presets"><span class="muted">${esc(ct('presets'))}</span>${['regions', 'topCampaigns', 'topSources', 'topReps', 'months', 'weeks'].map((p) => `<button class="btn ghost sm" data-preset="${p}">${esc(ct('p_' + p))}</button>`).join('')}</div>
      </div>
      <p class="muted cmp-note">${esc(cmp.dim === 'period' ? ct('note') : ct('pickValues') + ' · ' + ct('note'))}</p>
      <div class="cmp-sets">${cmp.sets.map(setCard).join('')}${cmp.sets.length < 4 ? `<button class="cmp-addset" id="cmp-addset">${icon('plus')}${esc(ct('addSet'))}</button>` : ''}</div>
    </div>
    ${ready ? `
    <div class="panel"><div class="panel-head"><h2>${esc(ct('scorecard'))}</h2><button class="btn soft sm" id="cmp-ai">${icon('ai')}${esc(ct('askAI'))}</button></div>${score()}</div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(ct('trend'))}</h2></div><div class="chart-box sm"><canvas id="c-cmp-trend"></canvas></div></div>
      <div class="panel"><div class="panel-head"><h2>${esc(ct('trendWin'))}</h2></div><div class="chart-box sm"><canvas id="c-cmp-win"></canvas></div></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(ct('mix'))}</h2></div>${mix()}</div>
    <div class="panel"><div class="panel-head"><h2>${esc(ct('breakdown'))}</h2><label class="cmp-ctl inline"><span>${esc(ct('breakdownBy'))}</span><select id="cmp-by">${byOpts.map((d) => `<option value="${d}" ${d === cmp.by ? 'selected' : ''}>${esc(ct('d_' + d))}</option>`).join('')}</select></label></div>${breakdown()}</div>`
    : `<div class="panel state-card">${icon('regions')}<p>${esc(ct('emptySets'))}</p></div>`}`;

  // ---- wiring ----
  $('#cmp-dim', el).addEventListener('change', (e) => { cmp.dim = e.target.value; cmp.open = null; cmp.q = ''; cmp.sets = cmpDefaults(); renderCompare(); });
  $$('[data-preset]', el).forEach((b) => b.addEventListener('click', () => cmpPreset(b.dataset.preset)));
  $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { cmp.sets.splice(Number(b.dataset.rm), 1); cmp.open = null; renderCompare(); }));
  if ($('#cmp-addset', el)) $('#cmp-addset', el).addEventListener('click', () => { cmp.sets.push(cmp.dim === 'period' ? { from: '', to: '', values: [] } : { values: [] }); cmp.open = cmp.dim === 'period' ? null : cmp.sets.length - 1; renderCompare(); });
  $$('[data-open]', el).forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.open); cmp.open = cmp.open === i ? null : i; cmp.q = ''; renderCompare(); }));
  $$('[data-unpick]', el).forEach((b) => b.addEventListener('click', () => { const s = cmp.sets[Number(b.dataset.unpick)]; s.values = s.values.filter((v) => v !== b.dataset.v); renderCompare(); }));
  $$('[data-pick]', el).forEach((c) => c.addEventListener('change', () => { const s = cmp.sets[Number(c.dataset.pick)]; s.values = c.checked ? [...s.values, c.value] : s.values.filter((v) => v !== c.value); renderCompare(); }));
  const q = $('#cmp-q', el);
  if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); q.addEventListener('input', () => { cmp.q = q.value; renderCompare(); }); }
  $$('[data-from],[data-to]', el).forEach((x) => x.addEventListener('change', () => { const i = Number(x.dataset.from ?? x.dataset.to); cmp.sets[i][x.dataset.from != null ? 'from' : 'to'] = x.value; renderCompare(); }));
  if ($('#cmp-by', el)) $('#cmp-by', el).addEventListener('change', (e) => { cmp.by = e.target.value; renderCompare(); });
  if ($('#cmp-ai', el)) $('#cmp-ai', el).addEventListener('click', () => {
    const lines = CMP_METRICS.map(([k, kind]) => `${ct('m_' + k)}: ${mets.map((m, i) => `${CMP_LETTERS[i]}=${cmpFmt(m[k], kind)}`).join(', ')}`).join('\n');
    const question = `${ct('aiQ', { dim: ct('d_' + cmp.dim), sets: cmp.sets.map((s, i) => `${CMP_LETTERS[i]} = ${cmp.dim === 'period' ? cmpSetLabel(s, i) : s.values.join(' + ')}`).join('; ') })}\n\n${lines}`;
    if (window.askAIPrefill) window.askAIPrefill(question); else { state.view = 'ai'; buildNav(); renderAll(); }
  });
  if (!ready) return;

  // ---- charts: per-set series on one time axis ----
  const all = per.flat();
  const g = cmp.dim === 'period' ? 'idx' : resolveGran(all);
  const cb = chartBase();
  let labels; let seriesFor;
  if (cmp.dim === 'period') {
    // Periods have different dates: align them as day 1, day 2, … of each range.
    const len = Math.max(...cmp.sets.map((s) => (s.from && s.to ? daysBetween(s.from, s.to) + 1 : 0)), 1);
    labels = [...Array(Math.min(len, 400))].map((_, i) => `${LANG === 'es' ? 'Día' : 'Day'} ${i + 1}`);
    seriesFor = (rows, s, fn) => labels.map((_, i) => { const d = s.from ? addDays(s.from, i) : null; if (!d || (s.to && d > s.to)) return null; return fn(rows.filter((r) => r.date === d)); });
  } else {
    const keys = periodKeys(all, g);
    labels = keys.map((k) => periodLabel(k, g));
    seriesFor = (rows, s, fn) => keys.map((k) => fn(rows.filter((r) => periodKey(r, g) === k)));
  }
  const ds = (fn) => cmp.sets.map((s, i) => ({ label: `${CMP_LETTERS[i]} · ${cmpSetLabel(s, i)}`, data: seriesFor(per[i], s, fn), borderColor: cssVar(CMP_COLORS[i]), backgroundColor: cssVar(CMP_COLORS[i]), borderWidth: 2, pointRadius: labels.length > 40 ? 0 : 2.5, pointHoverRadius: 5, tension: .3, spanGaps: true }));
  const legendOn = { ...cb.plugins, legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } } };
  charts.cmpTrend = new Chart($('#c-cmp-trend'), { type: 'line', data: { labels, datasets: ds((rows) => rows.length) }, options: { ...cb, plugins: legendOn } });
  charts.cmpWin = new Chart($('#c-cmp-win'), {
    type: 'line', data: { labels, datasets: ds((rows) => (rows.length ? stats(rows).winRate : null)) },
    options: { ...cb, scales: { x: cb.scales.x, y: { ...cb.scales.y, ticks: { callback: (v) => v + '%' } } }, plugins: { ...legendOn, tooltip: { ...cb.plugins.tooltip, callbacks: { label: (i) => `${i.dataset.label}: ${i.parsed.y == null ? '—' : i.parsed.y.toFixed(1) + '%'}` } } } },
  });
}

document.addEventListener('mousedown', (e) => { if (cmp.open != null && !e.target.closest('.cmp-set')) { cmp.open = null; cmp.q = ''; if (state.view === 'compare') renderCompare(); } });
window.renderCompare = renderCompare;
window.cmpFromUrl = cmpFromUrl;
