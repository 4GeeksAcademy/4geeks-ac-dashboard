'use strict';
/* Intelligence → Marketing tab. Which sources and campaigns bring leads that
   become students, what they cost, and what changed vs the previous period.
   Same filters as the rest of the page; numbers come from
   POST /api/marketing/intel (lib/marketing/intel.js), advice from Claude.
   Loaded after pipeline.js; uses dashboard.js helpers at call time. */

(function addMarketingStrings() {
  const en = {
    mk_title: 'Marketing intelligence', mk_sub: 'Which sources and campaigns bring leads that become students, and what they cost, compared with the previous period of the same length.',
    mk_by: 'Group by', mk_source: 'Source', mk_campaign: 'Campaign', mk_medium: 'Medium',
    mk_leads: 'Leads', mk_qualified: 'Qualified', mk_qualifiedSub: 'scored Good or Very Good by admissions', mk_junk: 'Junk', mk_junkSub: 'invalid, fake or duplicate', mk_enrolled: 'Enrolled', mk_enrolledSub: 'matched to the Enrollments section; recent leads may still enroll',
    mk_cpq: 'Cost per qualified lead', mk_cpe: 'Cost per enrollment', mk_spendSub: '{s} spent (4Geeks Center)', mk_noSpend: 'Pick a date range in the filters to bring in spend from 4Geeks Center',
    mk_vsPrev: 'previous period: {n}', mk_noPrev: 'Pick a date range to compare with the previous period',
    mk_change: 'Change', mk_qRate: 'Qualified', mk_jRate: 'Junk', mk_eRate: 'Enrolled %', mk_spend: 'Spend', mk_cpeCol: 'Cost / enrollment',
    mk_movers: 'Biggest changes vs the previous period', mk_quality: 'quality {d} pts',
    mk_aiTitle: 'What to change this week', mk_aiRun: 'Analyze with AI', mk_aiRunning: 'Claude is reading the numbers…', mk_aiNone: 'Press "Analyze with AI" for 3–5 concrete changes based on these numbers.', mk_aiAt: 'Written {d} by {u} for {p}',
    mk_match: '{m} campaigns matched 4Geeks Center spend by name ({c} campaigns in Center).', mk_loading: 'Loading the numbers…', mk_new: 'new', mk_gone: 'gone',
  };
  const es = {
    mk_title: 'Inteligencia de marketing', mk_sub: 'Qué fuentes y campañas traen leads que se convierten en estudiantes, y cuánto cuestan, comparado con el periodo anterior de la misma duración.',
    mk_by: 'Agrupar por', mk_source: 'Fuente', mk_campaign: 'Campaña', mk_medium: 'Medio',
    mk_leads: 'Leads', mk_qualified: 'Calificados', mk_qualifiedSub: 'con score Good o Very Good de admisiones', mk_junk: 'Basura', mk_junkSub: 'inválidos, falsos o duplicados', mk_enrolled: 'Matriculados', mk_enrolledSub: 'cruzados con la sección Matrículas; los leads recientes aún pueden matricularse',
    mk_cpq: 'Coste por lead calificado', mk_cpe: 'Coste por matrícula', mk_spendSub: '{s} invertidos (4Geeks Center)', mk_noSpend: 'Elige un rango de fechas en los filtros para traer la inversión de 4Geeks Center',
    mk_vsPrev: 'periodo anterior: {n}', mk_noPrev: 'Elige un rango de fechas para comparar con el periodo anterior',
    mk_change: 'Cambio', mk_qRate: 'Calificados', mk_jRate: 'Basura', mk_eRate: '% matriculados', mk_spend: 'Inversión', mk_cpeCol: 'Coste / matrícula',
    mk_movers: 'Mayores cambios vs el periodo anterior', mk_quality: 'calidad {d} pts',
    mk_aiTitle: 'Qué cambiar esta semana', mk_aiRun: 'Analizar con IA', mk_aiRunning: 'Claude está leyendo los números…', mk_aiNone: 'Pulsa "Analizar con IA" para 3–5 cambios concretos basados en estos números.', mk_aiAt: 'Escrito {d} por {u} para {p}',
    mk_match: '{m} campañas cruzadas con la inversión de 4Geeks Center por nombre ({c} campañas en Center).', mk_loading: 'Cargando los números…', mk_new: 'nueva', mk_gone: 'desapareció',
  };
  window.I18N.en = { ...window.I18N.en, ...en };
  window.I18N.es = { ...window.I18N.es, ...es };
})();

const MK = { dim: (() => { try { return localStorage.getItem('mkDim') || 'source'; } catch (e) { return 'source'; } })(), cache: new Map(), advice: {} };

const mkPct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
function mkDelta(cur, prev) {
  if (!prev && !cur) return '';
  if (!prev) return `<span class="mk-d up">${esc(t('mk_new'))}</span>`;
  if (!cur) return `<span class="mk-d down">${esc(t('mk_gone'))}</span>`;
  const d = (cur - prev) / prev;
  return `<span class="mk-d ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${Math.round(d * 100)}%</span>`;
}

async function mkCenter() {
  if (!state.dateFrom || !state.dateTo || typeof fetchAds !== 'function') return null;
  const region = state.region !== 'all' ? REGION_TO_CENTER[state.region] : 'US';
  try {
    const r = await fetchAds(region, state.dateFrom, state.dateTo, 'close');
    if (!r.ok || !r.data) return null;
    const d = r.data;
    return { currency: d.currency || 'USD', summary: { spend: d.summary && d.summary.spend }, campaigns: (d.campaigns || []).map((c) => ({ name: c.campaign || c.name, spend: c.spend, leads: c.leads })).filter((c) => c.name) };
  } catch (e) { return null; }
}

async function renderMarketingIntel(el) {
  const rows = ALL.filter((r) => match(r));
  const prev = (typeof previousRows === 'function' && previousRows()) || null;
  const key = `${rowsKey(rows)}|${prev ? rowsKey(prev) : '-'}|${MK.dim}|${state.dateFrom}|${state.dateTo}`;
  const draw = (data) => {
    el.innerHTML = `${mkHtml(data, rows, prev)}<div id="attr-root"></div>`;
    bindMk(el, data);
    if (window.renderAttribution) window.renderAttribution($('#attr-root', el), rows);
  };
  if (MK.cache.has(key)) return draw(MK.cache.get(key));
  el.innerHTML = `<div class="panel"><p class="muted">${esc(t('mk_loading'))}</p><div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:80%"></div></div>`;
  const center = await mkCenter();
  const res = await api('/api/marketing/intel', { method: 'POST', body: { region: state.region, dim: MK.dim, ids: rows.map((r) => String(r.id)), prevIds: prev ? prev.map((r) => String(r.id)) : null, center } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(data.error || 'Error')}</p></div>`; return; }
  data.currency = center ? center.currency : null;
  MK.cache.set(key, data);
  if (!MK.advice[`${state.region}:${MK.dim}`]) {
    try { const a = await (await api(`/api/marketing/advice?region=${encodeURIComponent(state.region)}&dim=${MK.dim}`)).json(); if (a && a.text) MK.advice[`${state.region}:${MK.dim}`] = a; } catch (e) { /* none yet */ }
  }
  draw(data);
}

function mkHtml(d, rows, prev) {
  const T = d.totals || {};
  const cur = d.currency || T.currency || 'USD';
  const kpi = (cls, label, val, sub) => `<div class="kpi ${cls}"><div class="k-lbl">${esc(label)}</div><div class="k-val">${val}</div><div class="k-sub">${sub}</div></div>`;
  const prevTxt = (n) => (prev ? esc(t('mk_vsPrev', { n: fmtInt(n) })) : esc(t('mk_noPrev')));
  const adv = MK.advice[`${state.region}:${d.dim}`];
  const dimLabel = { source: t('mk_source'), campaign: t('mk_campaign'), medium: t('mk_medium') }[d.dim];
  return `<div class="panel mk-panel">
    <div class="panel-head"><div><h2>${icon('ads')} ${esc(t('mk_title'))}</h2><div class="panel-sub">${esc(t('mk_sub'))} · <strong>${esc(t('pi_scope', { n: fmtInt(rows.length) }))}</strong></div></div>
      <div class="seg" id="mk-dim"><span class="mk-by">${esc(t('mk_by'))}</span>${['source', 'campaign', 'medium'].map((k) => `<button data-d="${k}" class="${d.dim === k ? 'active' : ''}">${esc(t('mk_' + k))}</button>`).join('')}</div></div>
    <div class="kpis k8" style="margin-bottom:14px">
      ${kpi('', t('mk_leads'), `${fmtInt(T.leads)} ${prev ? mkDelta(T.leads, T.prevLeads) : ''}`, prevTxt(T.prevLeads))}
      ${kpi('hl-blue', t('mk_qualified'), `${fmtInt(T.qualified)} <span class="pi-vs">${mkPct(T.leads ? T.qualified / T.leads : null)}</span>`, `${esc(t('mk_qualifiedSub'))} · ${prevTxt(T.prevQualified)}`)}
      ${kpi(T.leads && T.junk / T.leads > 0.15 ? 'hl-bad' : '', t('mk_junk'), `${fmtInt(T.junk)} <span class="pi-vs">${mkPct(T.leads ? T.junk / T.leads : null)}</span>`, esc(t('mk_junkSub')))}
      ${kpi('', t('mk_enrolled'), `${fmtInt(T.enrolled)} ${prev ? mkDelta(T.enrolled, T.prevEnrolled) : ''}`, `${esc(t('mk_enrolledSub'))} · ${prevTxt(T.prevEnrolled)}`)}
      ${kpi('', t('mk_cpq'), T.costPerQualified != null ? fmtMoney(T.costPerQualified, cur) : '—', T.spend != null ? esc(t('mk_spendSub', { s: fmtMoney(T.spend, cur) })) : esc(t('mk_noSpend')))}
      ${kpi('', t('mk_cpe'), T.costPerEnrollment != null ? fmtMoney(T.costPerEnrollment, cur) : '—', T.spend != null ? esc(t('mk_spendSub', { s: fmtMoney(T.spend, cur) })) : esc(t('mk_noSpend')))}
    </div>
    <div class="mk-ai panel-inset">
      <div class="mk-ai-head"><h3>${icon('sparkle')} ${esc(t('mk_aiTitle'))}</h3><button class="btn soft sm" id="mk-ai-run">${icon('sparkle')}${esc(t('mk_aiRun'))}</button></div>
      <div id="mk-ai-body">${adv ? `<div class="mk-ai-text">${mkRich(adv.text)}</div><div class="muted mk-ai-meta">${esc(t('mk_aiAt', { d: new Date(adv.at).toLocaleString(), u: adv.user || '—', p: adv.period || '—' }))}</div>` : `<p class="muted">${esc(t('mk_aiNone'))}</p>`}</div>
    </div>
    ${(d.movers || []).length && prev ? `<h3>${esc(t('mk_movers'))}</h3><div class="mk-movers">${d.movers.map((m) => `<div class="mk-mover"><strong>${esc(m.key)}</strong><span>${fmtInt(m.prevLeads)} → ${fmtInt(m.leads)} ${mkDelta(m.leads, m.prevLeads)}</span>${m.qualityShift != null && Math.abs(m.qualityShift) >= 0.05 ? `<span class="muted">${esc(t('mk_quality', { d: `${m.qualityShift > 0 ? '+' : ''}${Math.round(m.qualityShift * 100)}` }))}</span>` : ''}</div>`).join('')}</div>` : ''}
    <div class="table-wrap"><table class="pi-table mk-table"><thead><tr><th>${esc(dimLabel)}</th><th class="num">${esc(t('mk_leads'))}</th><th class="num">${esc(t('mk_change'))}</th><th class="num">${esc(t('mk_qRate'))}</th><th class="num">${esc(t('mk_jRate'))}</th><th class="num">${esc(t('mk_enrolled'))}</th><th class="num">${esc(t('mk_eRate'))}</th>${d.dim === 'campaign' ? `<th class="num">${esc(t('mk_spend'))}</th><th class="num">${esc(t('mk_cpeCol'))}</th>` : ''}</tr></thead>
      <tbody>${d.rows.map((r) => `<tr><td class="truncate" title="${esc(r.key)}">${esc(r.key)}</td><td class="num">${fmtInt(r.leads)}</td><td class="num">${prev ? mkDelta(r.leads, r.prevLeads) : '—'}</td>
        <td class="num ${r.qualifiedRate != null && r.qualifiedRate >= 0.35 ? 'ok' : ''}">${mkPct(r.qualifiedRate)}</td><td class="num ${r.junkRate != null && r.junkRate > 0.2 ? 'bad' : ''}">${mkPct(r.junkRate)}</td>
        <td class="num"><strong>${fmtInt(r.enrolled)}</strong></td><td class="num">${mkPct(r.enrollRate)}</td>
        ${d.dim === 'campaign' ? `<td class="num" title="${esc((r.matchedCampaigns || []).join(', '))}">${r.spend != null ? fmtMoney(r.spend, cur) : '—'}</td><td class="num">${r.costPerEnrollment != null ? fmtMoney(r.costPerEnrollment, cur) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    ${d.dim === 'campaign' && d.centerCampaigns ? `<p class="muted mk-foot">${esc(t('mk_match', { m: fmtInt(d.campaignsMatched), c: fmtInt(d.centerCampaigns) }))}</p>` : ''}
  </div>`;
}

const mkRich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split(/\n{1,}/).filter((x) => x.trim()).map((p) => `<p>${p}</p>`).join('');

function bindMk(el, d) {
  $$('#mk-dim button', el).forEach((b) => b.addEventListener('click', () => {
    MK.dim = b.dataset.d; try { localStorage.setItem('mkDim', MK.dim); } catch (e) { /* private mode */ }
    renderMarketingIntel(el);
  }));
  const run = $('#mk-ai-run', el);
  if (run) run.addEventListener('click', async () => {
    const body = $('#mk-ai-body', el);
    run.disabled = true; body.innerHTML = `<p class="ps-busy"><span class="spinner"></span>${esc(t('mk_aiRunning'))}</p>`;
    try {
      const res = await api('/api/marketing/advice', { method: 'POST', body: { region: state.region, period: dateLabel(), lang: LANG, report: { dim: d.dim, totals: d.totals, rows: d.rows.slice(0, 25) } } });
      const a = await res.json();
      if (!res.ok) throw new Error(a.error || 'Error');
      MK.advice[`${state.region}:${d.dim}`] = a;
      body.innerHTML = `<div class="mk-ai-text">${mkRich(a.text)}</div><div class="muted mk-ai-meta">${esc(t('mk_aiAt', { d: new Date(a.at).toLocaleString(), u: a.user || '—', p: a.period || '—' }))}</div>`;
    } catch (e) { body.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
    run.disabled = false;
  });
}

window.renderMarketingIntel = renderMarketingIntel;
