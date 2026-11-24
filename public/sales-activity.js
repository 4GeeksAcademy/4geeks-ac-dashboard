/* Spain daily activity — Intelligence → Sales (top block).
   Calls from Ringover (via n8n), offers by quality (Strong / Soft / Super soft), sales, leads and
   enrollments, per rep and per day. Same definitions as the Spain team's sheet (admisiones_spain).
   Server: lib/pipeline/sales-activity.js, GET /api/sales-activity?from&to. */
(function () {
  const D = {
    en: {
      sa_title: 'Daily activity · Spain', sa_sub: 'Calls from Ringover, offers by quality, sales and enrollments, per rep. Same definitions as the team\'s spreadsheet. Madrid time.',
      sa_today: 'Today', sa_yesterday: 'Yesterday', sa_7: 'Last 7 days', sa_30: 'Last 30 days', sa_day: 'Day',
      sa_calls: 'Calls made', sa_pick: 'Pick-up rate', sa_pickSub: '{n} answered', sa_active: 'Active conversations', sa_activeSub: '{p} of calls · >15 s talking',
      sa_offers: 'Offers', sa_offersSub: 'Strong {s} · Soft {o} · Super soft {ss}', sa_sales: 'Sales (Won)', sa_enr: 'Enrollments', sa_leads: 'New leads', sa_leadsSub: '{d} duplicates',
      sa_rep: 'Rep', sa_cLeads: 'Leads', sa_cCalls: 'Calls', sa_cPick: 'Picked up', sa_cPickR: '% pick-up', sa_cAct: 'Active conv.', sa_cActR: '% active', sa_cLong: '>15 min',
      sa_cTalk: 'Active talk', sa_cConn: 'Connected', sa_cStrong: 'Strong', sa_cSoft: 'Soft', sa_cSS: 'Super soft', sa_cOffers: 'Offers', sa_cSales: 'Sales', sa_total: 'Total',
      sa_byDay: 'Day by day', sa_offerList: 'Offers in the period ({n})', sa_noCalls: 'Ringover is not connected to the Hub yet, so calls are empty. Offers, sales and leads come from ActiveCampaign and are complete.',
      sa_callsErr: 'Last Ringover update failed: {e}', sa_callsAt: 'Calls updated {t}', sa_partial: 'Calls known for {n} of {d} days.',
      sa_preview: 'Preview briefing', sa_send: 'Send briefing now', sa_sent: 'Briefing sent to Slack', sa_refresh: 'Update calls',
      sa_briefNote: 'Every day at {h}:00 Madrid this summary goes to Slack.', sa_q_strong: 'Strong', sa_q_soft: 'Soft', sa_q_supersoft: 'Super soft', sa_q_other: 'No quality',
      sa_defs: 'Calls made = outbound calls. Picked up = outbound answered. Active conversation = answered with more than 15 s talking. Offers = deals with an offer date in the period, by the "has_offer" field. Sales = Won deals by won date. Enrollments = the Enrollments section.',
    },
    es: {
      sa_title: 'Actividad diaria · España', sa_sub: 'Llamadas de Ringover, ofertas por calidad, ventas y matrículas, por comercial. Mismas definiciones que el Excel del equipo. Hora de Madrid.',
      sa_today: 'Hoy', sa_yesterday: 'Ayer', sa_7: 'Últimos 7 días', sa_30: 'Últimos 30 días', sa_day: 'Día',
      sa_calls: 'Llamadas emitidas', sa_pick: 'Tasa de descuelgue', sa_pickSub: '{n} descuelgues', sa_active: 'Conversaciones activas', sa_activeSub: '{p} de las llamadas · >15 s hablando',
      sa_offers: 'Ofertas', sa_offersSub: 'Strong {s} · Soft {o} · Super soft {ss}', sa_sales: 'Ventas (Won)', sa_enr: 'Matrículas', sa_leads: 'Leads nuevos', sa_leadsSub: '{d} duplicados',
      sa_rep: 'Comercial', sa_cLeads: 'Leads', sa_cCalls: 'Llamadas', sa_cPick: 'Descuelgues', sa_cPickR: '% descuelgue', sa_cAct: 'Conv. activas', sa_cActR: '% activas', sa_cLong: '>15 min',
      sa_cTalk: 'T. conv. activa', sa_cConn: 'T. conectado', sa_cStrong: 'Strong', sa_cSoft: 'Soft', sa_cSS: 'Super soft', sa_cOffers: 'Ofertas', sa_cSales: 'Ventas', sa_total: 'Total',
      sa_byDay: 'Día a día', sa_offerList: 'Ofertas del periodo ({n})', sa_noCalls: 'Ringover aún no está conectado al Hub, así que las llamadas salen vacías. Ofertas, ventas y leads vienen de ActiveCampaign y están completos.',
      sa_callsErr: 'La última actualización de Ringover falló: {e}', sa_callsAt: 'Llamadas actualizadas {t}', sa_partial: 'Llamadas conocidas en {n} de {d} días.',
      sa_preview: 'Vista previa del resumen', sa_send: 'Enviar resumen ahora', sa_sent: 'Resumen enviado a Slack', sa_refresh: 'Actualizar llamadas',
      sa_briefNote: 'Cada día a las {h}:00 (Madrid) este resumen llega a Slack.', sa_q_strong: 'Strong', sa_q_soft: 'Soft', sa_q_supersoft: 'Super soft', sa_q_other: 'Sin calidad',
      sa_defs: 'Llamadas emitidas = salientes. Descuelgues = salientes contestadas. Conversación activa = contestada con más de 15 s hablando. Ofertas = deals con fecha de oferta en el periodo, según el campo "has_offer". Ventas = deals Won por fecha de won. Matrículas = la sección Matrículas.',
    },
  };
  Object.keys(D).forEach((l) => { window.I18N[l] = Object.assign(window.I18N[l] || {}, D[l]); });

  const SA = { range: (() => { try { return localStorage.getItem('saRange') || 'yesterday'; } catch (e) { return 'yesterday'; } })(), day: null, cache: new Map(), loading: null, preview: null };
  const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const shift = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  function period() {
    const today = madridToday();
    if (SA.range === 'today') return { from: today, to: today };
    if (SA.range === '7') return { from: shift(today, -6), to: today };
    if (SA.range === '30') return { from: shift(today, -29), to: today };
    if (SA.range === 'day' && SA.day) return { from: SA.day, to: SA.day };
    const y = shift(today, -1); return { from: y, to: y };
  }
  const pctTxt = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`);
  const hm = (sec) => { const m = Math.round((sec || 0) / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

  async function load(el) {
    const p = period(); const key = `${p.from}|${p.to}`;
    if (SA.cache.has(key) || SA.loading === key) return;
    SA.loading = key;
    try {
      const res = await api(`/api/sales-activity?from=${p.from}&to=${p.to}`);
      const d = await res.json(); if (!res.ok) throw new Error(d.error || res.statusText);
      SA.cache.set(key, d);
    } catch (e) { SA.cache.set(key, { error: e.message }); }
    SA.loading = null;
    const root = document.getElementById('sa-root'); if (root) render(root);
  }

  function kpi(label, val, sub, cls = '') { return `<div class="kpi sa-kpi ${cls}"><div class="k-lbl">${esc(label)}</div><div class="k-val">${val}</div>${sub ? `<div class="k-sub">${esc(sub)}</div>` : ''}</div>`; }

  function render(el) {
    if (!el) return;
    const region = (typeof state !== 'undefined' && state.region) || 'all';
    if (region !== 'all' && region !== 'Spain') { el.innerHTML = ''; return; }
    const p = period(); const key = `${p.from}|${p.to}`; const d = SA.cache.get(key);
    const admin = !!window.__isAdmin;
    const seg = `<div class="seg" id="sa-range">${[['today', t('sa_today')], ['yesterday', t('sa_yesterday')], ['7', t('sa_7')], ['30', t('sa_30')]].map(([k, l]) => `<button data-r="${k}" class="${SA.range === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
      <label class="sa-daypick">${esc(t('sa_day'))} <input type="date" id="sa-day" max="${madridToday()}" value="${SA.range === 'day' && SA.day ? SA.day : ''}"></label>`;
    let body;
    if (!d) { body = `<div class="skeleton" style="width:60%"></div><div class="skeleton" style="width:85%"></div>`; load(el); }
    else if (d.error) body = `<p class="at-off">${esc(d.error)}</p>`;
    else {
      const tt = d.total; const c = tt.calls; const o = tt.offers;
      const callsNote = !d.calls.configured ? `<p class="sa-note warn">${esc(t('sa_noCalls'))}</p>`
        : `${d.calls.lastSyncError ? `<p class="sa-note warn">${esc(t('sa_callsErr', { e: d.calls.lastSyncError }))}</p>` : ''}${d.calls.daysWithCalls < d.calls.days ? `<p class="sa-note">${esc(t('sa_partial', { n: d.calls.daysWithCalls, d: d.calls.days }))}</p>` : ''}`;
      const row = (x, total) => { const cc = x.calls; const oo = x.offers; return `<tr class="${total ? 'sa-tot' : ''}"><td>${esc(total ? t('sa_total') : x.rep)}</td><td class="num">${fmtInt(x.leads)}</td>
        <td class="num">${fmtInt(cc.emitidas)}</td><td class="num">${fmtInt(cc.descuelgues)}</td><td class="num"><b>${pctTxt(cc.tasaDescuelgue)}</b></td><td class="num">${fmtInt(cc.activas)}</td><td class="num">${pctTxt(cc.tasaActivas)}</td><td class="num">${fmtInt(cc.largas)}</td>
        <td class="num">${hm(cc.tActiva)}</td><td class="num">${hm(cc.tConectado)}</td>
        <td class="num sa-q-strong">${fmtInt(oo.strong)}</td><td class="num sa-q-soft">${fmtInt(oo.soft)}</td><td class="num sa-q-ss">${fmtInt(oo.supersoft)}</td><td class="num"><b>${fmtInt(x.offersTotal)}</b></td><td class="num"><b>${fmtInt(x.ventas)}</b></td></tr>`; };
      const head = `<thead><tr><th>${esc(t('sa_rep'))}</th><th class="num">${esc(t('sa_cLeads'))}</th><th class="num">${esc(t('sa_cCalls'))}</th><th class="num">${esc(t('sa_cPick'))}</th><th class="num">${esc(t('sa_cPickR'))}</th><th class="num">${esc(t('sa_cAct'))}</th><th class="num">${esc(t('sa_cActR'))}</th><th class="num">${esc(t('sa_cLong'))}</th><th class="num">${esc(t('sa_cTalk'))}</th><th class="num">${esc(t('sa_cConn'))}</th><th class="num">${esc(t('sa_cStrong'))}</th><th class="num">${esc(t('sa_cSoft'))}</th><th class="num">${esc(t('sa_cSS'))}</th><th class="num">${esc(t('sa_cOffers'))}</th><th class="num">${esc(t('sa_cSales'))}</th></tr></thead>`;
      const multi = d.days.length > 1;
      body = `${callsNote}
        <div class="kpi-grid sa-kpis">
          ${kpi(t('sa_calls'), fmtInt(c.emitidas), '')}
          ${kpi(t('sa_pick'), pctTxt(c.tasaDescuelgue), t('sa_pickSub', { n: fmtInt(c.descuelgues) }), 'hl')}
          ${kpi(t('sa_active'), fmtInt(c.activas), t('sa_activeSub', { p: pctTxt(c.tasaActivas) }))}
          ${kpi(t('sa_offers'), fmtInt(tt.offersTotal), t('sa_offersSub', { s: o.strong, o: o.soft, ss: o.supersoft }), 'hl')}
          ${kpi(t('sa_sales'), fmtInt(tt.ventas), Object.entries(tt.ventasByCourse).map(([k, v]) => `${k} ${v}`).join(' · '))}
          ${kpi(t('sa_enr'), fmtInt(tt.matriculas), (d.matriculas || []).map((m) => m.program).filter(Boolean).slice(0, 3).join(' · '))}
          ${kpi(t('sa_leads'), fmtInt(tt.leads), tt.dups ? t('sa_leadsSub', { d: tt.dups }) : '')}
        </div>
        <div class="table-wrap"><table class="pi-table sa-table">${head}<tbody>${d.reps.map((x) => row(x)).join('')}${row({ ...tt, rep: '' }, true)}</tbody></table></div>
        ${multi ? `<details class="sa-more" open><summary>${esc(t('sa_byDay'))}</summary><div class="table-wrap" style="max-height:420px"><table class="pi-table sa-table"><thead><tr><th>${esc(t('sa_day'))}</th><th class="num">${esc(t('sa_cLeads'))}</th><th class="num">${esc(t('sa_cCalls'))}</th><th class="num">${esc(t('sa_cPickR'))}</th><th class="num">${esc(t('sa_cAct'))}</th><th class="num">${esc(t('sa_cStrong'))}</th><th class="num">${esc(t('sa_cSoft'))}</th><th class="num">${esc(t('sa_cSS'))}</th><th class="num">${esc(t('sa_cSales'))}</th><th class="num">${esc(t('sa_enr'))}</th></tr></thead>
          <tbody>${d.days.slice().reverse().map((x) => `<tr><td>${esc(fmtDate(x.day))}</td><td class="num">${fmtInt(x.leads)}</td><td class="num">${x.callsKnown ? fmtInt(x.calls.emitidas) : '—'}</td><td class="num">${x.callsKnown ? pctTxt(x.calls.tasaDescuelgue) : '—'}</td><td class="num">${x.callsKnown ? fmtInt(x.calls.activas) : '—'}</td><td class="num">${fmtInt(x.offers.strong)}</td><td class="num">${fmtInt(x.offers.soft)}</td><td class="num">${fmtInt(x.offers.supersoft)}</td><td class="num">${fmtInt(x.ventas)}</td><td class="num">${fmtInt(x.matriculas)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
        ${d.offers.length ? `<details class="sa-more"><summary>${esc(t('sa_offerList', { n: d.offers.length }))}</summary><div class="table-wrap" style="max-height:360px"><table class="pi-table"><tbody>${d.offers.map((x) => `<tr><td><a href="#" data-lead-link="${esc(x.id)}">${esc(x.namePartial || x.name || '#' + x.id)}</a></td><td><span class="sa-badge q-${x.quality}">${esc(t('sa_q_' + x.quality))}</span></td><td>${esc(x.rep || '—')}</td><td>${esc(x.course || '—')}</td><td>${esc(fmtDate(x.day))}</td><td class="muted truncate">${esc(x.stage || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
        <p class="muted sa-note">${esc(t('sa_defs'))}${d.status && d.status.briefConfigured ? ` ${esc(t('sa_briefNote', { h: d.status.briefHour }))}` : ''}${d.calls.lastSync ? ` · ${esc(t('sa_callsAt', { t: new Date(d.calls.lastSync).toLocaleString() }))}` : ''}</p>
        ${admin ? `<div class="sa-admin"><button class="btn ghost sm" id="sa-preview">${esc(t('sa_preview'))}</button>${d.status && d.status.briefConfigured ? `<button class="btn soft sm" id="sa-send">${esc(t('sa_send'))}</button>` : ''}${d.calls.configured ? `<button class="btn ghost sm" id="sa-sync">${esc(t('sa_refresh'))}</button>` : ''}</div>` : ''}
        ${SA.preview ? `<pre class="sa-preview">${esc(SA.preview)}</pre>` : ''}`;
    }
    el.innerHTML = `<div class="panel sa-panel"><div class="panel-head"><div><h2>${icon('target')} ${esc(t('sa_title'))}</h2><div class="panel-sub">${esc(t('sa_sub'))}</div></div><div class="sa-ctl">${seg}</div></div>${body}</div>`;
    $$('#sa-range button', el).forEach((b) => b.addEventListener('click', () => { SA.range = b.dataset.r; SA.preview = null; try { localStorage.setItem('saRange', SA.range); } catch (e) { /* private */ } render(el); }));
    const dp = $('#sa-day', el); if (dp) dp.addEventListener('change', () => { if (!dp.value) return; SA.range = 'day'; SA.day = dp.value; SA.preview = null; render(el); });
    const p2 = period();
    const pv = $('#sa-preview', el); if (pv) pv.addEventListener('click', async () => { pv.disabled = true; try { const r = await api('/api/sales-activity/brief', { method: 'POST', body: { day: p2.to, send: false } }); const x = await r.json(); if (!r.ok) throw new Error(x.error); SA.preview = x.text; render(el); } catch (e) { showToast(e.message); pv.disabled = false; } });
    const sd = $('#sa-send', el); if (sd) sd.addEventListener('click', async () => { sd.disabled = true; try { const r = await api('/api/sales-activity/brief', { method: 'POST', body: { day: p2.to, send: true } }); const x = await r.json(); if (!r.ok) throw new Error(x.error); showToast(t('sa_sent')); } catch (e) { showToast(e.message); } sd.disabled = false; });
    const sy = $('#sa-sync', el); if (sy) sy.addEventListener('click', async () => { sy.disabled = true; try { await api('/api/sales-activity/sync', { method: 'POST', body: { days: 7 } }); SA.cache.clear(); render(el); } catch (e) { showToast(e.message); sy.disabled = false; } });
    $$('[data-lead-link]', el).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openLead(a.dataset.leadLink); }));
  }

  window.renderSalesActivity = render;
})();
