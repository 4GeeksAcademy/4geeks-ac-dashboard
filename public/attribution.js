'use strict';
/* Attribution machine — Hub side.
   - Lead drawer: the lead's journey (every visit before the form, the form,
     visits after), next to what ActiveCampaign recorded.
   - Intelligence → Marketing: credit by channel under 4 models, top paths,
     every ad that touched leads, coverage, tag health, and the setup card
     (GTM snippet + UTM templates). Uses dashboard.js helpers at call time. */

(function addAttributionStrings() {
  const en = {
    at_journey: 'Journey', at_recorded: 'As recorded in ActiveCampaign', at_noJourney: 'No visits linked to this lead yet. Leads are linked to Google Analytics by their Google Ads click or by the form event (synced every 3 hours, last 45 days); a lead that came from a browser GA never saw, or before the export started, only has what ActiveCampaign recorded.',
    at_form: 'Filled the form', at_after: 'After the form', at_pages: '{n} pages', at_touches: '{n} touches before the form over {d} days', at_oneTouch: 'One visit before the form',
    at_cont: '+ {n} continuation visits on other 4Geeks pages', at_ad: 'Ad', at_campaign: 'Campaign', at_keyword: 'Keyword', at_brand: 'branded', at_landing: 'Landed on',
    at_title: 'Attribution', at_sub: 'Every Google Analytics visit before each lead\'s form, credited by channel. Same leads as the filters above.',
    at_model: 'Model', at_m_first: 'First touch', at_m_last: 'Last touch', at_m_linear: 'Linear', at_m_position: 'Position (40/20/40)',
    at_m_first_h: 'Which channel STARTED the journey', at_m_last_h: 'Which channel CLOSED it (last non-direct visit before the form)', at_m_linear_h: 'Equal credit to every touch', at_m_position_h: '40% first, 40% last, 20% shared by the middle',
    at_channel: 'Channel', at_leads: 'Leads', at_qualified: 'Qualified', at_enrolled: 'Enrolled', at_share: 'Share of leads', at_detail: 'By source',
    at_paths: 'Most common journeys', at_steps: '{n} steps', at_ads: 'Every ad that touched a lead', at_firstT: 'Started', at_lastT: 'Closed', at_anyT: 'Touched',
    at_cov: '{w} of {n} leads have a tracked journey · {m} took more than one visit · median {t} touches · median {d} days from first visit to form.',
    at_paidThen: '{n} leads clicked an ad and later came back through search or direct, the "saw an ad, then googled 4Geeks" pattern.',
    at_health: 'Tag health: {a} of {p} paid clicks have no ad name (utm_content), {c} no campaign. Fix with the URL templates below so every click names its ad.',
    at_empty: 'No journeys for these leads yet. They appear once the Google Analytics export is connected and synced (setup below).',
    at_setup: 'Tracking setup', at_live: 'Live: {e} visits from {v} visitors in the last 24 h · {l} leads linked · tracking since {s}', at_notLive: 'Not receiving visits yet.',
    at_step1: '1 · In Google Tag Manager (container GTM-PGGRR6 on 4geeks.com): New tag → Custom HTML → paste this → trigger "All Pages" (or your consent trigger for the EU) → Submit / Publish.',
    at_step2: 'Make every paid click name its ad: paste these as the URL parameters in each ad platform (no change to the sites).', at_copy: 'Copy', at_copied: 'Copied',
    at_meta: 'Meta (Ads Manager → ad → URL parameters)', at_google: 'Google Ads (Account settings → Tracking → Final URL suffix; keep auto-tagging on and your current utm_source / utm_campaign)', at_tiktok: 'TikTok (ad → URL parameters)',
    at_step3: 'Optional: add "How did you first hear about us?" to the lead form. It catches what no tracker can: word of mouth, podcasts, an ad seen on someone else\'s phone.',
    at_hosts: 'Sites sending visits (7 days)',
    at_srcGa4: 'Source: the Google Analytics 4 export in BigQuery ({p} · {d}), already fed by your server-side GTM. Nothing new runs on the sites.',
    at_syncLine: 'Last sync {t}: {m} of {n} new leads linked ({g} by Google Ads click, {f} by form time), {v} visits loaded.',
    at_linkedLine: '{l} leads linked so far: {g} by Google Ads click (exact), {f} by form time (the GA form event within minutes of the deal, same campaign or page).',
    at_syncErr: 'Last sync failed: {e}', at_syncNow: 'Sync now', at_syncing: 'Syncing…',
    at_needKey: 'Not connected yet. In Google Cloud project 533541562873: IAM → Service accounts → create "marketing-hub-reader" with BigQuery Data Viewer (on the GA4 dataset, usually analytics_281853246) and BigQuery Job User, create a JSON key, then in Railway → Variables add GA_BQ_KEY (the key) and GA_BQ_PROJECT (the project ID). Paste the key in Railway, not in chat.',
    at_link_gclid: 'Linked to Google Analytics by the Google Ads click (exact)', at_link_form: 'Linked to Google Analytics by the form event ({c} confidence)', at_link_tracker: 'Linked by the Hub tracker',
    at_cf_high: 'high', at_cf_medium: 'medium', at_cf_low: 'low',
    av_title: 'Attribution: where enrollments come from', av_sub: 'Every lead counts: its full path from Google Analytics when linked, otherwise the channel the CRM recorded (no-source leads are organic).',
    av_whoL: 'Leads', av_who_won: 'Enrolled (Won)', av_who_qualified: 'Good / Very Good', av_who_all: 'All leads',
    av_byL: 'Group by', av_by_type: 'Paid vs organic', av_by_channel: 'Channel', av_by_source: 'Source', av_by_campaign: 'Campaign',
    av_modelL: 'Credit', av_m_linear: 'Shared', av_m_first: 'First touch', av_m_last: 'Last touch',
    av_m_linear_h: 'Shared: each lead counts as 1, split equally across everything that brought them (e.g. a Meta ad, then a Google search → 50% / 50%). The fairest single view.',
    av_m_first_h: 'First touch: 100% to what brought the person the first time. Shows what creates new demand.',
    av_m_last_h: 'Last touch: 100% to the last thing before the form (ignoring direct visits). Shows what closes.',
    av_summary: '{n} {w} in these filters: {g} with their full path from Google Analytics, {c} with only what the CRM recorded.',
    av_shareH: '% of {w}', av_credit: 'Credited', av_touched: 'Touched', av_touchedH: 'Leads that had this anywhere in their path',
    av_leadsT: '{w}: who they are and their path', av_leadsH: 'Click a lead to open it. Path = channels in order, then the form.',
    av_lead: 'Lead', av_date: 'Lead created', av_program: 'Program', av_score: 'Score', av_path: 'Path', av_idBy: 'Path from', av_won: 'Won',
    av_id_gclid: 'Google Analytics (Ads click)', 'av_id_form-time': 'Google Analytics (form)', av_id_ga: 'Google Analytics', av_id_crm: 'CRM only',
    av_none: 'No {w} in these filters.', av_setup: 'Data source and ad links',
  };
  const es = {
    at_journey: 'Recorrido', at_recorded: 'Según ActiveCampaign', at_noJourney: 'Aún no hay visitas vinculadas a este lead. Los leads se vinculan a Google Analytics por su clic de Google Ads o por el evento del formulario (sincronización cada 3 horas, últimos 45 días); si el lead llegó desde un navegador que GA no vio, solo tiene lo que registró ActiveCampaign.',
    at_form: 'Llenó el formulario', at_after: 'Después del formulario', at_pages: '{n} páginas', at_touches: '{n} contactos antes del formulario en {d} días', at_oneTouch: 'Una visita antes del formulario',
    at_cont: '+ {n} visitas de continuación en otras páginas de 4Geeks', at_ad: 'Anuncio', at_campaign: 'Campaña', at_keyword: 'Palabra clave', at_brand: 'de marca', at_landing: 'Aterrizó en',
    at_title: 'Atribución', at_sub: 'Cada visita de Google Analytics antes del formulario de cada lead, con el crédito por canal. Los mismos leads que los filtros de arriba.',
    at_model: 'Modelo', at_m_first: 'Primer contacto', at_m_last: 'Último contacto', at_m_linear: 'Lineal', at_m_position: 'Por posición (40/20/40)',
    at_m_first_h: 'Qué canal EMPEZÓ el recorrido', at_m_last_h: 'Qué canal lo CERRÓ (última visita no directa antes del formulario)', at_m_linear_h: 'El mismo crédito a cada contacto', at_m_position_h: '40% al primero, 40% al último y 20% repartido entre los del medio',
    at_channel: 'Canal', at_leads: 'Leads', at_qualified: 'Calificados', at_enrolled: 'Matriculados', at_share: '% de leads', at_detail: 'Por fuente',
    at_paths: 'Recorridos más comunes', at_steps: '{n} pasos', at_ads: 'Cada anuncio que tocó a un lead', at_firstT: 'Empezó', at_lastT: 'Cerró', at_anyT: 'Tocó',
    at_cov: '{w} de {n} leads tienen recorrido registrado · {m} necesitaron más de una visita · mediana {t} contactos · mediana {d} días de la primera visita al formulario.',
    at_paidThen: '{n} leads hicieron clic en un anuncio y luego volvieron por búsqueda o directo: el patrón "vi un anuncio y después busqué 4Geeks".',
    at_health: 'Etiquetado: {a} de {p} clics pagados no tienen nombre de anuncio (utm_content) y {c} no tienen campaña. Se arregla con las plantillas de URL de abajo para que cada clic diga su anuncio.',
    at_empty: 'Aún no hay recorridos para estos leads. Aparecen cuando la exportación de Google Analytics esté conectada y sincronizada (configuración abajo).',
    at_setup: 'Configuración del seguimiento', at_live: 'Activo: {e} visitas de {v} visitantes en las últimas 24 h · {l} leads vinculados · desde el {s}', at_notLive: 'Aún no recibe visitas.',
    at_step1: '1 · En Google Tag Manager (contenedor GTM-PGGRR6 de 4geeks.com): Nueva etiqueta → HTML personalizado → pega esto → activador "All Pages" (o tu activador de consentimiento para la UE) → Enviar / Publicar.',
    at_step2: 'Que cada clic pagado diga su anuncio: pega esto en los parámetros de URL de cada plataforma de anuncios (sin tocar los sitios).', at_copy: 'Copiar', at_copied: 'Copiado',
    at_meta: 'Meta (Ads Manager → anuncio → Parámetros de URL)', at_google: 'Google Ads (Configuración de la cuenta → Seguimiento → Sufijo de URL final; deja el autoetiquetado y tus utm_source / utm_campaign actuales)', at_tiktok: 'TikTok (anuncio → Parámetros de URL)',
    at_step3: 'Opcional: añade "¿Cómo nos conociste?" al formulario. Atrapa lo que ningún tracker ve: boca a boca, podcasts, un anuncio visto en el teléfono de otra persona.',
    at_hosts: 'Sitios que envían visitas (7 días)',
    at_srcGa4: 'Fuente: la exportación de Google Analytics 4 a BigQuery ({p} · {d}), que ya alimenta tu GTM server-side. No se instala nada nuevo en los sitios.',
    at_syncLine: 'Última sincronización {t}: {m} de {n} leads nuevos vinculados ({g} por clic de Google Ads, {f} por hora del formulario), {v} visitas cargadas.',
    at_linkedLine: '{l} leads vinculados hasta ahora: {g} por clic de Google Ads (exacto), {f} por hora del formulario (el evento de GA a minutos del deal, misma campaña o página).',
    at_syncErr: 'La última sincronización falló: {e}', at_syncNow: 'Sincronizar ahora', at_syncing: 'Sincronizando…',
    at_needKey: 'Aún no está conectado. En el proyecto de Google Cloud 533541562873: IAM → Cuentas de servicio → crea "marketing-hub-reader" con BigQuery Data Viewer (en el dataset de GA4, normalmente analytics_281853246) y BigQuery Job User, crea una clave JSON y en Railway → Variables añade GA_BQ_KEY (la clave) y GA_BQ_PROJECT (el ID del proyecto). Pega la clave en Railway, no en el chat.',
    at_link_gclid: 'Vinculado a Google Analytics por el clic de Google Ads (exacto)', at_link_form: 'Vinculado a Google Analytics por el evento del formulario (confianza {c})', at_link_tracker: 'Vinculado por el tracker del Hub',
    at_cf_high: 'alta', at_cf_medium: 'media', at_cf_low: 'baja',
    av_title: 'Atribución: de dónde vienen las matrículas', av_sub: 'Cuentan todos los leads: su recorrido completo de Google Analytics si está vinculado, si no el canal que guardó el CRM (los leads sin fuente son orgánicos).',
    av_whoL: 'Leads', av_who_won: 'Matriculados (Won)', av_who_qualified: 'Good / Very Good', av_who_all: 'Todos los leads',
    av_byL: 'Agrupar por', av_by_type: 'Pago vs orgánico', av_by_channel: 'Canal', av_by_source: 'Fuente', av_by_campaign: 'Campaña',
    av_modelL: 'Crédito', av_m_linear: 'Compartido', av_m_first: 'Primer contacto', av_m_last: 'Último contacto',
    av_m_linear_h: 'Compartido: cada lead cuenta 1, repartido por igual entre todo lo que lo trajo (p. ej. un anuncio de Meta y luego una búsqueda en Google → 50% / 50%). La vista más justa.',
    av_m_first_h: 'Primer contacto: 100% a lo que trajo a la persona la primera vez. Muestra qué crea demanda nueva.',
    av_m_last_h: 'Último contacto: 100% a lo último antes del formulario (sin contar visitas directas). Muestra qué cierra.',
    av_summary: '{n} {w} con estos filtros: {g} con su recorrido completo de Google Analytics, {c} solo con lo que registró el CRM.',
    av_shareH: '% de {w}', av_credit: 'Crédito', av_touched: 'Tocados', av_touchedH: 'Leads que tuvieron esto en algún punto de su recorrido',
    av_leadsT: '{w}: quiénes son y su recorrido', av_leadsH: 'Haz clic en un lead para abrirlo. Recorrido = canales en orden, luego el formulario.',
    av_lead: 'Lead', av_date: 'Lead creado', av_program: 'Programa', av_score: 'Score', av_path: 'Recorrido', av_idBy: 'Recorrido de', av_won: 'Won',
    av_id_gclid: 'Google Analytics (clic de Ads)', 'av_id_form-time': 'Google Analytics (formulario)', av_id_ga: 'Google Analytics', av_id_crm: 'Solo CRM',
    av_none: 'No hay {w} con estos filtros.', av_setup: 'Fuente de datos y enlaces de anuncios',
  };
  window.I18N.en = { ...window.I18N.en, ...en };
  window.I18N.es = { ...window.I18N.es, ...es };
})();

const AT = { model: (() => { try { return localStorage.getItem('atModel') || 'first'; } catch (e) { return 'first'; } })(), cache: new Map(), status: null };
const AT_TEMPLATES = {
  meta: 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{ad.id}}',
  google: 'utm_term={keyword}&utm_content={creative}&adgroup={adgroupid}&matchtype={matchtype}&network={network}',
  tiktok: 'utm_source=tiktok&utm_medium=paid_social&utm_campaign=__CAMPAIGN_NAME__&utm_term=__AID_NAME__&utm_content=__CID_NAME__',
};
const AT_GROUP_TONE = { 'Paid Search': 'blue', 'Paid Search (brand)': 'blue', 'Paid Social': 'blue', 'Paid Display/Video': 'blue', 'Organic Search': 'green', 'AI Assistant': 'amber', 'Organic Social': 'green', Email: 'gray', Referral: 'gray', Partner: 'gray', Messaging: 'gray', Direct: 'gray', 'Other campaign': 'gray' };
const atChip = (g, src, branded) => `<span class="at-chip t-${AT_GROUP_TONE[branded && g === 'Paid Search' ? 'Paid Search (brand)' : g] || 'gray'}">${esc(g)}${branded ? ` · ${esc(t('at_brand'))}` : ''}${src ? ` · ${esc(src)}` : ''}</span>`;
const atDate = (iso) => (iso ? new Date(iso).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// ---------------- lead drawer ----------------
function atTouchHtml(x) {
  const meta = [
    x.campaign ? `<span><b>${esc(t('at_campaign'))}:</b> ${esc(x.campaign)}</span>` : '',
    x.ad ? `<span><b>${esc(t('at_ad'))}:</b> ${esc(x.ad)}</span>` : '',
    x.term ? `<span><b>${esc(t('at_keyword'))}:</b> ${esc(x.term)}</span>` : '',
    `<span><b>${esc(t('at_landing'))}:</b> ${esc(x.landing || '—')}</span>`,
  ].filter(Boolean).join('');
  return `<li class="at-touch"><div class="at-when">${esc(atDate(x.at))}${x.device ? ` · ${esc(x.device)}` : ''}</div>
    <div class="at-what">${atChip(x.group, x.source, x.branded)} <span class="muted">${esc(t('at_pages', { n: x.pages }))}</span>${(x.keyPages || []).map((k) => `<span class="at-kp">${esc(k)}</span>`).join('')}</div>
    <div class="at-meta">${meta}</div></li>`;
}
async function loadLeadJourney(r) {
  const box = $('#ld-journey'); if (!box) return;
  let data;
  try { const res = await api(`/api/attribution/lead/${encodeURIComponent(r.id)}`); data = await res.json(); if (!res.ok) throw new Error(data.error || res.statusText); } catch (e) { box.querySelector('.at-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  if (!AT.status) { try { AT.status = await (await api('/api/attribution/status')).json(); } catch (e) { AT.status = {}; } }
  const j = data.journey; const rec = data.recorded || {};
  const recHtml = `<div class="at-rec"><span class="at-rec-t">${esc(t('at_recorded'))}</span> ${esc([rec.source, rec.medium, rec.campaign].filter(Boolean).join(' · ') || '—')}${rec.hasGclid ? ' · gclid' : ''}</div>`;
  if (!j || !j.touches.length) {
    box.querySelector('.at-body').innerHTML = `<p class="muted at-note">${esc(t('at_noJourney', { d: AT.status && AT.status.since ? String(AT.status.since).slice(0, 10) : '—' }))}</p>${recHtml}`;
    return;
  }
  const days = Math.max(0, Math.round((Date.parse(j.conversionAt || j.touches[j.touches.length - 1].at) - Date.parse(j.touches[0].at)) / 864e5));
  const lk = j.link || {};
  const linkTxt = lk.method === 'gclid' ? t('at_link_gclid') : lk.method === 'form-time' ? t('at_link_form', { c: t('at_cf_' + (lk.confidence || 'medium')) }) : lk.method ? t('at_link_tracker') : '';
  box.querySelector('.at-body').innerHTML = `
    <p class="at-sum">${esc(j.touches.length > 1 ? t('at_touches', { n: j.touches.length, d: days }) : t('at_oneTouch'))}</p>
    <ol class="at-tl">${j.touches.map(atTouchHtml).join('')}
      <li class="at-touch at-conv"><div class="at-when">${esc(atDate(j.conversionAt))}</div><div class="at-what"><span class="at-chip t-amber">${esc(t('at_form'))}</span></div></li>
      ${j.after.length ? `<li class="at-after-h">${esc(t('at_after'))}</li>${j.after.map(atTouchHtml).join('')}` : ''}</ol>
    ${j.continuations ? `<p class="muted at-note">${esc(t('at_cont', { n: j.continuations }))}</p>` : ''}${linkTxt ? `<p class="muted at-note">${esc(linkTxt)}</p>` : ''}${recHtml}`;
}
window.loadLeadJourney = loadLeadJourney;

// ---------------- Marketing tab panel ----------------
// One question, answered in %: where do our enrollments come from?
// Who: enrolled / Good-Very Good / all leads. Group by: paid vs organic, channel, source, campaign.
// Credit: shared across every touch (default), first touch, or last touch.
// Every lead counts: its Google Analytics path when linked, otherwise what the CRM recorded.
const ATV = (() => { let v = {}; try { v = JSON.parse(localStorage.getItem('atView') || '{}'); } catch (e) { /* private */ } return { who: v.who || 'won', by: v.by || 'channel', model: v.model || 'linear', cache: new Map() }; })();
const atTone = (label) => { const g = String(label).split(' · ')[0].replace(/ \(brand\)$/, ''); return /^Paid/.test(g) ? 'blue' : /^(Organic|AI Assistant|Referral|Direct)/.test(g) ? 'green' : 'gray'; };
const atPathChip = (x) => `<span class="at-chip t-${atTone(x)}">${esc(x)}</span>`;
const atPct = (x) => `${(Math.round(x * 1000) / 10).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US')}%`;

async function renderAttribution(el, rows) {
  const key = `${rowsKey(rows)}|${ATV.who}|${ATV.by}|${ATV.model}`;
  if (!ATV.cache.has(key)) el.innerHTML = `<div class="panel"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:75%"></div></div>`;
  try {
    if (!ATV.cache.has(key)) {
      const res = await api('/api/attribution/share', { method: 'POST', body: { region: state.region, ids: rows.map((r) => String(r.id)), who: ATV.who, by: ATV.by, model: ATV.model } });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || res.statusText);
      ATV.cache.set(key, d);
    }
    if (!AT.status) AT.status = await (await api('/api/attribution/status')).json().catch(() => ({}));
  } catch (e) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`; return; }
  const d = ATV.cache.get(key); const st = AT.status || {};
  const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([k, l, h]) => `<button data-v="${k}" ${h ? `title="${esc(h)}"` : ''} class="${cur === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  const whoTxt = t('av_who_' + d.who);
  const peak = d.rows.length ? Math.max(...d.rows.map((r) => r.share)) : 1;
  el.innerHTML = `<div class="panel at-panel">
    <div class="panel-head"><div><h2>${icon('target')} ${esc(t('av_title'))}</h2><div class="panel-sub">${esc(t('av_sub'))}</div></div></div>
    <div class="av-ctl">
      <div><span class="av-lbl">${esc(t('av_whoL'))}</span>${seg('av-who', [['won', t('av_who_won')], ['qualified', t('av_who_qualified')], ['all', t('av_who_all')]], ATV.who)}</div>
      <div><span class="av-lbl">${esc(t('av_byL'))}</span>${seg('av-by', [['type', t('av_by_type')], ['channel', t('av_by_channel')], ['source', t('av_by_source')], ['campaign', t('av_by_campaign')]], ATV.by)}</div>
      <div><span class="av-lbl">${esc(t('av_modelL'))}</span>${seg('av-model', [['linear', t('av_m_linear')], ['first', t('av_m_first')], ['last', t('av_m_last')]], ATV.model)}</div>
    </div>
    <p class="av-explain">${esc(t('av_m_' + ATV.model + '_h'))}</p>
    ${d.total ? `
    <p class="av-sum">${t('av_summary', { n: `<b>${fmtInt(d.total)}</b>`, w: esc(whoTxt.toLowerCase()), g: `<b>${fmtInt(d.withGa)}</b>`, c: `<b>${fmtInt(d.crmOnly)}</b>` })}</p>
    <div class="table-wrap"><table class="pi-table av-table"><thead><tr><th>${esc(t('av_by_' + d.by))}</th><th class="av-bar-h">${esc(t('av_shareH', { w: whoTxt.toLowerCase() }))}</th><th class="num">${esc(t('av_credit'))}</th><th class="num" title="${esc(t('av_touchedH'))}">${esc(t('av_touched'))}</th></tr></thead>
      <tbody>${d.rows.map((r) => `<tr><td>${atPathChip(d.by === 'type' ? t('ct_' + r.key) : r.key)}</td>
        <td><div class="av-bar"><i style="width:${(r.share / (peak || 1) * 100).toFixed(1)}%" class="t-${d.by === 'type' ? (r.key === 'Paid' ? 'blue' : r.key === 'Organic' ? 'green' : 'gray') : atTone(r.key)}"></i><b>${atPct(r.share)}</b></div></td>
        <td class="num">${(Math.round(r.credit * 10) / 10).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US')}</td><td class="num">${fmtInt(r.touched)}</td></tr>`).join('')}</tbody></table></div>
    <details class="av-leads" ${d.who === 'won' ? 'open' : ''}><summary><h3>${esc(t('av_leadsT', { w: whoTxt }))} <span class="count-tag">${fmtInt(d.leads.length)}</span></h3></summary>
      <p class="muted at-hint">${esc(t('av_leadsH'))}</p>
      <div class="table-wrap" style="max-height:520px"><table class="pi-table"><thead><tr><th>${esc(t('av_lead'))}</th><th>${esc(t('av_date'))}</th><th>${esc(t('av_program'))}</th><th>${esc(t('av_score'))}</th><th>${esc(t('av_path'))}</th><th>${esc(t('av_idBy'))}</th></tr></thead>
      <tbody>${d.leads.map((l) => `<tr class="clickrow" data-open="${esc(l.id)}"><td>${esc(l.namePartial || l.name || '#' + l.id)}${l.won ? ` <span class="badge b-won">${esc(t('av_won'))}</span>` : ''}</td><td>${esc(fmtDate(l.date))}</td><td class="truncate">${esc(l.course || '—')}</td><td>${esc(l.score || '—')}</td>
        <td><span class="at-path">${l.path.map(atPathChip).join('<span class="at-arrow">→</span>')}</span></td><td class="muted">${esc(t('av_id_' + (['gclid', 'form-time', 'crm'].includes(l.by) ? l.by : 'ga')))}</td></tr>`).join('')}</tbody></table></div></details>`
    : `<p class="muted">${esc(t('av_none', { w: whoTxt.toLowerCase() }))}</p>`}
    ${atSetupHtml(st)}
  </div>`;
  const save = () => { try { localStorage.setItem('atView', JSON.stringify({ who: ATV.who, by: ATV.by, model: ATV.model })); } catch (e) { /* private */ } };
  [['#av-who', 'who'], ['#av-by', 'by'], ['#av-model', 'model']].forEach(([sel, k]) => $$(`${sel} button`, el).forEach((b) => b.addEventListener('click', () => { ATV[k] = b.dataset.v; save(); renderAttribution(el, rows); })));
  $$('[data-open]', el).forEach((tr) => tr.addEventListener('click', () => openLead(tr.dataset.open)));
  const sync = $('#at-sync', el);
  if (sync) sync.addEventListener('click', async () => {
    sync.disabled = true; sync.textContent = t('at_syncing');
    try { const r = await api('/api/attribution/sync', { method: 'POST' }); const x = await r.json(); if (!r.ok) throw new Error(x.error || r.statusText); AT.status = null; ATV.cache.clear(); renderAttribution(el, rows); }
    catch (e) { showToast(e.message); sync.disabled = false; sync.textContent = t('at_syncNow'); }
  });
  $$('[data-copy]', el).forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = t('at_copied'); } catch (e) { /* no clipboard */ } }));
}
function atSetupHtml(st) {
  const g = st.ga4 || {};
  const last = g.last || null;
  const ok = g.configured && !g.lastError;
  const head = g.configured
    ? (g.lastError ? `<span class="at-off">${esc(t('at_syncErr', { e: g.lastError }))}</span>` : `<span class="at-ok">${esc(t('at_linkedLine', { l: fmtInt(st.linkedLeads || 0), g: fmtInt(st.linkedByGclid || 0), f: fmtInt(st.linkedByFormTime || 0) }))}</span>`)
    : `<span class="at-off">${esc(t('at_notLive'))}</span>`;
  const admin = !!window.__isAdmin;
  return `<details class="at-setup" ${ok ? '' : 'open'}><summary><h3>${icon('settings')} ${esc(t('av_setup'))}</h3> ${head}</summary>
    ${g.configured ? `<p>${esc(t('at_srcGa4', { p: g.project || '—', d: g.dataset || '—' }))}</p>
      ${last ? `<p class="muted at-hint">${esc(t('at_syncLine', { t: new Date(g.lastRun).toLocaleString(), m: fmtInt(last.matched), n: fmtInt(last.leads), g: fmtInt(last.byMethod.gclid), f: fmtInt(last.byMethod['form-time']), v: fmtInt(last.events) }))}</p>` : ''}
      ${admin ? `<button class="btn soft sm" id="at-sync">${icon('refresh')}${esc(t('at_syncNow'))}</button>` : ''}`
    : `${g.lastError ? `<p class="at-off">${esc(g.lastError)}</p>` : ''}<p>${esc(t('at_needKey'))}</p>`}
    <p style="margin-top:12px">${esc(t('at_step2'))}</p>
    ${['meta', 'google', 'tiktok'].map((k) => `<div class="at-tpl"><div class="at-tpl-t">${esc(t('at_' + k))}</div><div class="at-code"><code>${esc(AT_TEMPLATES[k])}</code><button class="btn ghost sm" data-copy="${esc(AT_TEMPLATES[k])}">${esc(t('at_copy'))}</button></div></div>`).join('')}
    <p class="muted">${esc(t('at_step3'))}</p></details>`;
}
window.renderAttribution = renderAttribution;
