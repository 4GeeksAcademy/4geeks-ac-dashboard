// ---------------------------------------------------------------------------
// Proposal Studio — storage.
//
// Postgres when DATABASE_URL is set (Railway: add a Postgres service and
// reference its DATABASE_URL). Without it, falls back to a JSON file under
// PROPOSALS_DATA_DIR (default ./data) so local previews work with zero setup.
// The JSON fallback is NOT durable on Railway unless that dir is a volume.
//
// Model
//   proposal        id, client, country, language, currency, status, owner,
//                   title, intake (JSON), created_at, updated_at, created_by
//   proposal_version proposal_id, version (1..n), content (JSON), author,
//                   note, source ('ai_draft'|'ai_revise'|'manual'|'clone'|'seed'), created_at
//   library         key -> JSON value (programs, proof points, terms, voice)
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUSES = ['draft', 'in_review', 'approved', 'sent', 'won', 'lost'];
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(8).toString('hex');

// ---------------- Postgres ----------------
function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: url,
    ssl: /sslmode=require|railway\.app|rlwy\.net/.test(url) && !/localhost|\.internal/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  const q = (text, params) => pool.query(text, params);
  let ready;
  const init = () => ready || (ready = q(`
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY, client TEXT NOT NULL, country TEXT, language TEXT, currency TEXT,
      status TEXT NOT NULL DEFAULT 'draft', owner TEXT, title TEXT, intake JSONB NOT NULL DEFAULT '{}',
      created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS proposal_versions (
      proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE, version INT NOT NULL,
      content JSONB NOT NULL, author TEXT, note TEXT, source TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (proposal_id, version));
    CREATE TABLE IF NOT EXISTS dashboard_users (
      name TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'editor', pass_hash TEXT,
      created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS proposal_library (
      key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
  `));
  const row = (r) => r && { ...r, created_at: r.created_at && new Date(r.created_at).toISOString(), updated_at: r.updated_at && new Date(r.updated_at).toISOString() };

  return {
    kind: 'postgres',
    async listProposals() {
      await init();
      const { rows } = await q(`SELECT p.*, (SELECT max(version) FROM proposal_versions v WHERE v.proposal_id=p.id) AS latest_version
                                FROM proposals p ORDER BY updated_at DESC`);
      return rows.map(row);
    },
    async getProposal(id) {
      await init();
      const { rows } = await q('SELECT * FROM proposals WHERE id=$1', [id]);
      if (!rows[0]) return null;
      const v = await q('SELECT version, author, note, source, created_at FROM proposal_versions WHERE proposal_id=$1 ORDER BY version DESC', [id]);
      return { ...row(rows[0]), versions: v.rows.map(row) };
    },
    async createProposal(p) {
      await init();
      const id = newId();
      await q(`INSERT INTO proposals (id, client, country, language, currency, status, owner, title, intake, created_by)
               VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9)`,
      [id, p.client, p.country || null, p.language || 'es', p.currency || 'USD', p.owner || p.created_by, p.title || null, p.intake || {}, p.created_by]);
      return this.getProposal(id);
    },
    async updateProposal(id, patch) {
      await init();
      const allowed = ['client', 'country', 'language', 'currency', 'status', 'owner', 'title', 'intake'];
      const keys = Object.keys(patch).filter((k) => allowed.includes(k));
      if (keys.length) {
        await q(`UPDATE proposals SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1`, [id, ...keys.map((k) => patch[k])]);
      }
      return this.getProposal(id);
    },
    async deleteProposal(id) { await init(); await q('DELETE FROM proposals WHERE id=$1', [id]); },
    async addVersion(id, { content, author, note, source }) {
      await init();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Lock the parent row so two people saving at once get v3 and v4, not two v3s.
        await client.query('SELECT id FROM proposals WHERE id=$1 FOR UPDATE', [id]);
        const { rows } = await client.query('SELECT coalesce(max(version),0)+1 AS n FROM proposal_versions WHERE proposal_id=$1', [id]);
        const n = rows[0].n;
        await client.query('INSERT INTO proposal_versions (proposal_id, version, content, author, note, source) VALUES ($1,$2,$3,$4,$5,$6)', [id, n, content, author, note || null, source || 'manual']);
        await client.query('UPDATE proposals SET updated_at=now() WHERE id=$1', [id]);
        await client.query('COMMIT');
        return n;
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    },
    async getVersion(id, n) {
      await init();
      const { rows } = n === 'latest'
        ? await q('SELECT * FROM proposal_versions WHERE proposal_id=$1 ORDER BY version DESC LIMIT 1', [id])
        : await q('SELECT * FROM proposal_versions WHERE proposal_id=$1 AND version=$2', [id, Number(n)]);
      return row(rows[0]) || null;
    },
    async listUsers() {
      await init();
      const { rows } = await q('SELECT name, role, pass_hash, created_by, created_at, updated_at FROM dashboard_users ORDER BY name');
      return rows.map(row);
    },
    async upsertUser(u) {
      await init();
      await q(`INSERT INTO dashboard_users (name, role, pass_hash, created_by) VALUES ($1,$2,$3,$4)
               ON CONFLICT (name) DO UPDATE SET role=EXCLUDED.role, pass_hash=coalesce(EXCLUDED.pass_hash, dashboard_users.pass_hash), updated_at=now()`,
      [u.name, u.role, u.pass_hash || null, u.created_by || null]);
    },
    async deleteUser(name) { await init(); await q('DELETE FROM dashboard_users WHERE name=$1', [name]); },
    async getLibrary() {
      await init();
      const { rows } = await q('SELECT key, value FROM proposal_library');
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async setLibrary(key, value, user) {
      await init();
      await q(`INSERT INTO proposal_library (key, value, updated_by) VALUES ($1,$2,$3)
               ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [key, JSON.stringify(value), user]);
    },
  };
}

// ---------------- JSON file ----------------
function fileStore(dir) {
  const file = path.join(dir, 'proposals.json');
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { proposals: {}, versions: {}, library: {} }; } };
  let db = load();
  db.users = db.users || {};
  const save = () => { fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, file); };
  const versionsOf = (id) => db.versions[id] || [];
  const summary = (v) => ({ version: v.version, author: v.author, note: v.note, source: v.source, created_at: v.created_at });

  return {
    kind: 'file',
    async listProposals() {
      return Object.values(db.proposals)
        .map((p) => ({ ...p, latest_version: versionsOf(p.id).length || null }))
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    },
    async getProposal(id) {
      const p = db.proposals[id];
      return p ? { ...p, versions: versionsOf(id).map(summary).reverse() } : null;
    },
    async createProposal(p) {
      const id = newId(); const t = now();
      db.proposals[id] = { id, client: p.client, country: p.country || null, language: p.language || 'es', currency: p.currency || 'USD',
        status: 'draft', owner: p.owner || p.created_by, title: p.title || null, intake: p.intake || {}, created_by: p.created_by, created_at: t, updated_at: t };
      save();
      return this.getProposal(id);
    },
    async updateProposal(id, patch) {
      const p = db.proposals[id]; if (!p) return null;
      ['client', 'country', 'language', 'currency', 'status', 'owner', 'title', 'intake'].forEach((k) => { if (patch[k] !== undefined) p[k] = patch[k]; });
      p.updated_at = now(); save();
      return this.getProposal(id);
    },
    async deleteProposal(id) { delete db.proposals[id]; delete db.versions[id]; save(); },
    async addVersion(id, { content, author, note, source }) {
      const list = db.versions[id] || (db.versions[id] = []);
      const n = list.length + 1;
      list.push({ proposal_id: id, version: n, content, author, note: note || null, source: source || 'manual', created_at: now() });
      if (db.proposals[id]) db.proposals[id].updated_at = now();
      save();
      return n;
    },
    async getVersion(id, n) {
      const list = versionsOf(id);
      return (n === 'latest' ? list[list.length - 1] : list.find((v) => v.version === Number(n))) || null;
    },
    async listUsers() { return Object.values(db.users).sort((a, b) => a.name.localeCompare(b.name)); },
    async upsertUser(u) {
      const cur = db.users[u.name] || { created_at: now(), created_by: u.created_by || null };
      db.users[u.name] = { ...cur, name: u.name, role: u.role, pass_hash: u.pass_hash || cur.pass_hash || null, updated_at: now() };
      save();
    },
    async deleteUser(name) { delete db.users[name]; save(); },
    async getLibrary() { return { ...db.library }; },
    async setLibrary(key, value) { db.library[key] = value; save(); },
  };
}

function createStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return fileStore(process.env.PROPOSALS_DATA_DIR || path.join(__dirname, '..', '..', 'data'));
}

module.exports = { createStore, STATUSES };
