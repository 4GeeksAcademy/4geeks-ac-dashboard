'use strict';
/* Social → Settings (changes: admins only; editors see it read-only). Sync status, accounts and ad accounts on/off and their site,
   the list of sites (add, rename, market, remove), and sync requests (refresh, discover, history).
   Data: /api/social/status and the PATCH / POST routes in lib/social/routes.js. */

const SOC_MARKETS = ['USA', 'Spain', 'LATAM'];
const SOC_REQ_CLASS = { pending: 'b-neutral', running: 'b-other', ok: 'b-won', error: 'b-lostc' };

async function renderSocialSettings(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:220px"></div></div>';
  let s;
  try { s = await hubJson('/api/social/status'); } catch (e) { socError(el, e); return; }
  if (state.view !== 'social_settings') return;
  const sites = [...s.sites].sort((a, b) => a.sort - b.sort);
  const siteOpts = (cur) => `<option value="">—</option>${sites.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  const stateOf = (task, id) => s.state.find((x) => x.task === task && x.account_id === id);
  const failed = s.state.filter((x) => x.ok === false);
  const accName = new Map(s.accounts.map((a) => [a.id, socAccName(a)]));
  const when = (d) => (d ? new Date(d).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const last = Object.entries(s.sync.lastRun || {}).map(([k, v]) => `${k} ${when(v.at)} (${v.seconds} s)`).join(' · ');
  const meta = s.accounts.filter((a) => a.platform === 'meta');

  el.innerHTML = `
    ${s.storage === 'memory' ? `<div class="ps-warn">${icon('alert')}<span>${esc(ss('storageMemory'))}</span></div>` : ''}
    <div class="panel"><div class="panel-head"><div><h2>${esc(ss('syncStatus'))}</h2>
      <div class="panel-sub">${esc(s.sync.enabled ? ss('syncOn') : ss('syncOff'))}${s.sync.running ? ' · ' + esc(ss('running', { t: s.sync.running })) : ''} · ${esc(last || ss('neverRun'))}</div></div>
      <div class="hub-toolbar" style="margin:0"><button class="btn ghost sm" id="soc-discover">${esc(ss('discover'))}</button>
        <label class="hub-small">${esc(ss('historyDays'))} <input type="number" id="soc-days" class="ps-select" value="90" min="1" max="365" style="width:72px"></label>
        <button class="btn ghost sm" id="soc-history">${esc(ss('history'))}</button></div></div>
      ${s.sync.lastError ? `<p class="hub-small" style="color:var(--bad-ink)">${esc(s.sync.lastError)}</p>` : ''}
      <h3 class="hub-small">${esc(failed.length ? ss('failedSteps') : ss('allGood'))}</h3>
      ${failed.length ? `<ul class="hub-small">${failed.map((x) => `<li><strong>${esc(x.task)}</strong>${x.account_id ? ' · ' + esc(accName.get(x.account_id) || x.account_id) : ''} — ${esc(x.error || '')} <span class="muted">(${esc(when(x.finished_at))})</span></li>`).join('')}</ul>` : ''}
    </div>

    <div class="panel"><div class="panel-head"><div><h2>${esc(ss('accounts'))} · ${esc(ss('switchedOn', { n: meta.filter((a) => a.active).length }))}</h2><div class="panel-sub">${esc(ss('turnOnNote'))}</div></div></div>
      <div class="tablewrap"><table><thead><tr><th>${esc(ss('active'))}</th><th>${esc(ss('account'))}</th><th>${esc(ss('site'))}</th><th>${esc(ss('lastSync'))}</th><th></th></tr></thead><tbody>
        ${meta.map((a) => { const st = stateOf('posts', a.id); return `<tr>
          <td><input type="checkbox" data-acc-active="${a.id}" ${a.active ? 'checked' : ''} aria-label="${esc(ss('active'))}"></td>
          <td>${socNet(a.network)} <strong>${esc(socAccName(a))}</strong></td>
          <td><select class="ps-select" data-acc-site="${a.id}">${siteOpts(a.site_id)}</select></td>
          <td class="hub-small">${st ? `${st.ok ? '' : '⚠ '}${esc(when(st.finished_at))}` : '—'}</td>
          <td>${a.active ? `<button class="btn ghost sm" data-acc-refresh="${a.id}">${esc(ss('refresh'))}</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="5" class="muted">${esc(ss('noData'))}</td></tr>`}
      </tbody></table></div></div>

    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(ss('adAccounts'))}</h2></div>
        <div class="tablewrap"><table><thead><tr><th>${esc(ss('active'))}</th><th>${esc(ss('account'))}</th><th>${esc(ss('site'))}</th><th>${esc(ss('currency'))}</th></tr></thead><tbody>
          ${s.adAccounts.map((a) => `<tr><td><input type="checkbox" data-ad-active="${esc(a.id)}" ${a.active ? 'checked' : ''} aria-label="${esc(ss('active'))}"></td>
            <td><strong>${esc(a.name || a.id)}</strong><div class="muted hub-small">${esc(a.id)}</div></td>
            <td><select class="ps-select" data-ad-site="${esc(a.id)}">${siteOpts(a.site_id)}</select></td><td>${esc(a.currency || '—')}</td></tr>`).join('')}
        </tbody></table></div></div>

      <div class="panel"><div class="panel-head"><h2>${esc(ss('sites'))}</h2></div>
        <div class="tablewrap"><table><thead><tr><th>${esc(ss('siteName'))}</th><th>${esc(ss('market'))}</th><th></th></tr></thead><tbody>
          ${sites.map((x) => `<tr><td><input type="text" class="ps-select" data-site-name="${x.id}" value="${esc(x.name)}"></td>
            <td><select class="ps-select" data-site-market="${x.id}"><option value="">${esc(ss('noMarket'))}</option>${SOC_MARKETS.map((m) => `<option ${x.market === m ? 'selected' : ''}>${m}</option>`).join('')}</select></td>
            <td><button class="btn ghost sm" data-site-del="${x.id}">${esc(ss('remove'))}</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="hub-toolbar"><input type="text" class="ps-select" id="soc-site-new" placeholder="${esc(ss('siteName'))}"><button class="btn primary sm" id="soc-site-add">${esc(ss('addSite'))}</button></div>
      </div>
    </div>

    <div class="panel"><div class="panel-head"><h2>${esc(ss('requests'))}</h2></div>
      ${s.requests.length ? `<div class="tablewrap"><table><tbody>${s.requests.map((r) => `<tr><td>#${r.id}</td><td>${esc(r.type)}${r.account_id ? ' · ' + esc(accName.get(r.account_id) || r.account_id) : ''}</td>
        <td><span class="badge ${SOC_REQ_CLASS[r.status] || 'b-neutral'}">${esc(ss('r_' + r.status))}</span>${r.progress && r.progress.total && r.status === 'running' ? ` ${r.progress.done}/${r.progress.total}` : ''}</td>
        <td class="hub-small">${esc(r.user_name || '')} · ${esc(when(r.created_at))}</td><td class="hub-small">${esc(r.error || '')}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">—</p>`}
    </div>`;

  // Editors see everything read-only; the server also refuses their changes (requireAdmin).
  if (!window.__isAdmin) {
    $$('input, select', el).forEach((x) => { x.disabled = true; });
    $$('button', el).forEach((b) => { b.hidden = true; });
    el.insertAdjacentHTML('afterbegin', `<div class="ps-warn">${icon('alert')}<span>${esc(ss('adminOnly'))}</span></div>`);
    return;
  }
  const redraw = () => renderSocialSettings(el);
  const send = async (url, method, body, toast) => {
    try { await hubJson(url, { method, body }); showToast(toast || ss('saved')); } catch (e) { showToast(e.message); }
    redraw();
  };
  $$('[data-acc-active]', el).forEach((c) => c.addEventListener('change', () => send(`/api/social/accounts/${c.dataset.accActive}`, 'PATCH', { active: c.checked })));
  $$('[data-acc-site]', el).forEach((c) => c.addEventListener('change', () => send(`/api/social/accounts/${c.dataset.accSite}`, 'PATCH', { site_id: c.value ? Number(c.value) : null })));
  $$('[data-acc-refresh]', el).forEach((b) => b.addEventListener('click', () => send('/api/social/requests', 'POST', { type: 'refresh', account_id: Number(b.dataset.accRefresh) }, ss('refreshQueued'))));
  $$('[data-ad-active]', el).forEach((c) => c.addEventListener('change', () => send(`/api/social/ad-accounts/${encodeURIComponent(c.dataset.adActive)}`, 'PATCH', { active: c.checked })));
  $$('[data-ad-site]', el).forEach((c) => c.addEventListener('change', () => send(`/api/social/ad-accounts/${encodeURIComponent(c.dataset.adSite)}`, 'PATCH', { site_id: c.value ? Number(c.value) : null })));
  $$('[data-site-name]', el).forEach((i) => i.addEventListener('change', () => send(`/api/social/sites/${i.dataset.siteName}`, 'PATCH', { name: i.value })));
  $$('[data-site-market]', el).forEach((c) => c.addEventListener('change', () => send(`/api/social/sites/${c.dataset.siteMarket}`, 'PATCH', { market: c.value || null })));
  $$('[data-site-del]', el).forEach((b) => b.addEventListener('click', () => { if (confirm(ss('confirmRemoveSite'))) send(`/api/social/sites/${b.dataset.siteDel}`, 'DELETE'); }));
  $('#soc-site-add', el).addEventListener('click', () => { const name = $('#soc-site-new', el).value.trim(); if (name) send('/api/social/sites', 'POST', { name }); });
  $('#soc-discover', el).addEventListener('click', () => send('/api/social/requests', 'POST', { type: 'discover' }, ss('discoverQueued')));
  $('#soc-history', el).addEventListener('click', () => send('/api/social/requests', 'POST', { type: 'history', params: { days: Number($('#soc-days', el).value) || 30 } }, ss('historyQueued')));
}

window.renderSocialSettings = renderSocialSettings;
