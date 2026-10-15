'use strict';
/* Marketing Hub — Workshops & Events: tracker, calendar, planner (promo checklist),
   Luma + 4Geeks links, results. Data: /api/hub/events. */

const evState = { view: 'calendar', month: null, market: 'all', status: 'all', items: [] };
const EV_STATUS_CLASS = { idea: 'b-neutral', planned: 'b-other', promoting: 'b-lostu', live: 'b-lostc', done: 'b-won', cancelled: 'b-neutral' };
const evBadge = (s) => `<span class="badge ${EV_STATUS_CLASS[s] || 'b-neutral'}">${esc(hl(s))}</span>`;

function evFiltered() {
  return evState.items.filter((e) => (evState.market === 'all' || e.market === evState.market) && (evState.status === 'all' || e.status === evState.status));
}
// Promo checklist progress for one event: done / total, overdue count.
function evProgress(e) {
  const list = hub.meta.event_checklist; const d = evDate(e); const today = todayStr();
  let done = 0; let overdue = 0;
  list.forEach((c) => { const ok = e.checklist && e.checklist[c.key]; if (ok) done++; else if (d && addDaysStr(d, c.offset) < today && e.status !== 'cancelled') overdue++; });
  return { done, total: list.length, overdue };
}
function evProgressHtml(e) {
  const p = evProgress(e);
  return `<span class="minibar"><i style="width:${(100 * p.done) / p.total}%;${p.overdue ? 'background:var(--warn)' : ''}"></i></span>${p.done}/${p.total}${p.overdue ? ` <span class="hub-warn-txt">· ${p.overdue} ${esc(hs('overdue'))}</span>` : ''}`;
}

async function renderEvents(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:220px"></div></div>';
  try {
    await hubMeta();
    evState.items = (await hubJson('/api/hub/events')).items;
    if (!evState.month) evState.month = todayStr().slice(0, 7);
    evDraw(el);
  } catch (e) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`; }
}

function evDraw(el) {
  const m = hub.meta; const rows = evFiltered(); const today = todayStr();
  const in30 = rows.filter((e) => { const d = evDate(e); return d && d >= today && d <= addDaysStr(today, 30) && e.status !== 'cancelled'; });
  const month = rows.filter((e) => evDate(e) && monthKey(evDate(e)) === evState.month && e.status !== 'cancelled');
  const past90 = rows.filter((e) => { const d = evDate(e); return d && d < today && d >= addDaysStr(today, -90) && e.status !== 'cancelled'; });
  const sum = (arr, k) => arr.reduce((a, e) => a + (num(e.results && e.results[k]) || 0), 0);
  const reg = sum(past90, 'registrations'); const att = sum(past90, 'attendees');
  const seg = (key, opts, cur) => `<div class="seg seg-sm" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${v === cur ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  el.innerHTML = `
    ${m.storage === 'file' ? `<div class="ps-warn">${icon('alert')}<span>${esc(hs('storageFile'))}</span></div>` : ''}
    <div class="kpis hub-kpis">
      <div class="kpi hl-blue"><div class="k-lbl">${icon('calendar')}${esc(hs('upcoming'))}</div><div class="k-val">${in30.length}</div><div class="k-sub">${esc(in30.slice(0, 2).map((e) => e.title).join(' · ') || '—')}</div></div>
      <div class="kpi"><div class="k-lbl">${esc(hs('thisMonth'))} · ${esc(monthTitle(evState.month))}</div><div class="k-val">${month.length}</div></div>
      <div class="kpi"><div class="k-lbl">${esc(hs('registrations'))} · 90d</div><div class="k-val">${fmtN(reg)}</div><div class="k-sub">${esc(hs('attendees'))}: ${fmtN(att)} · ${esc(hs('showRate'))} ${hubPct(att, reg)}</div></div>
      <div class="kpi"><div class="k-lbl">${esc(hs('leads'))} · 90d</div><div class="k-val">${fmtN(sum(past90, 'leads'))}</div><div class="k-sub">${esc(hs('regToLead'))}: ${hubPct(sum(past90, 'leads'), att)}</div></div>
      <div class="kpi hl-good"><div class="k-lbl">${esc(hs('enrollments'))} · 90d</div><div class="k-val">${fmtN(sum(past90, 'enrollments'))}</div><div class="k-sub">${esc(hs('eventsDone'))}: ${past90.length}</div></div>
    </div>
    <div class="hub-toolbar">
      ${seg('view', [['calendar', hs('calendar')], ['list', hs('list')], ['results', hs('results')]], evState.view)}
      ${seg('market', [['all', hs('all')], ...m.markets.map((x) => [x, x])], evState.market)}
      <select class="ps-select" data-sel="status"><option value="all">${esc(hs('status'))}: ${esc(hs('all'))}</option>${m.event_statuses.map((s) => `<option value="${s}" ${evState.status === s ? 'selected' : ''}>${esc(hl(s))}</option>`).join('')}</select>
      <span class="hub-spacer"></span>
      ${m.luma.api ? `<button class="btn ghost sm" id="ev-import">${icon('refresh')}${esc(hs('importLuma'))}</button>` : ''}
      <button class="btn ghost sm" id="ev-luma">${icon('link')}${esc(hs('fromLuma'))}</button>
      <button class="btn primary sm" id="ev-new">${icon('plus')}${esc(hs('newEvent'))}</button>
    </div>
    <div id="ev-body"></div>`;
  $$('[data-seg]', el).forEach((g) => $$('button', g).forEach((b) => b.addEventListener('click', () => { evState[g.dataset.seg] = b.dataset.v; evDraw(el); })));
  $('[data-sel=status]', el).addEventListener('change', (e) => { evState.status = e.target.value; evDraw(el); });
  $('#ev-new', el).addEventListener('click', () => evEditor(el, { status: 'planned', market: evState.market !== 'all' ? evState.market : 'USA', type: 'workshop', format: 'online' }));
  $('#ev-luma', el).addEventListener('click', () => evLumaPrompt(el));
  if ($('#ev-import', el)) $('#ev-import', el).addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const r = await hubJson('/api/hub/luma/import', { method: 'POST', body: {} }); showToast(hs('importDone', { f: r.found, c: r.created, u: r.updated })); await renderEvents(el); } catch (err) { showToast(err.message); b.disabled = false; }
  });
  const body = $('#ev-body', el);
  if (evState.view === 'calendar') evCalendar(el, body, rows);
  else if (evState.view === 'list') evList(el, body, rows);
  else evResults(el, body, rows);
}

function evChip(e) {
  return `<div class="hub-chip ${MARKET_CLASS[e.market] || ''} ${e.status === 'cancelled' ? 'cancelled' : ''}" data-ev="${esc(e.id)}" title="${esc(e.title)}"><b>${esc(evTime(e))}</b> ${esc(e.title)}</div>`;
}
function evCalendar(el, body, rows) {
  const by = {};
  rows.forEach((e) => { const d = evDate(e); if (d) (by[d] = by[d] || []).push({ date: d, html: evChip(e), t: e.start_at }); });
  Object.values(by).forEach((l) => l.sort((a, b) => (a.t || '').localeCompare(b.t || '')));
  const undated = rows.filter((e) => !e.start_at);
  body.innerHTML = `<div class="panel">
    <div class="hub-cal-head"><button class="icon-btn" data-mo="-1">‹</button><h2>${esc(monthTitle(evState.month))}</h2><button class="icon-btn" data-mo="1">›</button><button class="btn ghost sm" data-mo="0">${esc(hs('today'))}</button>
    <span class="hub-spacer"></span><span class="hub-legend"><i class="m-usa"></i>USA <i class="m-es"></i>Spain <i class="m-latam"></i>LATAM</span></div>
    ${hubMonthGrid(evState.month, by, { onDay: true, max: 3 })}
    ${undated.length ? `<h3>${esc(hl('idea'))}</h3><div class="hub-chips-row">${undated.map(evChip).join('')}</div>` : ''}
  </div>`;
  $$('[data-mo]', body).forEach((b) => b.addEventListener('click', () => { const n = Number(b.dataset.mo); evState.month = n ? shiftMonth(evState.month, n) : todayStr().slice(0, 7); evDraw(el); }));
  $$('[data-ev]', body).forEach((c) => c.addEventListener('click', (e) => { e.stopPropagation(); evEditor(el, evState.items.find((x) => x.id === c.dataset.ev)); }));
  $$('[data-add]', body).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); evEditor(el, { status: 'planned', type: 'workshop', format: 'online', market: evState.market !== 'all' ? evState.market : 'USA', start_at: new Date(b.dataset.add + 'T18:00').toISOString() }); }));
  $$('[data-more]', body).forEach((b) => b.addEventListener('click', () => { evState.view = 'list'; evDraw(el); }));
}

function evRow(e) {
  const r = e.results || {};
  return `<tr class="clickrow" data-ev="${esc(e.id)}">
    <td>${esc(fmtDay(evDate(e), { weekday: 'short', day: 'numeric', month: 'short' }))}<div class="muted">${esc(evTime(e))}</div></td>
    <td class="hub-wrap"><strong>${esc(e.title)}</strong><div class="muted">${esc([hl(e.type), e.program, e.format && hs(e.format)].filter(Boolean).join(' · '))}</div></td>
    <td><span class="hub-mk ${MARKET_CLASS[e.market] || ''}">${esc(e.market || '—')}</span></td>
    <td>${evBadge(e.status)}</td>
    <td>${evProgressHtml(e)}</td>
    <td class="num">${fmtN(num(r.registrations))}</td><td class="num">${fmtN(num(r.attendees))}</td><td class="num">${fmtN(num(r.leads))}</td>
    <td class="hub-links">${e.luma_url ? `<a href="${esc(e.luma_url)}" target="_blank" rel="noopener" title="Luma">Luma</a>` : ''}${e.landing_url ? `<a href="${esc(e.landing_url)}" target="_blank" rel="noopener" title="4Geeks">4Geeks</a>` : ''}</td>
  </tr>`;
}
function evList(el, body, rows) {
  const today = todayStr();
  const up = rows.filter((e) => !evDate(e) || evDate(e) >= today).sort((a, b) => (a.start_at || 'z').localeCompare(b.start_at || 'z'));
  const past = rows.filter((e) => evDate(e) && evDate(e) < today).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const head = `<thead><tr><th>${esc(hs('date'))}</th><th>${esc(hs('title'))}</th><th>${esc(hs('market'))}</th><th>${esc(hs('status'))}</th><th>${esc(hs('progress'))}</th><th class="num">${esc(hs('registrations'))}</th><th class="num">${esc(hs('attendees'))}</th><th class="num">${esc(hs('leads'))}</th><th>${esc(hs('links'))}</th></tr></thead>`;
  const table = (list) => (list.length ? `<div class="tablewrap"><table>${head}<tbody>${list.map(evRow).join('')}</tbody></table></div>` : `<div class="state-card">${icon('calendar')}<p>${esc(hs('noEvents'))}</p></div>`);
  body.innerHTML = `<div class="panel"><div class="panel-head"><h2>${esc(hs('upcoming').replace(/ \(.*\)/, ''))}</h2></div>${table(up)}</div>
    <div class="panel"><div class="panel-head"><h2>${esc(hs('history'))}</h2></div>${table(past)}</div>`;
  $$('[data-ev]', body).forEach((r) => r.addEventListener('click', (e) => { if (e.target.closest('a')) return; evEditor(el, evState.items.find((x) => x.id === r.dataset.ev)); }));
}

function evResults(el, body, rows) {
  const done = rows.filter((e) => evDate(e) && evDate(e) <= todayStr() && e.status !== 'cancelled').sort((a, b) => b.start_at.localeCompare(a.start_at));
  const agg = (list) => { const s = (k) => list.reduce((a, e) => a + (num(e.results && e.results[k]) || 0), 0); return { n: list.length, reg: s('registrations'), att: s('attendees'), leads: s('leads'), enr: s('enrollments'), cost: s('cost') }; };
  const group = (key, lab) => { const g = {}; done.forEach((e) => { const k = e[key] || '—'; (g[k] = g[k] || []).push(e); }); return Object.entries(g).map(([k, l]) => ({ label: lab(k), ...agg(l) })).sort((a, b) => b.att - a.att); };
  const line = (r) => `<td class="num">${r.n}</td><td class="num">${fmtN(r.reg)}</td><td class="num">${fmtN(r.att)}</td><td class="num">${hubPct(r.att, r.reg)}</td><td class="num">${fmtN(r.leads)}</td><td class="num">${fmtN(r.enr)}</td><td class="num">${money(r.cost || null)}</td><td class="num">${r.cost && r.att ? money(r.cost / r.att) : '—'}</td>`;
  const hd = (first) => `<thead><tr><th>${esc(first)}</th><th class="num">#</th><th class="num">${esc(hs('registrations'))}</th><th class="num">${esc(hs('attendees'))}</th><th class="num">${esc(hs('showRate'))}</th><th class="num">${esc(hs('leads'))}</th><th class="num">${esc(hs('enrollments'))}</th><th class="num">${esc(hs('cost'))}</th><th class="num">${esc(hs('costPerAttendee'))}</th></tr></thead>`;
  const tot = agg(done);
  body.innerHTML = `
    <div class="hub-two">
      <div class="panel"><div class="panel-head"><h2>${esc(hs('byType'))}</h2></div><div class="tablewrap"><table>${hd(hs('type'))}<tbody>${group('type', hl).map((r) => `<tr><td>${esc(r.label)}</td>${line(r)}</tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-head"><h2>${esc(hs('byMarket'))}</h2></div><div class="tablewrap"><table>${hd(hs('market'))}<tbody>${group('market', (k) => k).map((r) => `<tr><td>${esc(r.label)}</td>${line(r)}</tr>`).join('')}</tbody></table></div></div>
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(hs('eventsDone'))}</h2></div>
      ${done.length ? `<div class="tablewrap"><table><thead><tr><th>${esc(hs('date'))}</th><th>${esc(hs('title'))}</th><th>${esc(hs('market'))}</th><th class="num">${esc(hs('registrations'))}</th><th class="num">${esc(hs('attendees'))}</th><th class="num">${esc(hs('showRate'))}</th><th class="num">${esc(hs('leads'))}</th><th class="num">${esc(hs('enrollments'))}</th><th class="num">${esc(hs('cost'))}</th></tr></thead><tbody>
      ${done.map((e) => { const r = e.results || {}; return `<tr class="clickrow" data-ev="${esc(e.id)}"><td>${esc(fmtDay(evDate(e)))}</td><td class="hub-wrap"><strong>${esc(e.title)}</strong><div class="muted">${esc(hl(e.type))}${e.program ? ' · ' + esc(e.program) : ''}</div></td><td>${esc(e.market || '—')}</td><td class="num">${fmtN(num(r.registrations))}</td><td class="num">${fmtN(num(r.attendees))}</td><td class="num">${hubPct(num(r.attendees), num(r.registrations))}</td><td class="num">${fmtN(num(r.leads))}</td><td class="num">${fmtN(num(r.enrollments))}</td><td class="num">${money(num(r.cost))}</td></tr>`; }).join('')}
      <tr class="total"><td colspan="3">Total</td><td class="num">${fmtN(tot.reg)}</td><td class="num">${fmtN(tot.att)}</td><td class="num">${hubPct(tot.att, tot.reg)}</td><td class="num">${fmtN(tot.leads)}</td><td class="num">${fmtN(tot.enr)}</td><td class="num">${money(tot.cost || null)}</td></tr>
      </tbody></table></div>` : `<div class="state-card">${icon('trophy')}<p>${esc(hs('noEvents'))}</p></div>`}
    </div>`;
  $$('[data-ev]', body).forEach((r) => r.addEventListener('click', () => evEditor(el, evState.items.find((x) => x.id === r.dataset.ev))));
}

// ---------------- Luma link → prefilled event ----------------
function evLumaPrompt(el) {
  const d = hubDrawer(`<div class="dr-head"><div class="dr-titles"><h2>${esc(hs('fromLuma'))}</h2></div><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="dr-body"><label class="hub-f full"><span>${esc(hs('lumaUrl'))}</span><input type="text" id="ev-luma-url" placeholder="${esc(hs('fromLumaPh'))}"></label>
    <div class="ps-actions"><button class="btn primary" id="ev-luma-go">${icon('search')}${esc(hs('fetch'))}</button></div>
    ${hub.meta.luma.api ? '' : `<p class="muted hub-small">${esc(hs('lumaNoKey'))}</p>`}</div>`);
  const go = async () => {
    const b = $('#ev-luma-go', d); b.disabled = true; b.innerHTML = esc(hs('working'));
    try {
      const f = await hubJson('/api/hub/luma/lookup', { method: 'POST', body: { url: $('#ev-luma-url', d).value } });
      const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      evEditor(el, { status: 'promoting', type: 'workshop', market: evState.market !== 'all' ? evState.market : 'USA', ...clean, checklist: { luma: true }, source: 'luma_link' });
    } catch (e) { showToast(e.message); b.disabled = false; b.innerHTML = `${icon('search')}${esc(hs('fetch'))}`; }
  };
  $('#ev-luma-go', d).addEventListener('click', go);
  $('#ev-luma-url', d).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => $('#ev-luma-url', d).focus(), 250);
}

// ---------------- editor ----------------
function evEditor(el, ev) {
  const m = hub.meta; const e = ev || {}; const r = e.results || {}; const isNew = !e.id;
  const d0 = evDate(e); const today = todayStr();
  const checklist = m.event_checklist.map((c) => {
    const due = d0 ? addDaysStr(d0, c.offset) : null; const ok = !!(e.checklist && e.checklist[c.key]);
    const late = !ok && due && due < today && e.status !== 'cancelled';
    return `<label class="hub-check ${ok ? 'ok' : ''} ${late ? 'late' : ''}"><input type="checkbox" data-f="checklist.${c.key}" ${ok ? 'checked' : ''}><span>${esc(c.label)}</span><em>${due ? `${esc(fmtDay(due))} · ${c.offset === 0 ? 'D' : `D${c.offset > 0 ? '+' : ''}${c.offset}`}` : `D${c.offset > 0 ? '+' : ''}${c.offset}`}</em></label>`;
  }).join('');
  const sel = (arr, lab = (x) => x) => arr.map((x) => [x, lab(x)]);
  const utmBase = e.registration_url || e.landing_url || e.luma_url || '';
  const dr = hubDrawer(`<div class="dr-head"><div class="dr-titles"><h2>${esc(isNew ? hs('newEvent') : e.title)}</h2>${isNew ? '' : `<div class="lead-meta">${evBadge(e.status)}<span class="hub-mk ${MARKET_CLASS[e.market] || ''}">${esc(e.market || '')}</span>${e.luma_id ? '<span class="badge b-other plain">Luma</span>' : ''}</div>`}</div><button class="icon-btn" data-close>${icon('x')}</button></div>
  <div class="dr-body hub-form" id="ev-form">
    ${e.cover_url ? `<img class="hub-cover" src="${esc(e.cover_url)}" alt="">` : ''}
    <div class="hub-grid">
      ${hf('title', hs('title'), e.title, { full: true })}
      ${hf('type', hs('type'), e.type, { opts: sel(m.event_types, hl) })}
      ${hf('status', hs('status'), e.status, { opts: sel(m.event_statuses, hl) })}
      ${hf('market', hs('market'), e.market, { opts: sel(m.markets) })}
      ${hf('program', hs('program'), e.program, { opts: [['', hs('none')], ...sel(m.programs)] })}
      ${hf('language', hs('language'), e.language || (e.market === 'USA' ? 'en' : 'es'), { opts: [['en', 'English'], ['es', 'Español']] })}
      ${hf('owner', hs('owner'), e.owner || (window.__me && window.__me.name) || '')}
    </div>
    <h3 class="hub-h3">${icon('calendar')}${esc(hs('date'))}</h3>
    <div class="hub-grid">
      ${hf('start_at', hs('startAt'), toLocalInput(e.start_at), { type: 'datetime-local' })}
      ${hf('end_at', hs('endAt'), toLocalInput(e.end_at), { type: 'datetime-local' })}
      ${hf('format', hs('format'), e.format || 'online', { opts: [['online', hs('online')], ['in_person', hs('in_person')], ['hybrid', hs('hybrid')]] })}
      ${hf('capacity', hs('capacity'), e.capacity, { type: 'number' })}
      ${hf('location', hs('location'), e.location, { full: true })}
      ${hf('meeting_url', hs('meetingUrl'), e.meeting_url, { full: true })}
    </div>
    <h3 class="hub-h3">${icon('target')}${esc(hs('goal'))}</h3>
    <div class="hub-grid">
      ${hf('speakers', hs('speakers'), e.speakers, { full: true })}
      ${hf('audience', hs('audience'), e.audience, { full: true })}
      ${hf('goal', hs('goal'), e.goal, { full: true, rows: 2 })}
      ${hf('description', hs('description'), e.description, { full: true, rows: 4 })}
    </div>
    <h3 class="hub-h3">${icon('link')}${esc(hs('links'))}</h3>
    <div class="hub-grid">
      ${hf('luma_url', hs('lumaUrl'), e.luma_url, { full: true, ph: 'https://lu.ma/…' })}
      ${hf('landing_url', hs('landingUrl'), e.landing_url, { full: true, ph: 'https://4geeks.com/…' })}
      ${hf('registration_url', hs('registrationUrl'), e.registration_url, { full: true })}
      ${hf('recording_url', hs('recordingUrl'), e.recording_url, { full: true })}
      ${hf('slides_url', hs('slidesUrl'), e.slides_url, { full: true })}
    </div>
    <details class="hub-utm"><summary>${esc(hs('buildUtm'))}</summary>
      <div class="hub-grid"><label class="hub-f"><span>${esc(hs('source'))}</span><input type="text" id="utm-s" value="instagram"></label><label class="hub-f"><span>${esc(hs('medium'))}</span><input type="text" id="utm-m" value="organic"></label><label class="hub-f full"><span>${esc(hs('campaign'))}</span><input type="text" id="utm-c" value="${esc(slug(e.title) || 'event')}"></label></div>
      <div class="hub-utm-out" id="utm-out" data-base="${esc(utmBase)}"></div>
    </details>
    <h3 class="hub-h3">${icon('check')}${esc(hs('checklist'))}</h3><p class="muted hub-small">${esc(hs('checklistSub'))}</p>
    <div class="hub-checks">${checklist}</div>
    <h3 class="hub-h3">${icon('trophy')}${esc(hs('results'))}</h3>
    <div class="hub-grid hub-grid3">
      ${hf('results.registrations', hs('registrations'), r.registrations, { type: 'number' })}
      ${hf('results.attendees', hs('attendees'), r.attendees, { type: 'number' })}
      ${hf('results.leads', hs('leads'), r.leads, { type: 'number' })}
      ${hf('results.enrollments', hs('enrollments'), r.enrollments, { type: 'number' })}
      ${hf('results.cost', hs('cost') + ' (USD)', r.cost, { type: 'number' })}
      ${hf('budget', hs('budget') + ' (USD)', e.budget, { type: 'number' })}
    </div>
    ${e.luma_synced_at ? `<p class="muted hub-small">Luma · ${esc(new Date(e.luma_synced_at).toLocaleString(locale()))}</p>` : ''}
    ${hf('notes', hs('notes'), e.notes, { full: true, rows: 3 })}
    ${isNew ? '' : `<div class="hub-actions-col">
      <button class="btn soft sm" id="ev-promo">${icon('send')}${esc(hs('promoPosts'))}</button>
      ${m.ai ? `<button class="btn soft sm" id="ev-ai">${icon('sparkle')}${esc(hs('writeEventCopy'))}</button>` : ''}
      ${m.luma.api && e.luma_id ? `<button class="btn soft sm" id="ev-sync">${icon('refresh')}${esc(hs('syncLuma'))}</button>` : ''}
    </div><div id="ev-ai-out"></div>`}
  </div>
  <div class="dr-foot">${isNew ? '<span></span>' : `<button class="btn ghost sm" id="ev-del">${icon('x')}${esc(hs('del'))}</button>`}<div class="ps-actions" style="margin:0"><button class="btn ghost" data-close>${esc(hs('cancel'))}</button><button class="btn primary" id="ev-save">${icon('check')}${esc(hs('save'))}</button></div></div>`);

  const utm = () => { const o = $('#utm-out', dr); const base = $('[data-f=registration_url]', dr).value || $('[data-f=landing_url]', dr).value || $('[data-f=luma_url]', dr).value; const u = hubUtm(base, { source: $('#utm-s', dr).value, medium: $('#utm-m', dr).value, campaign: $('#utm-c', dr).value }); o.innerHTML = u ? hubCopyable(hs('utm'), u) : `<span class="muted hub-small">${esc(hs('registrationUrl'))}…</span>`; hubWireCopy(o); };
  $$('#utm-s,#utm-m,#utm-c,[data-f=registration_url],[data-f=landing_url],[data-f=luma_url]', dr).forEach((x) => x.addEventListener('input', utm)); utm();

  const save = async (silent) => {
    const data = hubReadForm($('#ev-form', dr));
    if (!data.title) { $('[data-f=title]', dr).focus(); return null; }
    data.results = { ...(e.results || {}), ...(data.results || {}) };
    const saved = isNew ? await hubJson('/api/hub/events', { method: 'POST', body: { ...e, ...data } }) : await hubJson(`/api/hub/events/${e.id}`, { method: 'PATCH', body: data });
    if (!silent) showToast(hs('saved'));
    return saved;
  };
  $('#ev-save', dr).addEventListener('click', async (x) => { const b = x.currentTarget; b.disabled = true; try { if (await save()) { closeDrawers(); await renderEvents(el); } } catch (err) { showToast(err.message); } b.disabled = false; });
  if ($('#ev-del', dr)) $('#ev-del', dr).addEventListener('click', async () => { if (!confirm(hs('confirmDel'))) return; await hubJson(`/api/hub/events/${e.id}`, { method: 'DELETE' }); closeDrawers(); await renderEvents(el); });
  if ($('#ev-promo', dr)) $('#ev-promo', dr).addEventListener('click', async (x) => { const b = x.currentTarget; b.disabled = true; try { await save(true); const r2 = await hubJson(`/api/hub/events/${e.id}/promo-posts`, { method: 'POST', body: {} }); showToast(hs('promoDone', { n: r2.created })); } catch (err) { showToast(err.message); } b.disabled = false; });
  if ($('#ev-sync', dr)) $('#ev-sync', dr).addEventListener('click', async (x) => { const b = x.currentTarget; b.disabled = true; try { const upd = await hubJson(`/api/hub/events/${e.id}/luma-sync`, { method: 'POST', body: {} }); evState.items = evState.items.map((i) => (i.id === upd.id ? upd : i)); evEditor(el, upd); } catch (err) { showToast(err.message); b.disabled = false; } });
  if ($('#ev-ai', dr)) $('#ev-ai', dr).addEventListener('click', async (x) => {
    const b = x.currentTarget; const out = $('#ev-ai-out', dr); b.disabled = true; out.innerHTML = `<div class="ps-busy"><span class="dot loading"></span>${esc(hs('working'))}</div>`;
    try {
      const c = await hubJson('/api/hub/ai/copy', { method: 'POST', body: { type: 'event', item: { ...e, ...hubReadForm($('#ev-form', dr)) } } });
      out.innerHTML = `<p class="muted hub-small">${esc(hs('copyReady'))}</p>${Object.entries(c).map(([k, v]) => hubCopyable(k.replace(/_/g, ' '), Array.isArray(v) ? v.join('\n') : v)).join('')}`;
      hubWireCopy(out);
    } catch (err) { out.innerHTML = `<p class="hub-warn-txt">${esc(err.message)}</p>`; }
    b.disabled = false;
  });
}

window.renderEvents = renderEvents;
