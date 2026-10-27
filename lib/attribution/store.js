'use strict';
// Attribution storage. Postgres when DATABASE_URL is set; memory otherwise
// (local previews and tests). No IP addresses and no raw emails are stored:
// a visitor is a random id, and a lead is linked by the SHA-256 of its email.
//   attr_events  one row per page view / identify
//   attr_ids     email hash <-> visitor id (a person can have several browsers)

function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: /sslmode=require|railway\.app|rlwy\.net/.test(url) && !/localhost|\.internal/.test(url) ? { rejectUnauthorized: false } : undefined, max: 4 });
  const q = (t, p) => pool.query(t, p);
  let ready;
  const init = () => ready || (ready = q(`
    CREATE TABLE IF NOT EXISTS attr_events (
      id BIGSERIAL PRIMARY KEY, vid TEXT NOT NULL, sid TEXT, ts TIMESTAMPTZ NOT NULL, type TEXT NOT NULL,
      host TEXT, path TEXT, title TEXT, new_session BOOLEAN DEFAULT false, referrer TEXT, utm JSONB,
      click_type TEXT, click_id TEXT, mobile BOOLEAN, received_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS attr_events_vid_ts ON attr_events (vid, ts);
    CREATE INDEX IF NOT EXISTS attr_events_received ON attr_events (received_at);
    CREATE TABLE IF NOT EXISTS attr_ids (
      email_hash TEXT NOT NULL, vid TEXT NOT NULL, first_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (email_hash, vid));
    CREATE INDEX IF NOT EXISTS attr_ids_vid ON attr_ids (vid);
  `));
  return {
    kind: 'postgres',
    async addEvents(vid, events) {
      await init();
      if (!events.length) return;
      const cols = ['vid', 'sid', 'ts', 'type', 'host', 'path', 'title', 'new_session', 'referrer', 'utm', 'click_type', 'click_id', 'mobile'];
      const vals = []; const rows = events.map((e, i) => {
        vals.push(vid, e.sid, new Date(e.ts), e.type, e.host, e.path, e.title, !!e.newSession, e.referrer, e.utm ? JSON.stringify(e.utm) : null, e.clickType, e.clickId, e.mobile == null ? null : !!e.mobile);
        return `(${cols.map((_, k) => `$${i * cols.length + k + 1}`).join(',')})`;
      });
      await q(`INSERT INTO attr_events (${cols.join(',')}) VALUES ${rows.join(',')}`, vals);
    },
    async link(emailHash, vid) {
      await init();
      await q(`INSERT INTO attr_ids (email_hash, vid) VALUES ($1,$2) ON CONFLICT (email_hash, vid) DO UPDATE SET last_at = now()`, [emailHash, vid]);
    },
    async vidsFor(hashes) {
      await init();
      if (!hashes.length) return [];
      const { rows } = await q('SELECT email_hash, vid, first_at FROM attr_ids WHERE email_hash = ANY($1)', [hashes]);
      return rows;
    },
    async eventsFor(vids) {
      await init();
      if (!vids.length) return [];
      const { rows } = await q(`SELECT vid, sid, ts, type, host, path, title, new_session, referrer, utm, click_type, click_id, mobile
                                FROM attr_events WHERE vid = ANY($1) AND type = 'pv' ORDER BY ts LIMIT 200000`, [vids]);
      return rows.map((r) => ({ vid: r.vid, sid: r.sid, ts: new Date(r.ts).toISOString(), type: r.type, host: r.host, path: r.path, title: r.title, newSession: r.new_session, referrer: r.referrer, utm: r.utm, clickType: r.click_type, clickId: r.click_id, mobile: r.mobile }));
    },
    async status() {
      await init();
      const [a, b, c, d] = await Promise.all([
        q(`SELECT count(*)::int n, count(DISTINCT vid)::int v, max(received_at) last FROM attr_events WHERE received_at > now() - interval '24 hours'`),
        q(`SELECT host, count(*)::int n FROM attr_events WHERE received_at > now() - interval '7 days' GROUP BY host ORDER BY n DESC LIMIT 10`),
        q(`SELECT count(*)::int n, min(first_at) since FROM attr_ids`),
        q(`SELECT min(ts) since, count(*)::int n FROM attr_events`),
      ]);
      return { events24h: a.rows[0].n, visitors24h: a.rows[0].v, lastEventAt: a.rows[0].last, hosts7d: b.rows, linkedLeads: c.rows[0].n, since: d.rows[0].since, totalEvents: d.rows[0].n };
    },
    async prune(days) { await init(); await q(`DELETE FROM attr_events WHERE ts < now() - ($1 || ' days')::interval`, [String(days)]); },
  };
}

function memStore() {
  const events = []; const ids = [];
  return {
    kind: 'memory',
    async addEvents(vid, evs) { evs.forEach((e) => events.push({ vid, ...e, ts: new Date(e.ts).toISOString(), receivedAt: new Date().toISOString() })); },
    async link(emailHash, vid) { if (!ids.some((x) => x.email_hash === emailHash && x.vid === vid)) ids.push({ email_hash: emailHash, vid, first_at: new Date().toISOString() }); },
    async vidsFor(hashes) { const s = new Set(hashes); return ids.filter((x) => s.has(x.email_hash)); },
    async eventsFor(vids) { const s = new Set(vids); return events.filter((e) => s.has(e.vid) && e.type === 'pv').sort((a, b) => a.ts.localeCompare(b.ts)); },
    async status() {
      const day = Date.now() - 864e5; const recent = events.filter((e) => Date.parse(e.receivedAt) > day);
      const hosts = {}; events.forEach((e) => { hosts[e.host] = (hosts[e.host] || 0) + 1; });
      return { events24h: recent.length, visitors24h: new Set(recent.map((e) => e.vid)).size, lastEventAt: events.length ? events[events.length - 1].receivedAt : null, hosts7d: Object.entries(hosts).map(([host, n]) => ({ host, n })), linkedLeads: ids.length, since: events[0] ? events[0].ts : null, totalEvents: events.length };
    },
    async prune() {},
    _events: events, _ids: ids,
  };
}

function createAttributionStore() { return process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memStore(); }
module.exports = { createAttributionStore, memStore };
