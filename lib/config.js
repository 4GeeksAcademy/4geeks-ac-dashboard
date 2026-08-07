// ---------------------------------------------------------------------------
// Reverse-engineered from the existing n8n workflow "Webhook db_dynamic"
// (id eklRm5UQDW2cIdwU), which has been syncing AC deals -> Google Sheets
// per-region since Jan 2026. Pipeline IDs and CONTACT field IDs below come
// directly from that workflow's code nodes and are high-confidence (AC
// contact custom fields are referenced by stable field ID in the webhook
// payload). DEAL custom field IDs are lower-confidence: the n8n workflow
// reads them by ARRAY POSITION in the webhook payload (deal[fields][N]),
// which the workflow's own comments warn can drift if fields are added/
// removed in AC. Those are marked TODO-verify below and should be confirmed
// against a live GET /api/3/dealCustomFieldMeta (see scripts/probe-schema.js)
// before trusting them for the REST API (which keys by real customFieldId,
// not payload position).
// ---------------------------------------------------------------------------

// AC deal pipeline ("group") ID -> region. High confidence (from
// ZONE_BY_PIPELINE in "Merge Sticky Fields" nodes, comments name the region
// explicitly next to each ID).
const PIPELINE_REGION_MAP = {
  '5': 'USA',     // n8n comment: "USA — heredado, pendiente de revisar"
  '16': 'Spain',
  '67': 'LATAM',
};

// AC deal status codes (fixed by ActiveCampaign)
const DEAL_STATUS = { OPEN: 0, WON: 1, LOST: 2 };

// Contact custom field IDs -> our internal names. High confidence: AC sends
// contact custom fields keyed by their real field ID in webhook payloads
// (contact[fields][<id>]), unlike deal fields which are positional.
const CONTACT_FIELD_MAP = {
  '59': 'utmSource',   // fallback in n8n: deal[fields][7] if contact field empty
  '33': 'utmCampaign',
  '36': 'utmMedium',
  '35': 'utmContent',
  '18': 'utmLocation',
  '2':  'course',
};

// Deal custom field IDs -> our internal names. TODO-verify against live
// dealCustomFieldMeta — these are currently the ARRAY POSITIONS the n8n
// workflow reads (deal[fields][N][value]), copied here as first-guess
// candidates only. Do not trust for REST API calls until confirmed by label.
const DEAL_FIELD_MAP_CANDIDATES = {
  lostReason: 1,        // multi-select; n8n joins all values with ", "
  courseDeal: 5,        // fallback course field on the deal itself
  campaignIdFallback: 6,
  utmSourceFallback: 7,
  utmLocationFallback: 12,
  utmContentFallback: 50,
  financingPartner: 54,
  followUp1: 86,         // LATAM only — admissions follow-up dates
  followUp2: 87,
  followUp3: 88,
  followUp4: 89,
};

// Deal custom field "keys" resolved by name (not position) in the n8n
// "Resolve Custom Fields" node — these matched successfully against the
// live payload as of 2026-07-30, so the field LABELS below are a strong
// starting point for matching against dealCustomFieldMeta.
const DEAL_FIELD_LABEL_HINTS = {
  dateOffer: 'offer_sent_date',
  dateWon: 'won_date',
  dateLost: 'lost_date',
  finalPrice: 'Final price',
  hadOffer: 'has_been_in_stage',
  gclid: 'GCLID',
  isaPendienteDate: 'isa_pendiente_date',   // LATAM only
  seguimientoActivoDate: 'seguimiento_activo_date', // LATAM only
};

// Campaign-name/region/source lookups (n8n's getCampaignMap Data Table,
// keyed by the numeric utm_campaign id) are NOT available via the AC API —
// they're a manually maintained reference table in n8n. Until that's
// exported to this app, campaigns will show as raw numeric IDs.
const CAMPAIGN_MAP = {}; // TODO: import from n8n Data Table "getCampaignMap"

module.exports = {
  PIPELINE_REGION_MAP,
  DEAL_STATUS,
  CONTACT_FIELD_MAP,
  DEAL_FIELD_MAP_CANDIDATES,
  DEAL_FIELD_LABEL_HINTS,
  CAMPAIGN_MAP,
};
