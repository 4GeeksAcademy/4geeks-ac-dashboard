'use strict';
// ---------------------------------------------------------------------------
// Spain daily sales activity: calls (Ringover), offers by quality, sales,
// leads and enrollments, per rep and per day, plus the 21:00 Madrid briefing.
//
// Same definitions as the Spain team's "spain_db_dynamic" sheet (admisiones_spain):
//   Llamadas emitidas        outbound calls (start time in the day, Madrid)
//   Descuelgues              outbound calls ANSWERED
//   Conversaciones activas   answered calls with more than 15 s in call (any direction)
//   Llamadas >15 min         calls with more than 899 s in call
//   Tasa de descuelgue       descuelgues / emitidas
//   Tasa conv. activas       conversaciones activas / emitidas
//   Tiempo en descuelgue     sum of in-call time
//   Tiempo en conv. activa   sum of in-call time of active conversations
//   Tiempo conectado RO      sum of total call time
//   Ofertas                  Spain deals whose offer_sent_date is in the day, split by the
//                            feedback STAGE of the Spain pipeline the offer sits in: Strong
//                            ("STRONG FEEDBACK +50%…"), Soft ("SOFT FEEDBACK -30%…"), Super soft
//                            ("SUPER SOFT FEEDBACK - OFERTA TIRADA…"). A deal already moved on
//                            (Won, follow-up…) keeps the feedback stage it went through: the one
//                            the Hub saw it in, or else the one in its ActiveCampaign stage history.
//   Ventas                   Spain deals Won whose won_date is in the day (by course)
//   Leads                    Spain deals created in the day (by course, duplicates = title "DUP -")
//   Matrículas               the Enrollments section's Spain rows converted that day
//
// Calls come from Ringover through n8n (workflow "Ringover calls → Marketing Hub",
// which holds the Ringover connection): the Hub posts {from, to} to
// RINGOVER_WEBHOOK_URL with its key, n8n checks the key with the Hub and answers
// with the calls. Each Madrid day is kept in the pipeline store (blob
// ringover-<YYYY-MM-DD>); the last 3 days are refreshed every 30 minutes.
//
// The briefing: every day at 21:00 Madrid the Hub posts that day's summary to
// BRIEF_WEBHOOK_URL (n8n "Daily briefing → Slack"), once per day.
// ---------------------------------------------------------------------------
const zlib = require('zlib');
const fetch = require('node-fetch');

const TZ = 'Europe/Madrid';
const DAY = 864e5;
const ACTIVE_SEC = 15;
const LONG_SEC = 899;
const COURSES = ['FS', 'DS', 'CS', 'AI'];

// 'YYYY-MM-DD' of an instant, in Madrid.
const madridDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const madridHM = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t));
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; };
const dayOf = (v) => { if (!v) return null; const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (Number.isFinite(Date.parse(s)) ? madridDay(s) : null); };

// has_offer value -> quality bucket, as the sheet's COUNTIFS read it.
function offerQualityOf(v) {
  const s = String(v || '').toUpperCase();
  if (!s) return null;
  if (s.includes('SUPER_SOFT') || /SUPER\s*SOFT/.test(s)) return 'supersoft';
  if (s.includes('STRONG')) return 'strong';
  if (s.includes('SOFT')) return 'soft';
  return 'other';
}
// The offer stages of the Spain pipeline ("STRONG FEEDBACK +50%…", "SOFT FEEDBACK -30%…",
// "SUPER SOFT FEEDBACK - OFERTA TIRADA…"): what the sheet's deal_had_offer mirrors.
const stageQualityOf = (stage) => { const q = offerQualityOf(/feedback/i.test(stage || '') ? stage : ''); return q === 'other' ? null : q; };
// FS / DS / CS / AI from the deal's or the contact's course, whatever way it is written.
function courseOf(r) {
  for (const v of [r.dealCourse, r.course]) {
    const c = String(v || '').trim();
    if (!c) continue;
    if (COURSES.includes(c.toUpperCase())) return c.toUpperCase();
    if (/cyber|ciber|seguridad|security|\bcs\b/i.test(c)) return 'CS';
    if (/data|datos|\bds\b|machine/i.test(c)) return 'DS';
    if (/full.?stack|\bfs\b|web dev|desarrollo/i.test(c)) return 'FS';
    if (/\bai\b|\bia\b|artificial|ai.?eng|fluency|agent|automat/i.test(c)) return 'AI';
  }
  return null;
}
// ActiveCampaign user names carry "de 4Geeks Academy" / "@4Geeks Academy"; Ringover's don't.
const cleanRep = (n) => String(n || '').replace(/\s*(?:de|@|-|·)\s*4\s*geeks(?:\s*academy)?\s*$/i, '').replace(/\s+/g, ' ').trim();

// One Ringover call -> the few fields the report needs (works with the API's names or the sheet's).
function slimCall(c) {
  const user = c.user || {};
  const rep = cleanRep(c.rep || user.concat_name || [user.firstname, user.lastname].filter(Boolean).join(' ') || c.Comercial || '') || 'Sin asignar';
  const start = c.start_time || c.startTime;
  return {
    id: String(c.cdr_id || c.call_id || c.id || `${start}|${rep}`),
    dir: String(c.direction || '').toLowerCase() === 'in' ? 'in' : 'out',
    state: String(c.last_state || c.state || '').toUpperCase(),
    at: start ? new Date(String(start).includes('T') || /Z|[+-]\d\d:?\d\d$/.test(String(start)) ? start : String(start).replace(' ', 'T') + 'Z').toISOString() : null,
    inCall: Number(c.incall_duration ?? c.inCall ?? c['In call duration in seconds'] ?? 0) || 0,
    total: Number(c.total_duration ?? c.total ?? 0) || 0,
    rep,
  };
}

function blankCalls() { return { emitidas: 0, descuelgues: 0, activas: 0, largas: 0, entrantes: 0, perdidasEntrantes: 0, tDescuelgue: 0, tActiva: 0, tConectado: 0 }; }
function addCall(m, c) {
  if (c.dir === 'out') { m.emitidas++; if (c.state === 'ANSWERED') m.descuelgues++; }
  else { m.entrantes++; if (c.state !== 'ANSWERED') m.perdidasEntrantes++; }
  const active = c.state === 'ANSWERED' && c.inCall > ACTIVE_SEC;
  if (active) { m.activas++; m.tActiva += c.inCall; }
  if (c.inCall > LONG_SEC) m.largas++;
  m.tDescuelgue += c.inCall;
  m.tConectado += c.total;
}
const rates = (m) => ({ ...m, tasaDescuelgue: m.emitidas ? m.descuelgues / m.emitidas : null, tasaActivas: m.emitidas ? m.activas / m.emitidas : null });

// stageHistory(dealId) -> [{ at, stage }] (stage names, oldest first), from ActiveCampaign's deal activities.
function createSalesActivity({ store, getRecords, getEnrollments, stageHistory = null, env = process.env, log = console, fetchImpl = fetch, now = () => Date.now() }) {
  const callsUrl = env.RINGOVER_WEBHOOK_URL || '';
  const briefUrl = env.BRIEF_WEBHOOK_URL || '';
  const key = env.HUB_N8N_KEY || env.ADS_SYNC_KEY || '';
  const region = env.SALES_ACTIVITY_REGION || 'Spain';
  const briefHour = Number(env.BRIEF_HOUR_MADRID || 21);
  const hubUrl = env.PUBLIC_URL || 'https://marketing.4geeksacademy.com';
  const cache = new Map(); // day -> calls[]
  const status = { callsConfigured: !!(callsUrl && key), briefConfigured: !!(briefUrl && key), lastSync: null, lastSyncError: null, lastBrief: null, lastBriefError: null, daysStored: 0 };

  // Offer quality per deal = its feedback stage: the current one; else the one the Hub last saw it in
  // (remembered, so a deal that moves on to Won keeps it); else the one in its AC stage history.
  let seenQuality = null; let seenDirty = false;
  async function loadSeen() {
    if (seenQuality) return seenQuality;
    seenQuality = {};
    try { const b = store && await store.getBlob('offer-quality-seen'); if (b && b.data) seenQuality = JSON.parse(zlib.gunzipSync(b.data).toString('utf8')); } catch (e) { /* first run */ }
    return seenQuality;
  }
  async function rememberStages(records = getRecords() || []) {
    const seen = await loadSeen();
    for (const r of records) {
      if (r.region !== region) continue;
      const q = stageQualityOf(r.stage);
      if (q && seen[r.id] !== q) { seen[r.id] = q; seenDirty = true; }
    }
    if (seenDirty && store) { try { await store.putBlob('offer-quality-seen', zlib.gzipSync(Buffer.from(JSON.stringify(seen))), { deals: Object.keys(seen).length }); seenDirty = false; } catch (e) { log.warn('[sales-activity] offer stages not saved:', e.message); } }
  }
  function qualityOf(r) {
    return stageQualityOf(r.stage) || (seenQuality && seenQuality[r.id]) || null;
  }
  // Deals whose offer quality is still unknown: read their stage history (a few per report, cached).
  const historyTried = new Set();
  async function fillFromHistory(deals, max = 40) {
    if (!stageHistory) return;
    const seen = await loadSeen();
    let n = 0;
    for (const r of deals) {
      if (n >= max) break;
      if (seen[r.id] || historyTried.has(String(r.id))) continue;
      historyTried.add(String(r.id)); n++;
      try {
        const h = await stageHistory(r.id);
        const offerDay = dayOf(r.offerSentDate);
        const fb = (h || []).map((x) => ({ ...x, q: stageQualityOf(x.stage) })).filter((x) => x.q);
        // The feedback stage closest to the offer date (the one it was given in, or moved to right after).
        fb.sort((a, b) => Math.abs(Date.parse(a.at) - Date.parse(offerDay)) - Math.abs(Date.parse(b.at) - Date.parse(offerDay)));
        if (fb[0]) { seen[r.id] = fb[0].q; seenDirty = true; }
      } catch (e) { log.warn('[sales-activity] stage history not read for deal', r.id, e.message); }
    }
    if (seenDirty && store) { try { await store.putBlob('offer-quality-seen', zlib.gzipSync(Buffer.from(JSON.stringify(seen))), { deals: Object.keys(seen).length }); seenDirty = false; } catch (e) { /* next time */ } }
  }

  const checkKey = (k) => !!key && typeof k === 'string' && k.length === key.length && require('crypto').timingSafeEqual(Buffer.from(k), Buffer.from(key));

  async function loadDay(day) {
    if (cache.has(day)) return cache.get(day);
    let calls = null;
    try { const b = store && await store.getBlob(`ringover-${day}`); if (b && b.data) calls = JSON.parse(zlib.gunzipSync(b.data).toString('utf8')); } catch (e) { log.warn('[sales-activity] day not read:', day, e.message); }
    if (calls) cache.set(day, calls);
    return calls; // null = never synced (unknown), [] = synced, no calls
  }
  async function saveDay(day, calls) {
    cache.set(day, calls);
    if (store) await store.putBlob(`ringover-${day}`, zlib.gzipSync(Buffer.from(JSON.stringify(calls))), { day, calls: calls.length, at: new Date(now()).toISOString() });
  }

  // Ask n8n for the calls of [from, to] (Madrid days) and store them day by day.
  async function syncCalls(from, to) {
    if (!status.callsConfigured) return { skipped: 'not configured' };
    const start = new Date(Date.parse(from + 'T00:00:00Z') - 2 * 3600e3).toISOString(); // Madrid is UTC+1/+2
    const end = new Date(Date.parse(addDays(to, 1) + 'T00:00:00Z')).toISOString();
    const res = await fetchImpl(callsUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-key': key }, body: JSON.stringify({ from: start, to: end }), timeout: 120000 });
    const text = await res.text();
    if (!res.ok) throw new Error(`n8n answered ${res.status}: ${text.slice(0, 200)}`);
    let body; try { body = JSON.parse(text || '{}'); } catch (e) { throw new Error('n8n did not answer JSON'); }
    if (body.error) throw new Error(String(body.error).slice(0, 300));
    const list = (Array.isArray(body) ? body : body.calls || []).map(slimCall).filter((c) => c.at);
    const byDay = new Map(daysBetween(from, to).map((d) => [d, new Map()]));
    list.forEach((c) => { const d = madridDay(c.at); if (byDay.has(d)) byDay.get(d).set(c.id, c); });
    for (const [d, m] of byDay) await saveDay(d, [...m.values()]);
    status.daysStored = Math.max(status.daysStored, byDay.size);
    return { calls: list.length, days: byDay.size };
  }

  async function sync({ days = 3 } = {}) {
    if (!status.callsConfigured) return null;
    const to = madridDay(now());
    const from = addDays(to, -(days - 1));
    try {
      // A few days per request keeps each n8n answer small and fast; one failed chunk does not stop the rest.
      let total = 0; const failed = [];
      for (let d = from; d <= to; d = addDays(d, 3)) {
        const end = addDays(d, 2) < to ? addDays(d, 2) : to;
        try { total += (await syncCalls(d, end)).calls || 0; } catch (e) { failed.push(`${d}: ${e.message}`); }
      }
      if (failed.length) throw new Error(`${failed.length} chunk(s) failed (${failed[0]})`);
      status.lastSync = new Date(now()).toISOString(); status.lastSyncError = null;
      log.log(`[sales-activity] Ringover: ${total} calls stored for ${from} → ${to}`);
    } catch (e) { status.lastSyncError = e.message; log.warn('[sales-activity] Ringover sync failed:', e.message); }
    return status;
  }

  // The report for [from, to] (Madrid days, inclusive).
  async function report({ from, to }) {
    const days = daysBetween(from, to);
    const records = (getRecords() || []).filter((r) => r.region === region);
    await rememberStages(records);
    const inRange0 = (d) => d && d >= from && d <= to;
    await fillFromHistory(records.filter((r) => inRange0(dayOf(r.offerSentDate)) && !qualityOf(r)));
    const enr = (((getEnrollments && getEnrollments()) || {}).rows || []).filter((e) => e.region === region);
    const reps = new Map();
    const rep = (name) => { const k = cleanRep(name) || 'Sin asignar'; if (!reps.has(k)) reps.set(k, { rep: k, calls: blankCalls(), leads: 0, leadsByCourse: {}, dups: 0, offers: { strong: 0, soft: 0, supersoft: 0, other: 0 }, ventas: 0, ventasByCourse: {} }); return reps.get(k); };
    const perDay = new Map(days.map((d) => [d, { day: d, calls: blankCalls(), callsKnown: false, leads: 0, offers: { strong: 0, soft: 0, supersoft: 0, other: 0 }, ventas: 0, matriculas: 0 }]));
    const total = { calls: blankCalls(), leads: 0, leadsByCourse: {}, dups: 0, offers: { strong: 0, soft: 0, supersoft: 0, other: 0 }, ventas: 0, ventasByCourse: {}, matriculas: 0 };
    let daysWithCalls = 0;
    for (const d of days) {
      const calls = await loadDay(d);
      if (!calls) continue;
      daysWithCalls++; perDay.get(d).callsKnown = true;
      for (const c of calls) { addCall(perDay.get(d).calls, c); addCall(rep(c.rep).calls, c); addCall(total.calls, c); }
    }
    const inRange = (d) => d && d >= from && d <= to;
    const offerList = []; const salesList = [];
    for (const r of records) {
      const created = dayOf(r.createdAt) || r.date;
      if (inRange(created)) {
        const x = rep(r.assignTo); x.leads++; total.leads++; perDay.get(created) && perDay.get(created).leads++;
        const c = courseOf(r); if (c) { x.leadsByCourse[c] = (x.leadsByCourse[c] || 0) + 1; total.leadsByCourse[c] = (total.leadsByCourse[c] || 0) + 1; }
        if (/DUP\s*-/i.test(r.title || '')) { x.dups++; total.dups++; }
      }
      const od = dayOf(r.offerSentDate);
      if (inRange(od)) {
        const q = qualityOf(r) || 'other';
        rep(r.assignTo).offers[q]++; total.offers[q]++; perDay.get(od).offers[q]++;
        offerList.push({ id: r.id, contactId: r.contactId || null, name: r.name || null, rep: cleanRep(r.assignTo) || null, day: od, quality: q, course: courseOf(r), stage: r.stage || null });
      }
      const wd = dayOf(r.wonDate);
      if (r.bucket === 'Won' && inRange(wd)) {
        const x = rep(r.assignTo); x.ventas++; total.ventas++; perDay.get(wd).ventas++;
        const c = courseOf(r); if (c) { x.ventasByCourse[c] = (x.ventasByCourse[c] || 0) + 1; total.ventasByCourse[c] = (total.ventasByCourse[c] || 0) + 1; }
        salesList.push({ id: r.id, contactId: r.contactId || null, name: r.name || null, rep: cleanRep(r.assignTo) || null, day: wd, course: courseOf(r), stage: r.stage || null });
      }
    }
    const matriculas = enr.filter((e) => inRange(dayOf(e.converted))).map((e) => ({ id: e.id, contactId: e.contactId || null, name: e.name || null, program: e.program || null, rep: cleanRep(e.assignTo || e.owner) || null, day: dayOf(e.converted), status: e.status || null }));
    matriculas.forEach((m) => { total.matriculas++; perDay.get(m.day) && perDay.get(m.day).matriculas++; });
    const offersTotal = (o) => o.strong + o.soft + o.supersoft + o.other;
    const repRows = [...reps.values()]
      .map((x) => ({ ...x, calls: rates(x.calls), offersTotal: offersTotal(x.offers) }))
      .filter((x) => x.calls.emitidas || x.calls.entrantes || x.leads || x.offersTotal || x.ventas)
      .sort((a, b) => b.calls.emitidas - a.calls.emitidas || b.leads - a.leads);
    return {
      region, from, to, tz: TZ, definitions: { activeSeconds: ACTIVE_SEC, longSeconds: LONG_SEC },
      calls: { configured: status.callsConfigured, daysWithCalls, days: days.length, lastSync: status.lastSync, lastSyncError: status.lastSyncError },
      total: { ...total, calls: rates(total.calls), offersTotal: offersTotal(total.offers) },
      reps: repRows,
      days: [...perDay.values()].map((d) => ({ ...d, calls: rates(d.calls), offersTotal: offersTotal(d.offers) })),
      offers: offerList.sort((a, b) => b.day.localeCompare(a.day)), sales: salesList, matriculas,
    };
  }

  // ---------------- the briefing ----------------
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const hm = (sec) => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  const fechaLarga = (d) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00Z'));

  function briefText(rep) {
    const t = rep.total; const c = t.calls; const o = t.offers;
    const lines = [];
    lines.push(`*Resumen España · ${fechaLarga(rep.from)}*`);
    if (rep.calls.daysWithCalls) {
      lines.push(`📞 *Llamadas:* ${c.emitidas} emitidas · ${c.descuelgues} descuelgues (*${pct(c.tasaDescuelgue)}*) · ${c.activas} conversaciones activas (${pct(c.tasaActivas)}) · ${c.largas} de más de 15 min · ${hm(c.tActiva)} en conversación activa`);
      rep.reps.filter((x) => x.calls.emitidas || x.calls.entrantes).forEach((x) => {
        lines.push(`      • ${x.rep}: ${x.calls.emitidas} emitidas · ${pct(x.calls.tasaDescuelgue)} descuelgue · ${x.calls.activas} activas · ${hm(x.calls.tConectado)} conectado`);
      });
      if (c.entrantes) lines.push(`      ↳ Entrantes: ${c.entrantes} (${c.perdidasEntrantes} sin contestar)`);
    } else {
      lines.push(`📞 *Llamadas:* ${rep.calls.configured ? 'sin llamadas registradas en Ringover' : 'Ringover aún no está conectado al Hub'}`);
    }
    lines.push(`📨 *Ofertas:* ${t.offersTotal} — Strong ${o.strong} · Soft ${o.soft} · Super soft ${o.supersoft}${o.other ? ` · sin calidad ${o.other}` : ''}`);
    const byRepOffers = rep.reps.filter((x) => x.offersTotal).map((x) => `${x.rep} ${x.offersTotal} (${x.offers.strong}/${x.offers.soft}/${x.offers.supersoft})`);
    if (byRepOffers.length) lines.push(`      • ${byRepOffers.join(' · ')}  _(strong/soft/super soft)_`);
    const byCourse = Object.entries(t.ventasByCourse).map(([k, v]) => `${k} ${v}`).join(' · ');
    lines.push(`🏆 *Ventas (Won):* ${t.ventas}${byCourse ? ` — ${byCourse}` : ''}`);
    rep.sales.forEach((s) => lines.push(`      • ${s.name || '#' + s.id}${s.course ? ` · ${s.course}` : ''}${s.rep ? ` · ${s.rep}` : ''}`));
    lines.push(`🎓 *Matrículas:* ${t.matriculas}`);
    rep.matriculas.forEach((m) => lines.push(`      • ${m.name || '#' + m.id}${m.program ? ` · ${m.program}` : ''}${m.rep ? ` · ${m.rep}` : ''}`));
    lines.push(`🆕 *Leads nuevos:* ${t.leads}${Object.keys(t.leadsByCourse).length ? ` — ${Object.entries(t.leadsByCourse).map(([k, v]) => `${k} ${v}`).join(' · ')}` : ''}${t.dups ? ` · ${t.dups} duplicados` : ''}`);
    lines.push(`<${hubUrl}/?view=recommendations&region=Spain|Ver el detalle en el Marketing Hub>`);
    return lines.join('\n');
  }

  async function brief(day = madridDay(now()), { send = true } = {}) {
    if (status.callsConfigured) await sync({ days: 2 });
    const rep = await report({ from: day, to: day });
    const text = briefText(rep);
    if (!send) return { day, text };
    if (!status.briefConfigured) throw Object.assign(new Error('BRIEF_WEBHOOK_URL is not set'), { status: 400 });
    const res = await fetchImpl(briefUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-key': key }, body: JSON.stringify({ day, region, text }) });
    if (!res.ok) throw new Error(`n8n answered ${res.status}`);
    status.lastBrief = { day, at: new Date(now()).toISOString() };
    try { if (store) await store.putBlob('brief-last', Buffer.from(JSON.stringify(status.lastBrief)), status.lastBrief); } catch (e) { /* best effort */ }
    log.log(`[sales-activity] briefing for ${day} sent`);
    return { day, text, sent: true };
  }
  // What n8n asks before posting: genuine key + a briefing the Hub is sending right now.
  let pendingBrief = null;
  async function sendBriefOnce(day) {
    pendingBrief = day;
    try { return await brief(day); } finally { setTimeout(() => { pendingBrief = null; }, 120000).unref(); }
  }
  const isPendingBrief = (day) => !!pendingBrief && pendingBrief === day;

  // Every minute: at 21:00 Madrid (once per day) send today's briefing; every 30 min refresh calls.
  function start() {
    if (status.callsConfigured) {
      log.log('[sales-activity] Ringover calls via n8n: on (refresh every 30 min, last 3 days; first fill 45 days)');
      // First fill: 45 days, retried every 10 minutes (up to 4 times) until it goes through.
      const fill = (n) => sync({ days: 45 }).then((st) => { if (st && st.lastSyncError && n < 4) setTimeout(() => fill(n + 1), 10 * 60 * 1000).unref(); });
      setTimeout(() => fill(1), 4 * 60 * 1000).unref();
      setInterval(() => sync({ days: 3 }), 30 * 60 * 1000).unref();
      setInterval(() => { if (getRecords()) rememberStages().catch(() => {}); }, 10 * 60 * 1000).unref();
    } else log.log('[sales-activity] Ringover calls: off (set RINGOVER_WEBHOOK_URL)');
    if (!status.briefConfigured) { log.log('[sales-activity] daily briefing: off (set BRIEF_WEBHOOK_URL)'); return; }
    log.log(`[sales-activity] daily briefing: on, ${briefHour}:00 Madrid`);
    (async () => { try { const b = store && await store.getBlob('brief-last'); if (b && b.data) status.lastBrief = JSON.parse(b.data.toString('utf8')); } catch (e) { /* none yet */ } })();
    setInterval(async () => {
      const t = now(); const day = madridDay(t); const h = Number(madridHM(t).slice(0, 2));
      if (h !== briefHour || (status.lastBrief && status.lastBrief.day === day) || pendingBrief) return;
      if (!getRecords()) return; // data still loading: next minute
      try { await sendBriefOnce(day); } catch (e) { status.lastBriefError = e.message; log.warn('[sales-activity] briefing failed:', e.message); }
    }, 60 * 1000).unref();
  }

  return { start, sync, syncCalls, report, brief, briefText, sendBriefOnce, isPendingBrief, checkKey, status: () => ({ ...status, region, briefHour }), _cache: cache };
}

module.exports = { createSalesActivity, offerQualityOf, stageQualityOf, courseOf, cleanRep, slimCall, madridDay, addDays };
