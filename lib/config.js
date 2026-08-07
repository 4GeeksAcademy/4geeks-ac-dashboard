// ---------------------------------------------------------------------------
// Field IDs verified live against GET /api/3/dealCustomFieldMeta and
// /api/3/fields via this app's own /api/schema endpoint on 2026-08-07.
// Pipeline IDs and CONTACT field IDs (originally sourced from the n8n
// "Webhook db_dynamic" workflow) are confirmed correct. DEAL custom field
// IDs below REPLACE the earlier positional guesses copied from n8n's
// webhook-array-index reads (deal[fields][N]) -- those positions do NOT
// match real customFieldId values used by the REST API, and using them
// caused the deployed app to read the WRONG field for lost reasons
// (position 1 = "Forecasted Close Date", not "Lost Reasons" = real id 2).
// ---------------------------------------------------------------------------

// AC deal pipeline ("group") ID -> region. Verified via /api/schema:
// 5 = "4Geeks USA Programs", 16 = "4Geeks Madrid PT", 67 = "4Geeks Latinoamérica".
const PIPELINE_REGION_MAP = {
    '5': 'USA',
    '16': 'Spain',
    '67': 'LATAM',
};

// AC deal status codes (fixed by ActiveCampaign)
const DEAL_STATUS = { OPEN: 0, WON: 1, LOST: 2 };

// Contact custom field IDs -> our internal names. Confirmed against live
// /api/3/fields (contact fields are keyed by real field ID everywhere,
// both in webhooks and the REST API).
const CONTACT_FIELD_MAP = {
    '59': 'utmSource',
    '33': 'utmCampaign',
    '36': 'utmMedium',
    '35': 'utmContent',
    '18': 'utmLocation',
    '2': 'course',
    '31': 'admissionsTestScore',        // "Admission Code Test Score"
    '56': 'classification',             // "Classifications"
    '63': 'admissionsConversationType', // "Admissions Conversation Type"
    '115': 'leadSentiment',             // "Lead sentiment"
    '20': 'lastEventAssistance',        // "Last Event Assitance"
};

// Deal custom field IDs -> our internal names. Verified against live
// GET /api/3/dealCustomFieldMeta (real customFieldId, safe for REST API use).
const DEAL_FIELD_MAP = {
    lostReason: 2,             // "Lost Reasons" (multi-select)
    wonReason: 3,               // "Won Reasons"
    gclid: 4,                   // "GCLID"
    utmUrl: 5,                  // "utm_url"
    utmCourseField: 6,          // "utm_course"
    utmCampaign: 7,              // "utm_campaign"
    utmSource: 8,                // "utm_source"
    utmMedium: 9,                 // "utm_medium"
    expectedCohort: 10,           // "expected_cohort"
    utmLocation: 16,               // "utm_location"
    utmTerm: 22,                    // "utm_term"
    utmPlacement: 23,                // "utm_placement"
    finalPrice: 45,                   // "Final price"
    offerSentDate: 59,                 // "offer_sent_date"
    course: 61,                         // "Course" (deal-level)
    utmContent: 70,                      // "utm_content"
    wonDate: 74,                          // "won_date"
    financingPartner: 76,                  // "ES_EU_Finacing_Partner"
    firstCall: 79,                          // "first_call"
    secondCall: 80,                          // "second_call"
    thirdCall: 81,                            // "third_call"
    fourthCall: 82,                            // "fourth_call"
    hasOffer: 83,                               // "has_offer"
    lostDate: 94,                                // "lost_date"
    dealClientComments: 95,                       // "Deal Client Comments" (feedback text)
    dealQuality: 101,                              // "Deal Quality" (engagement score)
    isaPendienteDate: 112,                          // "isa_pendiente_date" (LATAM)
    seguimientoActivoDate: 113,                      // "seguimiento_activo_date" (LATAM)
    eceLostReason: 87,                                // "ECE_lost_reason" (secondary/legacy)
};

// Campaign-name/region/source lookups (n8n's getCampaignMap Data Table,
// keyed by the numeric utm_campaign id) are NOT available via the AC API --
// they're a manually maintained reference table in n8n. Until that's
// exported to this app, campaigns will show as raw numeric IDs.
const CAMPAIGN_MAP = {}; // TODO: import from n8n Data Table "getCampaignMap"

module.exports = {
    PIPELINE_REGION_MAP,
    DEAL_STATUS,
    CONTACT_FIELD_MAP,
    DEAL_FIELD_MAP,
    CAMPAIGN_MAP,
};
