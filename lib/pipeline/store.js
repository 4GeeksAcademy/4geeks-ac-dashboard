'use strict';
// ---------------------------------------------------------------------------
// Pipeline intelligence storage.
//
//   pipeline_items    kind, id, data JSONB, updated_at   (one row per item)
//       kind 'intel'  id = deal id  -> conversation (notes + activities),
//                                       metrics and the AI stall diagnosis
//       kind 'state'  id = deal id  -> queue state: snoozed / done
//       kind 'advice' id = key      -> last AI advice per region + list
//   pipeline_actions  append-only log of every action taken from the app
//
// Postgres when DATABASE_URL is set (same Railway Postgres as the rest of
// the Hub); otherwise a JSON file under PIPELINE_DATA_DIR for local runs.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const nowIso = () => new Date().toISOString();

function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: url,
    ssl: /sslmode=require|railway\.app|rlwy\.net/.test(url) && !/localhost|\.internal/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  const q = (text, params) => pool.query(text, params);
  let ready;
  const init = () => ready || (ready = q(`
    CREATE TABLE IF NOT EXISTS pipeline_items (
      kind TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (kind, id));
    CREATE TABLE IF NOT EXISTS pipeline_actions (
      seq BIGSERIAL PRIMARY KEY, deal_id TEXT NOT NULL, type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}', result JSONB, user_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS pipeline_actions_deal_idx ON pipeline_actions (deal_id);
    CREATE INDEX IF NOT EXISTS pipeline_actions_created_idx ON pipeline_actions (created_at);
    CREATE TABLE IF NOT EXISTS pipeline_blobs (
      id TEXT PRIMARY KEY, data BYTEA NOT NULL, meta JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  `));
  const shapeAction = (r) => ({ seq: Number(r.seq), dealId: r.deal_id, type: r.type, payload: r.payload, result: r.result, user: r.user_name, at: new Date(r.created_at).toISOString() });
  return {
    kind: 'postgres',
    async all(kind) {
      await init();
      const { rows } = await q('SELECT id, data, updated_at FROM pipeline_items WHERE kind=$1', [kind]);
      return rows.map((r) => ({ ...r.data, id: r.id, updatedAt: new Date(r.updated_at).toISOString() }));
    },
    async get(kind, id) {
      await init();
      const { rows } = await q('SELECT id, data, updated_at FROM pipeline_items WHERE kind=$1 AND id=$2', [kind, String(id)]);
      return rows[0] ? { ...rows[0].data, id: rows[0].id, updatedAt: new Date(rows[0].updated_at).toISOString() } : null;
    },
    async put(kind, id, data) {
      await init();
      await q(`INSERT INTO pipeline_items (kind, id, data) VALUES ($1,$2,$3)
               ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [kind, String(id), data]);
    },
    async remove(kind, id) { await init(); await q('DELETE FROM pipeline_items WHERE kind=$1 AND id=$2', [kind, String(id)]); },
    async logAction({ dealId, type, payload, result, user }) {
      await init();
      const { rows } = await q('INSERT INTO pipeline_actions (deal_id, type, payload, result, user_name) VALUES ($1,$2,$3,$4,$5) RETURNING *', [String(dealId), type, payload || {}, result || null, user || null]);
      return shapeAction(rows[0]);
    },
    async actionsSince(iso) {
      await init();
      const { rows } = await q('SELECT * FROM pipeline_actions WHERE created_at >= $1 ORDER BY seq', [iso]);
      return rows.map(shapeAction);
    },
    async putBlob(id, buf, meta = {}) {
      await init();
      await q(`INSERT INTO pipeline_blobs (id, data, meta) VALUES ($1,$2,$3)
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, meta = EXCLUDED.meta, updated_at = now()`, [id, buf, meta]);
    },
    async getBlob(id) {
      await init();
      const { rows } = await q('SELECT data, meta FROM pipeline_blobs WHERE id=$1', [id]);
      return rows[0] ? { data: rows[0].data, meta: rows[0].meta } : null;
    },
    async actionsFor(dealId) {
      await init();
      const { rows } = await q('SELECT * FROM pipeline_actions WHERE deal_id=$1 ORDER BY seq DESC LIMIT 50', [String(dealId)]);
      return rows.map(shapeAction);
    },
  };
}

function fileStore(dir) {
  const file = path.join(dir, 'pipeline.json');
  let db;
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { db = {}; }
  db.items = db.items || {};
  db.actions = db.actions || [];
  let timer = null;
  const save = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, file);
    }, 200);
  };
  const bucket = (k) => db.items[k] || (db.items[k] = {});
  return {
    kind: 'file',
    async all(kind) { return Object.entries(bucket(kind)).map(([id, r]) => ({ ...r.data, id, updatedAt: r.updatedAt })); },
    async get(kind, id) { const r = bucket(kind)[String(id)]; return r ? { ...r.data, id: String(id), updatedAt: r.updatedAt } : null; },
    async put(kind, id, data) { bucket(kind)[String(id)] = { data, updatedAt: nowIso() }; save(); },
    async remove(kind, id) { delete bucket(kind)[String(id)]; save(); },
    async logAction({ dealId, type, payload, result, user }) {
      const a = { seq: db.actions.length + 1, dealId: String(dealId), type, payload: payload || {}, result: result || null, user: user || null, at: nowIso() };
      db.actions.push(a);
      if (db.actions.length > 20000) db.actions = db.actions.slice(-20000);
      save();
      return a;
    },
    async actionsSince(iso) { return db.actions.filter((a) => a.at >= iso); },
    async actionsFor(dealId) { return db.actions.filter((a) => a.dealId === String(dealId)).slice(-50).reverse(); },
    async putBlob(id, buf, meta = {}) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `blob-${id}.bin`), buf); fs.writeFileSync(path.join(dir, `blob-${id}.json`), JSON.stringify(meta)); },
    async getBlob(id) { try { return { data: fs.readFileSync(path.join(dir, `blob-${id}.bin`)), meta: JSON.parse(fs.readFileSync(path.join(dir, `blob-${id}.json`), 'utf8')) }; } catch (e) { return null; } },
  };
}

function createPipelineStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return fileStore(process.env.PIPELINE_DATA_DIR || path.join(__dirname, '..', '..', 'data'));
}

module.exports = { createPipelineStore, fileStore };
