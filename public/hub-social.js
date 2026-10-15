'use strict';
/* Marketing Hub — Social organic calendar: posts calendar, pipeline, plan vs mix
   targets (+ Claude month planner), history with results, account metrics, settings.
   Data: /api/hub/posts, /api/hub/metrics, /api/hub/settings. */

const soState = { view: 'calendar', month: null, market: 'all', channel: 'all', items: [], events: [], metrics: [], aiPlan: null };
const SO_STATUS_CLASS = { idea: 'b-neutral', drafting: 'b-neutral', design: 'b-lostu', ready: 'b-other', scheduled: 'b-other', published: 'b-won', skipped: 'b-neutral' };
const soBadge = (s) => `<span class="badge ${SO_STATUS_CLASS[s] || 'b-neutral'}">${esc(hl(s))}</span>`;
const soAccounts = () => hub.meta.settings.accounts || [];
const soAccLabel = (key) => { const a = soAccounts().find((x) => x.key === key); return a ? `${a.market} · ${hl(a.channel)}${a.handle ? ' ' + a.handle : ''}` : key || '—'; };
const soPillar = (k) => { const p = hub.meta.pillars.find((x) => x.key === k); return p ? p.label : k || '—'; };
const soEng = (r = {}) => ['likes', 'comments', 'saves', 'shares'].reduce((a, k) => a + (num(r[k]) || 0), 0);

function soFiltered() {
  return soState.items.filter((p) => (soState.market === 'all' || p.market === soState.market) && (soState.channel === 'all' || p.channel === soState.channel));
}

async function renderSocial(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:220px"></div></div>';
  try {
    await hubMeta();
    const [posts, events, metrics] = await Promise.all([hubJson('/api/hub/posts'), hubJson('/api/hub/events'), hubJson('/api/hub/metrics')]);
    soState.items = posts.items; soState.events = events.items; soState.metrics = metrics.items;
    if (!soState.month) soState.month = todayStr().slice(0, 7);
    soDraw(el);
  } catch (e) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`; }
}

function soDraw(el) {
  const m = hub.meta; const rows = soFiltered(); const today = todayStr();
  const month = rows.filter((p) => monthKey(p.date || '') === soState.month && p.status !== 'skipped');
  const pub = month.filter((p) => p.status === 'published');
  const next7 = rows.filter((p) => p.date >= today && p.date <= addDaysStr(today, 6) && p.status !== 'skipped');
  const ready7 = next7.filter((p) => ['ready', 'scheduled', 'published'].includes(p.status));
  const ws = weekStart(today); const weekDays = [...Array(7)].map((_, i) => addDaysStr(ws, i));
  const empty = weekDays.filter((d) => !rows.some((p) => p.date === d && p.status !== 'skipped')).length;
  const seg = (key, opts, cur) => `<div class="seg seg-sm" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${v === cur ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  el.innerHTML = `
    ${m.storage === 'file' ? `<div class="ps-warn">${icon('alert')}<span>${esc(hs('storageFile'))}</span></div>` : ''}
    <div class="kpis hub-kpis">
      <div class="kpi hl-blue"><div class="k-lbl">${esc(hs('postsThisMonth'))} · ${esc(monthTitle(soState.month))}</div><div class="k-val">${month.length}</div><div class="k-sub">${esc(hs('publishedMonth'))}: ${pub.length}</div></div>
      <div class="kpi ${ready7.length < next7.length ? 'hl-bad' : 'hl-good'}"><div class="k-lbl">${esc(hs('readyNext7'))}</div><div class="k-val">${ready7.length}/${next7.length}</div></div>
      <div class="kpi"><div class="k-lbl">${esc(hs('gaps'))}</div><div class="k-val">${empty}</div><div class="k-sub">${esc(fmtDay(ws))} – ${esc(fmtDay(addDaysStr(ws, 6)))}</div></div>
      <div class="kpi"><div class="k-lbl">${esc(hs('views'))} · ${esc(hs('publishedMonth'))}</div><div class="k-val">${fmtN(pub.reduce((a, p) => a + (num(p.results && p.results.views) || 0), 0))}</div><div class="k-sub">${esc(hs('shares'))}: ${fmtN(pub.reduce((a, p) => a + (num(p.results && p.results.shares) || 0), 0))} · ${esc(hs('dms'))}: ${fmtN(pub.reduce((a, p) => a + (num(p.results && p.results.dms) || 0), 0))}</div></div>
    </div>
    <div class="hub-toolbar">
      ${seg('view', [['calendar', hs('calendar')], ['board', hs('board')], ['plan', hs('plan')], ['history', hs('history')], ['settings', hs('settings')]], soState.view)}
      ${seg('market', [['all', hs('all')], ...m.markets.map((x) => [x, x])], soState.market)}
      <select class="ps-select" data-sel="channel"><option value="all">${esc(hs('channel'))}: ${esc(hs('all'))}</option>${m.channels.map((c) => `<option value="${c}" ${soState.channel === c ? 'selected' : ''}>${esc(hl(c))}</option>`).join('')}</select>
      <span class="hub-spacer"></span>
      <button class="btn primary sm" id="so-new">${icon('plus')}${esc(hs('newPost'))}</button>
    </div>
    <div id="so-body"></div>`;
  $$('[data-seg]', el).forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { soState[g.dataset.seg] = b.dataset.v; soDraw(el); })));
  $('[data-sel=channel]', el).addEventListener('change', (e) => { soState.channel = e.target.value; soDraw(el); });
  $('#so-new', el).addEventListener('click', () => soEditor(el, soNewPost(today)));
  const body = $('#so-body', el);
  ({ calendar: soCalendar, board: soBoard, plan: soPlan, history: soHistory, settings: soSettings })[soState.view](el, body, rows);
}
function soNewPost(date) {
  const acc = soAccounts().find((a) => (soState.market === 'all' || a.market === soState.market) && (soState.channel === 'all' || a.channel === soState.channel)) || soAccounts()[0] || {};
  return { date, time: '12:00', account: acc.key, channel: acc.channel, market: acc.market, status: 'idea', format: 'reel', funnel: 'TOFU', pillar: 'trends_fun' };
}

function soChip(p) {
  return `<div class="hub-chip ch-${esc(p.channel || 'x')} st-${esc(p.status)}" data-post="${esc(p.id)}" title="${esc(soAccLabel(p.account) + ' · ' + (p.title || p.hook || ''))}"><i class="hub-dot"></i><b>${esc(hlFormat(p.format))}</b> ${esc(p.title || p.hook || '')}</div>`;
}
function soCalendar(el, body, rows) {
  const by = {};
  rows.filter((p) => p.date && p.status !== 'skipped').forEach((p) => { (by[p.date] = by[p.date] || []).push({ html: soChip(p), t: p.time || '' }); });
  Object.values(by).forEach((l) => l.sort((a, b) => a.t.localeCompare(b.t)));
  // Events show on the social calendar too, so promos line up with them.
  soState.events.filter((e) => e.start_at && e.status !== 'cancelled' && (soState.market === 'all' || e.market === soState.market)).forEach((e) => { const d = evDate(e); (by[d] = by[d] || []).unshift({ html: `<div class="hub-chip hub-chip-ev" title="${esc(e.title)}">${icon('calendar')} ${esc(e.title)}</div>`, t: '' }); });
  body.innerHTML = `<div class="panel">
    <div class="hub-cal-head"><button class="icon-btn" data-mo="-1">‹</button><h2>${esc(monthTitle(soState.month))}</h2><button class="icon-btn" data-mo="1">›</button><button class="btn ghost sm" data-mo="0">${esc(hs('today'))}</button>
    <span class="hub-spacer"></span><span class="hub-legend">${hub.meta.channels.slice(0, 5).map((c) => `<i class="ch-${c}"></i>${esc(hl(c))}`).join(' ')}</span></div>
    ${hubMonthGrid(soState.month, by, { onDay: true, max: 4 })}
  </div>`;
  $$('[data-mo]', body).forEach((b) => b.addEventListener('click', () => { const n = Number(b.dataset.mo); soState.month = n ? shiftMonth(soState.month, n) : todayStr().slice(0, 7); soDraw(el); }));
  $$('[data-post]', body).forEach((c) => c.addEventListener('click', (e) => { e.stopPropagation(); soEditor(el, soState.items.find((x) => x.id === c.dataset.post)); }));
  $$('[data-add]', body).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); soEditor(el, soNewPost(b.dataset.add)); }));
  $$('[data-more]', body).forEach((b) => b.addEventListener('click', () => { soState.view = 'board'; soDraw(el); }));
}

function soBoard(el, body, rows) {
  const st = hub.meta.post_statuses.filter((s) => s !== 'skipped');
  const inMonth = rows.filter((p) => monthKey(p.date || '') === soState.month || (!p.date && p.status === 'idea'));
  body.innerHTML = `<div class="hub-cal-head hub-board-head"><button class="icon-btn" data-mo="-1">‹</button><h2>${esc(monthTitle(soState.month))}</h2><button class="icon-btn" data-mo="1">›</button></div>
  <div class="hub-board">${st.map((s) => { const list = inMonth.filter((p) => p.status === s).sort((a, b) => (a.date || '').localeCompare(b.date || '')); return `<div class="hub-col"><div class="hub-col-h">${soBadge(s)}<span class="muted">${list.length}</span></div>
    ${list.map((p) => `<div class="hub-card" data-post="${esc(p.id)}"><div class="hub-card-top"><span class="hub-ch ch-${esc(p.channel)}">${esc(hl(p.channel))}</span><span class="muted">${esc(fmtDay(p.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span></div>
      <div class="hub-card-t">${esc(p.title || p.hook || '—')}</div><div class="hub-card-m">${esc([hlFormat(p.format), p.funnel, p.market].filter(Boolean).join(' · '))}</div></div>`).join('') || `<div class="muted hub-small hub-col-empty">—</div>`}
  </div>`; }).join('')}</div>`;
  $$('[data-mo]', body).forEach((b) => b.addEventListener('click', () => { soState.month = shiftMonth(soState.month, Number(b.dataset.mo)); soDraw(el); }));
  $$('[data-post]', body).forEach((c) => c.addEventListener('click', () => soEditor(el, soState.items.find((x) => x.id === c.dataset.post))));
}

function soPlan(el, body, rows) {
  const m = hub.meta; const s = m.settings;
  const month = rows.filter((p) => monthKey(p.date || '') === soState.month && p.status !== 'skipped');
  const share = (arr, key, val) => (arr.length ? (100 * arr.filter((p) => p[key] === val).length) / arr.length : 0);
  const funnelRows = m.funnel.map((f) => ({ label: f, actual: share(month, 'funnel', f), target: s.funnel_mix[f] }));
  const pillarRows = m.pillars.map((p) => ({ label: p.label, actual: share(month, 'pillar', p.key), target: s.pillar_mix[p.key] }));
  // Weekly cadence per channel (weeks that touch this month).
  const first = weekStart(soState.month + '-01'); const weeks = [];
  for (let w = first; monthKey(w) <= soState.month; w = addDaysStr(w, 7)) weeks.push(w);
  const channels = m.channels.filter((c) => (s.weekly_targets[c] || 0) > 0 || rows.some((p) => p.channel === c));
  const cad = channels.map((c) => `<tr><td><span class="hub-ch ch-${c}">${esc(hl(c))}</span></td><td class="num">${s.weekly_targets[c] || 0}</td>${weeks.map((w) => { const n = rows.filter((p) => p.channel === c && p.status !== 'skipped' && p.date >= w && p.date <= addDaysStr(w, 6)).length; const t = s.weekly_targets[c] || 0; return `<td class="num ${t && n < t ? 'hub-under' : t ? 'hub-ok' : ''}">${n}</td>`; }).join('')}</tr>`).join('');
  const accs = soAccounts().filter((a) => soState.market === 'all' || a.market === soState.market);
  body.innerHTML = `
    <div class="hub-two">
      <div class="panel"><div class="panel-head"><div><h2>${esc(hs('funnelMix'))}</h2><div class="panel-sub">${esc(hs('planMix'))} · ${month.length} posts</div></div></div>${hubBar(funnelRows)}
        <div class="hub-defs">${m.funnel.map((f) => `<div><b>${f}</b> ${esc(s.funnel_definitions[f] || '')}</div>`).join('')}</div></div>
      <div class="panel"><div class="panel-head"><div><h2>${esc(hs('pillarMix'))}</h2><div class="panel-sub">${esc(hs('planMix'))}</div></div></div>${hubBar(pillarRows)}</div>
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(hs('weeklyCadence'))}</h2></div>
      <div class="tablewrap"><table><thead><tr><th>${esc(hs('channel'))}</th><th class="num">${esc(hs('target'))}</th>${weeks.map((w) => `<th class="num">${esc(fmtDay(w))}</th>`).join('')}</tr></thead><tbody>${cad}</tbody></table></div></div>
    <div class="panel hub-ai-panel"><div class="panel-head"><div><h2>${icon('sparkle')} ${esc(hs('aiPlan'))} · ${esc(monthTitle(soState.month))}</h2><div class="panel-sub">${esc(hs('aiPlanSub'))}</div></div></div>
      ${m.ai ? `<div class="hub-acc-picks">${accs.map((a) => `<label class="hub-pick"><input type="checkbox" value="${esc(a.key)}" ${a.handle ? 'checked' : ''}>${esc(soAccLabel(a.key))}</label>`).join('')}</div>
      <label class="hub-f full"><span>${esc(hs('focus'))}</span><textarea id="so-focus" rows="2" placeholder="${esc(hs('focusPh'))}"></textarea></label>
      <div class="ps-actions"><button class="btn primary" id="so-gen">${icon('sparkle')}${esc(hs('generate'))}</button></div>
      <div id="so-ai-out"></div>` : `<p class="muted">${esc(hs('noAI'))}</p>`}
    </div>`;
  if (!m.ai) return;
  const out = $('#so-ai-out', body);
  const drawPlan = () => {
    const list = soState.aiPlan || []; if (!list.length) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="tablewrap hub-ai-table"><table><thead><tr><th><input type="checkbox" id="so-all" checked></th><th>${esc(hs('date'))}</th><th>${esc(hs('account'))}</th><th>${esc(hs('format'))}</th><th>${esc(hs('funnel'))}</th><th>${esc(hs('pillar'))}</th><th>${esc(hs('title'))} / ${esc(hs('hook'))}</th></tr></thead><tbody>
      ${list.map((p, i) => `<tr><td><input type="checkbox" class="so-pick" data-i="${i}" checked></td><td>${esc(fmtDay(p.date, { weekday: 'short', day: 'numeric' }))} ${esc(p.time || '')}</td><td>${esc(soAccLabel(p.account))}</td><td>${esc(hlFormat(p.format))}</td><td>${esc(p.funnel || '')}</td><td>${esc(soPillar(p.pillar))}</td><td class="hub-wrap"><strong>${esc(p.title || '')}</strong><div class="muted">${esc(p.hook || '')}</div><details><summary class="muted hub-small">${esc(hs('caption'))}</summary><div class="hub-pre">${esc(p.caption || '')}\n\n${esc(p.cta || '')}\n${esc(p.hashtags || '')}</div></details></td></tr>`).join('')}
    </tbody></table></div><div class="ps-actions"><button class="btn primary" id="so-add"></button></div>`;
    const count = () => { const n = $$('.so-pick', out).filter((x) => x.checked).length; $('#so-add', out).innerHTML = `${icon('plus')}${esc(hs('addSelected', { n }))}`; $('#so-add', out).disabled = !n; };
    $('#so-all', out).addEventListener('change', (e) => { $$('.so-pick', out).forEach((x) => { x.checked = e.target.checked; }); count(); });
    $$('.so-pick', out).forEach((x) => x.addEventListener('change', count)); count();
    $('#so-add', out).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const items = $$('.so-pick', out).filter((x) => x.checked).map((x) => list[Number(x.dataset.i)]);
      try { await hubJson('/api/hub/posts', { method: 'POST', body: { items } }); soState.aiPlan = null; showToast(hs('saved')); soState.view = 'calendar'; await renderSocial(el); } catch (err) { showToast(err.message); }
    });
  };
  drawPlan();
  $('#so-gen', body).addEventListener('click', async (e) => {
    const b = e.currentTarget; const accounts = $$('.hub-acc-picks input', body).filter((x) => x.checked).map((x) => x.value);
    b.disabled = true; out.innerHTML = `<div class="ps-busy"><span class="dot loading"></span>${esc(hs('planning'))}</div>`;
    try { const r = await hubJson('/api/hub/ai/plan', { method: 'POST', body: { month: soState.month, accounts, focus: $('#so-focus', body).value, from: soState.month === todayStr().slice(0, 7) ? todayStr() : undefined } }); soState.aiPlan = r.posts; drawPlan(); } catch (err) { out.innerHTML = `<p class="hub-warn-txt">${esc(err.message)}</p>`; }
    b.disabled = false;
  });
}

function soHistory(el, body, rows) {
  const pub = rows.filter((p) => p.status === 'published').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const top = [...pub].sort((a, b) => (num(b.results && b.results.views) || 0) - (num(a.results && a.results.views) || 0)).slice(0, 5);
  const accKeys = [...new Set(soState.metrics.map((x) => x.account))].filter((k) => { const a = soAccounts().find((y) => y.key === k); return !a || soState.market === 'all' || a.market === soState.market; });
  const delta = (cur, prev) => { if (cur == null || prev == null || !prev) return ''; const d = Math.round((100 * (cur - prev)) / prev); return ` <span class="${d >= 0 ? 'hub-up' : 'hub-down'}">${d >= 0 ? '▲' : '▼'}${Math.abs(d)}%</span>`; };
  const metricsTable = (k) => { const list = soState.metrics.filter((x) => x.account === k).sort((a, b) => b.week_start.localeCompare(a.week_start)); return `<h3>${esc(soAccLabel(k))}</h3><div class="tablewrap"><table><thead><tr><th>${esc(hs('weekStart'))}</th><th class="num">${esc(hs('followers'))}</th><th class="num">${esc(hs('views'))}</th><th class="num">${esc(hs('nonFollower'))}</th><th class="num">${esc(hs('interactions'))}</th><th class="num">${esc(hs('accountsEngaged'))}</th><th class="num">${esc(hs('profileVisits'))}</th><th class="num">${esc(hs('linkTaps'))}</th><th>${esc(hs('topPost'))}</th></tr></thead><tbody>
    ${list.map((w, i) => { const p = list[i + 1] || {}; return `<tr class="clickrow" data-metric="${esc(w.id)}"><td>${esc(fmtDay(w.week_start, { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td class="num">${fmtN(w.followers)}${delta(w.followers, p.followers)}</td><td class="num">${fmtN(w.views)}${delta(w.views, p.views)}</td><td class="num">${w.non_follower_pct != null ? w.non_follower_pct + '%' : '—'}</td><td class="num">${fmtN(w.interactions)}${delta(w.interactions, p.interactions)}</td><td class="num">${fmtN(w.accounts_engaged)}</td><td class="num">${fmtN(w.profile_visits)}</td><td class="num">${fmtN(w.link_taps)}</td><td class="hub-wrap hub-small">${esc(w.top_post || '')}</td></tr>`; }).join('')}</tbody></table></div>`; };
  body.innerHTML = `
    <div class="panel"><div class="panel-head"><h2>${esc(hs('topPosts'))}</h2></div>
      ${top.length ? `<div class="hub-tops">${top.map((p) => ({ ...p, results: p.results || {} })).map((p) => `<div class="hub-top" data-post="${esc(p.id)}"><span class="hub-ch ch-${esc(p.channel)}">${esc(hl(p.channel))} · ${esc(hlFormat(p.format))}</span><div class="hub-card-t">${esc(p.title || p.hook || '')}</div><div class="hub-top-n"><b>${fmtN(num(p.results.views))}</b> ${esc(hs('views').split(' ')[0].toLowerCase())} · ${fmtN(num(p.results.shares))} ${esc(hs('shares').toLowerCase())} · ${fmtN(num(p.results.saves))} ${esc(hs('saves').toLowerCase())}</div></div>`).join('')}</div>` : `<p class="muted">${esc(hs('noPosts'))}</p>`}
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(hs('history'))} · ${pub.length}</h2></div>
      ${pub.length ? `<div class="tablewrap"><table><thead><tr><th>${esc(hs('date'))}</th><th>${esc(hs('account'))}</th><th>${esc(hs('title'))}</th><th>${esc(hs('funnel'))}</th><th class="num">${esc(hs('views'))}</th><th class="num">${esc(hs('likes'))}</th><th class="num">${esc(hs('comments'))}</th><th class="num">${esc(hs('saves'))}</th><th class="num">${esc(hs('shares'))}</th><th class="num">${esc(hs('dms'))}</th><th class="num">${esc(hs('engRate'))}</th></tr></thead><tbody>
      ${pub.map((p) => { const r = p.results || {}; return `<tr class="clickrow" data-post="${esc(p.id)}"><td>${esc(fmtDay(p.date))}</td><td>${esc(soAccLabel(p.account))}</td><td class="hub-wrap"><strong>${esc(p.title || p.hook || '—')}</strong><div class="muted">${esc([hlFormat(p.format), soPillar(p.pillar)].join(' · '))}</div></td><td>${esc(p.funnel || '')}</td><td class="num">${fmtN(num(r.views))}</td><td class="num">${fmtN(num(r.likes))}</td><td class="num">${fmtN(num(r.comments))}</td><td class="num">${fmtN(num(r.saves))}</td><td class="num">${fmtN(num(r.shares))}</td><td class="num">${fmtN(num(r.dms))}</td><td class="num">${hubPct(soEng(r), num(r.views))}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<p class="muted">${esc(hs('noPosts'))}</p>`}
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(hs('accountMetrics'))}</h2><button class="btn ghost sm" id="so-addweek">${icon('plus')}${esc(hs('addWeek'))}</button></div>
      ${accKeys.map(metricsTable).join('') || `<p class="muted">—</p>`}
    </div>`;
  $$('[data-post]', body).forEach((r) => r.addEventListener('click', () => soEditor(el, soState.items.find((x) => x.id === r.dataset.post))));
  $$('[data-metric]', body).forEach((r) => r.addEventListener('click', () => soMetricEditor(el, soState.metrics.find((x) => x.id === r.dataset.metric))));
  $('#so-addweek', body).addEventListener('click', () => soMetricEditor(el, { account: accKeys[0] || (soAccounts()[0] || {}).key, week_start: weekStart(addDaysStr(todayStr(), -7)) }));
}

function soMetricEditor(el, w) {
  const isNew = !w.id;
  const dr = hubDrawer(`<div class="dr-head"><div class="dr-titles"><h2>${esc(hs('accountMetrics'))}</h2></div><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="dr-body hub-form" id="mw-form"><div class="hub-grid">
      ${hf('account', hs('account'), w.account, { opts: soAccounts().map((a) => [a.key, soAccLabel(a.key)]), full: true })}
      ${hf('week_start', hs('weekStart'), w.week_start, { type: 'date' })}
      ${hf('followers', hs('followers'), w.followers, { type: 'number' })}
      ${hf('views', hs('views'), w.views, { type: 'number' })}
      ${hf('non_follower_pct', hs('nonFollower'), w.non_follower_pct, { type: 'number', step: '0.1' })}
      ${hf('viewers', hs('viewers'), w.viewers, { type: 'number' })}
      ${hf('interactions', hs('interactions'), w.interactions, { type: 'number' })}
      ${hf('accounts_engaged', hs('accountsEngaged'), w.accounts_engaged, { type: 'number' })}
      ${hf('profile_visits', hs('profileVisits'), w.profile_visits, { type: 'number' })}
      ${hf('link_taps', hs('linkTaps'), w.link_taps, { type: 'number' })}
      ${hf('top_post', hs('topPost'), w.top_post, { full: true, rows: 2 })}
    </div></div>
    <div class="dr-foot">${isNew ? '<span></span>' : `<button class="btn ghost sm" id="mw-del">${esc(hs('del'))}</button>`}<button class="btn primary" id="mw-save">${icon('check')}${esc(hs('save'))}</button></div>`);
  $('#mw-save', dr).addEventListener('click', async () => {
    const data = hubReadForm($('#mw-form', dr));
    try { if (isNew) await hubJson('/api/hub/metrics', { method: 'POST', body: data }); else await hubJson(`/api/hub/metrics/${w.id}`, { method: 'PATCH', body: data }); closeDrawers(); showToast(hs('saved')); await renderSocial(el); } catch (e) { showToast(e.message); }
  });
  if ($('#mw-del', dr)) $('#mw-del', dr).addEventListener('click', async () => { if (!confirm(hs('confirmDel'))) return; await hubJson(`/api/hub/metrics/${w.id}`, { method: 'DELETE' }); closeDrawers(); await renderSocial(el); });
}

function soSettings(el, body) {
  const m = hub.meta; const s = JSON.parse(JSON.stringify(m.settings));
  const accRow = (a, i) => `<div class="hub-acc-row" data-i="${i}">
    <select data-a="market">${m.markets.map((x) => `<option ${x === a.market ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <select data-a="channel">${m.channels.map((x) => `<option value="${x}" ${x === a.channel ? 'selected' : ''}>${esc(hl(x))}</option>`).join('')}</select>
    <input type="text" data-a="handle" value="${esc(a.handle || '')}" placeholder="${esc(hs('handle'))}"><input type="text" data-a="url" value="${esc(a.url || '')}" placeholder="${esc(hs('url'))}">
    <input type="hidden" data-a="key" value="${esc(a.key || '')}"><button class="icon-btn ps-del" data-rm>×</button></div>`;
  const sumOf = (o) => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);
  body.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>${esc(hs('settings'))}</h2><div class="panel-sub">${esc(hs('settingsSub'))}</div></div><button class="btn primary sm" id="st-save">${icon('check')}${esc(hs('save'))}</button></div>
    <h3>${esc(hs('accounts'))}</h3><div id="st-accs">${s.accounts.map(accRow).join('')}</div><button class="btn ghost sm" id="st-addacc">${icon('plus')}${esc(hs('addAccount'))}</button>
    <h3>${esc(hs('weeklyTargets'))}</h3><div class="hub-nums">${m.channels.map((c) => `<label class="hub-f"><span>${esc(hl(c))}</span><input type="number" min="0" data-wt="${c}" value="${s.weekly_targets[c] || 0}"></label>`).join('')}</div>
    <h3>${esc(hs('funnelMix'))} %</h3><div class="hub-nums">${m.funnel.map((f) => `<label class="hub-f"><span>${f}</span><input type="number" min="0" max="100" data-fm="${f}" value="${s.funnel_mix[f] || 0}"></label>`).join('')}</div><p class="hub-warn-txt hub-small" id="st-fmw"></p>
    <h3>${esc(hs('pillarMix'))} %</h3><div class="hub-nums">${m.pillars.map((p) => `<label class="hub-f"><span>${esc(p.label)}</span><input type="number" min="0" max="100" data-pm="${p.key}" value="${s.pillar_mix[p.key] || 0}"></label>`).join('')}</div><p class="hub-warn-txt hub-small" id="st-pmw"></p>
    <h3>${esc(hs('funnelDefs'))}</h3>${m.funnel.map((f) => `<label class="hub-f full"><span>${f}</span><textarea rows="2" data-fd="${f}">${esc(s.funnel_definitions[f] || '')}</textarea></label>`).join('')}
    <h3>${esc(hs('links'))}</h3>${Object.entries(s.links).map(([k, v]) => `<label class="hub-f full"><span>${esc(k.replace(/_/g, ' '))}</span><input type="text" data-ln="${esc(k)}" value="${esc(v)}"></label>`).join('')}
  </div>`;
  const wire = () => $$('[data-rm]', body).forEach((b) => { b.onclick = () => b.closest('.hub-acc-row').remove(); });
  wire();
  $('#st-addacc', body).addEventListener('click', () => { $('#st-accs', body).insertAdjacentHTML('beforeend', accRow({ market: 'USA', channel: 'instagram' }, Date.now())); wire(); });
  const checkMix = () => {
    const f = sumOf(Object.fromEntries($$('[data-fm]', body).map((x) => [x.dataset.fm, x.value]))); const p = sumOf(Object.fromEntries($$('[data-pm]', body).map((x) => [x.dataset.pm, x.value])));
    $('#st-fmw', body).textContent = f === 100 ? '' : hs('mixWarn', { n: f }); $('#st-pmw', body).textContent = p === 100 ? '' : hs('mixWarn', { n: p });
  };
  $$('[data-fm],[data-pm]', body).forEach((x) => x.addEventListener('input', checkMix)); checkMix();
  $('#st-save', body).addEventListener('click', async () => {
    const accounts = $$('.hub-acc-row', body).map((r) => { const a = Object.fromEntries($$('[data-a]', r).map((x) => [x.dataset.a, x.value.trim()])); if (!a.key) a.key = slug(`${a.market}-${a.channel}-${a.handle || Date.now()}`); return a; });
    const patch = {
      accounts,
      weekly_targets: Object.fromEntries($$('[data-wt]', body).map((x) => [x.dataset.wt, Number(x.value) || 0])),
      funnel_mix: Object.fromEntries($$('[data-fm]', body).map((x) => [x.dataset.fm, Number(x.value) || 0])),
      pillar_mix: Object.fromEntries($$('[data-pm]', body).map((x) => [x.dataset.pm, Number(x.value) || 0])),
      funnel_definitions: Object.fromEntries($$('[data-fd]', body).map((x) => [x.dataset.fd, x.value.trim()])),
      links: Object.fromEntries($$('[data-ln]', body).map((x) => [x.dataset.ln, x.value.trim()])),
    };
    try { hub.meta.settings = await hubJson('/api/hub/settings', { method: 'PUT', body: patch }); showToast(hs('saved')); soDraw(el); } catch (e) { showToast(e.message); }
  });
}

// ---------------- post editor ----------------
function soEditor(el, post) {
  const m = hub.meta; const p = post || {}; const r = p.results || {}; const isNew = !p.id;
  const evOpts = [['', hs('none')], ...soState.events.filter((e) => e.status !== 'cancelled').sort((a, b) => (b.start_at || '').localeCompare(a.start_at || '')).slice(0, 40).map((e) => [e.id, `${fmtDay(evDate(e))} · ${e.title}`])];
  const dr = hubDrawer(`<div class="dr-head"><div class="dr-titles"><h2>${esc(isNew ? hs('newPost') : (p.title || p.hook || hs('newPost')))}</h2>${isNew ? '' : `<div class="lead-meta">${soBadge(p.status)}<span class="hub-ch ch-${esc(p.channel)}">${esc(soAccLabel(p.account))}</span>${p.source === 'ai' ? '<span class="badge b-other plain">Claude</span>' : ''}</div>`}</div><button class="icon-btn" data-close>${icon('x')}</button></div>
  <div class="dr-body hub-form" id="so-form">
    <div class="hub-grid">
      ${hf('date', hs('date'), p.date, { type: 'date' })}
      ${hf('time', hs('time'), p.time, { type: 'time' })}
      ${hf('account', hs('account'), p.account, { opts: soAccounts().map((a) => [a.key, soAccLabel(a.key)]), full: true })}
      ${hf('format', hs('format'), p.format, { opts: m.formats.map((f) => [f, hlFormat(f)]) })}
      ${hf('status', hs('status'), p.status, { opts: m.post_statuses.map((s) => [s, hl(s)]) })}
      ${hf('funnel', hs('funnel'), p.funnel, { opts: m.funnel })}
      ${hf('pillar', hs('pillar'), p.pillar, { opts: m.pillars.map((x) => [x.key, x.label]) })}
      ${hf('program', hs('program'), p.program, { opts: [['', hs('none')], ...m.programs.map((x) => [x, x])] })}
      ${hf('owner', hs('owner'), p.owner || (window.__me && window.__me.name) || '')}
      ${hf('title', hs('title'), p.title, { full: true })}
      ${hf('hook', hs('hook'), p.hook, { full: true, rows: 2 })}
      ${hf('caption', hs('caption'), p.caption, { full: true, rows: 7 })}
      ${hf('cta', hs('cta'), p.cta, { full: true })}
      ${hf('hashtags', hs('hashtags'), p.hashtags, { full: true })}
      ${hf('link', hs('link'), p.link, { full: true })}
      ${hf('asset_url', hs('asset'), p.asset_url, { full: true })}
      ${hf('asset_notes', hs('assetNotes'), p.asset_notes, { full: true, rows: 2 })}
      ${hf('event_id', hs('event'), p.event_id, { opts: evOpts, full: true })}
    </div>
    <div id="so-utm"></div>
    ${m.ai ? `<div class="hub-actions-col"><button class="btn soft sm" id="so-ai">${icon('sparkle')}${esc(hs('writeCopy'))}</button></div><div id="so-ai-alt"></div>` : ''}
    <h3 class="hub-h3">${icon('trophy')}${esc(hs('perf'))}</h3>
    <div class="hub-grid hub-grid3">
      ${hf('post_url', hs('postUrl'), p.post_url, { full: true })}
      ${['views', 'likes', 'comments', 'saves', 'shares', 'dms', 'follows'].map((k) => hf(`results.${k}`, hs(k), r[k], { type: 'number' })).join('')}
    </div>
    ${hf('notes', hs('notes'), p.notes, { full: true, rows: 2 })}
  </div>
  <div class="dr-foot">${isNew ? '<span></span>' : `<div class="ps-actions" style="margin:0"><button class="btn ghost sm" id="so-del">${esc(hs('del'))}</button><button class="btn ghost sm" id="so-dup">${icon('plus')}Duplicate</button></div>`}<div class="ps-actions" style="margin:0"><button class="btn ghost" data-close>${esc(hs('cancel'))}</button><button class="btn primary" id="so-save">${icon('check')}${esc(hs('save'))}</button></div></div>`);

  const form = $('#so-form', dr);
  const utm = () => {
    const f = hubReadForm(form); const a = soAccounts().find((x) => x.key === f.account) || {};
    const u = hubUtm(f.link, { source: a.channel, medium: 'organic', campaign: slug(f.title || f.hook || 'post'), content: f.date });
    $('#so-utm', dr).innerHTML = f.link ? hubCopyable(hs('utm'), u) : ''; hubWireCopy($('#so-utm', dr));
  };
  $$('[data-f=link],[data-f=account],[data-f=title]', form).forEach((x) => x.addEventListener('input', utm)); utm();

  const collect = () => {
    const data = hubReadForm(form); const a = soAccounts().find((x) => x.key === data.account) || {};
    data.channel = a.channel; data.market = a.market;
    data.results = { ...(p.results || {}), ...(data.results || {}) };
    if (data.status === 'published' && !p.published_at) data.published_at = new Date().toISOString();
    return data;
  };
  $('#so-save', dr).addEventListener('click', async (e) => {
    const b = e.currentTarget; const data = collect();
    if (!data.date) { $('[data-f=date]', form).focus(); return; }
    b.disabled = true;
    try { if (isNew) await hubJson('/api/hub/posts', { method: 'POST', body: { ...p, ...data } }); else await hubJson(`/api/hub/posts/${p.id}`, { method: 'PATCH', body: data }); closeDrawers(); showToast(hs('saved')); await renderSocial(el); } catch (err) { showToast(err.message); b.disabled = false; }
  });
  if ($('#so-del', dr)) $('#so-del', dr).addEventListener('click', async () => { if (!confirm(hs('confirmDel'))) return; await hubJson(`/api/hub/posts/${p.id}`, { method: 'DELETE' }); closeDrawers(); await renderSocial(el); });
  if ($('#so-dup', dr)) $('#so-dup', dr).addEventListener('click', () => { const c = collect(); delete c.post_url; c.results = {}; c.status = 'idea'; delete c.published_at; soEditor(el, { ...c, title: (c.title || '') + ' (copy)' }); });
  if ($('#so-ai', dr)) $('#so-ai', dr).addEventListener('click', async (e) => {
    const b = e.currentTarget; const alt = $('#so-ai-alt', dr); b.disabled = true; alt.innerHTML = `<div class="ps-busy"><span class="dot loading"></span>${esc(hs('working'))}</div>`;
    try {
      const c = await hubJson('/api/hub/ai/copy', { method: 'POST', body: { type: 'post', item: collect() } });
      ['hook', 'caption', 'cta', 'hashtags', 'asset_notes'].forEach((k) => { if (c[k]) $(`[data-f=${k}]`, form).value = c[k]; });
      alt.innerHTML = (c.alternatives || []).length ? `<p class="muted hub-small">${esc(hs('alternatives'))}</p>${c.alternatives.map((h) => hubCopyable('hook', h)).join('')}` : '';
      hubWireCopy(alt);
    } catch (err) { alt.innerHTML = `<p class="hub-warn-txt">${esc(err.message)}</p>`; }
    b.disabled = false;
  });
}

window.renderSocial = renderSocial;
