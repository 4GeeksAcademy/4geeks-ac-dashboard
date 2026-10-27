'use strict';
// ---------------------------------------------------------------------------
// The attribution machine: visits → sessions → touches → each lead's journey
// → channel credit under several models.
//
//   collect()   validates what /t.js sends (page views + email-hash links)
//   journey()   one lead's full path: every visit before the form, the form,
//               and visits after (pricing re-reads, apply page…)
//   report()    for a set of leads: credit by channel under first touch,
//               last non-direct touch, linear and position-based (40/20/40),
//               with leads, qualified (Good/Very Good) and enrolled (from the
//               Enrollments section), plus top paths, top ads and coverage.
// ---------------------------------------------------------------------------
const crypto = require('crypto');
const { classify, PAID } = require('./channel');

const emailHash = (email) => crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
const QUAL = ['Very Good', 'Good'];
const KEY_PAGES = [[/\/apply/i, 'Apply'], [/financ|pricing|precio|tuition|payment/i, 'Pricing / financing'], [/job-guarantee|garantia/i, 'Job guarantee'], [/career-programs\/([^/?#]+)/i, null], [/\/location/i, 'Location'], [/\/(faq|preguntas)/i, 'FAQ']];
const MAX_BATCH = 20;

function keyPagesOf(paths) {
  const out = new Set();
  paths.forEach((p) => KEY_PAGES.forEach(([re, label]) => { const m = String(p).match(re); if (m) out.add(label || `Program: ${m[1]}`); }));
  return [...out];
}
const median = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// ---- what the browser sends ----
const str = (v, n) => (v == null ? null : String(v).slice(0, n));
function cleanEvents(body) {
  if (!body || typeof body !== 'object' || !/^[a-f0-9]{24}$/.test(String(body.v || ''))) return null;
  const evs = Array.isArray(body.e) ? body.e.slice(0, MAX_BATCH) : [];
  const now = Date.now();
  const out = { vid: body.v, events: [], links: [] };
  for (const e of evs) {
    if (!e || typeof e !== 'object') continue;
    const ts = Number(e.ts) && Math.abs(Number(e.ts) - now) < 7 * 864e5 ? Number(e.ts) : now; // ignore wildly wrong clocks
    if (e.t === 'id' && /^[a-f0-9]{64}$/.test(String(e.eh || ''))) { out.links.push({ emailHash: e.eh, ts }); continue; }
    if (e.t !== 'pv') continue;
    const utm = e.u && typeof e.u === 'object' ? Object.fromEntries(Object.entries(e.u).filter(([k]) => ['source', 'medium', 'campaign', 'content', 'term', 'id'].includes(k)).map(([k, v]) => [k, str(v, 200)])) : null;
    out.events.push({
      type: 'pv', ts, sid: str(e.s, 32), host: str(e.h, 120), path: str(e.p, 300), title: str(e.ti, 120), newSession: !!e.ns,
      referrer: str(e.r, 500), utm: utm && Object.keys(utm).length ? utm : null,
      clickType: ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id', 'twclid', 'ScCid'].includes(e.c) ? e.c : null, clickId: str(e.cv, 300), mobile: e.m == null ? null : !!e.m,
    });
  }
  return out;
}

// ---- events → sessions ----
function sessionsOf(events) {
  const by = new Map();
  for (const e of events) {
    const k = `${e.vid}|${e.sid || ''}`;
    let s = by.get(k);
    if (!s) { s = { vid: e.vid, sid: e.sid, start: e.ts, end: e.ts, landing: `${e.host || ''}${e.path || ''}`, pages: [], first: e, mobile: e.mobile }; by.set(k, s); }
    s.end = e.ts; s.pages.push(e.path || '/');
    if (e.newSession && s.first !== e && !s.first.newSession) s.first = e; // the event carrying the source wins
  }
  return [...by.values()].map((s) => {
    const f = s.first;
    const ch = classify({ utm: f.utm || {}, clickType: f.clickType, referrer: f.referrer || '', host: f.host });
    const u = f.utm || {};
    return {
      at: s.start, end: s.end, vid: s.vid, group: ch.group, source: ch.source, branded: !!ch.branded,
      campaign: u.campaign || null, ad: u.content || null, term: u.term || null, clickType: f.clickType || null,
      landing: s.landing, pages: s.pages.length, keyPages: keyPagesOf(s.pages), device: s.mobile == null ? null : (s.mobile ? 'phone' : 'desktop'),
    };
  }).sort((a, b) => a.at.localeCompare(b.at));
}

// A touch is a session that started from somewhere (not a continuation from another 4Geeks page).
const touchesOf = (sessions) => sessions.filter((s) => s.group !== 'Internal');
const label = (t) => (t.group === 'Paid Search' && t.branded ? 'Paid Search (brand)' : t.group);

function credit(touches, model) {
  const n = touches.length;
  if (!n) return [];
  if (model === 'first') return [[touches[0], 1]];
  if (model === 'last') { const nd = touches.filter((t) => t.group !== 'Direct'); return [[(nd.length ? nd[nd.length - 1] : touches[n - 1]), 1]]; }
  if (model === 'linear') return touches.map((t) => [t, 1 / n]);
  if (model === 'position') {
    if (n === 1) return [[touches[0], 1]];
    if (n === 2) return [[touches[0], 0.5], [touches[1], 0.5]];
    return touches.map((t, i) => [t, i === 0 || i === n - 1 ? 0.4 : 0.2 / (n - 2)]);
  }
  return [];
}
const MODELS = ['first', 'last', 'linear', 'position'];

function createAttribution({ store, getRecords, getEnrollOf, log = console }) {
  // email hash -> record ids, rebuilt when the record set changes
  let hashIndex = { n: -1, map: new Map() };
  function indexFor(records) {
    if (hashIndex.n === records.length && hashIndex.src === records) return hashIndex.map;
    const map = new Map();
    records.forEach((r) => { if (r.email && String(r.email).includes('@')) map.set(String(r.id), emailHash(r.email)); });
    hashIndex = { n: records.length, src: records, map };
    return map;
  }

  async function collect(body) {
    const c = cleanEvents(body);
    if (!c) return { ok: false };
    if (c.events.length) await store.addEvents(c.vid, c.events);
    for (const l of c.links) await store.link(l.emailHash, c.vid);
    return { ok: true, events: c.events.length, links: c.links.length };
  }

  // Journeys for many leads at once: { [dealId]: { touches, after, conversionAt, vids } }
  async function journeysFor(records) {
    const idx = indexFor(getRecords() || []);
    const hashOf = new Map(records.map((r) => [String(r.id), idx.get(String(r.id)) || (r.email ? emailHash(r.email) : null)]).filter(([, h]) => h));
    const links = await store.vidsFor([...new Set(hashOf.values())]);
    const vidsByHash = new Map(); const linkedAt = new Map();
    links.forEach((l) => {
      (vidsByHash.get(l.email_hash) || vidsByHash.set(l.email_hash, []).get(l.email_hash)).push(l.vid);
      const at = l.first_at ? new Date(l.first_at).toISOString() : null;
      if (at && (!linkedAt.has(l.email_hash) || at < linkedAt.get(l.email_hash))) linkedAt.set(l.email_hash, at);
    });
    const allVids = [...new Set(links.map((l) => l.vid))];
    const events = allVids.length ? await store.eventsFor(allVids) : [];
    const evByVid = new Map(); events.forEach((e) => (evByVid.get(e.vid) || evByVid.set(e.vid, []).get(e.vid)).push(e));
    const out = {};
    for (const r of records) {
      const h = hashOf.get(String(r.id)); if (!h) continue;
      const vids = vidsByHash.get(h); if (!vids) continue;
      const sessions = sessionsOf(vids.flatMap((v) => evByVid.get(v) || []));
      // The form moment: when this email was first linked; else the end of the deal's creation day.
      const conversionAt = linkedAt.get(h) || (r.date ? `${r.date}T23:59:59.000Z` : null);
      const before = sessions.filter((s) => !conversionAt || s.at <= conversionAt);
      const after = sessions.filter((s) => conversionAt && s.at > conversionAt);
      out[String(r.id)] = { vids: vids.length, conversionAt, touches: touchesOf(before), continuations: before.length - touchesOf(before).length, after };
    }
    return out;
  }

  async function journey(record) {
    const j = (await journeysFor([record]))[String(record.id)] || null;
    return {
      journey: j,
      recorded: { source: record.source || null, medium: record.medium || null, campaign: record.campaign || null, hasGclid: !!record.hasGclid },
    };
  }

  async function report(records) {
    const enrollOf = getEnrollOf();
    const journeys = await journeysFor(records);
    const withJ = records.filter((r) => journeys[String(r.id)] && journeys[String(r.id)].touches.length);
    const models = {};
    for (const m of MODELS) {
      const byGroup = new Map(); const bySource = new Map();
      const add = (map, key, w, r) => {
        const x = map.get(key) || { key, leads: 0, qualified: 0, enrolled: 0 };
        x.leads += w; if (QUAL.includes(r.admissionsScore)) x.qualified += w; if (enrollOf(r)) x.enrolled += w;
        map.set(key, x);
      };
      for (const r of withJ) {
        for (const [t, w] of credit(journeys[String(r.id)].touches, m)) {
          add(byGroup, label(t), w, r);
          add(bySource, `${label(t)}${t.source ? ` · ${t.source}` : ''}`, w, r);
        }
      }
      const round = (x) => ({ ...x, leads: Math.round(x.leads * 10) / 10, qualified: Math.round(x.qualified * 10) / 10, enrolled: Math.round(x.enrolled * 10) / 10 });
      models[m] = { groups: [...byGroup.values()].map(round).sort((a, b) => b.leads - a.leads), sources: [...bySource.values()].map(round).sort((a, b) => b.leads - a.leads).slice(0, 25) };
    }
    // Paths (channel sequence, consecutive repeats collapsed).
    const paths = new Map(); const ads = new Map();
    const touchesN = []; const daysToLead = []; let multi = 0; let paidThenBrand = 0;
    for (const r of withJ) {
      const ts = journeys[String(r.id)].touches;
      const seq = ts.map(label).filter((x, i, a) => i === 0 || x !== a[i - 1]);
      const k = seq.join(' → ');
      const p = paths.get(k) || { path: k, leads: 0, qualified: 0, enrolled: 0, steps: seq.length };
      p.leads++; if (QUAL.includes(r.admissionsScore)) p.qualified++; if (enrollOf(r)) p.enrolled++;
      paths.set(k, p);
      touchesN.push(ts.length); if (ts.length > 1) multi++;
      const days = (Date.parse(journeys[String(r.id)].conversionAt || ts[ts.length - 1].at) - Date.parse(ts[0].at)) / 864e5;
      if (Number.isFinite(days)) daysToLead.push(Math.max(0, days));
      if (ts.some((t) => PAID.has(t.group) && !(t.group === 'Paid Search' && t.branded)) && ts.some((t) => (t.group === 'Paid Search' && t.branded) || t.group === 'Organic Search' || t.group === 'Direct')) paidThenBrand++;
      // Every ad that touched the lead (any position).
      new Set(ts.filter((t) => PAID.has(t.group)).map((t) => `${t.source || t.group}|${t.campaign || '(no campaign)'}|${t.ad || '(no ad name)'}`)).forEach((key) => {
        const [src, campaign, ad] = key.split('|');
        const a = ads.get(key) || { source: src, campaign, ad, leads: 0, firstTouch: 0, lastTouch: 0, qualified: 0, enrolled: 0 };
        a.leads++; if (QUAL.includes(r.admissionsScore)) a.qualified++; if (enrollOf(r)) a.enrolled++;
        const f = ts[0]; const l = credit(ts, 'last')[0][0];
        if (PAID.has(f.group) && `${f.source || f.group}|${f.campaign || '(no campaign)'}|${f.ad || '(no ad name)'}` === key) a.firstTouch++;
        if (PAID.has(l.group) && `${l.source || l.group}|${l.campaign || '(no campaign)'}|${l.ad || '(no ad name)'}` === key) a.lastTouch++;
        ads.set(key, a);
      });
    }
    // Tag health: paid touches without a campaign or an ad name can't be traced to an ad.
    const paidTouches = withJ.flatMap((r) => journeys[String(r.id)].touches.filter((t) => PAID.has(t.group)));
    return {
      coverage: {
        leads: records.length, withJourney: withJ.length, multiTouch: multi,
        medianTouches: median(touchesN), medianDaysFirstTouchToLead: median(daysToLead) == null ? null : Math.round(median(daysToLead) * 10) / 10,
        paidThenSearchOrDirect: paidThenBrand,
      },
      models,
      paths: [...paths.values()].sort((a, b) => b.leads - a.leads).slice(0, 12),
      ads: [...ads.values()].sort((a, b) => b.leads - a.leads).slice(0, 25),
      tagHealth: {
        paidTouches: paidTouches.length,
        noCampaign: paidTouches.filter((t) => !t.campaign).length,
        noAdName: paidTouches.filter((t) => !t.ad).length,
      },
    };
  }

  return { collect, journey, journeysFor, report, status: () => store.status(), prune: (days) => store.prune(days) };
}

module.exports = { createAttribution, cleanEvents, sessionsOf, credit, emailHash, keyPagesOf, MODELS };
