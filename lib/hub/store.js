// ---------------------------------------------------------------------------
// Marketing Hub — storage for Events and Social (organic) calendar.
//
// One generic table, one row per item, the item itself as JSON:
//   hub_items  kind ('event' | 'post' | 'metric' | 'settings'), id, data JSONB,
//              created_by, updated_by, created_at, updated_at
// Postgres when DATABASE_URL is set (same Railway Postgres as Proposal Studio);
// otherwise a JSON file under HUB_DATA_DIR (default ./data) for local previews.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KINDS = ['event', 'post', 'metric', 'settings'];
const newId = () => crypto.randomBytes(8).toString('hex');
const nowIso = () => new Date().toISOString();

function shape(r) {
  if (!r) return null;
  const iso = (d) => (d ? new Date(d).toISOString() : null);
  return { ...(r.data || {}), id: r.id, kind: r.kind, created_by: r.created_by, updated_by: r.updated_by, created_at: iso(r.created_at), updated_at: iso(r.updated_at) };
}
// Meta fields never live inside the JSON blob.
function clean(data) {
  const d = { ...(data || {}) };
  ['id', 'kind', 'created_by', 'updated_by', 'created_at', 'updated_at'].forEach((k) => delete d[k]);
  return d;
}

function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: url,
    ssl: /sslmode=require|railway\.app|rlwy\.net/.test(url) && !/localhost|\.internal/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  const q = (text, params) => pool.query(text, params);
  let ready;
  const init = () => ready || (ready = q(`
    CREATE TABLE IF NOT EXISTS hub_items (
      kind TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}',
      created_by TEXT, updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, id));
    CREATE INDEX IF NOT EXISTS hub_items_kind_idx ON hub_items (kind);
  `));
  return {
    kind: 'postgres',
    async list(kind) { await init(); const { rows } = await q('SELECT * FROM hub_items WHERE kind=$1 ORDER BY updated_at DESC', [kind]); return rows.map(shape); },
    async get(kind, id) { await init(); const { rows } = await q('SELECT * FROM hub_items WHERE kind=$1 AND id=$2', [kind, id]); return shape(rows[0]); },
    async create(kind, data, user, id = newId()) {
      await init();
      await q('INSERT INTO hub_items (kind, id, data, created_by, updated_by) VALUES ($1,$2,$3,$4,$4)', [kind, id, clean(data), user]);
      return this.get(kind, id);
    },
    async update(kind, id, patch, user) {
      await init();
      // Shallow merge so two people editing different fields don't overwrite each other.
      const { rowCount } = await q('UPDATE hub_items SET data = data || $3::jsonb, updated_by=$4, updated_at=now() WHERE kind=$1 AND id=$2', [kind, id, JSON.stringify(clean(patch)), user]);
      return rowCount ? this.get(kind, id) : null;
    },
    async upsert(kind, id, data, user) {
      await init();
      await q(`INSERT INTO hub_items (kind, id, data, created_by, updated_by) VALUES ($1,$2,$3,$4,$4)
               ON CONFLICT (kind, id) DO UPDATE SET data = hub_items.data || EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=now()`, [kind, id, clean(data), user]);
      return this.get(kind, id);
    },
    async remove(kind, id) { await init(); await q('DELETE FROM hub_items WHERE kind=$1 AND id=$2', [kind, id]); },
  };
}

function fileStore(dir) {
  const file = path.join(dir, 'hub.json');
  let db; try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { db = {}; }
  const save = () => { fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, file); };
  const bucket = (k) => db[k] || (db[k] = {});
  const row = (k, id) => { const r = bucket(k)[id]; return r ? shape({ ...r, kind: k, id }) : null; };
  return {
    kind: 'file',
    async list(kind) { return Object.keys(bucket(kind)).map((id) => row(kind, id)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')); },
    async get(kind, id) { return row(kind, id); },
    async create(kind, data, user, id = newId()) { const t = nowIso(); bucket(kind)[id] = { data: clean(data), created_by: user, updated_by: user, created_at: t, updated_at: t }; save(); return row(kind, id); },
    async update(kind, id, patch, user) { const r = bucket(kind)[id]; if (!r) return null; r.data = { ...r.data, ...clean(patch) }; r.updated_by = user; r.updated_at = nowIso(); save(); return row(kind, id); },
    async upsert(kind, id, data, user) { return bucket(kind)[id] ? this.update(kind, id, data, user) : this.create(kind, data, user, id); },
    async remove(kind, id) { delete bucket(kind)[id]; save(); },
  };
}

function createHubStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return fileStore(process.env.HUB_DATA_DIR || path.join(__dirname, '..', '..', 'data'));
}

module.exports = { createHubStore, KINDS };
