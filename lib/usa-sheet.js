// ---------------------------------------------------------------------------
// USA enrollments from the "2026 USA DATA" Google Sheet, tab ATTRIBUTION
// REPORT — the sheet the USA team keeps (and the n8n "USA Won Sync" fills from
// Notion + ActiveCampaign). Read through a small n8n webhook that uses the
// team's existing Google Sheets credential, so the Hub needs no Google keys:
//
//   USA_ENROLL_FEED_URL  https://n8n.4geeks.com/webhook/marketing-hub-usa-enrollments-…
//   USA_ENROLL_FEED_KEY  shared secret, sent as header x-hub-key
//
// Columns: (A, unnamed) enrollment date · EMAIL · SOURCE · CAMPAIGN · CONTENT ·
// TERM · CREATED · LOCATION · PROGRAM · CONV TIME (days) · ENR PLAN ·
// TICKET AMT · MONTHLY PMT · DATE. n8n names the unnamed column "col_1".
// ---------------------------------------------------------------------------
const { money } = require('./money');

const PROGRAMS = [
  [/^(ai[-\s]?eng|aie\b|ai\b|applied ai|ai[-\s]?ml|machine)/i, 'AI Engineering'],
  [/^(fs|full[-\s]?stack)/i, 'Full-Stack'],
  [/^(cs|cyber)/i, 'Cybersecurity'],
  [/^(ds|data)/i, 'Data Science & ML'],
  [/fluency/i, 'AI Fluency'],
  [/flex/i, 'AI Flex'],
];
function program(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Other / not set';
  const spanish = /[-\s]es$/i.test(s);
  const hit = PROGRAMS.find(([re]) => re.test(s.replace(/[-\s]es$/i, '').trim()));
  const name = hit ? hit[1] : s;
  return spanish ? `${name} (Spanish)` : name;
}
const CITY = { ny: 'New York', nyc: 'New York', newyork: 'New York', 'downtown-miami': 'Miami', miami: 'Miami', losangeles: 'Los Angeles', la: 'Los Angeles', sanfrancisco: 'San Francisco' };
function location(raw) {
  let s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/-(usa|us)$/, '');
  if (CITY[s]) return CITY[s];
  return s.replace(/-canada$/, ' (Canada)').split(/[-\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
const SOURCE = { fb: 'facebook', ig: 'instagram', 'chatgpt.com': 'chatgpt', 'facebook (organic)': 'facebook' };
function source(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  return SOURCE[s] || s;
}
// "1/4/2026" or "2026-01-04" -> "2026-01-04"
function usDate(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const pick = (row, ...names) => {
  for (const n of names) {
    const k = Object.keys(row).find((x) => x.trim().toLowerCase() === n.toLowerCase());
    if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return null;
};

async function fetchUsaSheet({ url = process.env.USA_ENROLL_FEED_URL, key = process.env.USA_ENROLL_FEED_KEY, fetchImpl = fetch } = {}) {
  if (!url) return null;
  const r = await fetchImpl(url, { headers: { 'x-hub-key': key || '', accept: 'application/json' } });
  if (!r.ok) throw new Error(`USA sheet feed returned ${r.status}`);
  const text = await r.text();
  if (!text.trim()) throw new Error('USA sheet feed returned an empty body (check USA_ENROLL_FEED_KEY)');
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : (data.rows || []);
  return rows.map((row) => {
    const converted = usDate(pick(row, 'col_1', '', 'DATE ENROLLED', 'ENROLLED')) || usDate(pick(row, 'DATE'));
    if (!converted) return null;
    const created = usDate(pick(row, 'CREATED'));
    let days = Number(pick(row, 'CONV TIME'));
    if (!Number.isFinite(days) || days < 0 || days > 1500) days = null; // date serials typed by mistake
    if (created) days = Math.max(0, Math.round((new Date(converted) - new Date(created)) / 86400000));
    return {
      sheetRow: row.row_number || null,
      email: pick(row, 'EMAIL'),
      source: source(pick(row, 'SOURCE')),
      campaign: pick(row, 'CAMPAIGN'),
      content: pick(row, 'CONTENT'),
      term: pick(row, 'TERM'),
      created,
      converted,
      location: location(pick(row, 'LOCATION')),
      courseRaw: pick(row, 'PROGRAM'),
      program: program(pick(row, 'PROGRAM')),
      daysToConvert: days,
      plan: pick(row, 'ENR PLAN'),
      price: money(pick(row, 'TICKET AMT')),
      monthly: money(pick(row, 'MONTHLY PMT')),
    };
  }).filter(Boolean);
}

module.exports = { fetchUsaSheet, program, location, source, usDate };
