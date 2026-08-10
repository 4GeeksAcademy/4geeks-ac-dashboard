const { PIPELINE_REGION_MAP, DEAL_FIELD_MAP, CONTACT_FIELD_MAP, DEAL_STATUS } = require('./config');

// AC returns multiselect custom-field values (like Lost Reasons) as a single
// string. We've seen it come back delimited a few different ways depending
// on how the deal was edited (double-pipe "||", a JSON array string, or a
// single plain value with no delimiter). Parse defensively into a clean
// array of the underlying canonical option strings, so a deal with 2+
// reasons selected doesn't get treated as one giant one-off "reason" --
// each individual reason should be counted against the ~30 fixed options
// that actually exist on the AC field, not as a unique compound string.
function parseMultiselect(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
    const str = String(raw).trim();
    if (!str) return [];
    if (str.startsWith('[')) {
          try {
                  const parsed = JSON.parse(str);
                  if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
          } catch (e) {
                  // not valid JSON -- fall through to delimiter splitting below
          }
    }
    const delimiter = str.includes('||') ? '||' : (str.includes('|') ? '|' : null);
    if (delimiter) return str.split(delimiter).map((v) => v.trim()).filter(Boolean);
    return [str];
}

function isoWeekStart(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const day = d.getUTCDay(); // 0=Sun
const diff = (day === 0 ? -6 : 1) - day; // back up to Monday
const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function bucketForDeal(deal, reasons) {
    const status = Number(deal.status);
    if (status === DEAL_STATUS.WON) return 'Won';
    if (status === DEAL_STATUS.LOST) return (reasons && reasons.length) ? 'Lost - Classified' : 'Lost - Unclassified';
    return 'Active / Other';
}

/**
* Build a flat, dashboard-ready array of records from raw AC data.
* One row per deal. Deal custom fields (lost reason, deal quality, feedback,
* etc.) are looked up by real customFieldId from DEAL_FIELD_MAP -- see
* lib/config.js for how these were verified against /api/schema.
*/
function buildDataset({ deals, dealCustomFieldData, contactsById, contactFieldValuesById }) {
  const dealFieldsByDeal = new Map();
  (dealCustomFieldData || []).forEach((row) => {
    const key = String(row.dealId);
    if (!dealFieldsByDeal.has(key)) dealFieldsByDeal.set(key, {});
    dealFieldsByDeal.get(key)[String(row.customFieldId)] = row.fieldValue;
  });

const getDealField = (dealId, fieldId) => {
  if (!fieldId) return null;
  const fields = dealFieldsByDeal.get(String(dealId));
  return fields ? (fields[String(fieldId)] || null) : null;
};

const getContactField = (contactId, mappedName) => {
  const values = contactFieldValuesById?.get(String(contactId)) || [];
  for (const [fieldId, name] of Object.entries(CONTACT_FIELD_MAP)) {
    if (name !== mappedName) continue;
    const hit = values.find((v) => String(v.field) === String(fieldId));
    if (hit) return hit.value || null;
  }
  return null;
};

const records = [];

(deals || []).forEach((deal) => {
  const contact = contactsById?.get(String(deal.contact));
  const lostReasonRaw = getDealField(deal.id, DEAL_FIELD_MAP.lostReason);
      const lostReasons = parseMultiselect(lostReasonRaw);
      const bucket = bucketForDeal(deal, lostReasons);
  const region = PIPELINE_REGION_MAP[String(deal.group)] || 'Unmapped pipeline';
  const date = (deal.cdate || '').slice(0, 10);

                      records.push({
                        id: deal.id,
                        contactId: deal.contact || null,
                        name: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null : null,
                        email: contact?.email || null,
                        phone: contact?.phone || null,
                        date,
                        week: isoWeekStart(date),
                        dealTitle: deal.title || null,
                        dealValue: deal.value ? Number(deal.value) / 100 : 0, // AC stores cents
                        stageId: deal.stage || null,
                        region,
                        pipelineId: deal.group,
                        course: getContactField(deal.contact, 'course'),
                        source: getContactField(deal.contact, 'utmSource'),
                        medium: getContactField(deal.contact, 'utmMedium'),
                        campaign: getContactField(deal.contact, 'utmCampaign'),
                        location: getContactField(deal.contact, 'utmLocation'),
                        assignTo: deal.owner || null,
                        bucket,
reason: bucket === 'Won' ? 'Enrolled' : bucket === 'Active / Other' ? 'Open / in pipeline' : (lostReasons.length ? lostReasons.join(', ') : 'No reason recorded'),
                              reasons: bucket === 'Lost - Classified' ? lostReasons : [],
                        admissionsScore: getContactField(deal.contact, 'admissionsTestScore'),
                        leadSentiment: getContactField(deal.contact, 'leadSentiment'),
                        classification: getContactField(deal.contact, 'classification'),
                        admissionsConversationType: getContactField(deal.contact, 'admissionsConversationType'),
                        dealQuality: getDealField(deal.id, DEAL_FIELD_MAP.dealQuality),
                        feedback: getDealField(deal.id, DEAL_FIELD_MAP.dealClientComments),
                        offerSentDate: getDealField(deal.id, DEAL_FIELD_MAP.offerSentDate),
                        wonDate: getDealField(deal.id, DEAL_FIELD_MAP.wonDate),
                        lostDate: getDealField(deal.id, DEAL_FIELD_MAP.lostDate),
                      });
});

return records;
}

function summarize(records) {
  const total = records.length;
  const byBucket = {};
  records.forEach((r) => { byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1; });
  const lost = (byBucket['Lost - Classified'] || 0) + (byBucket['Lost - Unclassified'] || 0);
  return {
    total,
    byBucket,
    lossRatePct: total ? Number(((lost / total) * 100).toFixed(1)) : 0,
  };
}

function groupBy(records, field) {
  const groups = {};
  records.forEach((r) => {
    const key = r[field] || '(none)';
    if (!groups[key]) groups[key] = { total: 0, won: 0, lostClassified: 0, lostUnclassified: 0, other: 0 };
    groups[key].total++;
    if (r.bucket === 'Won') groups[key].won++;
    else if (r.bucket === 'Lost - Classified') groups[key].lostClassified++;
    else if (r.bucket === 'Lost - Unclassified') groups[key].lostUnclassified++;
    else groups[key].other++;
  });
  return groups;
}

module.exports = { buildDataset, summarize, groupBy, isoWeekStart };
