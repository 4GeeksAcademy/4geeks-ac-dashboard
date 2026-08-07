const { PIPELINE_REGION_MAP, DEAL_FIELD_MAP_CANDIDATES, CONTACT_FIELD_MAP, DEAL_STATUS } = require('./config');
const LOST_REASON_FIELD_ID = DEAL_FIELD_MAP_CANDIDATES.lostReason; // TODO-verify, see lib/config.js

function isoWeekStart(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // back up to Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function bucketForDeal(deal, lostReason) {
  const status = Number(deal.status);
  if (status === DEAL_STATUS.WON) return 'Won';
  if (status === DEAL_STATUS.LOST) return lostReason ? 'Lost - Classified' : 'Lost - Unclassified';
  return 'Active / Other';
}

/**
 * Build a flat, dashboard-ready array of records from raw AC data.
 * One row per deal. Contacts with no deal in the window are appended
 * separately as 'Active / Other' rows with region 'Unknown' unless a
 * contact-level region field is configured.
 */
function buildDataset({ deals, dealCustomFieldData, contactsById, contactFieldValuesById }) {
  const lostReasonByDeal = new Map();
  if (LOST_REASON_FIELD_ID) {
    (dealCustomFieldData || []).forEach((row) => {
      if (String(row.customFieldId) === String(LOST_REASON_FIELD_ID) && row.fieldValue) {
        lostReasonByDeal.set(String(row.dealId), row.fieldValue);
      }
    });
  }

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
    const lostReason = lostReasonByDeal.get(String(deal.id));
    const bucket = bucketForDeal(deal, lostReason);
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
      reason: bucket === 'Won' ? 'Enrolled' : bucket === 'Active / Other' ? 'Open / in pipeline' : (lostReason || 'No reason recorded'),
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
