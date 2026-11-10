'use strict';
/* Social → Analytics. Every account switched on side by side, and one account's detail:
   Community, Account, Posts, Reels (IG), Organic vs paid, Demographics (IG); TikTok: ads and promoted posts.
   Data: /api/social/analytics/* (lib/social/analytics.js). */

const soc = { accountId: null, tab: 'community', sort: 'recent', overview: null };
const SOC_TABS = {
  instagram: ['community', 'account', 'posts', 'reels', 'paid', 'demographics'],
  facebook: ['community', 'account', 'posts', 'paid'],
  // Ads only, until TikTok approves access to the organic account.
  tiktok: ['ads', 'promoted'],
};

async function renderSocialAnalytics(el) {
  el.innerHTML = '<div class="panel"><div class="skeleton" style="height:220px"></div></div>';
  try {
    soc.overview = await hubJson('/api/social/analytics/overview?' + socQuery());
    if (state.view !== 'social_analytics') return;
    const acc = soc.overview.accounts.find((a) => a.id === soc.accountId);
    if (acc) await socDetail(el, acc); else { soc.accountId = null; socOverview(el); }
  } catch (e) { socError(el, e); }
}

// ---------------- all accounts ----------------
function socOverview(el) {
  const o = soc.overview; const tot = o.totals;
  const bar = socPeriodBar(() => renderSocialAnalytics(el), { compare: false });
  const cols = [['followers', fmtN], ['followers_growth', socSigned], ['new_followers', fmtN], ['views', fmtN], ['organic_share', socPct], ['interactions', fmtN], ['posts', fmtN], ['avg_post_engagement', socPct]];
  el.innerHTML = `
    <div class="hub-toolbar">${bar.html}</div>
    <div class="kpis">
      ${socKpi(ss('followers'), tot.followers, { compare: false })}
      ${socKpi(ss('followers_growth'), tot.followers_growth, { fmt: socSigned, compare: false, help: ss('growthHelp') })}
      ${socKpi(ss('views'), tot.views, { compare: false })}
      ${socKpi(ss('interactions'), tot.interactions, { compare: false })}
      ${socKpi(ss('posts'), tot.posts, { compare: false })}
    </div>
    <div class="panel"><div class="panel-head"><div><h2>${esc(ss('comparison'))}</h2><div class="panel-sub">${esc(ss('clickAccount'))}</div></div></div>
      ${o.accounts.length ? `<div class="tablewrap"><table><thead><tr><th>${esc(ss('account'))}</th><th>${esc(ss('site'))}</th>${cols.map(([k]) => `<th class="num">${esc(ss(k))}</th>`).join('')}</tr></thead><tbody>
        ${o.accounts.map((a) => `<tr class="clickrow" data-acc="${a.id}"><td>${socNet(a.network)} <strong>${esc(socAccName(a))}</strong></td><td>${esc(a.site || '—')}${a.market ? ` <span class="muted">· ${esc(a.market)}</span>` : ''}</td>${cols.map(([k, f]) => `<td class="num">${f(a[k])}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>` : `<p class="muted">${esc(ss('noAccounts'))}</p>`}
    </div>`;
  bar.wire(el);
  $$('[data-acc]', el).forEach((r) => r.addEventListener('click', () => { soc.accountId = Number(r.dataset.acc); soc.tab = 'community'; renderSocialAnalytics(el); }));
}

// ---------------- one account ----------------
async function socDetail(el, acc) {
  const tabs = SOC_TABS[acc.network] || SOC_TABS.facebook;
  if (!tabs.includes(soc.tab)) soc.tab = tabs[0];
  const bar = socPeriodBar(() => renderSocialAnalytics(el), { compare: ['community', 'account', 'ads'].includes(soc.tab) });
  el.innerHTML = `
    <div class="hub-toolbar">
      <button class="btn ghost sm" id="soc-back">← ${esc(ss('back'))}</button>
      <h2 class="soc-acc">${socNet(acc.network)} ${esc(socAccName(acc))} <span class="muted">${esc([acc.site, acc.market].filter(Boolean).join(' · '))}</span></h2>
    </div>
    <div class="hub-toolbar">
      <div class="seg seg-sm" id="soc-tabs">${tabs.map((t_) => `<button data-v="${t_}" class="${soc.tab === t_ ? 'active' : ''}">${esc(ss('tab_' + t_))}</button>`).join('')}</div>
      <span class="hub-spacer"></span>${soc.tab === 'demographics' ? '' : bar.html}
    </div>
    <div id="soc-body"><div class="panel"><div class="skeleton" style="height:220px"></div></div></div>`;
  bar.wire(el);
  $('#soc-back', el).addEventListener('click', () => { soc.accountId = null; renderSocialAnalytics(el); });
  $$('#soc-tabs button', el).forEach((b) => b.addEventListener('click', () => { soc.tab = b.dataset.v; renderSocialAnalytics(el); }));
  const body = $('#soc-body', el);
  try {
    await ({ community: socCommunity, account: socAccount, posts: socPosts, reels: socReels, paid: socPaid, demographics: socDemographics, ads: socTikTokAds, promoted: socTikTokPosts })[soc.tab](body, acc);
  } catch (e) { socError(body, e); }
}

const socApi = (acc, what, extra) => hubJson(`/api/social/analytics/accounts/${acc.id}/${what}?${socQuery(extra)}`);
/** Daily series as {days, byMetric: {metric|breakdown: {day: value}}}. */
function socSeries(rows) {
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const by = {};
  rows.forEach((r) => { const k = r.metric + (r.breakdown ? '|' + r.breakdown : ''); (by[k] = by[k] || {})[r.day] = r.value; });
  return { days, get: (k) => days.map((d) => (by[k] && by[k][d] != null ? by[k][d] : null)) };
}
// Tabs redraw without going through renderAll(), so each chart replaces its previous one here.
function socDropChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function socChart(id, type, labels, datasets, { stacked } = {}) {
  socDropChart(id);
  const base = chartBase();
  charts[id] = new Chart($('#' + id), {
    type,
    data: { labels: labels.map((d) => fmtDay(d)), datasets: datasets.map((d) => ({ borderWidth: type === 'line' ? 2 : 0, borderRadius: 3, maxBarThickness: 24, pointRadius: labels.length > 31 ? 0 : 2, tension: 0.3, spanGaps: true, ...d })) },
    options: { ...base, scales: { x: { ...base.scales.x, stacked }, y: { ...base.scales.y, stacked } }, plugins: { ...base.plugins, legend: { display: datasets.length > 1, position: 'bottom' } } },
  });
}

async function socCommunity(body, acc) {
  const [k, rows] = await Promise.all([socApi(acc, 'kpis'), socApi(acc, 'series', { metrics: 'followers,new_followers,unfollows' })]);
  const K = k.kpis; const s = socSeries(rows);
  body.innerHTML = `
    <div class="kpis">
      ${socKpi(ss('followers'), K.followers, { compare: false })}
      ${socKpi(ss('followers_growth'), K.followers_growth, { fmt: socSigned, compare: false, help: ss('growthHelp') })}
      ${socKpi(ss('new_followers'), K.new_followers)}
      ${acc.network === 'facebook' ? socKpi(ss('unfollows'), K.unfollows) : socKpi(ss('profile_visits'), K.profile_visits)}
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(ss('new_followers'))}</h2></div><div class="chart-box sm"><canvas id="soc-c-new"></canvas></div></div>
      <div class="panel"><div class="panel-head"><h2>${esc(ss('followers'))}</h2></div><div class="chart-box sm"><canvas id="soc-c-fol"></canvas></div></div>
    </div>`;
  socChart('soc-c-new', 'bar', s.days, [{ label: ss('new_followers'), data: s.get('new_followers'), backgroundColor: cssVar('--blue') },
    ...(acc.network === 'facebook' ? [{ label: ss('unfollows'), data: s.get('unfollows').map((v) => (v == null ? null : -v)), backgroundColor: cssVar('--c-c') }] : [])], { stacked: true });
  socChart('soc-c-fol', 'line', s.days, [{ label: ss('followers'), data: s.get('followers'), borderColor: cssVar('--blue'), backgroundColor: cssVar('--blue') }]);
}

async function socAccount(body, acc) {
  const [k, rows] = await Promise.all([socApi(acc, 'kpis'), socApi(acc, 'series', { metrics: 'views,interactions,reach' })]);
  const K = k.kpis; const s = socSeries(rows); const fb = acc.network === 'facebook';
  body.innerHTML = `
    <div class="kpis">
      ${socKpi(ss('views'), K.views)}
      ${fb ? socKpi(ss('organic_share'), K.organic_share, { fmt: socPct }) : ''}
      ${socKpi(ss('avg_daily_reach'), K.avg_daily_reach, { help: ss('reachHelp') })}
      ${socKpi(ss('interactions'), K.interactions)}
      ${fb ? '' : socKpi(ss('accounts_engaged'), K.accounts_engaged)}
      ${fb ? '' : socKpi(ss('profile_visits'), K.profile_visits)}
    </div>
    <div class="grid2">
      <div class="panel"><div class="panel-head"><h2>${esc(ss('views'))}</h2></div><div class="chart-box sm"><canvas id="soc-c-views"></canvas></div></div>
      <div class="panel"><div class="panel-head"><h2>${esc(ss('interactions'))}</h2></div><div class="chart-box sm"><canvas id="soc-c-int"></canvas></div></div>
    </div>`;
  // Facebook splits views into organic / paid; Instagram account views come as one number.
  socChart('soc-c-views', 'bar', s.days, fb
    ? [{ label: ss('views_organic'), data: s.get('views|organic'), backgroundColor: cssVar('--blue') }, { label: ss('views_paid'), data: s.get('views|paid'), backgroundColor: cssVar('--c-b') }]
    : [{ label: ss('views'), data: s.get('views'), backgroundColor: cssVar('--blue') }], { stacked: true });
  socChart('soc-c-int', 'bar', s.days, [{ label: ss('interactions'), data: s.get('interactions'), backgroundColor: cssVar('--blue') }]);
}

const SOC_SORT = {
  recent: (p) => p.published_at, views: (p) => p.metrics && p.metrics.views, engagement: (p) => p.metrics && p.metrics.engagement_rate,
  saves: (p) => p.metrics && p.metrics.saves, shares: (p) => p.metrics && p.metrics.shares,
};
function socPostsTable(posts, { reels } = {}) {
  if (!posts.length) return `<p class="muted">${esc(ss('noPosts'))}</p>`;
  const m = (p, k) => (p.metrics ? p.metrics[k] : null);
  return `<div class="tablewrap"><table><thead><tr><th>${esc(ss('date'))}</th><th>${esc(ss('caption'))}</th><th class="num">${esc(ss('views'))}</th><th class="num">${esc(ss('reach'))}</th>
    ${reels ? `<th class="num">${esc(ss('avgWatch'))}</th><th class="num">${esc(ss('skipRate'))}</th>` : `<th class="num">${esc(ss('likes'))}</th><th class="num">${esc(ss('comments'))}</th><th class="num">${esc(ss('shares'))}</th><th class="num">${esc(ss('saves'))}</th>`}
    <th class="num">${esc(ss('engagement'))}</th><th class="num">${esc(ss('spend'))}</th><th></th></tr></thead><tbody>
    ${posts.map((p) => `<tr><td>${esc(fmtDay(p.published_at.slice(0, 10)))}</td>
      <td class="hub-wrap"><span class="muted">${esc(p.format || '')}</span>${p.ad_active || p.ads ? ` <span class="badge b-other">${esc(ss('promoted'))}</span>` : ''}<div class="hub-small">${esc((p.caption || '').slice(0, 110))}</div></td>
      <td class="num">${fmtN(m(p, 'views'))}</td><td class="num">${fmtN(m(p, 'reach'))}</td>
      ${reels ? `<td class="num">${m(p, 'avg_watch_s') == null ? '—' : fmtN(m(p, 'avg_watch_s')) + ' ' + ss('seconds')}</td><td class="num">${m(p, 'skip_rate') == null ? '—' : fmtN(m(p, 'skip_rate')) + '%'}</td>`
    : `<td class="num">${fmtN(m(p, 'likes'))}</td><td class="num">${fmtN(m(p, 'comments'))}</td><td class="num">${fmtN(m(p, 'shares'))}</td><td class="num">${fmtN(m(p, 'saves'))}</td>`}
      <td class="num">${socPct(m(p, 'engagement_rate'))}</td><td class="num">${p.ads ? esc(socMoney(p.ads.spend)) : '—'}</td>
      <td>${/^https:\/\//.test(p.permalink || '') ? `<a href="${esc(p.permalink)}" target="_blank" rel="noopener">${esc(ss('open'))}</a>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}
const socAvg = (posts, k) => { const v = posts.map((p) => p.metrics && p.metrics[k]).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

async function socPosts(body, acc) {
  const posts = await socApi(acc, 'posts');
  const key = SOC_SORT[soc.sort] || SOC_SORT.recent;
  const sorted = [...posts].sort((a, b) => ((key(b) ?? -Infinity) > (key(a) ?? -Infinity) ? 1 : -1));
  const asOf = posts.map((p) => p.snapshot_day).filter(Boolean).sort().pop();
  body.innerHTML = `
    <div class="kpis">
      ${socKpi(ss('posts'), posts.length, { compare: false })}
      ${socKpi(ss('avgViews'), socAvg(posts, 'views'), { compare: false })}
      ${socKpi(ss('avg_post_engagement'), socAvg(posts, 'engagement_rate'), { fmt: socPct, compare: false })}
      ${socKpi(ss('promoted'), posts.filter((p) => p.ad_active || p.ads).length, { compare: false })}
    </div>
    <div class="panel"><div class="panel-head"><div><h2>${esc(ss('posts'))}</h2>${asOf ? `<div class="panel-sub">${esc(ss('dataAsOf', { d: fmtDay(asOf) }))}</div>` : ''}</div>
      <select class="ps-select" id="soc-sort" aria-label="${esc(ss('sortBy'))}">${Object.keys(SOC_SORT).map((k) => `<option value="${k}" ${soc.sort === k ? 'selected' : ''}>${esc(ss('s_' + k))}</option>`).join('')}</select></div>
      ${socPostsTable(sorted)}</div>`;
  $('#soc-sort', body).addEventListener('change', (e) => { soc.sort = e.target.value; socPosts(body, acc); });
}

async function socReels(body, acc) {
  const reels = await socApi(acc, 'posts', { format: 'REELS' });
  body.innerHTML = `
    <div class="kpis">
      ${socKpi(ss('reels'), reels.length, { compare: false })}
      ${socKpi(ss('views_organic'), socAvg(reels, 'views_organic'), { compare: false })}
      ${socKpi(ss('avgWatch'), socAvg(reels, 'avg_watch_s'), { fmt: (v) => `${fmtN(v)} ${ss('seconds')}`, compare: false })}
      ${socKpi(ss('skipRate'), socAvg(reels, 'skip_rate'), { fmt: (v) => `${fmtN(v)}%`, compare: false })}
    </div>
    <div class="panel">${socPostsTable([...reels].sort((a, b) => ((b.metrics && b.metrics.views) || 0) - ((a.metrics && a.metrics.views) || 0)), { reels: true })}</div>`;
}

async function socPaid(body, acc) {
  const posts = await socApi(acc, 'posts');
  const fb = acc.network === 'facebook';
  const sum = (k) => posts.reduce((a, p) => a + ((p.metrics && p.metrics[k]) || 0), 0);
  const org = sum('views_organic'); const paid = sum('views_paid');
  // Promoted = an active ad or ad spend linked to the post (same rule as the Posts tab).
  // Not "has paid views": the Instagram estimate also counts views on Facebook.
  const promoted = posts.filter((p) => p.ad_active || p.ads);
  const withPaid = posts.filter((p) => p.metrics && p.metrics.views_paid).sort((a, b) => b.metrics.views_paid - a.metrics.views_paid);
  body.innerHTML = `
    <div class="kpis">
      ${socKpi(ss('views_organic'), org, { compare: false })}
      ${socKpi(ss('views_paid'), paid, { compare: false, help: fb ? null : ss('paidApprox') })}
      ${socKpi(ss('organic_share'), org + paid ? org / (org + paid) : null, { fmt: socPct, compare: false })}
      ${socKpi(ss('promoted'), promoted.length, { compare: false })}
    </div>
    ${fb ? '' : `<p class="muted hub-small">${esc(ss('paidApprox'))}</p>`}
    <div class="panel"><div class="panel-head"><h2>${esc(ss('views'))}</h2></div><div class="chart-box"><canvas id="soc-c-paid"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h2>${esc(ss('withPaidViews'))}</h2></div>${socPostsTable(withPaid)}</div>`;
  const top = [...posts].sort((a, b) => ((b.metrics && b.metrics.views) || 0) - ((a.metrics && a.metrics.views) || 0)).slice(0, 15);
  const base = chartBase();
  socDropChart('soc-c-paid');
  charts['soc-c-paid'] = new Chart($('#soc-c-paid'), {
    type: 'bar',
    data: { labels: top.map((p) => `${fmtDay(p.published_at.slice(0, 10))} · ${(p.caption || p.format || '').slice(0, 24)}`), datasets: [
      { label: ss('views_organic'), data: top.map((p) => p.metrics && p.metrics.views_organic), backgroundColor: cssVar('--blue'), borderRadius: 3, maxBarThickness: 24 },
      { label: ss('views_paid'), data: top.map((p) => p.metrics && p.metrics.views_paid), backgroundColor: cssVar('--c-b'), borderRadius: 3, maxBarThickness: 24 },
    ] },
    options: { ...base, indexAxis: 'y', scales: { x: { ...base.scales.y, stacked: true }, y: { ...base.scales.x, stacked: true } }, plugins: { ...base.plugins, legend: { display: true, position: 'bottom' } } },
  });
}

async function socDemographics(body, acc) {
  const d = await hubJson(`/api/social/analytics/accounts/${acc.id}/demographics`);
  if (!d.day) { body.innerHTML = `<div class="panel"><p class="muted">${esc(ss('noDemo'))}</p></div>`; return; }
  const list = (rows, label) => {
    const top = (rows || []).slice(0, 12); const max = top.length ? top[0].value : 1;
    return `<div class="panel"><div class="panel-head"><h2>${esc(label)}</h2></div><div class="hub-bars">${top.map((r) => `<div class="hub-bar-row"><span class="hub-bar-l">${esc(r.key.replace('|', ' · '))}</span><span class="hub-bar-track"><i style="width:${Math.round((100 * r.value) / max)}%"></i></span><span class="hub-bar-v">${fmtN(r.value)}</span></div>`).join('') || `<p class="muted">—</p>`}</div></div>`;
  };
  body.innerHTML = `<p class="muted hub-small">${esc(ss('demoAsOf', { d: fmtDay(d.day) }))}</p>
    <div class="grid2">${list(d.dimensions.country, ss('countries'))}${list(d.dimensions.city, ss('cities'))}</div>
    ${list(d.dimensions.age_gender, ss('ageGender'))}`;
}

// ---------------- TikTok (ads) ----------------
const socTtMoney = (v, cur) => (v == null ? '—' : `${Number(v).toLocaleString(locale(), { maximumFractionDigits: 2 })} ${cur || ''}`.trim());
/** Note shown when the period has no spend (campaigns paused), with the last day that had some. */
const socNoSpend = (d) => (d.kpis.spend.current ? '' : `<div class="ps-warn">${icon('alert')}<span>${esc(ss('ttNoSpend', { d: d.last_spend_day ? fmtDay(d.last_spend_day, { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }))}</span></div>`);

async function socTikTokAds(body, acc) {
  const d = await socApi(acc, 'tiktok-ads'); const K = d.kpis; const cur = d.currency;
  body.innerHTML = `${socNoSpend(d)}
    <div class="kpis k8">
      ${socKpi(ss('spend'), K.spend, { fmt: (v) => socTtMoney(v, cur) })}
      ${socKpi(ss('ttImpressions'), K.impressions)}
      ${socKpi(ss('ttPlays'), K.plays)}
      ${socKpi(ss('ttClicks'), K.clicks)}
      ${socKpi('CTR', K.ctr, { fmt: socPct })}
      ${socKpi('CPM', K.cpm, { fmt: (v) => socTtMoney(v, cur) })}
      ${socKpi(ss('ttFollows'), K.follows)}
      ${socKpi(ss('ttAdsWithSpend'), K.ads)}
    </div>
    <div class="panel"><div class="panel-head"><h2>${esc(ss('spend'))}</h2></div><div class="chart-box sm"><canvas id="soc-c-tt"></canvas></div></div>
    <div class="panel"><div class="panel-head"><div><h2>${esc(ss('ttIdentities'))}</h2><div class="panel-sub">${esc(ss('ttIdentitiesHelp'))}</div></div></div>
      ${d.identities.length ? `<div class="tablewrap"><table><thead><tr><th>${esc(ss('ttIdentity'))}</th><th>${esc(ss('ttType'))}</th><th class="num">${esc(ss('spend'))}</th><th class="num">${esc(ss('ttImpressions'))}</th><th class="num">${esc(ss('ttPlays'))}</th><th class="num">CTR</th></tr></thead><tbody>
        ${d.identities.map((x) => `<tr><td>${esc(x.identity || '—')}</td><td class="muted">${esc(x.type || '—')}</td><td class="num">${socTtMoney(x.spend, cur)}</td><td class="num">${fmtN(x.impressions)}</td><td class="num">${fmtN(x.plays)}</td><td class="num">${socPct(x.ctr)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">—</p>'}</div>`;
  socChart('soc-c-tt', 'bar', d.series.map((x) => x.day), [{ label: ss('spend'), data: d.series.map((x) => x.spend), backgroundColor: cssVar('--blue') }]);
}

async function socTikTokPosts(body, acc) {
  const d = await socApi(acc, 'tiktok-ads'); const cur = d.currency;
  const onPosts = d.posts.reduce((a, p) => a + (p.spend || 0), 0);
  body.innerHTML = `${socNoSpend(d)}
    <div class="kpis">
      ${socKpi(ss('ttPromotedPosts'), d.posts.length, { compare: false })}
      ${socKpi(ss('ttSpendOnPosts'), onPosts, { fmt: (v) => socTtMoney(v, cur), compare: false })}
      ${socKpi(ss('ttShareOnPosts'), d.kpis.spend.current ? onPosts / d.kpis.spend.current : null, { fmt: socPct, compare: false, help: ss('ttShareHelp') })}
    </div>
    <div class="panel">${d.posts.length ? `<div class="tablewrap"><table><thead><tr><th>${esc(ss('ttPost'))}</th><th>${esc(ss('ttIdentity'))}</th><th>${esc(ss('ttDays'))}</th><th class="num">${esc(ss('spend'))}</th><th class="num">${esc(ss('ttImpressions'))}</th><th class="num">${esc(ss('ttPlays'))}</th><th class="num">${esc(ss('likes'))}</th><th class="num">${esc(ss('ttFollows'))}</th></tr></thead><tbody>
      ${d.posts.map((p) => `<tr><td class="hub-small">${esc(p.item_id)}</td><td>${esc(p.identity || '—')}</td><td class="hub-small">${esc(fmtDay(p.first_day))} – ${esc(fmtDay(p.last_day))}</td><td class="num">${socTtMoney(p.spend, cur)}</td><td class="num">${fmtN(p.impressions)}</td><td class="num">${fmtN(p.plays)}</td><td class="num">${fmtN(p.likes)}</td><td class="num">${fmtN(p.follows)}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="muted">${esc(ss('noPosts'))}</p>`}</div>`;
}

window.renderSocialAnalytics = renderSocialAnalytics;
