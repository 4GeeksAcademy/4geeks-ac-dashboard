'use strict';
// ---------------------------------------------------------------------------
// Marketing intelligence: which sources and campaigns bring leads that turn
// into students, what they cost, and what changed against the previous period.
//
// Lead quality comes from the admissions score (Good / Very Good = qualified,
// Invalid / Fake / Duplicate = junk); enrollments come from the Enrollments
// section (USA sheet + AC won), matched by deal id or email — the same truth
// the Sales tab uses. Spend comes from 4Geeks Center (the Ads page's source),
// matched to our UTM campaigns by name where they line up.
// ---------------------------------------------------------------------------
const { bucketOf, QUALIFIED } = require('../pipeline/scores');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const keyOf = (r, dim) => {
  const v = dim === 'campaign' ? r.campaign : dim === 'medium' ? r.medium : r.source;
  const t = String(v || '').trim();
  return t ? t.toLowerCase() : '(not set)';
};

function tally(records, dim, enrollOf) {
  const g = new Map();
  for (const r of records) {
    const k = keyOf(r, dim);
    const x = g.get(k) || { key: k, leads: 0, scored: 0, qualified: 0, junk: 0, enrolled: 0 };
    x.leads++;
    const b = bucketOf(r.admissionsScore);
    if (b !== 'Not scored') x.scored++;
    if (QUALIFIED.includes(b)) x.qualified++;
    if (b === 'Junk') x.junk++;
    if (enrollOf(r)) x.enrolled++;
    g.set(k, x);
  }
  return g;
}

// Center campaign names vs our utm_campaign values: exact after normalizing,
// else one contains the other (long names only, to avoid false matches).
function spendFor(key, campaigns) {
  const k = norm(key);
  if (!k || k === 'notset' || !campaigns.length) return null;
  const hit = campaigns.filter((c) => { const n = norm(c.name || c.campaign); return n === k || (k.length > 6 && n.length > 6 && (n.includes(k) || k.includes(n))); });
  if (!hit.length) return null;
  return { spend: hit.reduce((a, c) => a + (Number(c.spend) || 0), 0), centerLeads: hit.reduce((a, c) => a + (Number(c.leads) || 0), 0), matched: hit.map((c) => c.name || c.campaign).slice(0, 3) };
}

function report({ records, prevRecords = [], dim = 'source', enrollOf, center = null }) {
  const cur = tally(records, dim, enrollOf);
  const prev = tally(prevRecords, dim, enrollOf);
  const campaigns = (center && Array.isArray(center.campaigns)) ? center.campaigns : [];
  const rate = (a, b) => (b ? a / b : null);
  const rows = [...cur.values()].map((x) => {
    const p = prev.get(x.key) || { leads: 0, qualified: 0, enrolled: 0, scored: 0, junk: 0 };
    const sp = dim === 'campaign' ? spendFor(x.key, campaigns) : null;
    return {
      key: x.key, leads: x.leads, prevLeads: p.leads, change: p.leads ? (x.leads - p.leads) / p.leads : null,
      qualified: x.qualified, qualifiedRate: rate(x.qualified, x.leads), prevQualifiedRate: rate(p.qualified, p.leads),
      junk: x.junk, junkRate: rate(x.junk, x.leads), scoredRate: rate(x.scored, x.leads),
      enrolled: x.enrolled, enrollRate: rate(x.enrolled, x.leads), prevEnrolled: p.enrolled,
      spend: sp ? sp.spend : null, costPerLead: sp && x.leads ? sp.spend / x.leads : null, costPerEnrollment: sp && x.enrolled ? sp.spend / x.enrolled : null,
      matchedCampaigns: sp ? sp.matched : null,
    };
  }).sort((a, b) => b.leads - a.leads);
  // Sources that disappeared this period still matter ("Facebook went from 120 to 0").
  [...prev.values()].filter((p) => !cur.has(p.key) && p.leads >= 5).forEach((p) => rows.push({ key: p.key, leads: 0, prevLeads: p.leads, change: -1, qualified: 0, qualifiedRate: null, prevQualifiedRate: rate(p.qualified, p.leads), junk: 0, junkRate: null, scoredRate: null, enrolled: 0, enrollRate: null, prevEnrolled: p.enrolled, spend: null, costPerLead: null, costPerEnrollment: null }));

  const sum = (m, f) => [...m.values()].reduce((a, x) => a + x[f], 0);
  const totals = {
    leads: sum(cur, 'leads'), prevLeads: sum(prev, 'leads'),
    qualified: sum(cur, 'qualified'), prevQualified: sum(prev, 'qualified'),
    junk: sum(cur, 'junk'), enrolled: sum(cur, 'enrolled'), prevEnrolled: sum(prev, 'enrolled'), scored: sum(cur, 'scored'),
  };
  const cs = center && center.summary ? center.summary : null;
  totals.spend = cs && Number.isFinite(cs.spend) ? cs.spend : null;
  totals.currency = center && center.currency ? center.currency : null;
  totals.costPerQualified = totals.spend != null && totals.qualified ? totals.spend / totals.qualified : null;
  totals.costPerEnrollment = totals.spend != null && totals.enrolled ? totals.spend / totals.enrolled : null;

  // Biggest movers vs the previous period (by volume and by quality).
  const movers = rows.filter((r) => r.prevLeads >= 10 || r.leads >= 10).map((r) => ({
    key: r.key, leads: r.leads, prevLeads: r.prevLeads, change: r.change,
    qualityShift: r.qualifiedRate != null && r.prevQualifiedRate != null ? r.qualifiedRate - r.prevQualifiedRate : null,
  })).sort((a, b) => Math.abs(b.leads - b.prevLeads) - Math.abs(a.leads - a.prevLeads)).slice(0, 6);

  return { dim, totals, rows: rows.slice(0, 60), movers, campaignsMatched: rows.filter((r) => r.spend != null).length, centerCampaigns: campaigns.length };
}

const ADVICE_SYSTEM = `You are the head of performance marketing at 4Geeks Academy (tech/AI bootcamps; USA, Spain, LATAM). You get a table of lead sources/campaigns with volume, change vs the previous period, lead quality (share scored Good/Very Good by admissions, share junk), real enrollments and cost where known.
Write what marketing should change THIS WEEK. Rules:
- 3 to 5 actions, most valuable first. Each: one bold imperative line, then one sentence of evidence quoting the numbers from the table (source/campaign name + figures).
- Judge sources by qualified leads and enrollments, never by raw lead volume alone. Call out junk-heavy sources and sources whose quality dropped.
- When cost is known, use cost per qualified lead / per enrollment. When it isn't, say which spend data is missing instead of guessing.
- If the numbers are too small to conclude (under ~20 leads), say so rather than over-reading them.
- Enrollments lag leads by weeks: fewer enrollments in the current period than the previous one is expected and is NOT by itself a decline. Lean on qualified rate for recent periods.
- End with one line "To watch:" naming one risk.
Plain text with **bold** only, no headings, no tables. Under 220 words.`;

function adviceContent({ region, period, report: rep, lang }) {
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const lines = rep.rows.slice(0, 25).map((r) => `${r.key}: ${r.leads} leads (prev ${r.prevLeads}), qualified ${pct(r.qualifiedRate)} (prev ${pct(r.prevQualifiedRate)}), junk ${pct(r.junkRate)}, enrolled ${r.enrolled}${r.spend != null ? `, spend ${Math.round(r.spend)}, cost/enrollment ${r.costPerEnrollment ? Math.round(r.costPerEnrollment) : '—'}` : ''}`);
  const t = rep.totals;
  return `Region: ${region}. Period: ${period}. Grouped by ${rep.dim}. Reply in ${lang === 'es' ? 'Spanish' : 'English'}.
Totals: ${t.leads} leads (prev ${t.prevLeads}), ${t.qualified} qualified (prev ${t.prevQualified}), ${t.junk} junk, ${t.enrolled} enrolled (prev ${t.prevEnrolled})${t.spend != null ? `, spend ${Math.round(t.spend)} ${t.currency || ''}, cost per qualified ${t.costPerQualified ? Math.round(t.costPerQualified) : '—'}, cost per enrollment ${t.costPerEnrollment ? Math.round(t.costPerEnrollment) : '—'}` : ', spend unknown'}.
Rows:
${lines.join('\n')}`;
}

module.exports = { report, spendFor, ADVICE_SYSTEM, adviceContent, keyOf };
