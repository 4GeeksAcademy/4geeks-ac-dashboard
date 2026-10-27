'use strict';
/* Attribution machine — Hub side.
   - Lead drawer: the lead's journey (every visit before the form, the form,
     visits after), next to what ActiveCampaign recorded.
   - Intelligence → Marketing: credit by channel under 4 models, top paths,
     every ad that touched leads, coverage, tag health, and the setup card
     (GTM snippet + UTM templates). Uses dashboard.js helpers at call time. */

(function addAttributionStrings() {
  const en = {
    at_journey: 'Journey', at_recorded: 'As recorded in ActiveCampaign', at_noJourney: 'No tracked visits for this lead yet. Tracking runs on the 4Geeks sites from {d}; leads who came before that, or from another browser without filling a form there, only have what ActiveCampaign recorded.',
    at_form: 'Filled the form', at_after: 'After the form', at_pages: '{n} pages', at_touches: '{n} touches before the form over {d} days', at_oneTouch: 'One visit before the form',
    at_cont: '+ {n} continuation visits on other 4Geeks pages', at_ad: 'Ad', at_campaign: 'Campaign', at_keyword: 'Keyword', at_brand: 'branded', at_landing: 'Landed on',
    at_title: 'Attribution', at_sub: 'Every tracked visit before each lead\'s form, credited by channel. Same leads as the filters above.',
    at_model: 'Model', at_m_first: 'First touch', at_m_last: 'Last touch', at_m_linear: 'Linear', at_m_position: 'Position (40/20/40)',
    at_m_first_h: 'Which channel STARTED the journey', at_m_last_h: 'Which channel CLOSED it (last non-direct visit before the form)', at_m_linear_h: 'Equal credit to every touch', at_m_position_h: '40% first, 40% last, 20% shared by the middle',
    at_channel: 'Channel', at_leads: 'Leads', at_qualified: 'Qualified', at_enrolled: 'Enrolled', at_share: 'Share of leads', at_detail: 'By source',
    at_paths: 'Most common journeys', at_steps: '{n} steps', at_ads: 'Every ad that touched a lead', at_firstT: 'Started', at_lastT: 'Closed', at_anyT: 'Touched',
    at_cov: '{w} of {n} leads have a tracked journey · {m} took more than one visit · median {t} touches · median {d} days from first visit to form.',
    at_paidThen: '{n} leads clicked an ad and later came back through search or direct, the "saw an ad, then googled 4Geeks" pattern.',
    at_health: 'Tag health: {a} of {p} paid clicks have no ad name (utm_content), {c} no campaign. Fix with the URL templates below so every click names its ad.',
    at_empty: 'No tracked journeys for these leads yet. Install the tracker (below); journeys build up from the day it goes live.',
    at_setup: 'Tracking setup', at_live: 'Live: {e} visits from {v} visitors in the last 24 h · {l} leads linked · tracking since {s}', at_notLive: 'Not receiving visits yet.',
    at_step1: '1 · In Google Tag Manager (container GTM-PGGRR6 on 4geeks.com): New tag → Custom HTML → paste this → trigger "All Pages" (or your consent trigger for the EU) → Submit / Publish.',
    at_step2: '2 · Make every paid click name its ad. Paste these as the URL parameters of each platform:', at_copy: 'Copy', at_copied: 'Copied',
    at_meta: 'Meta (Ads Manager → ad → URL parameters)', at_google: 'Google Ads (Account settings → Tracking → Final URL suffix; keep auto-tagging on and your current utm_source / utm_campaign)', at_tiktok: 'TikTok (ad → URL parameters)',
    at_step3: '3 · Optional: add "How did you first hear about us?" to the lead form. It catches what no tracker can: word of mouth, podcasts, an ad seen on someone else\'s phone.',
    at_hosts: 'Sites sending visits (7 days)',
  };
  const es = {
    at_journey: 'Recorrido', at_recorded: 'Según ActiveCampaign', at_noJourney: 'Aún no hay visitas registradas para este lead. El seguimiento corre en los sitios de 4Geeks desde el {d}; los leads anteriores, o los que llegaron desde otro navegador sin llenar ahí un formulario, solo tienen lo que registró ActiveCampaign.',
    at_form: 'Llenó el formulario', at_after: 'Después del formulario', at_pages: '{n} páginas', at_touches: '{n} contactos antes del formulario en {d} días', at_oneTouch: 'Una visita antes del formulario',
    at_cont: '+ {n} visitas de continuación en otras páginas de 4Geeks', at_ad: 'Anuncio', at_campaign: 'Campaña', at_keyword: 'Palabra clave', at_brand: 'de marca', at_landing: 'Aterrizó en',
    at_title: 'Atribución', at_sub: 'Cada visita registrada antes del formulario de cada lead, con el crédito por canal. Los mismos leads que los filtros de arriba.',
    at_model: 'Modelo', at_m_first: 'Primer contacto', at_m_last: 'Último contacto', at_m_linear: 'Lineal', at_m_position: 'Por posición (40/20/40)',
    at_m_first_h: 'Qué canal EMPEZÓ el recorrido', at_m_last_h: 'Qué canal lo CERRÓ (última visita no directa antes del formulario)', at_m_linear_h: 'El mismo crédito a cada contacto', at_m_position_h: '40% al primero, 40% al último y 20% repartido entre los del medio',
    at_channel: 'Canal', at_leads: 'Leads', at_qualified: 'Calificados', at_enrolled: 'Matriculados', at_share: '% de leads', at_detail: 'Por fuente',
    at_paths: 'Recorridos más comunes', at_steps: '{n} pasos', at_ads: 'Cada anuncio que tocó a un lead', at_firstT: 'Empezó', at_lastT: 'Cerró', at_anyT: 'Tocó',
    at_cov: '{w} de {n} leads tienen recorrido registrado · {m} necesitaron más de una visita · mediana {t} contactos · mediana {d} días de la primera visita al formulario.',
    at_paidThen: '{n} leads hicieron clic en un anuncio y luego volvieron por búsqueda o directo: el patrón "vi un anuncio y después busqué 4Geeks".',
    at_health: 'Etiquetado: {a} de {p} clics pagados no tienen nombre de anuncio (utm_content) y {c} no tienen campaña. Se arregla con las plantillas de URL de abajo para que cada clic diga su anuncio.',
    at_empty: 'Aún no hay recorridos registrados para estos leads. Instala el tracker (abajo); los recorridos se acumulan desde el día en que se activa.',
    at_setup: 'Configuración del seguimiento', at_live: 'Activo: {e} visitas de {v} visitantes en las últimas 24 h · {l} leads vinculados · desde el {s}', at_notLive: 'Aún no recibe visitas.',
    at_step1: '1 · En Google Tag Manager (contenedor GTM-PGGRR6 de 4geeks.com): Nueva etiqueta → HTML personalizado → pega esto → activador "All Pages" (o tu activador de consentimiento para la UE) → Enviar / Publicar.',
    at_step2: '2 · Que cada clic pagado diga su anuncio. Pega esto en los parámetros de URL de cada plataforma:', at_copy: 'Copiar', at_copied: 'Copiado',
    at_meta: 'Meta (Ads Manager → anuncio → Parámetros de URL)', at_google: 'Google Ads (Configuración de la cuenta → Seguimiento → Sufijo de URL final; deja el autoetiquetado y tus utm_source / utm_campaign actuales)', at_tiktok: 'TikTok (anuncio → Parámetros de URL)',
    at_step3: '3 · Opcional: añade "¿Cómo nos conociste?" al formulario. Atrapa lo que ningún tracker ve: boca a boca, podcasts, un anuncio visto en el teléfono de otra persona.',
    at_hosts: 'Sitios que envían visitas (7 días)',
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
  box.querySelector('.at-body').innerHTML = `
    <p class="at-sum">${esc(j.touches.length > 1 ? t('at_touches', { n: j.touches.length, d: days }) : t('at_oneTouch'))}</p>
    <ol class="at-tl">${j.touches.map(atTouchHtml).join('')}
      <li class="at-touch at-conv"><div class="at-when">${esc(atDate(j.conversionAt))}</div><div class="at-what"><span class="at-chip t-amber">${esc(t('at_form'))}</span></div></li>
      ${j.after.length ? `<li class="at-after-h">${esc(t('at_after'))}</li>${j.after.map(atTouchHtml).join('')}` : ''}</ol>
    ${j.continuations ? `<p class="muted at-note">${esc(t('at_cont', { n: j.continuations }))}</p>` : ''}${recHtml}`;
}
window.loadLeadJourney = loadLeadJourney;

// ---------------- Marketing tab panel ----------------
async function renderAttribution(el, rows) {
  const key = `${rowsKey(rows)}`;
  el.innerHTML = `<div class="panel"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:75%"></div></div>`;
  try {
    if (!AT.cache.has(key)) {
      const res = await api('/api/attribution/report', { method: 'POST', body: { region: state.region, ids: rows.map((r) => String(r.id)) } });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || res.statusText);
      AT.cache.set(key, d);
    }
    if (!AT.status) AT.status = await (await api('/api/attribution/status')).json().catch(() => ({}));
  } catch (e) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(e.message)}</p></div>`; return; }
  const d = AT.cache.get(key); const st = AT.status || {};
  const c = d.coverage || {};
  const m = d.models[AT.model] || { groups: [], sources: [] };
  const totalLeads = m.groups.reduce((a, g) => a + g.leads, 0) || 1;
  const fmt1 = (x) => (Math.round(x * 10) / 10).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US');
  const th = d.tagHealth || {};
  el.innerHTML = `<div class="panel at-panel">
    <div class="panel-head"><div><h2>${icon('target')} ${esc(t('at_title'))}</h2><div class="panel-sub">${esc(t('at_sub'))}</div></div>
      <div class="seg" id="at-model"><span class="mk-by">${esc(t('at_model'))}</span>${['first', 'last', 'linear', 'position'].map((k) => `<button data-m="${k}" title="${esc(t('at_m_' + k + '_h'))}" class="${AT.model === k ? 'active' : ''}">${esc(t('at_m_' + k))}</button>`).join('')}</div></div>
    ${c.withJourney ? `<p class="at-cov">${esc(t('at_cov', { w: fmtInt(c.withJourney), n: fmtInt(c.leads), m: fmtInt(c.multiTouch), t: c.medianTouches == null ? '—' : fmt1(c.medianTouches), d: c.medianDaysFirstTouchToLead == null ? '—' : fmt1(c.medianDaysFirstTouchToLead) }))}</p>
      ${c.paidThenSearchOrDirect ? `<p class="at-cov hl">${esc(t('at_paidThen', { n: fmtInt(c.paidThenSearchOrDirect) }))}</p>` : ''}
      <p class="muted at-hint">${esc(t('at_m_' + AT.model + '_h'))}</p>
      <div class="at-cols">
        <div><table class="pi-table"><thead><tr><th>${esc(t('at_channel'))}</th><th class="num">${esc(t('at_leads'))}</th><th class="num">${esc(t('at_share'))}</th><th class="num">${esc(t('at_qualified'))}</th><th class="num">${esc(t('at_enrolled'))}</th></tr></thead>
          <tbody>${m.groups.map((g) => `<tr><td>${atChip(g.key)}</td><td class="num">${fmt1(g.leads)}</td><td class="num">${Math.round((g.leads / totalLeads) * 100)}%</td><td class="num">${fmt1(g.qualified)}</td><td class="num"><strong>${fmt1(g.enrolled)}</strong></td></tr>`).join('')}</tbody></table>
          <details class="at-more"><summary>${esc(t('at_detail'))}</summary><table class="pi-table"><tbody>${m.sources.map((g) => `<tr><td>${esc(g.key)}</td><td class="num">${fmt1(g.leads)}</td><td class="num">${fmt1(g.qualified)}</td><td class="num">${fmt1(g.enrolled)}</td></tr>`).join('')}</tbody></table></details></div>
        <div><h3>${esc(t('at_paths'))}</h3><ul class="at-paths">${(d.paths || []).map((p) => `<li><span class="at-path">${p.path.split(' → ').map((x) => atChip(x)).join('<span class="at-arrow">→</span>')}</span><span class="at-pn">${fmtInt(p.leads)} · ${fmtInt(p.qualified)} ${esc(t('at_qualified').toLowerCase())} · <strong>${fmtInt(p.enrolled)}</strong> ${esc(t('at_enrolled').toLowerCase())}</span></li>`).join('')}</ul></div>
      </div>
      ${(d.ads || []).length ? `<h3>${esc(t('at_ads'))}</h3><div class="table-wrap"><table class="pi-table"><thead><tr><th>${esc(t('at_campaign'))}</th><th>${esc(t('at_ad'))}</th><th class="num">${esc(t('at_anyT'))}</th><th class="num">${esc(t('at_firstT'))}</th><th class="num">${esc(t('at_lastT'))}</th><th class="num">${esc(t('at_qualified'))}</th><th class="num">${esc(t('at_enrolled'))}</th></tr></thead>
        <tbody>${d.ads.map((a) => `<tr><td>${esc(a.source)} · ${esc(a.campaign)}</td><td>${esc(a.ad)}</td><td class="num">${fmtInt(a.leads)}</td><td class="num">${fmtInt(a.firstTouch)}</td><td class="num">${fmtInt(a.lastTouch)}</td><td class="num">${fmtInt(a.qualified)}</td><td class="num"><strong>${fmtInt(a.enrolled)}</strong></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${th.paidTouches && (th.noAdName || th.noCampaign) ? `<p class="at-cov warn">${esc(t('at_health', { a: fmtInt(th.noAdName), p: fmtInt(th.paidTouches), c: fmtInt(th.noCampaign) }))}</p>` : ''}`
    : `<p class="muted">${esc(t('at_empty'))}</p>`}
    <details class="at-setup" ${st.events24h ? '' : 'open'}><summary><h3>${icon('settings')} ${esc(t('at_setup'))}</h3> <span class="${st.events24h ? 'at-ok' : 'at-off'}">${esc(st.events24h ? t('at_live', { e: fmtInt(st.events24h), v: fmtInt(st.visitors24h), l: fmtInt(st.linkedLeads || 0), s: String(st.since || '').slice(0, 10) }) : t('at_notLive'))}</span></summary>
      ${(st.hosts7d || []).length ? `<p class="muted at-hint">${esc(t('at_hosts'))}: ${st.hosts7d.map((h) => `${esc(h.host)} (${fmtInt(h.n)})`).join(' · ')}</p>` : ''}
      <p>${esc(t('at_step1'))}</p><div class="at-code"><code>${esc(st.snippet || '')}</code><button class="btn ghost sm" data-copy="${esc(st.snippet || '')}">${esc(t('at_copy'))}</button></div>
      <p>${esc(t('at_step2'))}</p>
      ${['meta', 'google', 'tiktok'].map((k) => `<div class="at-tpl"><div class="at-tpl-t">${esc(t('at_' + k))}</div><div class="at-code"><code>${esc(AT_TEMPLATES[k])}</code><button class="btn ghost sm" data-copy="${esc(AT_TEMPLATES[k])}">${esc(t('at_copy'))}</button></div></div>`).join('')}
      <p class="muted">${esc(t('at_step3'))}</p></details>
  </div>`;
  $$('#at-model button', el).forEach((b) => b.addEventListener('click', () => { AT.model = b.dataset.m; try { localStorage.setItem('atModel', AT.model); } catch (e) { /* private */ } renderAttribution(el, rows); }));
  $$('[data-copy]', el).forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = t('at_copied'); } catch (e) { /* no clipboard */ } }));
}
window.renderAttribution = renderAttribution;
