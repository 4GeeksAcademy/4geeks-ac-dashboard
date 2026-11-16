'use strict';
/* Social → Inbox (admins). Comments (organic and on ads) and Instagram DMs of the accounts switched on:
   filters, detail with the thread, status and category (one or many), and browser notifications
   while the Hub is open. Data: /api/social/inbox/* and /api/social/categories (lib/social/inbox.js).
   Replies are written in Instagram / Business Suite (links in the detail). */

const SOC_INBOX_STATUS = ['new', 'in_review', 'replied', 'closed'];
const SOC_STATUS_CLASS = { new: 'b-other', in_review: 'b-lostu', replied: 'b-won', closed: 'b-neutral' };
const SOC_CAT_COLOR = { blue: 'var(--blue)', teal: '#14b8a6', violet: '#8b5cf6', red: '#ef4444', yellow: '#eab308', gray: '#94a3b8' };
const socIn = { kind: 'comments', status: 'open', account: '', category: '', unanswered: false, q: '', offset: 0, selected: new Set(), cats: [], accounts: [] };
const SOC_PAGE = 50;

const socStatusBadge = (s) => `<span class="badge ${SOC_STATUS_CLASS[s] || 'b-neutral'}">${esc(ss('st_' + s))}</span>`;
const socCatBadge = (id) => { const c = socIn.cats.find((x) => x.id === id); return c ? `<span class="badge plain soc-cat" style="--cat:${SOC_CAT_COLOR[c.color] || SOC_CAT_COLOR.gray}">${esc(c.name)}</span>` : ''; };
const socWhen = (d) => (d ? new Date(d).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const socAccLabel = (id) => { const a = socIn.accounts.find((x) => x.id === id); return a ? `${socNet(a.network)} ${esc(socAccName(a))}` : ''; };

async function renderSocialInbox(el) {
  if (!window.__isAdmin) { el.innerHTML = `<div class="panel state-card">${icon('alert')}<p>${esc(ss('inboxAdminOnly'))}</p></div>`; return; }
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:220px"></div></div>';
  try {
    const q = new URLSearchParams({ limit: SOC_PAGE, offset: socIn.offset, status: socIn.status === 'all' ? '' : socIn.status, account_id: socIn.account, category_id: socIn.category, unanswered: socIn.unanswered, q: socIn.q });
    const [cats, status, summary, list] = await Promise.all([
      hubJson('/api/social/categories'), hubJson('/api/social/status'), hubJson('/api/social/inbox/summary'),
      hubJson(`/api/social/inbox/${socIn.kind}?${q}`),
    ]);
    if (state.view !== 'social_inbox') return;
    socIn.cats = cats.categories; socIn.accounts = status.accounts.filter((a) => a.active && a.platform === 'meta');
    socInboxDraw(el, summary, list);
  } catch (e) { socError(el, e); }
}

function socInboxDraw(el, summary, list) {
  const C = summary.comments; const M = summary.messages; const isComments = socIn.kind === 'comments';
  const accounts = isComments ? socIn.accounts : socIn.accounts.filter((a) => a.network === 'instagram');
  const activeCats = socIn.cats.filter((c) => c.active);
  el.innerHTML = `
    <div class="kpis">
      ${socKpi(ss('openComments'), C.open, { compare: false })}${socKpi(ss('unansweredComments'), C.unanswered, { compare: false })}
      ${socKpi(ss('openDms'), M.open, { compare: false })}${socKpi(ss('unansweredDms'), M.unanswered, { compare: false })}
    </div>
    <div class="hub-toolbar">
      <div class="seg seg-sm" id="si-kind">${[['comments', ss('comments')], ['conversations', ss('dms')]].map(([v, l]) => `<button data-v="${v}" class="${socIn.kind === v ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
      <div class="seg seg-sm" id="si-status">${['open', ...SOC_INBOX_STATUS, 'all'].map((v) => `<button data-v="${v}" class="${socIn.status === v ? 'active' : ''}">${esc(ss('st_' + v))}</button>`).join('')}</div>
      <select class="ps-select" id="si-account"><option value="">${esc(ss('allAccounts'))}</option>${accounts.map((a) => `<option value="${a.id}" ${String(a.id) === String(socIn.account) ? 'selected' : ''}>${esc((a.network === 'instagram' ? 'IG ' : 'FB ') + socAccName(a))}</option>`).join('')}</select>
      <select class="ps-select" id="si-cat"><option value="">${esc(ss('category'))}: ${esc(ss('all'))}</option><option value="0" ${socIn.category === '0' ? 'selected' : ''}>${esc(ss('noCategory'))}</option>${socIn.cats.map((c) => `<option value="${c.id}" ${String(c.id) === String(socIn.category) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <label class="hub-small"><input type="checkbox" id="si-unans" ${socIn.unanswered ? 'checked' : ''}> ${esc(ss('unansweredOnly'))}</label>
      <div class="fb-search">${icon('search')}<input type="search" id="si-q" placeholder="${esc(ss('searchInbox'))}" value="${esc(socIn.q)}"></div>
      <span class="hub-spacer"></span>
      <button class="btn ghost sm" id="si-notify">${esc(socNotifyOn() ? ss('notifyOn') : ss('notifyEnable'))}</button>
    </div>
    <div class="soc-bulk" id="si-bulk" ${socIn.selected.size ? '' : 'hidden'}>
      <strong>${esc(ss('selectedN', { n: socIn.selected.size }))}</strong>
      ${SOC_INBOX_STATUS.map((s) => `<button class="btn ghost sm" data-bulk-status="${s}">${esc(ss('st_' + s))}</button>`).join('')}
      <select class="ps-select" id="si-bulk-cat"><option value="">${esc(ss('setCategory'))}</option>${activeCats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="clear">${esc(ss('noCategory'))}</option></select>
    </div>
    <div class="panel">${list.items.length ? `<div class="tablewrap"><table><thead><tr><th><input type="checkbox" id="si-all" aria-label="${esc(ss('selectAll'))}"></th><th>${esc(ss('account'))}</th><th>${esc(isComments ? ss('author') : ss('person'))}</th><th>${esc(isComments ? ss('comment') : ss('lastMessage'))}</th><th>${esc(ss('date'))}</th><th>${esc(ss('status'))}</th><th>${esc(ss('category'))}</th></tr></thead><tbody>
      ${list.items.map((x) => isComments ? `<tr class="clickrow" data-id="${x.id}"><td><input type="checkbox" data-sel="${x.id}" ${socIn.selected.has(x.id) ? 'checked' : ''}></td><td>${socAccLabel(x.account_id)}</td>
          <td>${esc(x.author_name ? (x.network === 'instagram' ? '@' : '') + x.author_name : ss('fbUser'))}${x.origin === 'ad' ? ` <span class="badge b-lostu">${esc(ss('fromAd'))}</span>` : ''}</td>
          <td class="hub-wrap"><div>${esc((x.text || '').slice(0, 140))}</div><div class="muted hub-small">${esc(((x.object && x.object.text) || '').slice(0, 70))}</div></td>
          <td class="hub-small">${esc(socWhen(x.written_at))}${x.replied_at ? `<div class="muted">✓ ${esc(ss('answered'))}</div>` : ''}</td><td>${socStatusBadge(x.status)}</td><td>${socCatBadge(x.category_id)}</td></tr>`
        : `<tr class="clickrow" data-id="${x.id}"><td><input type="checkbox" data-sel="${x.id}" ${socIn.selected.has(x.id) ? 'checked' : ''}></td><td>${socAccLabel(x.account_id)}</td>
          <td>${esc(x.participant_name ? '@' + x.participant_name : '—')}${x.unanswered ? ` <span class="badge b-lostc">${esc(ss('unanswered'))}</span>` : ''}</td>
          <td class="hub-wrap">${x.last ? `${x.last.from_account ? `<span class="muted">${esc(ss('you'))}:</span> ` : ''}${x.last.erased ? `<em class="muted">${esc(ss('erased'))}</em>` : esc((x.last.text || '').slice(0, 140))}` : '—'}</td>
          <td class="hub-small">${esc(socWhen(x.last_message_at))}${x.window_open ? `<div class="muted">${esc(ss('windowOpen'))}</div>` : ''}</td><td>${socStatusBadge(x.status)}</td><td>${socCatBadge(x.category_id)}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="muted">${esc(ss('inboxEmpty'))}</p>`}
      ${list.total > SOC_PAGE ? `<div class="hub-toolbar"><span class="muted hub-small">${socIn.offset + 1}–${Math.min(socIn.offset + SOC_PAGE, list.total)} / ${list.total}</span><button class="btn ghost sm" id="si-prev" ${socIn.offset ? '' : 'disabled'}>←</button><button class="btn ghost sm" id="si-next" ${socIn.offset + SOC_PAGE < list.total ? '' : 'disabled'}>→</button></div>` : ''}
    </div>`;

  const redraw = () => { socIn.offset = 0; socIn.selected.clear(); renderSocialInbox(el); };
  $$('#si-kind button', el).forEach((b) => b.addEventListener('click', () => { socIn.kind = b.dataset.v; socIn.account = ''; redraw(); }));
  $$('#si-status button', el).forEach((b) => b.addEventListener('click', () => { socIn.status = b.dataset.v; redraw(); }));
  $('#si-account', el).addEventListener('change', (e) => { socIn.account = e.target.value; redraw(); });
  $('#si-cat', el).addEventListener('change', (e) => { socIn.category = e.target.value; redraw(); });
  $('#si-unans', el).addEventListener('change', (e) => { socIn.unanswered = e.target.checked; redraw(); });
  $('#si-q', el).addEventListener('change', (e) => { socIn.q = e.target.value.trim(); redraw(); });
  $('#si-notify', el).addEventListener('click', socNotifyEnable);
  if ($('#si-prev', el)) $('#si-prev', el).addEventListener('click', () => { socIn.offset = Math.max(0, socIn.offset - SOC_PAGE); renderSocialInbox(el); });
  if ($('#si-next', el)) $('#si-next', el).addEventListener('click', () => { socIn.offset += SOC_PAGE; renderSocialInbox(el); });
  // Selection and bulk changes
  const syncBulk = () => { const b = $('#si-bulk', el); b.hidden = !socIn.selected.size; $('strong', b).textContent = ss('selectedN', { n: socIn.selected.size }); };
  $$('[data-sel]', el).forEach((c) => { c.addEventListener('click', (e) => e.stopPropagation()); c.addEventListener('change', () => { const id = Number(c.dataset.sel); if (c.checked) socIn.selected.add(id); else socIn.selected.delete(id); syncBulk(); }); });
  if ($('#si-all', el)) $('#si-all', el).addEventListener('change', (e) => { $$('[data-sel]', el).forEach((c) => { c.checked = e.target.checked; const id = Number(c.dataset.sel); if (c.checked) socIn.selected.add(id); else socIn.selected.delete(id); }); syncBulk(); });
  const bulk = async (change) => {
    try { const r = await hubJson(`/api/social/inbox/${socIn.kind}/bulk`, { method: 'POST', body: { ids: [...socIn.selected], ...change } }); showToast(ss('bulkDone', { n: r.updated })); } catch (e) { showToast(e.message); }
    redraw();
  };
  $$('[data-bulk-status]', el).forEach((b) => b.addEventListener('click', () => bulk({ status: b.dataset.bulkStatus })));
  $('#si-bulk-cat', el).addEventListener('change', (e) => { if (e.target.value) bulk(e.target.value === 'clear' ? { clear_category: true } : { category_id: Number(e.target.value) }); });
  $$('tr[data-id]', el).forEach((r) => r.addEventListener('click', () => socInboxDetail(el, Number(r.dataset.id))));
}

async function socInboxDetail(el, id) {
  const isComments = socIn.kind === 'comments';
  let d;
  try { d = await hubJson(`/api/social/inbox/${socIn.kind}/${id}`); } catch (e) { showToast(e.message); return; }
  const o = d.object || {};
  const body = isComments
    ? `${o.text || o.permalink ? `<div class="soc-origin"><div class="muted hub-small">${esc(o.origin === 'ad' ? ss('fromAd') + (o.ad && o.ad.campaign ? ' · ' + o.ad.campaign : '') : ss('fromPost'))}</div><div>${esc(o.text || '')}</div>${/^https:\/\//.test(o.permalink || '') ? `<a href="${esc(o.permalink)}" target="_blank" rel="noopener">${esc(ss('openPost'))}</a>` : ''}</div>` : ''}
       <div class="soc-thread">${d.thread.map((x) => `<div class="soc-msg ${x.own ? 'mine' : ''} ${x.id === d.id ? 'focus' : ''}"><div class="soc-msg-h">${esc(x.own ? ss('you') : (x.author_name || ss('fbUser')))} · ${esc(socWhen(x.written_at))}${x.hidden ? ` · ${esc(ss('hidden'))}` : ''}</div><div>${esc(x.text || '')}</div></div>`).join('')}</div>
       ${/^https:\/\//.test(d.permalink || '') ? `<a href="${esc(d.permalink)}" target="_blank" rel="noopener">${esc(ss('openComment'))}</a>` : ''}`
    : `<div class="soc-thread">${d.messages.map((m) => `<div class="soc-msg ${m.from_account ? 'mine' : ''}"><div class="soc-msg-h">${esc(m.from_account ? ss('you') : '@' + (d.participant_name || '—'))} · ${esc(socWhen(m.written_at))}</div><div>${m.erased ? `<em class="muted">${esc(ss('erased'))}</em>` : esc(m.text || '')}</div></div>`).join('')}</div>
       <p class="muted hub-small">${esc(ss('only20'))} ${d.window_open ? esc(ss('windowUntil', { d: socWhen(d.window_until) })) : esc(ss('windowClosed'))}</p>
       ${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(ss('openBusinessSuite'))}</a>` : ''}`;
  const dr = hubDrawer(`<div class="dr-head"><div class="dr-titles"><h2>${esc(isComments ? (d.author_name || ss('fbUser')) : '@' + (d.participant_name || '—'))}</h2><div class="lead-meta">${socAccLabel(d.account_id)} ${socStatusBadge(d.status)} ${socCatBadge(d.category_id)}</div></div><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="dr-body">${body}
      <h3 class="hub-h3">${esc(ss('classify'))}</h3>
      <div class="hub-toolbar">${SOC_INBOX_STATUS.map((s) => `<button class="btn ${d.status === s ? 'primary' : 'ghost'} sm" data-st="${s}">${esc(ss('st_' + s))}</button>`).join('')}</div>
      <select class="ps-select" id="sd-cat"><option value="">${esc(ss('noCategory'))}</option>${socIn.cats.filter((c) => c.active || c.id === d.category_id).map((c) => `<option value="${c.id}" ${c.id === d.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      ${d.handled_by ? `<p class="muted hub-small">${esc(ss('handledBy', { u: d.handled_by, d: socWhen(d.handled_at) }))}</p>` : ''}
    </div>`);
  const save = async (change) => {
    try { await hubJson(`/api/social/inbox/${socIn.kind}/${id}`, { method: 'PATCH', body: change }); showToast(ss('saved')); closeDrawers(); renderSocialInbox(el); } catch (e) { showToast(e.message); }
  };
  $$('[data-st]', dr).forEach((b) => b.addEventListener('click', () => save({ status: b.dataset.st })));
  $('#sd-cat', dr).addEventListener('change', (e) => save(e.target.value ? { category_id: Number(e.target.value) } : { clear_category: true }));
}

// ---------------- browser notifications (while the Hub is open in a tab) ----------------
const SOC_NOTIFY_KEY = 'socialInboxNotify';
const socNotifyOn = () => { try { return localStorage.getItem(SOC_NOTIFY_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted'; } catch (e) { return false; } };
async function socNotifyEnable() {
  if (!('Notification' in window)) { showToast(ss('notifyUnsupported')); return; }
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p !== 'granted') { showToast(ss('notifyDenied')); return; }
  try { localStorage.setItem(SOC_NOTIFY_KEY, '1'); } catch (e) { /* private mode: works until reload */ }
  showToast(ss('notifyOn'));
  socNotifyStart();
  if (state.view === 'social_inbox') renderSocialInbox($('#tab-social_inbox'));
}
let socNotifyTimer = null; const socMarks = { after_comment: null, after_message: null };
function socNotifyStart() {
  if (socNotifyTimer || !window.__isAdmin) return;
  const poll = async () => {
    if (!socNotifyOn()) return;
    try {
      const q = new URLSearchParams(Object.entries(socMarks).filter(([, v]) => v != null));
      const n = await hubJson('/api/social/inbox/news?' + q);
      const first = socMarks.after_comment == null;
      socMarks.after_comment = n.after_comment; socMarks.after_message = n.after_message;
      if (first) return; // the first call only sets the marks
      const items = [...n.comments.items.map((x) => ({ ...x, kind: 'comments' })), ...n.messages.items.map((x) => ({ ...x, kind: 'conversations' }))];
      const total = n.comments.total + n.messages.total;
      if (!total) return;
      const x = items[0];
      const note = new Notification(total > 1 ? ss('notifyMany', { n: total }) : (x.kind === 'comments' ? ss('notifyComment') : ss('notifyDm')), { body: `${x.author_name ? '@' + x.author_name + ': ' : ''}${x.text || ''}`, tag: 'social-inbox' });
      note.onclick = () => { window.focus(); socIn.kind = x.kind; go('social_inbox'); note.close(); };
    } catch (e) { /* offline or signed out: try again next time */ }
  };
  poll();
  socNotifyTimer = setInterval(poll, 30 * 1000);
}
// Start polling once the user is known to be an admin (dashboard.js sets __isAdmin after /api/me).
setTimeout(function wait() { if (window.__isAdmin) socNotifyStart(); else if (window.__isAdmin === undefined) setTimeout(wait, 2000); }, 2000);

window.renderSocialInbox = renderSocialInbox;
