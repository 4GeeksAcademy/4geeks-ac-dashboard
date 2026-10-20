// ---------------------------------------------------------------------------
// Enrollments — Spain and LATAM from ActiveCampaign, USA from the team's
// "2026 USA DATA" sheet (lib/usa-sheet.js), enriched with the AC deal (rep,
// name, link) matched by email. If USA_ENROLL_FEED_URL is not set, USA falls
// back to ActiveCampaign pipeline 5.
//
// Why a separate pull: the main dataset only holds deals CREATED in the last
// DATA_WINDOW_MONTHS. An enrollment is counted by the date it CONVERTED, and
// many are won months after the lead came in, so the main window misses them.
// Here we pull, per enrollment pipeline, every deal with status = Won created
// since ENROLL_SINCE (cheap: a few hundred deals), plus the deals sitting in
// "drop" stages (e.g. Spain "BAJA - Leads WON que finalmente acaban como
// LOST"). Deals in the main cache that were won and later lost (won_date set,
// status Lost) are counted as dropped too.
//
// Pipelines (verified live on 2026-10-20 through /api/schema):
//   16 4Geeks Madrid PT         -> Spain   (won stages: "Won/WON <program> (<cohort dates>) - <code>")
//   67 4Geeks Latinoamérica     -> LATAM
//   5  4Geeks USA Programs      -> USA, only as the email lookup for the sheet (or as the source when no sheet feed)
// B2B España (75) is deliberately NOT counted. Override with ENROLL_PIPELINES="16:Spain,67:LATAM".
// ---------------------------------------------------------------------------
const { DEAL_FIELD_MAP, CONTACT_FIELD_MAP } = require('./config');
const { dealRowDealId, dealRowFieldId, dealRowValue, isoWeekStart } = require('./analysis');
const { fetchUsaSheet } = require('./usa-sheet');

const USA_FROM_SHEET = !!process.env.USA_ENROLL_FEED_URL;
const USA_PIPELINE = String(process.env.USA_PIPELINE || '5');
const DEFAULT_PIPELINES = '16:Spain,67:LATAM';
const ENROLL_PIPELINES = String(process.env.ENROLL_PIPELINES || DEFAULT_PIPELINES).split(',')
  .map((s) => s.trim().split(':')).filter(([id, region]) => id && region)
  .map(([id, region]) => ({ id: String(id), region }));
const ENROLL_SINCE = process.env.ENROLL_SINCE || '2025-01-01';
// Stages that mean "enrolled, then dropped" even if the deal is still Won.
const DROP_STAGE_PATTERN = /\bbaja\b|dropped|drop out|withdr/i;
const USD_PER_EUR = Number(process.env.USD_PER_EUR || 1.08);


function programFrom(course, stage) {
  const s = `${course || ''} ${stage || ''}`.toLowerCase();
  if (/ai\s*eng.*dev|aiedevs|ai engineering for dev/.test(s)) return 'AI Engineering for Developers';
  if (/master/.test(s)) return 'Master AI Engineering';
  if (/fluency/.test(s)) return 'AI Fluency';
  if (/flex/.test(s)) return 'AI Flex';
  if (/ai\s*eng|aie\b|applied ai|machine learning|ai-ml|\bai\b/.test(s)) return 'AI Engineering';
  if (/cyber|\bcs\b/.test(s)) return 'Cybersecurity';
  if (/data|\bds\b/.test(s)) return 'Data Science & ML';
  if (/full.?stack|\bfs\b|web dev|coding/.test(s)) return 'Full-Stack';
  return course ? String(course) : 'Other / not set';
}
// "WON AI ENG TARDES (02 NOV - 12 MAY) TARDES - ES-AIE-QF6VAY" -> "02 NOV - 12 MAY"
function cohortFrom(stage) {
  const m = String(stage || '').match(/\(([^)]*\d[^)]*)\)/);
  return m ? m[1].trim() : null;
}
const { money } = require('./money');
function isoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function createEnrollments({ client, getLookups, getMainRecords, getContactCaches, contactFieldMap = CONTACT_FIELD_MAP, usaFeed = fetchUsaSheet, usaFromSheet = USA_FROM_SHEET }) {
  let state = { at: 0, rows: [], error: null, usaError: null, usaAt: null, loading: false, pipelines: ENROLL_PIPELINES, since: ENROLL_SINCE };
  let lastUsaRows = [];
  // USA comes from the sheet when the feed is set; otherwise from its AC pipeline.
  const pipelines = usaFromSheet ? ENROLL_PIPELINES.filter((p) => p.region !== 'USA')
    : (ENROLL_PIPELINES.some((p) => p.region === 'USA') ? ENROLL_PIPELINES : [...ENROLL_PIPELINES, { id: USA_PIPELINE, region: 'USA' }]);

  async function fetchContacts(ids) {
    const contacts = new Map(); const fieldValues = new Map();
    const list = [...ids];
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const qs = chunk.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
      try {
        const data = await client._get(`/api/3/contacts?${qs}`, { include: 'fieldValues', limit: 100 });
        (data.contacts || []).forEach((c) => contacts.set(String(c.id), c));
        (data.fieldValues || []).forEach((fv) => {
          const k = String(fv.contact);
          if (!fieldValues.has(k)) fieldValues.set(k, []);
          fieldValues.get(k).push(fv);
        });
      } catch (e) { console.warn(`[enrollments] contacts batch failed: ${e.message}`); }
    }
    return { contacts, fieldValues };
  }

  function toRow(deal, ctx) {
    const { dealFields, contact, contactValues, region, usersById, stagesById, dropped } = ctx;
    const df = (id) => (id ? dealFields[String(id)] ?? null : null);
    const cf = (name) => {
      for (const [fid, n] of Object.entries(contactFieldMap)) {
        if (n !== name) continue;
        const hit = (contactValues || []).find((v) => String(v.field) === String(fid));
        if (hit && hit.value) return hit.value;
      }
      return null;
    };
    const stageObj = stagesById.get(String(deal.stage));
    const stage = stageObj ? (stageObj.title || stageObj.name) : String(deal.stage || '');
    const u = usersById.get(String(deal.owner));
    const owner = u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.email) : (deal.owner ? `User #${deal.owner}` : null);
    const course = df(DEAL_FIELD_MAP.course) || cf('course') || df(DEAL_FIELD_MAP.utmCourseField);
    const created = isoDate(deal.cdate);
    const converted = isoDate(df(DEAL_FIELD_MAP.wonDate)) || isoDate(deal.edate) || isoDate(deal.mdate) || created;
    const finalPrice = money(df(DEAL_FIELD_MAP.finalPrice));
    const value = deal.value ? Number(deal.value) / 100 : null;
    const price = finalPrice || (value > 0 ? value : null);
    const currency = String(deal.currency || (region === 'Spain' ? 'eur' : 'usd')).toUpperCase();
    const priceUsd = price == null ? null : currency === 'EUR' ? price * USD_PER_EUR : price;
    return {
      id: String(deal.id),
      contactId: deal.contact ? String(deal.contact) : null,
      name: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null : null,
      email: contact ? contact.email || null : null,
      phone: contact ? contact.phone || null : null,
      region,
      pipelineId: String(deal.group),
      stage,
      cohort: cohortFrom(stage) || df(DEAL_FIELD_MAP.expectedCohort) || null,
      course: course || null,
      program: programFrom(course, stage),
      location: cf('utmLocation') || df(DEAL_FIELD_MAP.utmLocation) || null,
      source: cf('utmSource') || df(DEAL_FIELD_MAP.utmSource) || null,
      medium: cf('utmMedium') || df(DEAL_FIELD_MAP.utmMedium) || null,
      campaign: cf('utmCampaign') || df(DEAL_FIELD_MAP.utmCampaign) || null,
      assignTo: owner,
      created,
      converted,
      week: isoWeekStart(converted),
      month: converted ? converted.slice(0, 7) : null,
      daysToConvert: created && converted ? Math.max(0, Math.round((new Date(converted) - new Date(created)) / 86400000)) : null,
      price,
      currency,
      priceUsd,
      listValue: value,
      financing: df(DEAL_FIELD_MAP.financingPartner) || null,
      sourceSystem: 'activecampaign',
      status: dropped ? 'dropped' : 'enrolled',
      lostDate: dropped ? (isoDate(df(DEAL_FIELD_MAP.lostDate)) || isoDate(deal.mdate)) : null,
    };
  }

  async function refresh() {
    if (!client || state.loading) return;
    state.loading = true;
    const started = Date.now();
    try {
      const { usersById, stagesById } = getLookups();
      const dropStageIds = new Set([...stagesById.values()]
        .filter((s) => pipelines.some((p) => p.id === String(s.group)) && DROP_STAGE_PATTERN.test(s.title || ''))
        .map((s) => String(s.id)));

      const deals = []; const dealFieldRows = [];
      for (const p of pipelines) {
        const won = await client.listDealsWithCustomFields({ group: p.id, status: 1, createdAfter: ENROLL_SINCE });
        won.deals.forEach((d) => deals.push({ deal: d, region: p.region }));
        dealFieldRows.push(...(won.dealCustomFieldData || []));
      }
      // Deals parked in a "drop" stage (whatever their status) are drops.
      for (const sid of dropStageIds) {
        const st = stagesById.get(sid);
        const p = pipelines.find((x) => x.id === String(st.group));
        const params = { 'filters[stage]': sid, 'filters[created_after]': ENROLL_SINCE, 'orders[cdate]': 'ASC' };
        const res = await client._paginateAllWithInclude('/api/3/deals', params, 'deals', 'dealCustomFieldData');
        res.items.forEach((d) => deals.push({ deal: d, region: p.region, dropped: true }));
        dealFieldRows.push(...(res.included || []));
      }

      const fieldsByDeal = new Map();
      dealFieldRows.forEach((row) => {
        const k = dealRowDealId(row); const f = dealRowFieldId(row);
        if (!k || !f) return;
        if (!fieldsByDeal.has(k)) fieldsByDeal.set(k, {});
        fieldsByDeal.get(k)[f] = dealRowValue(row);
      });

      // Contacts: reuse what the main pull already has, fetch only the rest.
      const { contactsById: cachedContacts, fieldValuesById: cachedValues } = getContactCaches();
      const need = new Set(deals.map((x) => String(x.deal.contact)).filter((id) => id && id !== 'null' && !(cachedContacts.has(id) && cachedValues.has(id))));
      const fetched = need.size ? await fetchContacts(need) : { contacts: new Map(), fieldValues: new Map() };

      const seen = new Map();
      deals.forEach(({ deal, region, dropped }) => {
        const id = String(deal.id);
        const stage = stagesById.get(String(deal.stage));
        const isDrop = !!dropped || Number(deal.status) === 2 || (stage && DROP_STAGE_PATTERN.test(stage.title || ''));
        const c = String(deal.contact);
        const row = toRow(deal, {
          dealFields: fieldsByDeal.get(id) || {}, region, usersById, stagesById, dropped: isDrop,
          contact: fetched.contacts.get(c) || cachedContacts.get(c),
          contactValues: fetched.fieldValues.get(c) || cachedValues.get(c) || [],
        });
        if (!seen.has(id) || isDrop) seen.set(id, row);
      });

      // Won, then lost later: in the main 6-month cache with a won_date.
      (getMainRecords() || []).forEach((r) => {
        if (seen.has(String(r.id)) || !r.wonDate) return;
        if (r.bucket !== 'Lost - Classified' && r.bucket !== 'Lost - Unclassified') return;
        const p = pipelines.find((x) => x.id === String(r.pipelineId));
        if (!p) return;
        const converted = isoDate(r.wonDate);
        seen.set(String(r.id), {
          id: String(r.id), contactId: r.contactId, name: r.name, email: r.email, phone: r.phone,
          region: p.region, pipelineId: String(r.pipelineId), stage: r.stage,
          cohort: cohortFrom(r.stage), course: r.course, program: programFrom(r.course, r.stage),
          location: r.location, source: r.source, medium: r.medium, campaign: r.campaign, assignTo: r.assignTo,
          created: r.date, converted, week: isoWeekStart(converted), month: converted ? converted.slice(0, 7) : null,
          daysToConvert: r.date && converted ? Math.max(0, Math.round((new Date(converted) - new Date(r.date)) / 86400000)) : null,
          price: r.dealValue || null, currency: p.region === 'Spain' ? 'EUR' : 'USD',
          priceUsd: r.dealValue ? (p.region === 'Spain' ? r.dealValue * USD_PER_EUR : r.dealValue) : null,
          listValue: r.dealValue || null, financing: null, status: 'dropped', lostDate: isoDate(r.lostDate),
        });
      });

      // ---- USA from the sheet, matched to the AC deal by email ----
      let usaRows = [];
      let usaError = null;
      if (usaFromSheet) {
        try {
          const sheet = await usaFeed();
          const won = await client.listDealsWithCustomFields({ group: USA_PIPELINE, status: 1, createdAfter: '2024-01-01' });
          const ids = new Set(won.deals.map((d) => String(d.contact)).filter((id) => id && !cachedContacts.has(id)));
          const more = ids.size ? await fetchContacts(ids) : { contacts: new Map() };
          const byEmail = new Map();
          won.deals.slice().sort((a, b) => String(a.cdate).localeCompare(String(b.cdate))).forEach((d) => {
            const c = more.contacts.get(String(d.contact)) || cachedContacts.get(String(d.contact));
            if (c && c.email) byEmail.set(String(c.email).trim().toLowerCase(), { deal: d, contact: c });
          });
          (getMainRecords() || []).forEach((r) => { if (r.region === 'USA' && r.email && !byEmail.has(r.email.toLowerCase())) byEmail.set(r.email.toLowerCase(), { record: r }); });
          usaRows = sheet.map((s, i) => {
            const m = s.email ? byEmail.get(s.email.toLowerCase()) : null;
            const deal = m && m.deal; const rec = m && m.record; const c = m && m.contact;
            const u = deal ? usersById.get(String(deal.owner)) : null;
            const rep = u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username) : (rec ? rec.assignTo : null);
            const st = deal ? stagesById.get(String(deal.stage)) : null;
            return {
              id: deal ? String(deal.id) : (rec ? String(rec.id) : `usa-${s.sheetRow || i}`),
              acDeal: !!(deal || rec),
              contactId: deal ? String(deal.contact) : (rec ? rec.contactId : null),
              name: c ? [c.firstName, c.lastName].filter(Boolean).join(' ') || null : (rec ? rec.name : null),
              email: s.email, phone: c ? c.phone || null : null,
              region: 'USA', pipelineId: USA_PIPELINE, stage: st ? st.title : (rec ? rec.stage : null),
              cohort: null, course: s.courseRaw, program: s.program,
              location: s.location, source: s.source, medium: null, campaign: s.campaign, assignTo: rep,
              created: s.created, converted: s.converted, week: isoWeekStart(s.converted), month: s.converted.slice(0, 7),
              daysToConvert: s.daysToConvert, price: s.price, currency: 'USD', priceUsd: s.price, listValue: s.price,
              financing: s.plan, plan: s.plan, monthly: s.monthly, status: 'enrolled', lostDate: null, sourceSystem: 'sheet',
            };
          });
          lastUsaRows = usaRows; state.usaAt = Date.now();
        } catch (e) {
          usaError = e.message; usaRows = lastUsaRows;
          console.warn('[enrollments] USA sheet failed:', e.message);
        }
      }

      const rows = [...seen.values(), ...usaRows].filter((r) => r.converted && r.converted >= ENROLL_SINCE)
        .sort((a, b) => b.converted.localeCompare(a.converted));
      state = { ...state, at: Date.now(), rows, error: null, usaError };
      console.log(`[enrollments] ${rows.length} enrollments (${rows.filter((r) => r.status === 'dropped').length} dropped) from ${pipelines.length} pipelines in ${((Date.now() - started) / 1000).toFixed(1)}s; fetched ${need.size} contacts`);
    } catch (e) {
      state.error = e.message;
      console.error('[enrollments] refresh failed:', e.message);
    } finally {
      state.loading = false;
    }
  }

  return {
    refresh,
    get: () => state,
    meta: () => ({ sources: { USA: usaFromSheet ? 'sheet' : 'activecampaign', Spain: 'activecampaign', LATAM: 'activecampaign' }, usaError: state.usaError, usaAt: state.usaAt ? new Date(state.usaAt).toISOString() : null, pipelines: pipelines, since: ENROLL_SINCE, usdPerEur: USD_PER_EUR, at: state.at ? new Date(state.at).toISOString() : null, loading: state.loading, error: state.error, count: state.rows.length }),
  };
}

module.exports = { createEnrollments, programFrom, cohortFrom, money, ENROLL_PIPELINES };
