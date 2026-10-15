// ---------------------------------------------------------------------------
// Luma connection for the Events tracker.
//
// Two ways in:
//   1. LUMA_API_KEY set (Luma Plus → calendar → Settings → API keys):
//      import every event of the calendar and sync registrations / check-ins.
//      Base https://public-api.luma.com, header x-luma-api-key.
//   2. No key: paste any public lu.ma / luma.com event link and we read its
//      title, date, cover and place from the public page.
// ---------------------------------------------------------------------------
const BASE = 'https://public-api.luma.com';
const hasKey = () => !!process.env.LUMA_API_KEY;

async function luma(pathname, params = {}) {
  if (!hasKey()) { const e = new Error('LUMA_API_KEY is not set on the server'); e.status = 400; throw e; }
  const u = new URL(BASE + pathname);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v); });
  const r = await fetch(u, { headers: { 'x-luma-api-key': process.env.LUMA_API_KEY, accept: 'application/json' } });
  if (!r.ok) { const e = new Error(`Luma API ${r.status}: ${(await r.text()).slice(0, 200)}`); e.status = 502; throw e; }
  return r.json();
}

const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };

// Normalize a Luma event (calendar entry or event detail) into our event fields.
function fromLuma(raw) {
  const ev = raw && raw.event ? raw.event : raw || {};
  const geo = ev.geo_address_json || {};
  const online = !!pick(ev, 'meeting_url', 'zoom_meeting_url') || ev.location_type === 'online' || (!geo.full_address && !geo.address);
  const url = pick(ev, 'url');
  return {
    luma_id: pick(ev, 'id', 'api_id'),
    title: pick(ev, 'name'),
    start_at: pick(ev, 'start_at'),
    end_at: pick(ev, 'end_at'),
    timezone: pick(ev, 'timezone'),
    luma_url: url ? (/^https?:/.test(url) ? url : `https://lu.ma/${url}`) : undefined,
    cover_url: pick(ev, 'cover_url'),
    format: online ? 'online' : 'in_person',
    location: pick(geo, 'full_address', 'address', 'city') || undefined,
    meeting_url: pick(ev, 'meeting_url', 'zoom_meeting_url'),
    capacity: pick(ev, 'max_capacity'),
    tags: Array.isArray(raw && raw.tags) ? raw.tags.map((t) => t.name || t).filter(Boolean) : undefined,
  };
}

async function listCalendarEvents({ after } = {}) {
  const out = []; let cursor;
  for (let i = 0; i < 20; i++) {
    const data = await luma('/v1/calendars/events/list', { after, pagination_cursor: cursor, pagination_limit: 50, sort_column: 'start_at', sort_direction: 'asc' });
    (data.entries || []).forEach((e) => out.push(fromLuma(e)));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out.filter((e) => e.luma_id);
}

// Registrations = approved guests; attendees = guests with a check-in.
async function guestCounts(eventId) {
  let registered = 0; let checkedIn = 0; let waitlist = 0; let cursor;
  for (let i = 0; i < 40; i++) {
    const data = await luma('/v1/events/guests/list', { event_id: eventId, pagination_cursor: cursor, pagination_limit: 100 });
    for (const g0 of data.entries || []) {
      const g = g0.guest || g0;
      const st = g.approval_status || 'approved';
      if (st === 'approved') registered++;
      if (st === 'waitlist') waitlist++;
      if (g.checked_in_at || (g.event_ticket && g.event_ticket.checked_in_at)) checkedIn++;
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return { registrations: registered, attendees: checkedIn, waitlist };
}

// Public page fallback: OpenGraph + JSON-LD on any lu.ma / luma.com event page.
async function lookupPublic(link) {
  let u;
  try { u = new URL(link); } catch (e) { const err = new Error('That is not a valid link'); err.status = 400; throw err; }
  if (!/(^|\.)(lu\.ma|luma\.com)$/.test(u.hostname)) { const err = new Error('Paste a lu.ma or luma.com event link'); err.status = 400; throw err; }
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (4Geeks Marketing Hub)', accept: 'text/html' }, redirect: 'follow' });
  if (!r.ok) { const e = new Error(`Luma page returned ${r.status}`); e.status = 502; throw e; }
  const html = await r.text();
  const meta = (p) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`, 'i')); return m ? decode(m[1]) : undefined; };
  let ld = {};
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); const arr = Array.isArray(j) ? j : [j]; const ev = arr.find((x) => /Event/.test(x['@type'] || '')); if (ev) { ld = ev; break; } } catch (e) { /* ignore */ }
  }
  const loc = ld.location || {};
  const online = /Online/i.test(ld.eventAttendanceMode || '') || loc['@type'] === 'VirtualLocation';
  const address = loc.address && (typeof loc.address === 'string' ? loc.address : [loc.address.streetAddress, loc.address.addressLocality].filter(Boolean).join(', '));
  return {
    title: ld.name || meta('og:title'),
    start_at: ld.startDate,
    end_at: ld.endDate,
    luma_url: u.toString().split('?')[0],
    cover_url: (Array.isArray(ld.image) ? ld.image[0] : ld.image) || meta('og:image'),
    description: ld.description || meta('og:description'),
    format: online ? 'online' : (address ? 'in_person' : undefined),
    location: online ? undefined : (loc.name ? [loc.name, address].filter(Boolean).join(' · ') : address),
  };
}
function decode(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }

module.exports = { hasKey, listCalendarEvents, guestCounts, lookupPublic, fromLuma };
