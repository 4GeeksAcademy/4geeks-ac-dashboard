let ALL = [];
let META = { generatedAt: null, cacheAgeSeconds: null };
let authToken = localStorage.getItem('dashboardToken');

// ---- Authentication ----
function checkAuth(){
  if(!authToken){
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    return false;
  }
  return true;
}

function handleLogin(e){
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  fetch('/api/login', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({ username, password })
  })
  .then(r=>{
    if(!r.ok) throw new Error('Invalid credentials');
    return r.json();
  })
  .then(data=>{
    authToken = data.token;
    localStorage.setItem('dashboardToken', authToken);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    location.reload();
  })
  .catch(e=>{
    document.getElementById('login-error').textContent = e.message;
    document.getElementById('login-error').style.display = 'block';
  });
}

function handleLogout(){
  localStorage.removeItem('dashboardToken');
  authToken = null;
  location.reload();
}

// ---- Dashboard ----
const BUCKET_LABEL = { 'Won':'Won', 'Lost - Classified':'Lost (classified)', 'Lost - Unclassified':'Lost (no reason)', 'Active / Other':'Active / Other' };
const BUCKET_CLASS = { 'Won':'b-won', 'Lost - Classified':'b-lostc', 'Lost - Unclassified':'b-lostu', 'Active / Other':'b-other' };
const REGIONS = ['USA','Spain','LATAM'];

const state = { region:'all', bucket:'all', source:'all', medium:'all', campaign:'all', location:'all', course:'all', assignTo:'all', reason:'all', q:'', dateFrom:'', dateTo:'', admissionsScore:'all', leadSentiment:'all', admissionsConversationType:'all', classification:'all', dealQuality:'all' };
let sortState = { field:'date', dir:'desc' };
function syncStateFromUrl(){
  const params = new URLSearchParams(location.search);
  Object.keys(state).forEach(k=>{ if(params.has(k)) state[k] = params.get(k); });
}
function syncStateToUrl(){
  const params = new URLSearchParams();
  Object.entries(state).forEach(([k,v])=>{ if(v && v!=='all') params.set(k, v); });
  const qs = params.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}
function showToast(msg){
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2200);
}

async function loadData(region){
  const url = region && region!=='all' ? `/api/summary?region=${encodeURIComponent(region)}` : '/api/summary';
  let data = null;
  for(let attempt=0; attempt<180; attempt++){
    const res = await fetch(url);
    if(res.status===202){
      const body = await res.json().catch(()=>({}));
      document.getElementById('freshness').textContent = body.lastError ? `Loading from ActiveCampaign… (retrying after error: ${body.lastError})` : 'Loading from ActiveCampaign… (first load can take a few minutes)';
      await new Promise(r=>setTimeout(r, 3000));
      continue;
    }
    if(!res.ok){
      const err = await res.json().catch(()=>({error:res.statusText}));
      document.getElementById('freshness').innerHTML = `<span style="color:#ff6b6b">Failed to load: ${err.error||res.statusText}</span>`;
      document.querySelector('.wrap').insertAdjacentHTML('beforeend', `<div class="error">Could not reach ActiveCampaign. Check AC_API_URL / AC_API_KEY env vars, or open <a href="/api/schema" style="color:#ff9d6b">/api/schema</a> to debug.</div>`);
      throw new Error(err.error||res.statusText);
    }
    data = await res.json();
    break;
  }
  if(!data) throw new Error('Timed out waiting for ActiveCampaign data');
  ALL = data.records;
  META = { generatedAt: data.generatedAt, cacheAgeSeconds: data.cacheAgeSeconds };
  renderFreshness();
}

function renderFreshness(){
  const el = document.getElementById('freshness');
  const t = META.generatedAt ? new Date(META.generatedAt).toLocaleString() : '—';
  el.innerHTML = `Data as of ${t} (cached ${META.cacheAgeSeconds ?? '?'}s ago) <button id="btn-refresh">Refresh now</button> <button id="btn-copy-link" class="ghost">Copy link to this view</button>`;
  document.getElementById('btn-refresh').addEventListener('click', async ()=>{
    document.getElementById('btn-refresh').textContent = 'Refreshing…';
    await fetch('/api/refresh', { method:'POST' });
    await loadData(state.region);
    buildFilters();
    renderAll();
  });
  document.getElementById('btn-copy-link').addEventListener('click', async ()=>{
    syncStateToUrl();
    try{ await navigator.clipboard.writeText(location.href); showToast('Link copied to clipboard'); }
    catch(e){ showToast('Could not copy link'); }
  });
}

function uniq(field){ const s=new Set(); ALL.forEach(r=>{ if(r[field]) s.add(r[field]); }); return Array.from(s).sort(); }
// The Lost Reasons field is a multiselect on the AC side (a deal can have 2+
// reasons checked), so `r.reasons` is always an array (possibly empty) while
// `r.reason` is a comma-joined display string. Anywhere we count/filter/group
// by reason we need to explode that array per-deal instead of treating the
// joined string as one atomic value -- otherwise "A" and "A, B" look like two
// unrelated reasons instead of both counting toward reason "A".
function uniqReasons(){ const s=new Set(); ALL.forEach(r=>{ (r.reasons||[]).forEach(x=>{ if(x) s.add(x); }); }); return Array.from(s).sort(); }
function countByReasons(rows){ const m={}; rows.forEach(r=>{ (r.reasons||[]).forEach(x=>{ if(x) m[x]=(m[x]||0)+1; }); }); return m; }

function filtered(){
  return ALL.filter(r=>{
    if(state.region!=='all' && r.region!==state.region) return false;
    if(state.bucket!=='all' && r.bucket!==state.bucket) return false;
    if(state.source!=='all' && r.source!==state.source) return false;
    if(state.medium!=='all' && r.medium!==state.medium) return false;
    if(state.campaign!=='all' && r.campaign!==state.campaign) return false;
    if(state.location!=='all' && r.location!==state.location) return false;
    if(state.course!=='all' && r.course!==state.course) return false;
    if(state.assignTo!=='all' && r.assignTo!==state.assignTo) return false;
    if(state.reason!=='all' && !(r.reasons||[]).includes(state.reason)) return false;
    if(state.admissionsScore!=='all' && r.admissionsScore!==state.admissionsScore) return false;
    if(state.leadSentiment!=='all' && r.leadSentiment!==state.leadSentiment) return false;
    if(state.admissionsConversationType!=='all' && r.admissionsConversationType!==state.admissionsConversationType) return false;
    if(state.classification!=='all' && r.classification!==state.classification) return false;
    if(state.dealQuality!=='all' && r.dealQuality!==state.dealQuality) return false;
    if(state.dateFrom && (!r.date || r.date < state.dateFrom)) return false;
    if(state.dateTo && (!r.date || r.date > state.dateTo)) return false;
    if(state.q){
      const q = state.q.toLowerCase();
      const hay = [r.name,r.email,r.id,r.campaign,r.location,r.course,r.reason].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function fmtPct(n,d){ return d? (n/d*100).toFixed(1)+'%' : '0%'; }
function countBy(rows, field){ const m={}; rows.forEach(r=>{ const k=r[field]||'(none)'; m[k]=(m[k]||0)+1; }); return m; }

function selectHtml(id,label,field,extraOptions){
  const opts = extraOptions || uniq(field).map(v=>({v,l:v}));
  return `<div class="filt"><label>${label}</label><select id="${id}">
    <option value="all">All</option>
    ${opts.map(o=>`<option value="${o.v}">${o.l}</option>`).join('')}
  </select></div>`;
}

function buildFilters(){
    const el = document.getElementById('filters');
    el.innerHTML = `
        <div class="filters-row">
              ${selectHtml('f-region','Region','', REGIONS.map(v=>({v,l:v})))}
                    ${selectHtml('f-bucket','Status bucket','bucket', Object.keys(BUCKET_LABEL).map(v=>({v,l:BUCKET_LABEL[v]})))}
                          ${selectHtml('f-reason','Lost reason','', uniqReasons().map(v=>({v,l:v})))}
                                ${selectHtml('f-admissionsConversationType','Admissions conversation type','admissionsConversationType')}
                                      <div class="filt"><label>Search</label><input type="text" id="f-q" placeholder="name, email, id, campaign..."></div>
                                            <button class="toggle-more" id="toggle-more">More filters &#9662;</button>
                                                  <div class="filt" style="margin-left:auto;"><label>&nbsp;</label><button class="ghost" id="f-reset">Reset filters</button></div>
                                                      </div>
                                                          <div class="filters-more" id="filters-more">
                                                                <div class="section-lab">Admissions</div>
                                                                      ${selectHtml('f-admissionsScore','Admission code test score','admissionsScore')}
                                                                            ${selectHtml('f-leadSentiment','Lead sentiment','leadSentiment')}
                                                                                  ${selectHtml('f-dealQuality','Deal quality','dealQuality')}
                                                                                        ${selectHtml('f-classification','Classification','classification')}
                                                                                              <div class="section-lab">Attribution</div>
                                                                                                    ${selectHtml('f-source','UTM Source','source')}
                                                                                                          ${selectHtml('f-medium','UTM Medium','medium')}
                                                                                                                ${selectHtml('f-campaign','Campaign','campaign')}
                                                                                                                      <div class="section-lab">Other</div>
                                                                                                                            ${selectHtml('f-location','Location','location')}
                                                                                                                                  ${selectHtml('f-course','Course','course')}
                                                                                                                                        ${selectHtml('f-assignTo','Owner','assignTo')}
                                                                                                                                              <div class="filt"><label>From date</label><input type="date" id="f-from"></div>
                                                                                                                                                    <div class="filt"><label>To date</label><input type="date" id="f-to"></div>
                                                                                                                                                        </div>
                                                                                                                                                          `;
    document.getElementById('toggle-more').addEventListener('click', ()=>{
          document.getElementById('filters-more').classList.toggle('open');
          document.getElementById('toggle-more').classList.toggle('open');
    });
    ['region','bucket','source','medium','campaign','location','course','assignTo','reason','admissionsScore','leadSentiment','admissionsConversationType','classification','dealQuality'].forEach(k=>{
          const elx = document.getElementById('f-'+k); if(elx && state[k]) elx.value = state[k];
    });
    if(state.dateFrom) document.getElementById('f-from').value = state.dateFrom;
    if(state.dateTo) document.getElementById('f-to').value = state.dateTo;
    if(state.q) document.getElementById('f-q').value = state.q;
    ['region','bucket','source','medium','campaign','location','course','assignTo','reason','admissionsScore','leadSentiment','admissionsConversationType','classification','dealQuality'].forEach(k=>{
          document.getElementById('f-'+k).addEventListener('change', async e=>{
                  state[k]=e.target.value;
                  if(k==='region'){ await loadData(state.region==='all'?undefined:state.region); }
                  renderAll();
          });
    });
    document.getElementById('f-from').addEventListener('change', e=>{ state.dateFrom=e.target.value; renderAll(); });
    document.getElementById('f-to').addEventListener('change', e=>{ state.dateTo=e.target.value; renderAll(); });
    document.getElementById('f-q').addEventListener('input', e=>{ state.q=e.target.value; renderAll(); });
    document.getElementById('f-reset').addEventListener('click', async ()=>{
          Object.keys(state).forEach(k=> state[k] = (k==='q'||k==='dateFrom'||k==='dateTo') ? '' : 'all');
          document.querySelectorAll('#filters select').forEach(s=>s.value='all');
          document.getElementById('f-from').value=''; document.getElementById('f-to').value=''; document.getElementById('f-q').value='';
          await loadData();
          renderAll();
    });
}

function jumpToIndividual(field, value){
  state[field]=value;
  const sel = document.getElementById('f-'+field);
  if(sel) sel.value = value;
  document.querySelector('.tab[data-tab=individual]').click();
}

function renderKpis(rows){
  const total = rows.length;
  const won = rows.filter(r=>r.bucket==='Won').length;
  const lostc = rows.filter(r=>r.bucket==='Lost - Classified').length;
  const lostu = rows.filter(r=>r.bucket==='Lost - Unclassified').length;
  const other = rows.filter(r=>r.bucket==='Active / Other').length;
  document.getElementById('kpis').innerHTML = `
    <div class="kpi"><div class="val">${total.toLocaleString()}</div><div class="lbl">Deals in view</div></div>
    <div class="kpi won"><div class="val">${won}</div><div class="lbl">Won</div></div>
    <div class="kpi lostc"><div class="val">${lostc}</div><div class="lbl">Lost — classified</div></div>
    <div class="kpi lostu"><div class="val">${lostu}</div><div class="lbl">Lost — no reason</div></div>
    <div class="kpi other"><div class="val">${other}</div><div class="lbl">Active / other</div></div>
    <div class="kpi"><div class="val">${fmtPct(lostc+lostu,total)}</div><div class="lbl">Loss rate</div></div>
  `;
}

function renderBarList(elId, rows, field, topN, jumpField, countsOverride){
  const counts = countsOverride || countBy(rows, field);
  const total = rows.length || 1;
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,topN);
  const max = top.length ? top[0][1] : 1;
  document.getElementById(elId).innerHTML = top.map(([k,v])=>`
    <div class="barrow">
      <div class="lab clickable" title="${k}" data-field="${jumpField}" data-value="${k}">${k}</div>
      <div class="track"><div class="fill" style="width:${(v/max*100).toFixed(1)}%"></div></div>
      <div class="num">${v} (${fmtPct(v,total)})</div>
    </div>
  `).join('') || '<span class="muted">No data</span>';
  document.getElementById(elId).querySelectorAll('.clickable').forEach(elx=>{
    elx.addEventListener('click', ()=> jumpToIndividual(elx.dataset.field, elx.dataset.value));
  });
}

let weeklyChart, sourceChart;
function renderOverview(rows){
  const el = document.getElementById('tab-overview');
  el.innerHTML = `
    <div class="panel"><h2>Weekly volume by outcome</h2><canvas id="chart-weekly" height="80"></canvas></div>
    <div class="grid2">
      <div class="panel"><h2>Top locations</h2><div id="loc-bars"></div></div>
      <div class="panel"><h2>Top campaigns</h2><div id="camp-bars"></div></div>
    </div>
    <div class="grid2">
      <div class="panel"><h2>Source mix</h2><canvas id="chart-source" height="180"></canvas></div>
      <div class="panel"><h2>Course mix</h2><div id="course-bars"></div></div>
    </div>
  `;
  const weeks = Array.from(new Set(rows.map(r=>r.week).filter(Boolean))).sort();
  const buckets = Object.keys(BUCKET_LABEL);
  const colors = {'Won':'#3fd68a','Lost - Classified':'#ff6b6b','Lost - Unclassified':'#ff9d6b','Active / Other':'#6d8dff'};
  const datasets = buckets.map(b=>({ label: BUCKET_LABEL[b], data: weeks.map(w=> rows.filter(r=>r.week===w && r.bucket===b).length), backgroundColor: colors[b] }));
  if(weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(document.getElementById('chart-weekly'), { type:'bar', data:{ labels:weeks, datasets },
    options:{ responsive:true, plugins:{legend:{labels:{color:'#e8ecf5'}}}, scales:{ x:{stacked:true, ticks:{color:'#8b95ac'}, grid:{color:'#2a3348'}}, y:{stacked:true, ticks:{color:'#8b95ac'}, grid:{color:'#2a3348'}} } } });

  renderBarList('loc-bars', rows, 'location', 8, 'location');
  renderBarList('camp-bars', rows, 'campaign', 8, 'campaign');
  renderBarList('course-bars', rows, 'course', 6, 'course');

  const srcCounts = countBy(rows,'source');
  const top = Object.entries(srcCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(sourceChart) sourceChart.destroy();
  sourceChart = new Chart(document.getElementById('chart-source'), { type:'doughnut',
    data:{ labels: top.map(t=>t[0]||'(none)'), datasets:[{ data: top.map(t=>t[1]), backgroundColor:['#6d8dff','#9b7bff','#3fd68a','#ffb648','#ff6b6b','#ff9d6b','#5b6584','#8b95ac'] }] },
    options:{ plugins:{legend:{position:'right', labels:{color:'#e8ecf5', boxWidth:12, font:{size:11}}}} } });
}

function renderRegions(){
  const el = document.getElementById('tab-regions');
  el.innerHTML = `<div class="panel"><h2>Loading region comparison…</h2></div>`;
  // Regions tab always compares against the FULL unfiltered dataset for the current region selector context
  const cols = REGIONS.map(region=>{
    const rows = ALL.filter(r=>r.region===region);
    const total = rows.length;
    const won = rows.filter(r=>r.bucket==='Won').length;
    const lostc = rows.filter(r=>r.bucket==='Lost - Classified').length;
    const lostu = rows.filter(r=>r.bucket==='Lost - Unclassified').length;
    return `<div class="panel">
      <h2>${region} <span class="count-tag">n=${total}</span></h2>
      <div class="barrow"><div class="lab">Won</div><div class="track"><div class="fill" style="background:#3fd68a;width:${fmtPct(won,total)}"></div></div><div class="num">${won}</div></div>
      <div class="barrow"><div class="lab">Lost (classified)</div><div class="track"><div class="fill" style="background:#ff6b6b;width:${fmtPct(lostc,total)}"></div></div><div class="num">${lostc}</div></div>
      <div class="barrow"><div class="lab">Lost (no reason)</div><div class="track"><div class="fill" style="background:#ff9d6b;width:${fmtPct(lostu,total)}"></div></div><div class="num">${lostu}</div></div>
      <h3 style="margin-top:14px">Top lost reasons</h3>
      <div id="reg-reason-${region}"></div>
      <h3 style="margin-top:14px">Top campaigns</h3>
      <div id="reg-camp-${region}"></div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="grid3">${cols}</div>`;
  REGIONS.forEach(region=>{
    const rows = ALL.filter(r=>r.region===region && (r.bucket==='Lost - Classified'));
    renderBarList(`reg-reason-${region}`, rows, 'reason', 5, 'reason', countByReasons(rows));
    renderBarList(`reg-camp-${region}`, ALL.filter(r=>r.region===region), 'campaign', 5, 'campaign');
  });
}

function renderGrouped(rows){
  const el = document.getElementById('tab-grouped');
  el.innerHTML = `
    <div class="panel">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;">
        <h2 style="margin:0">Group by</h2>
        <select id="grp-field">
          <option value="region">Region</option>
          <option value="source">UTM Source</option>
          <option value="medium">UTM Medium</option>
          <option value="campaign">Campaign</option>
          <option value="location">Location</option>
          <option value="course">Course</option>
          <option value="week">Week</option>
          <option value="assignTo">Owner</option>
          <option value="reason">Reason</option>
          <option value="bucket">Status bucket</option>
          <option value="leadSentiment">Lead sentiment</option>
          <option value="classification">Classification</option>
          <option value="dealQuality">Deal quality</option>
        </select>
        <span class="pill count-tag">${rows.length} deals in current filter</span>
      </div>
      <div class="scrollbox"><table id="grp-table"></table></div>
    </div>
  `;
  const sel = document.getElementById('grp-field');
  sel.addEventListener('change', ()=> drawGroupTable(rows, sel.value));
  drawGroupTable(rows, sel.value);
}

function drawGroupTable(rows, field){
  const groups = {};
  rows.forEach(r=>{
          const keys = field==='reason' ? ((r.reasons&&r.reasons.length)?r.reasons:['(none)']) : [r[field] || '(none)'];
          keys.forEach(k=>{
                    if(!groups[k]) groups[k] = {total:0,won:0,lostc:0,lostu:0,other:0};
                    groups[k].total++;
                    if(r.bucket==='Won') groups[k].won++;
                    else if(r.bucket==='Lost - Classified') groups[k].lostc++;
                    else if(r.bucket==='Lost - Unclassified') groups[k].lostu++;
                    else groups[k].other++;
          });
  });
  const entries = Object.entries(groups).sort((a,b)=>b[1].total-a[1].total);
  const table = document.getElementById('grp-table');
  table.innerHTML = `
    <thead><tr><th>${field}</th><th>Total</th><th>Won</th><th>Lost (classified)</th><th>Lost (no reason)</th><th>Active/Other</th><th>Loss rate</th></tr></thead>
    <tbody>${entries.map(([k,v])=>`
      <tr>
        <td class="clickable" data-field="${field}" data-value="${k}">${k}</td>
        <td>${v.total}</td><td>${v.won}</td><td>${v.lostc}</td><td>${v.lostu}</td><td>${v.other}</td>
        <td>${fmtPct(v.lostc+v.lostu, v.total)}</td>
      </tr>`).join('')}</tbody>
  `;
  table.querySelectorAll('.clickable').forEach(elx=>{
    elx.addEventListener('click', ()=> jumpToIndividual(elx.dataset.field, elx.dataset.value));
  });
}

const IND_COLS = [['id','ID'],['name','Name'],['email','Email'],['date','Date'],['region','Region'],['course','Course'],['source','Source'],['campaign','Campaign'],['location','Location'],['assignTo','Owner'],['dealValue','Value'],['bucket','Bucket'],['reason','Reason'],['admissionsConversationType','Adm. Type'],['admissionsScore','Adm. Score'],['leadSentiment','Sentiment'],['classification','Classification'],['dealQuality','Deal Quality'],['feedback','Feedback']];

function renderIndividual(rows){
  const el = document.getElementById('tab-individual');
  el.innerHTML = `
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h2 style="margin:0">Individual deals <span class="count-tag">(${rows.length} matching filters)</span></h2>
        <button id="btn-export" class="ghost">Export filtered CSV</button>
      </div>
      <div class="scrollbox"><table id="ind-table"></table></div>
    </div>
  `;
  document.getElementById('btn-export').addEventListener('click', ()=> exportCsv(rows));
  drawIndividualTable(rows);
}

function drawIndividualTable(rows){
  let sorted = rows.slice().sort((a,b)=>{
    const f = sortState.field; let av=a[f], bv=b[f];
    if(av==null) av=''; if(bv==null) bv='';
    if(av<bv) return sortState.dir==='asc'?-1:1;
    if(av>bv) return sortState.dir==='asc'?1:-1;
    return 0;
  });
  const capped = sorted.slice(0,500);
  const table = document.getElementById('ind-table');
  table.innerHTML = `
    <thead><tr>${IND_COLS.map(([f,l])=>`<th data-field="${f}">${l}${sortState.field===f?(sortState.dir==='asc'?' ▲':' ▼'):''}</th>`).join('')}</tr></thead>
    <tbody>${capped.map(r=>`
      <tr data-deal-id="${r.id}" class="lead-row-clickable">
        <td>${r.id}</td><td>${r.name||'<span class=muted>—</span>'}</td><td>${r.email||'<span class=muted>—</span>'}</td>
        <td>${r.date||'-'}</td><td>${r.region||'-'}</td><td>${r.course||'-'}</td><td>${r.source||'-'}</td>
        <td>${r.campaign||'-'}</td><td>${r.location||'-'}</td><td>${r.assignTo||'<span class=muted>unassigned</span>'}</td>
        <td>${r.dealValue ? '$'+Number(r.dealValue).toLocaleString() : '-'}</td>
        <td><span class="badge ${BUCKET_CLASS[r.bucket]}">${BUCKET_LABEL[r.bucket]}</span></td>
        <td>${r.reason||'-'}</td>
        <td>${r.admissionsConversationType||'-'}</td>
        <td>${r.admissionsScore||'-'}</td>
        <td>${r.leadSentiment||'-'}</td>
        <td>${r.classification||'-'}</td>
        <td>${r.dealQuality||'-'}</td>
        <td>${r.feedback||'-'}</td>
      </tr>`).join('')}</tbody>
  `;
  if(sorted.length>500){
    const note = document.createElement('div');
    note.className='muted'; note.style.padding='8px 10px';
    note.textContent = `Showing first 500 of ${sorted.length} rows — narrow with filters or export CSV for the full set.`;
    table.parentElement.appendChild(note);
  }
  table.querySelectorAll('th').forEach(th=>{
    th.addEventListener('click', ()=>{
      const f = th.dataset.field;
      if(sortState.field===f) sortState.dir = sortState.dir==='asc'?'desc':'asc';
      else { sortState.field=f; sortState.dir='asc'; }
      drawIndividualTable(rows);
    });
  });
  // Add click handlers to rows to open lead modal
  table.querySelectorAll('.lead-row-clickable').forEach(row=>{
    row.addEventListener('click', (e)=>{
      if(e.target.tagName==='TH') return; // don't open modal on header click
      const dealId = row.dataset.dealId;
      if(dealId) openLeadModal(dealId);
    });
    row.style.cursor = 'pointer';
  });
}

function exportCsv(rows){
  const cols = IND_COLS.map(c=>c[0]);
  const lines = [cols.join(',')];
  rows.forEach(r=>{
    lines.push(cols.map(c=>{
      let v = r[c]==null? '' : String(r[c]).replace(/"/g,'""');
      if(v.includes(',')||v.includes('"')) v = `"${v}"`;
      return v;
    }).join(','));
  });
  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'deals_filtered.csv';
  a.click();
}

let aiHistory = [];
let sessionAdsData = {}; // Store ads data from uploads

function buildAIContext(rows){
  const top = (field, n)=> Object.entries(countBy(rows, field)).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({value:k, count:v}));
  const lostRows = rows.filter(r=>r.bucket==='Lost - Classified');
  return {
    activeFilters: state,
    totalDeals: rows.length,
    kpis: {
      won: rows.filter(r=>r.bucket==='Won').length,
      lostClassified: lostRows.length,
      lostUnclassified: rows.filter(r=>r.bucket==='Lost - Unclassified').length,
      activeOther: rows.filter(r=>r.bucket==='Active / Other').length,
    },
    byRegion: countBy(rows,'region'),
    byBucket: countBy(rows,'bucket'),
    topSources: top('source',10),
    topMediums: top('medium',10),
    topCampaigns: top('campaign',10),
    topLocations: top('location',10),
    topCourses: top('course',10),
    topOwners: top('assignTo',10),
    topLostReasons: Object.entries(countByReasons(lostRows)).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>({reason:k,count:v})),
    byWeek: countBy(rows,'week'),
    sampleDeals: rows.slice(0,25).map(r=>({date:r.date, region:r.region, course:r.course, source:r.source, medium:r.medium, campaign:r.campaign, location:r.location, bucket:r.bucket, reason:r.reason, feedback:r.feedback, dealValue:r.dealValue})),
  };
}

async function askAI(rows){
  const qEl = document.getElementById('ai-question');
  const question = (qEl.value||'').trim();
  if(!question) return;
  const entry = { question, loading:true };
  aiHistory.push(entry);
  renderAIHistory();
  qEl.value = '';
  try{
    const context = buildAIContext(rows);
    // Pass conversation history (all previous Q&A pairs) for context
    const conversationHistory = aiHistory.slice(0, -1).filter(h => h.answer); // Exclude current loading entry

    const res = await fetch('/api/ask', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        question,
        context,
        history: conversationHistory,
        adsData: sessionAdsData
      }),
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || res.statusText);
    entry.loading = false;
    entry.answer = data.answer || '(no answer returned)';
  } catch(e){
    entry.loading = false;
    entry.error = e.message;
  }
  renderAIHistory();
}

function renderAIHistory(){
  const el = document.getElementById('ai-history');
  if(!el) return;
  el.innerHTML = aiHistory.slice().reverse().map(h=>`
  <div class="ai-entry">
  <div class="ai-q">${h.question}</div>
  <div class="ai-answer${h.loading?' loading':''}">${h.loading ? 'Thinking…' : (h.error ? `<span style="color:#ff6b6b">${h.error}</span>` : h.answer)}</div>
  </div>
  `).join('');
}

function renderAI(rows){
  const el = document.getElementById('tab-ai');
  el.innerHTML = `
  <div class="panel">
  <h2>Ask AI about this view <span class="count-tag">(${rows.length} deals in current filter)</span></h2>
  <div class="ai-box">
  <textarea id="ai-question" placeholder="e.g. Why is LATAM losing more deals in June? Which campaigns convert best? Summarize this view for a leadership update."></textarea>
  <div class="ai-suggestions">
  <button class="ghost" data-q="Summarize this view: key trends, the biggest problem, and one concrete recommendation.">Summarize this view</button>
  <button class="ghost" data-q="What are the top reasons deals are lost here, and what should we do about each one?">Top loss reasons + fixes</button>
  <button class="ghost" data-q="Which sources and campaigns are performing best and worst in this filtered view?">Best/worst campaigns</button>
  <button class="ghost" data-q="Are there any notable trends over time (by week) in this data?">Trends over time</button>
  </div>
  <div><button id="ai-ask">Ask</button></div>
  </div>
  <div id="ai-history" class="ai-history"></div>
  </div>
  `;
  document.querySelectorAll('.ai-suggestions button').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.getElementById('ai-question').value = b.dataset.q;
      askAI(rows);
    });
  });
  document.getElementById('ai-ask').addEventListener('click', ()=> askAI(rows));
  document.getElementById('ai-question').addEventListener('keydown', e=>{
    if(e.key==='Enter' && (e.metaKey||e.ctrlKey)) askAI(rows);
  });
  renderAIHistory();
}

// ---- Lead Coach Modal ----

async function openLeadModal(dealId){
  const modal = document.createElement('div');
  modal.className = 'lead-modal';
  modal.innerHTML = `<div class="lead-modal-content"><div style="padding:20px;text-align:center;"><p>Loading lead details…</p></div></div>`;
  document.body.appendChild(modal);

  try{
    const res = await fetch('/api/lead-coach', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ leadId: Number(dealId) }),
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({error:res.statusText}));
      modal.querySelector('.lead-modal-content').innerHTML = `<div style="padding:20px;color:#ff6b6b;">Error loading lead: ${err.error||res.statusText}</div>`;
      return;
    }
    const data = await res.json();
    await renderLeadModal(modal, data);
  }catch(e){
    modal.querySelector('.lead-modal-content').innerHTML = `<div style="padding:20px;color:#ff6b6b;">Error: ${e.message}</div>`;
  }
}

async function renderLeadModal(modal, data){
  const { lead, aiCoaching } = data;
  // Normalise so a partial payload can never throw while rendering the modal
  // (engagement.timeline.length used to blow up if timeline was missing).
  const engagement = lead.engagement || {};
  if (!Array.isArray(engagement.timeline)) engagement.timeline = [];

  // Load existing notes for this lead
  let leadNotesData = { notes: '', tags: [], emailSent: false, actions: [] };
  try {
    const notesRes = await fetch(`/api/lead-notes/${lead.contactId}`);
    if (notesRes.ok) {
      leadNotesData = await notesRes.json();
    }
  } catch (e) {
    console.warn('Could not load lead notes:', e.message);
  }

  const coachingText = aiCoaching.fullAnalysis;
  // Parse coaching text for sections
  const lines = coachingText.split('\n');
  let analysis = '', nextSteps = '', emailTemplate = '', smsTemplate = '';
  let currentSection = '';
  for(let i=0; i<lines.length; i++){
    const line = lines[i];
    if(line.startsWith('**Analysis:')) currentSection='analysis';
    else if(line.startsWith('**Next Steps:')) currentSection='nextSteps';
    else if(line.startsWith('**EMAIL TEMPLATE:')) currentSection='email';
    else if(line.startsWith('**SMS TEMPLATE:')) currentSection='sms';
    else if(currentSection==='analysis') analysis += line + '\n';
    else if(currentSection==='nextSteps') nextSteps += line + '\n';
    else if(currentSection==='email') emailTemplate += line + '\n';
    else if(currentSection==='sms') smsTemplate += line + '\n';
  }

  analysis = analysis.trim();
  nextSteps = nextSteps.trim();
  emailTemplate = emailTemplate.trim();
  smsTemplate = smsTemplate.trim();

  modal.querySelector('.lead-modal-content').innerHTML = `
    <header class="lead-modal-header">
      <h2>${lead.name}</h2>
      <button class="lead-modal-close">✕</button>
    </header>

    <div class="lead-modal-body">
      <div class="section">
        <h3>📋 Lead Info</h3>
        <div class="info-grid">
          <div><strong>Email:</strong> ${lead.email||'—'}</div>
          <div><strong>Phone:</strong> ${lead.phone||'—'}</div>
          <div><strong>Course:</strong> ${lead.course||'—'}</div>
          <div><strong>Region:</strong> ${lead.region||'—'}</div>
          <div><strong>Deal Value:</strong> $${Number(lead.dealValue).toLocaleString()}</div>
          <div><strong>Stage:</strong> ${lead.dealStage||'—'}</div>
          <div><strong>Status:</strong> <span class="badge ${BUCKET_CLASS[lead.dealStatus] || 'b-other'}">${lead.dealStatus}</span></div>
          <div><strong>Owner:</strong> ${lead.assignedTo||'Unassigned'}</div>
        </div>
      </div>

      <div class="section">
        <h3>📊 Engagement Timeline</h3>
        ${engagement.trackingAvailable ? `
          <div class="engagement-stats">
            <div class="stat"><span class="label">Emails Engaged:</span> <span class="value">${engagement.emailsEngaged}</span></div>
            <div class="stat"><span class="label">Opens:</span> <span class="value">${engagement.emailsOpened} (${engagement.emailOpenRate}%)</span></div>
            <div class="stat"><span class="label">Clicks:</span> <span class="value">${engagement.linksClicked}</span></div>
            <div class="stat"><span class="label">Last Email:</span> <span class="value">${engagement.lastEmailDate||'—'}</span></div>
          </div>
          ${engagement.timeline.length > 0 ? `
            <div class="timeline">
              ${engagement.timeline.slice(0,10).map(evt=>`
                <div class="timeline-item">
                  <span class="date">${evt.date}</span>
                  <span class="action">${evt.detail}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p class="muted">No engagement events recorded</p>'}
        ` : '<p class="muted">Email tracking not available for this lead</p>'}
      </div>

      <div class="section">
        <h3>⭐ Scoring</h3>
        <div class="scores-grid">
          ${lead.customFields.admissionsScore ? `<div class="score-box"><div class="label">Admissions</div><div class="value">${lead.customFields.admissionsScore}/100</div></div>` : ''}
          ${lead.customFields.dealQuality ? `<div class="score-box"><div class="label">Deal Quality</div><div class="value">${lead.customFields.dealQuality}/10</div></div>` : ''}
          ${lead.customFields.leadSentiment ? `<div class="score-box"><div class="label">Sentiment</div><div class="value">${lead.customFields.leadSentiment}</div></div>` : ''}
          ${lead.customFields.classification ? `<div class="score-box"><div class="label">Classification</div><div class="value">${lead.customFields.classification}</div></div>` : ''}
        </div>
        ${lead.customFields.conversationType ? `<p><strong>Conv. Type:</strong> ${lead.customFields.conversationType}</p>` : ''}
        ${lead.customFields.feedback ? `<p><strong>Feedback:</strong> ${lead.customFields.feedback}</p>` : ''}
      </div>

      <div class="section coach-section">
        <h3>🤖 AI Coach</h3>
        <div class="coach-analysis">
          <p><strong>Analysis:</strong></p>
          <p>${analysis || coachingText}</p>
        </div>
        ${nextSteps ? `
          <p><strong>Suggested Next Steps:</strong></p>
          <div class="next-steps">${nextSteps.split('\n').filter(l=>l.trim()).map(l=>`<div>• ${l.replace(/^[-•*]\s*/, '')}</div>`).join('')}</div>
        ` : ''}

        <div class="templates">
          ${emailTemplate ? `
            <div class="template">
              <h4>📧 Email Template</h4>
              <pre>${emailTemplate}</pre>
              <button class="copy-btn" data-text="${encodeURIComponent(emailTemplate)}">Copy Email</button>
            </div>
          ` : ''}
          ${smsTemplate ? `
            <div class="template">
              <h4>📱 SMS Template</h4>
              <pre>${smsTemplate}</pre>
              <button class="copy-btn" data-text="${encodeURIComponent(smsTemplate)}">Copy SMS</button>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="section">
        <h3>📝 Notes &amp; Actions</h3>
        <div style="margin-bottom:10px;">
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <input type="checkbox" id="lead-email-sent" ${leadNotesData.emailSent ? 'checked' : ''}>
            <span>Email sent</span>
          </label>
        </div>
        <textarea id="lead-notes-text" placeholder="Add notes about this lead (admissions rep actions, follow-ups, etc.)" style="width:100%;min-height:80px;padding:8px;border:1px solid #ccc;border-radius:4px;font-family:monospace;font-size:12px;">${leadNotesData.notes}</textarea>
        <button id="lead-notes-save" style="margin-top:8px;">Save Notes</button>
      </div>
    </div>
  `;

  modal.querySelector('.lead-modal-close').addEventListener('click', ()=> modal.remove());
  modal.addEventListener('click', (e)=>{
    if(e.target===modal) modal.remove();
  });

  modal.querySelectorAll('.copy-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const text = decodeURIComponent(btn.dataset.text);
      try{
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
        btn.textContent = '✓ Copied!';
        setTimeout(()=>{ btn.textContent = btn.textContent.replace('Copied!', btn.dataset.original || 'Copy'); }, 2000);
      }catch(e){
        showToast('Failed to copy');
      }
    });
  });

  // Save lead notes
  const saveNotesBtn = modal.querySelector('#lead-notes-save');
  if (saveNotesBtn) {
    saveNotesBtn.addEventListener('click', async () => {
      const notes = modal.querySelector('#lead-notes-text')?.value || '';
      const emailSent = modal.querySelector('#lead-email-sent')?.checked || false;

      try {
        const res = await fetch('/api/lead-notes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id,
            contactId: lead.contactId,
            notes,
            emailSent,
          }),
        });

        if (res.ok) {
          showToast('Notes saved!');
          saveNotesBtn.textContent = '✓ Saved';
          setTimeout(() => { saveNotesBtn.textContent = 'Save Notes'; }, 2000);
        }
      } catch (e) {
        showToast('Failed to save notes');
        console.error('Error saving notes:', e);
      }
    });
  }
}

// ---- Recommendations Tab ----

async function renderRecommendations(){
  const el = document.getElementById('tab-recommendations');
  el.innerHTML = `<div class="panel"><div style="padding:20px;text-align:center;"><p>Loading recommendations…</p></div></div>`;

  try{
    // Send filtered records to get recommendations based on current filter state
    const filteredRecords = filtered();
    const res = await fetch('/api/recommendations', {
      method:'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({ filteredRecords })
    });
    if(!res.ok){
      const err = await res.json().catch(()=>({error:res.statusText}));
      el.innerHTML = `<div class="panel"><h2 style="color:#ff6b6b;">Error loading recommendations: ${err.error||res.statusText}</h2></div>`;
      return;
    }
    const data = await res.json();

    el.innerHTML = `
      <div class="panel">
        <h2>🎯 Lead Recommendations</h2>
        <div class="summary-cards">
          <div class="card"><div class="val">${data.summary.totalDeals}</div><div class="lbl">Total Deals</div></div>
          <div class="card"><div class="val">${data.summary.active}</div><div class="lbl">Active</div></div>
          <div class="card"><div class="val">${data.summary.won}</div><div class="lbl">Won</div></div>
          <div class="card"><div class="val">${data.summary.lost}</div><div class="lbl">Lost</div></div>
        </div>
      </div>
      ${data.groups.map((group, idx)=>`
        <div class="panel recommendation-group">
          <div class="group-header">
            <h3>${getGroupEmoji(group.name)} ${getGroupLabel(group.name)}</h3>
            <span class="count-tag">${group.count} leads</span>
          </div>
          <div class="group-content">
            <p class="recommendation-text">${group.recommendation || 'No recommendation generated'}</p>
            <details class="group-leads">
              <summary>View ${group.count} leads in this group</summary>
              <div class="leads-list">
                ${group.leads.map(l=>`
                  <div class="lead-item">
                    <div class="name">${l.name||'—'}</div>
                    <div class="email">${l.email||'—'}</div>
                    <div class="meta">
                      ${l.admissionsScore ? `<span>Score: ${l.admissionsScore}</span>` : ''}
                      ${l.leadSentiment ? `<span>Sentiment: ${l.leadSentiment}</span>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </details>
          </div>
        </div>
      `).join('')}
    `;
  }catch(e){
    el.innerHTML = `<div class="panel"><h2 style="color:#ff6b6b;">Error: ${e.message}</h2></div>`;
  }
}

function getGroupLabel(name){
  const labels = {
    needsContact: 'Needs Contact',
    needsFollowUp: 'Needs Follow-up',
    atRisk: 'At Risk',
    readyToClose: 'Ready to Close',
    wonRecently: 'Won Recently',
    lostNeedAnalysis: 'Lost (No Reason)',
  };
  return labels[name] || name;
}

function getGroupEmoji(name){
  const emojis = {
    needsContact: '📞',
    needsFollowUp: '📧',
    atRisk: '⚠️',
    readyToClose: '🎯',
    wonRecently: '✅',
    lostNeedAnalysis: '❌',
  };
  return emojis[name] || '📋';
}

function renderAds(rows){
  const el = document.getElementById('tab-ads');
  el.innerHTML = `
  <div class="panel">
  <h2>Ads Performance</h2>
  <p class="ads-note">Upload Meta or Google Ads exports (CSV or screenshots) to review spend and performance alongside the funnel. Data will be considered in AI Insights questions.</p>
  <div class="upload-zone" id="dropZone">
  <p>Drag &amp; drop CSV or image files here, or click to browse</p>
  <input type="file" id="fileInput" accept=".csv,image/*" multiple style="display:none;">
  </div>
  <div id="fileList"></div>
  </div>
  `;
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const files = [];

  function platformFor(name){
    if(/google/i.test(name)) return {cls:'google', label:'Google Ads'};
    if(/meta|facebook|fb/i.test(name)) return {cls:'meta', label:'Meta Ads'};
    return {cls:'meta', label:'Ads'};
  }

  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      data.push(row);
    }
    return data;
  }

  async function processFile(file) {
    const platform = platformFor(file.name);
    try {
      const text = await file.text();
      let data = null;

      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        data = parseCSV(text);
      } else {
        // For images, just store metadata
        data = { filename: file.name, size: file.size, type: file.type };
      }

      if (data) {
        sessionAdsData[file.name] = {
          platform: platform.label,
          data: data,
          uploadedAt: new Date().toISOString(),
        };

        // Also send to server
        await fetch('/api/ads-data', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            platform: platform.label,
            data: typeof data === 'string' ? data : JSON.stringify(data),
          }),
        });
      }
    } catch (e) {
      console.error('Error processing file:', e.message);
    }
  }

  function renderFileList(){
    fileList.innerHTML = files.map((f,i)=>{
      const p = platformFor(f.name);
      return `<div class="file-row"><span class="plat ${p.cls}">${p.label}</span><span class="fname">${f.name}</span><span class="fsize">${(f.size/1024).toFixed(1)} KB</span><button class="ghost remove-file" data-i="${i}">Remove</button></div>`;
    }).join('') || '<p class="muted">No files uploaded yet.</p>';
    fileList.querySelectorAll('.remove-file').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const file = files[Number(btn.dataset.i)];
        delete sessionAdsData[file.name];
        files.splice(Number(btn.dataset.i),1);
        renderFileList();
      });
    });
  }

  async function addFiles(list){
    for (let f of Array.from(list)) {
      files.push(f);
      await processFile(f);
    }
    renderFileList();
    showToast(`Loaded ${files.length} ad file(s) - use in AI Insights`);
  }

  dropZone.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', e=> addFiles(e.target.files));
  dropZone.addEventListener('dragover', e=>{ e.preventDefault(); dropZone.classList.add('drag'); });
  dropZone.addEventListener('dragleave', ()=> dropZone.classList.remove('drag'));
  dropZone.addEventListener('drop', e=>{
    e.preventDefault();
    dropZone.classList.remove('drag');
    addFiles(e.dataTransfer.files);
  });
  renderFileList();
}


document.getElementById('tabs').addEventListener('click', e=>{
  const t = e.target.closest('.tab');
  if(!t) return;
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  ['overview','recommendations','regions','grouped','individual','ads','ai'].forEach(name=>{
    document.getElementById('tab-'+name).style.display = (name===t.dataset.tab) ? 'block':'none';
  });
  renderAll();
});

function renderAll(){
  syncStateToUrl();
  const rows = filtered();
  renderKpis(rows);
  const active = document.querySelector('.tab.active').dataset.tab;
  if(active==='overview') renderOverview(rows);
  if(active==='recommendations') renderRecommendations();
  if(active==='regions') renderRegions();
  if(active==='grouped') renderGrouped(rows);
  if(active==='individual') renderIndividual(rows);
  if(active==='ai') renderAI(rows);
  if(active==='ads') renderAds(rows);
}

(async function init(){
  try{
    if(!checkAuth()){
      // Setup login form
      document.getElementById('login-form').addEventListener('submit', handleLogin);
      return;
    }

    // Auth OK - load dashboard
    syncStateFromUrl();
    await loadData(state.region && state.region!=='all' ? state.region : undefined);
    buildFilters();
    renderAll();

    // Setup logout
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
  }catch(e){
    console.error(e);
  }
})();
