// Run this once against the real AC account to discover the IDs needed in
// lib/config.js. Usage:
//   AC_API_URL=... AC_API_KEY=... node scripts/probe-schema.js
require('dotenv').config();
const { ActiveCampaignClient } = require('../lib/ac-client');

async function main() {
  const client = new ActiveCampaignClient({
    apiUrl: process.env.AC_API_URL,
    apiKey: process.env.AC_API_KEY,
  });

  console.log('\n=== Deal Pipelines (dealGroups) ===');
  const pipelines = await client.listPipelines();
  pipelines.forEach((p) => console.log(`  id=${p.id}  title="${p.title}"`));

  console.log('\n=== Deal Stages ===');
  const stages = await client.listDealStages();
  stages.forEach((s) => console.log(`  id=${s.id}  title="${s.title}"  groupId=${s.dealGroup ?? s.group}`));

  console.log('\n=== Deal Custom Fields (dealCustomFieldMeta) ===');
  const dealFields = await client.listDealCustomFieldMeta();
  dealFields.forEach((f) => console.log(`  id=${f.id}  label="${f.fieldLabel}"  type=${f.fieldType}`));

  console.log('\n=== Contact Custom Fields (fields) ===');
  const contactFields = await client.listContactCustomFieldMeta();
  contactFields.forEach((f) => console.log(`  id=${f.id}  title="${f.title}"  type=${f.type}  perstag=${f.perstag}`));

  console.log('\nNext steps:');
  console.log('1. Match pipeline ids above to USA / Spain / LATAM in lib/config.js -> PIPELINE_REGION_MAP');
  console.log('2. Find the "lost reason" field id above -> LOST_REASON_FIELD_ID');
  console.log('3. Map utm_source / utm_campaign / utm_location / course / assigned-to field ids -> CONTACT_FIELD_MAP');
}

main().catch((err) => {
  console.error('Probe failed:', err.message);
  process.exit(1);
});
