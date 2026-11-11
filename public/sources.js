'use strict';
/* Other sources next to ActiveCampaign, both read-only:
   - Brevo: the AI Fluency / AI Flex funnel (lists + automation emails) -> its own page.
   - 4Geeks CDP: what the CDP knows about one lead -> a block inside the lead drawer.
   Server side: lib/sources/brevo.js and lib/sources/cdp.js.
   Uses the dashboard's globals: $, $$, esc, icon, api, LANG, t, fmtInt, pct, fmtDate, fmtDT, openLead, scoreBadge. */
(function addSourcesStrings() {
  const en = {
    nav_aifunnel: 'AI Fluency funnel (Brevo)', sub_aifunnel: 'Leads that enter through Brevo: where each one is, which emails they got, and who is also in the CRM',
    bv_off: 'Brevo is not connected yet', bv_offHow: 'Add the Brevo API key as BREVO_API_KEY in the Hub\'s Railway variables. The Hub only reads from Brevo: the lists and automations keep working as they are.',
    bv_loading: 'Reading the lists and emails from Brevo…', bv_updated: 'Updated {t} · emails of the last {d} days', bv_refresh: 'Refresh from Brevo', bv_err: 'Brevo could not be read: {e}', bv_truncated: 'There are more email events than the Hub reads in one go, so the email counts are a floor.',
    bv_all: 'All programs', st_lead: 'Leads', st_enrolled: 'Enrolled', st_module1: 'First module done', st_finishing: 'About to finish', st_finished: 'Course finished',
    bv_ofLeads: '{p} of leads', bv_inCrm: 'Also in the CRM', bv_inCrmSub: 'have a deal in ActiveCampaign', bv_opened: 'Opened an email', bv_clicked: 'Clicked an email', bv_ofSent: 'of {n} who got one',
    bv_emails: 'Emails sent by the automations', bv_emailsSub: 'To these leads only. Opens and clicks are counted once per email and person.', bv_subject: 'Email', bv_sent: 'Sent', bv_delivered: 'Delivered', bv_openRate: 'Opened', bv_clickRate: 'Clicked', bv_last: 'Last sent', bv_noEmails: 'No emails to these leads in this window.',
    bv_people: 'People', bv_peopleSub: '{n} shown · newest first', bv_person: 'Lead', bv_program: 'Program', bv_step: 'Step', bv_entered: 'Entered', bv_source: 'Source', bv_mail: 'Emails (sent · opened · clicked)', bv_crm: 'In the CRM', bv_notInCrm: 'Not in the CRM', bv_unsub: 'unsubscribed', bv_none: 'Nobody matches these filters.', bv_more: 'Show {n} more', bv_lists: 'Brevo lists read: {l}',
    cdp_title: 'In the CDP', cdp_loading: 'Looking this lead up in the CDP…', cdp_off: 'The CDP is not connected (add CDP_TOKEN in Railway).', cdp_notFound: 'The CDP does not know this lead yet.', cdp_noEmail: 'This lead has no email to look up.', cdp_err: 'The CDP could not be read: {e}',
    cdp_since: 'Known since', cdp_personas: 'Personas', cdp_segments: 'Segments', cdp_consent: 'Marketing consent', cdp_allowed: 'allowed', cdp_blocked: 'blocked', cdp_traits: 'Traits', cdp_activity: 'Recent activity', cdp_nurture: 'Nurture', cdp_ids: 'Identified by',
    set_brevo: 'Brevo (AI Fluency)', set_brevoOn: '{n} people in {l} lists', set_srcOff: 'Not connected', set_cdp: '4Geeks CDP', set_cdpOn: 'Connected · {n} leads in the CDP', set_cdpBad: 'Token rejected or CDP unreachable',
  };
  const es = {
    nav_aifunnel: 'Embudo AI Fluency (Brevo)', sub_aifunnel: 'Leads que entran por Brevo: dónde está cada uno, qué correos recibió y quién está también en el CRM',
    bv_off: 'Brevo aún no está conectado', bv_offHow: 'Añade la API key de Brevo como BREVO_API_KEY en las variables de Railway del Hub. El Hub solo lee de Brevo: las listas y automatizaciones siguen funcionando igual.',
    bv_loading: 'Leyendo las listas y correos de Brevo…', bv_updated: 'Actualizado {t} · correos de los últimos {d} días', bv_refresh: 'Actualizar desde Brevo', bv_err: 'No se pudo leer Brevo: {e}', bv_truncated: 'Hay más eventos de correo de los que el Hub lee de una vez, así que los conteos de correo son un mínimo.',
    bv_all: 'Todos los programas', st_lead: 'Leads', st_enrolled: 'Inscritos', st_module1: 'Primer módulo hecho', st_finishing: 'Por terminar', st_finished: 'Curso terminado',
    bv_ofLeads: '{p} de los leads', bv_inCrm: 'También en el CRM', bv_inCrmSub: 'tienen un deal en ActiveCampaign', bv_opened: 'Abrió un correo', bv_clicked: 'Hizo clic en un correo', bv_ofSent: 'de {n} que recibieron alguno',
    bv_emails: 'Correos enviados por las automatizaciones', bv_emailsSub: 'Solo a estos leads. Aperturas y clics se cuentan una vez por correo y persona.', bv_subject: 'Correo', bv_sent: 'Enviados', bv_delivered: 'Entregados', bv_openRate: 'Abiertos', bv_clickRate: 'Con clic', bv_last: 'Último envío', bv_noEmails: 'No hay correos a estos leads en este periodo.',
    bv_people: 'Personas', bv_peopleSub: '{n} mostradas · más recientes primero', bv_person: 'Lead', bv_program: 'Programa', bv_step: 'Paso', bv_entered: 'Entró', bv_source: 'Fuente', bv_mail: 'Correos (enviados · abiertos · clics)', bv_crm: 'En el CRM', bv_notInCrm: 'No está en el CRM', bv_unsub: 'dado de baja', bv_none: 'Nadie coincide con estos filtros.', bv_more: 'Mostrar {n} más', bv_lists: 'Listas de Brevo leídas: {l}',
    cdp_title: 'En el CDP', cdp_loading: 'Buscando este lead en el CDP…', cdp_off: 'El CDP no está conectado (añade CDP_TOKEN en Railway).', cdp_notFound: 'El CDP aún no conoce a este lead.', cdp_noEmail: 'Este lead no tiene email para buscarlo.', cdp_err: 'No se pudo leer el CDP: {e}',
    cdp_since: 'Conocido desde', cdp_personas: 'Personas (perfiles)', cdp_segments: 'Segmentos', cdp_consent: 'Consentimiento de marketing', cdp_allowed: 'permitido', cdp_blocked: 'bloqueado', cdp_traits: 'Rasgos', cdp_activity: 'Actividad reciente', cdp_nurture: 'Nurture', cdp_ids: 'Identificado por',
    set_brevo: 'Brevo (AI Fluency)', set_brevoOn: '{n} personas en {l} listas', set_srcOff: 'Sin conectar', set_cdp: 'CDP de 4Geeks', set_cdpOn: 'Conectado · {n} leads en el CDP', set_cdpBad: 'Token rechazado o CDP inaccesible',
  };
  window.I18N.en = { ...window.I18N.en, ...en };
  window.I18N.es = { ...window.I18N.es, ...es };
})();

const BV = { data: null, loading: false, error: null, at: 0, program: 'all', stage: 'all', shown: 100 };

async function loadBrevo(force) {
  BV.loading = true;
  try {
    if (force) await api('/api/sources/brevo/refresh', { method: 'POST' });
    const res = await api('/api/sources/brevo');
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || res.statusText);
    BV.data = d; BV.error = null;
  } catch (e) { BV.error = e.message; }
  BV.loading = false; BV.at = Date.now();
  if (state.view === 'aifunnel') window.renderBrevo($('#tab-aifunnel'));
  // The first pull after a deploy (or a forced one) takes a few seconds: look again.
  if (BV.data && BV.data.enabled && (BV.data.refreshing || !BV.data.at) && state.view === 'aifunnel') setTimeout(() => loadBrevo(false), 5000);
}

window.renderBrevo = function renderBrevo(el) {
  if (!BV.loading && (!BV.data || Date.now() - BV.at > 60000)) loadBrevo(false);
  const d = BV.data;
  if (!d) { el.innerHTML = BV.error ? `<div class="panel state-card">${icon('alert')}<p>${esc(t('bv_err', { e: BV.error }))}</p></div>` : `<div class="panel state-card"><p class="muted">${esc(t('bv_loading'))}</p></div>`; return; }
  if (!d.enabled) { el.innerHTML = `<div class="panel state-card">${icon('mail')}<p><strong>${esc(t('bv_off'))}</strong></p><p class="muted">${esc(t('bv_offHow'))}</p></div>`; return; }
  if (!d.at && !d.error) { el.innerHTML = `<div class="panel state-card"><p class="muted">${esc(t('bv_loading'))}</p></div>`; return; }
  const programs = [...new Set(d.rows.map((r) => r.program).filter(Boolean))].sort();
  if (BV.program !== 'all' && !programs.includes(BV.program)) BV.program = 'all';
  const inProgram = d.rows.filter((r) => BV.program === 'all' || r.program === BV.program);
  const idx = (s) => d.stages.indexOf(s);
  const reached = (s) => inProgram.filter((r) => idx(r.stage) >= idx(s)).length;
  const leads = reached('lead');
  const gotMail = inProgram.filter((r) => r.sent.sent > 0);
  const rows = inProgram.filter((r) => BV.stage === 'all' || r.stage === BV.stage).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const kpi = (label, val, sub, sel, attr = '') => `<button class="kpi as-kpi ${sel ? 'sel' : ''}" ${attr}><div class="k-lbl">${esc(label)}</div><div class="k-val">${fmtInt(val)}</div><div class="k-sub">${esc(sub || '')}</div></button>`;
  el.innerHTML = `
    <div class="panel as-head">
      <div class="as-line"><span class="as-dot on"></span>${esc(t('bv_updated', { t: fmtDT(d.at), d: d.days }))}${d.error ? `<span class="as-err" title="${esc(d.error)}">${esc(t('bv_err', { e: d.error.slice(0, 80) }))}</span>` : ''}</div>
      <div class="as-actions"><button class="btn soft sm" data-bv-refresh>${icon('refresh')}${esc(t('bv_refresh'))}</button></div>
      <p class="as-note">${esc(t('bv_lists', { l: d.lists.map((l) => `${l.name} (${l.count})`).join(' · ') }))}${d.eventsTruncated ? ` · ${esc(t('bv_truncated'))}` : ''}</p>
    </div>
    ${programs.length > 1 ? `<div class="seg as-pf">${['all', ...programs].map((p) => `<button data-bv-program="${esc(p)}" class="${BV.program === p ? 'active' : ''}">${esc(p === 'all' ? t('bv_all') : p)}</button>`).join('')}</div>` : ''}
    <div class="kpis k8">
      ${d.stages.map((s) => kpi(t('st_' + s), reached(s), s === 'lead' ? '' : t('bv_ofLeads', { p: pct(reached(s), leads) }), BV.stage === s, `data-bv-stage="${s}"`)).join('')}
      ${kpi(t('bv_inCrm'), inProgram.filter((r) => r.crm).length, t('bv_inCrmSub'), false, 'disabled')}
      ${kpi(t('bv_opened'), gotMail.filter((r) => r.sent.opened > 0).length, t('bv_ofSent', { n: fmtInt(gotMail.length) }), false, 'disabled')}
      ${kpi(t('bv_clicked'), gotMail.filter((r) => r.sent.clicked > 0).length, t('bv_ofSent', { n: fmtInt(gotMail.length) }), false, 'disabled')}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(t('bv_emails'))}</h2><div class="panel-sub">${esc(t('bv_emailsSub'))}</div></div></div>
      ${d.messages.length ? `<div class="as-wrap"><table class="as-table"><thead><tr><th>${esc(t('bv_subject'))}</th><th class="num">${esc(t('bv_sent'))}</th><th class="num">${esc(t('bv_delivered'))}</th><th class="num">${esc(t('bv_openRate'))}</th><th class="num">${esc(t('bv_clickRate'))}</th><th>${esc(t('bv_last'))}</th></tr></thead><tbody>
        ${d.messages.slice(0, 40).map((m) => `<tr><td>${esc(m.subject || '—')}${m.templateId != null ? `<div class="muted" style="font-size:11px">#${esc(m.templateId)}</div>` : ''}</td><td class="num">${fmtInt(m.sent)}</td><td class="num">${fmtInt(m.delivered)}</td><td class="num">${fmtInt(m.opened)} <span class="muted">${pct(m.opened, m.delivered || m.sent, 0)}</span></td><td class="num">${fmtInt(m.clicked)} <span class="muted">${pct(m.clicked, m.delivered || m.sent, 0)}</span></td><td>${m.lastAt ? fmtDT(m.lastAt) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('bv_noEmails'))}</p>`}
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(t('bv_people'))}</h2><div class="panel-sub">${esc(t('bv_peopleSub', { n: fmtInt(rows.length) }))}</div></div></div>
      ${rows.length ? `<div class="as-wrap"><table class="as-table"><thead><tr><th>${esc(t('bv_person'))}</th><th>${esc(t('bv_program'))}</th><th>${esc(t('bv_step'))}</th><th>${esc(t('bv_entered'))}</th><th>${esc(t('bv_source'))}</th><th>${esc(t('bv_mail'))}</th><th>${esc(t('bv_crm'))}</th></tr></thead><tbody>
        ${rows.slice(0, BV.shown).map((r) => `<tr>
          <td>${r.crm ? `<button class="q-name" data-open="${esc(r.crm.dealId)}">${esc(r.namePartial || r.emailPartial || '—')}</button>` : `<strong>${esc(r.namePartial || r.emailPartial || '—')}</strong>`}<div class="muted" style="font-size:11px">${esc(r.emailPartial || '')}${r.location ? ' · ' + esc(r.location) : ''}${r.unsubscribed ? ` · ${esc(t('bv_unsub'))}` : ''}</div></td>
          <td>${esc(r.program || '—')}</td>
          <td><span class="badge plain ${r.stage === 'lead' ? 'b-neutral' : 'b-won'}">${esc(t('st_' + r.stage))}</span></td>
          <td>${r.createdAt ? fmtDT(r.createdAt) : '—'}</td>
          <td>${esc([r.source, r.medium].filter(Boolean).join(' / ') || '—')}</td>
          <td>${fmtInt(r.sent.sent)} · ${fmtInt(r.sent.opened)} · ${fmtInt(r.sent.clicked)}</td>
          <td>${r.crm ? `${esc(r.crm.region || '')}${r.crm.score ? ' ' + scoreBadge(r.crm.score) : ''}<div class="muted" style="font-size:11px">${esc(String(r.crm.stage || '').slice(0, 48))}</div>` : `<span class="muted">${esc(t('bv_notInCrm'))}</span>`}</td></tr>`).join('')}</tbody></table></div>
        ${rows.length > BV.shown ? `<button class="btn ghost sm" data-bv-more style="margin-top:10px">${esc(t('bv_more', { n: fmtInt(Math.min(100, rows.length - BV.shown)) }))}</button>` : ''}` : `<p class="muted">${esc(t('bv_none'))}</p>`}
    </div>`;
  $$('[data-bv-program]', el).forEach((b) => b.addEventListener('click', () => { BV.program = b.dataset.bvProgram; BV.shown = 100; renderBrevo(el); }));
  $$('[data-bv-stage]', el).forEach((b) => b.addEventListener('click', () => { BV.stage = BV.stage === b.dataset.bvStage ? 'all' : b.dataset.bvStage; BV.shown = 100; renderBrevo(el); }));
  $$('[data-bv-more]', el).forEach((b) => b.addEventListener('click', () => { BV.shown += 100; renderBrevo(el); }));
  $$('[data-bv-refresh]', el).forEach((b) => b.addEventListener('click', () => { b.disabled = true; loadBrevo(true); }));
  $$('[data-open]', el).forEach((b) => b.addEventListener('click', () => openLead(b.dataset.open)));
};

// ───────────── CDP block inside the lead drawer ─────────────
// Filled after the drawer opens; the drawer already has <div id="ld-cdp">.
window.loadLeadCdp = function loadLeadCdp(dealId) {
  const head = `<h3>${icon('users')}${esc(t('cdp_title'))}</h3>`;
  const set = (html) => { const box = $('#ld-cdp'); if (box && box.dataset.deal === String(dealId)) box.innerHTML = head + html; };
  const chips = (list, f) => list.map((x) => `<span class="badge plain b-neutral" style="margin:0 4px 4px 0">${esc(f(x))}</span>`).join('');
  const day = (iso) => (iso ? fmtDate(String(iso).slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  api(`/api/sources/cdp/lead/${encodeURIComponent(dealId)}`).then(async (res) => {
    const p = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(p.error || res.statusText);
    if (!p.enabled) return set(`<p class="muted">${esc(t('cdp_off'))}</p>`);
    if (!p.found) return set(`<p class="muted">${esc(t(p.reason === 'no_email' ? 'cdp_noEmail' : 'cdp_notFound'))}</p>`);
    const kv = (label, html) => (html ? `<dt>${esc(label)}</dt><dd>${html}</dd>` : '');
    const nurture = p.nurture ? Object.entries(p.nurture).map(([k, v]) => `<div style="margin-top:8px"><strong>${esc(k)}</strong> <span class="muted">(${fmtInt(v.total)})</span>${v.items.map((it) => `<div class="muted" style="font-size:12px">${esc(Object.entries(it).map(([a, b]) => `${a}: ${b}`).join(' · '))}</div>`).join('')}</div>`).join('') : '';
    set(`<dl class="kv">
      ${kv(t('cdp_since'), esc(day(p.createdAt)))}
      ${kv(t('cdp_ids'), esc((p.identifierTypes || []).join(', ')))}
      ${kv(t('cdp_consent'), p.consent ? (p.consent.channels || []).map((c) => `<span class="badge plain ${c.marketing ? 'b-won' : 'b-lostc'}" style="margin:0 4px 4px 0">${esc(c.channel)}: ${esc(c.marketing ? t('cdp_allowed') : `${t('cdp_blocked')}${c.block ? ` (${c.block})` : ''}`)}</span>`).join('') : '')}
      ${kv(t('cdp_personas'), chips(p.personas || [], (x) => String(x.segment).replace(/^persona:/, '')))}
      ${kv(t('cdp_segments'), chips(p.segments || [], (x) => x.segment))}
      ${kv(t('cdp_traits'), (p.traits || []).map((x) => `<div style="font-size:12.5px">${esc(x.key)}: <strong>${esc(x.value)}</strong>${x.source ? ` <span class="muted">· ${esc(x.source)}</span>` : ''}</div>`).join(''))}
      ${kv(t('cdp_activity'), (p.activity || []).map((x) => `<div style="font-size:12.5px">${esc(x.event)} <span class="muted">· ${esc(x.source || '')} · ${esc(day(x.at))}</span></div>`).join(''))}
      ${kv(t('cdp_nurture'), nurture)}</dl>`);
  }).catch((e) => set(`<p class="muted">${esc(t('cdp_err', { e: e.message }))}</p>`));
};
