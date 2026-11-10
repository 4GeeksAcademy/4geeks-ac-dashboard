'use strict';
// ---------------------------------------------------------------------------
// Social — storage. Tables social_* in the Hub's Postgres (DATABASE_URL).
// Without DATABASE_URL (local preview, tests) everything lives in memory and
// is lost on restart.
//
// A small generic layer, the same for both backends:
//   insert(table, row)            → row (with its serial id)
//   upsert(table, rows)           → rows; conflict on the table's key, provided columns win
//   find(table, where, opts)      → rows; where {col: value | [values] | null | {gte, lte}}, opts {order, limit}
//   update(table, where, patch)   → number of rows changed
//   remove(table, where)          → number of rows removed
//   withLock(fn)                  → runs fn only if no other syncer holds the lock, else null
// ---------------------------------------------------------------------------

// Tables: key = conflict columns for upsert; serial = auto id; json = JSONB columns;
// add = columns added after the table was first created (ALTER … ADD COLUMN IF NOT EXISTS).
const TABLES = {
  sites: { key: ['slug'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    market TEXT, sort INT NOT NULL DEFAULT 0` },
  accounts: { key: ['network', 'external_id'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'meta', network TEXT NOT NULL,
    external_id TEXT NOT NULL, name TEXT, username TEXT,
    site_id INT REFERENCES social_sites(id) ON DELETE SET NULL,
    page_id INT REFERENCES social_accounts(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (network, external_id)` },
  ad_accounts: { key: ['id'], ddl: `
    id TEXT PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'meta', name TEXT, currency TEXT,
    site_id INT REFERENCES social_sites(id) ON DELETE SET NULL, active BOOLEAN NOT NULL DEFAULT false` },
  posts: { key: ['account_id', 'external_id'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, account_id INT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, published_at TIMESTAMPTZ NOT NULL, format TEXT, media_type TEXT,
    permalink TEXT, caption TEXT, duration TEXT, promotion_status TEXT, ad_active BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (account_id, external_id)`,
    index: 'CREATE INDEX IF NOT EXISTS social_posts_account_pub_idx ON social_posts (account_id, published_at)' },
  // One snapshot per post and day of its lifetime (cumulative) metrics; the day's last update wins.
  post_metrics: { key: ['post_id', 'day'], json: ['metrics', 'extra'], ddl: `
    post_id INT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE, day DATE NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}', extra JSONB, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, day)` },
  // Daily account metrics in long format. breakdown: '' | organic | paid.
  account_metrics: { key: ['account_id', 'day', 'metric', 'breakdown'], ddl: `
    account_id INT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE, day DATE NOT NULL,
    metric TEXT NOT NULL, breakdown TEXT NOT NULL DEFAULT '', value DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (account_id, day, metric, breakdown)` },
  // Follower demographics snapshot (Instagram). dimension: age_gender | country | city.
  demographics: { key: ['account_id', 'day', 'dimension', 'key'], ddl: `
    account_id INT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE, day DATE NOT NULL,
    dimension TEXT NOT NULL, key TEXT NOT NULL, value INT NOT NULL,
    PRIMARY KEY (account_id, day, dimension, key)` },
  ads: { key: ['ad_id'], ddl: `
    ad_id TEXT PRIMARY KEY, ad_account_id TEXT NOT NULL REFERENCES social_ad_accounts(id) ON DELETE CASCADE,
    name TEXT, campaign TEXT, ig_media_source TEXT, ig_media_ad TEXT, fb_post TEXT, fb_post_effective TEXT,
    post_id INT REFERENCES social_posts(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
    // TikTok: the post the ad uses and who signs it (brand account, Business Center or a creator).
    add: ['tt_item_id TEXT', 'identity TEXT', 'identity_type TEXT'] },
  ad_metrics: { key: ['ad_id', 'day'], ddl: `
    ad_id TEXT NOT NULL REFERENCES social_ads(ad_id) ON DELETE CASCADE, day DATE NOT NULL, currency TEXT,
    spend DOUBLE PRECISION NOT NULL DEFAULT 0, impressions BIGINT NOT NULL DEFAULT 0,
    reach BIGINT NOT NULL DEFAULT 0, clicks INT NOT NULL DEFAULT 0, PRIMARY KEY (ad_id, day)`,
    // TikTok only (Meta leaves them empty): engagement with the ad.
    add: ['plays BIGINT', 'likes INT', 'comments INT', 'shares INT', 'follows INT'] },
  // Last result of each task per account (account_id 0 = global tasks).
  sync_state: { key: ['task', 'account_id'], json: ['detail'], ddl: `
    task TEXT NOT NULL, account_id INT NOT NULL DEFAULT 0, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
    ok BOOLEAN, last_ok_at TIMESTAMPTZ, detail JSONB, error TEXT, PRIMARY KEY (task, account_id)` },
  // Sync jobs asked for from the app (refresh, history, discover). Only the scheduler runs them.
  requests: { serial: 'id', json: ['params', 'progress'], ddl: `
    id SERIAL PRIMARY KEY, type TEXT NOT NULL, account_id INT REFERENCES social_accounts(id) ON DELETE CASCADE,
    params JSONB, user_name TEXT, status TEXT NOT NULL DEFAULT 'pending', progress JSONB, error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ` },
  // Who changed what (switches, sites…). Never holds comment or DM text.
  audit: { serial: 'id', json: ['detail'], ddl: `
    id SERIAL PRIMARY KEY, user_name TEXT, action TEXT NOT NULL, object TEXT NOT NULL, object_id TEXT,
    detail JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()` },

  // ---- Inbox: comments and Instagram DMs. Texts are personal data: never logged, never in audit. ----
  // Inbox categories (admins manage them).
  categories: { key: ['name'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT 'gray', sort INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true` },
  // A post or ad whose comments are watched. `count` = last total seen in Meta: comments are only
  // downloaded again when it changes (incremental refresh).
  comment_objects: { key: ['network', 'external_id'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, account_id INT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    network TEXT NOT NULL, external_id TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'organic',
    post_id INT REFERENCES social_posts(id) ON DELETE SET NULL, ad_id TEXT REFERENCES social_ads(ad_id) ON DELETE SET NULL,
    text TEXT, permalink TEXT, count INT, checked_at TIMESTAMPTZ, error TEXT, UNIQUE (network, external_id)` },
  // One comment or reply. own = written by the account itself (never in the inbox).
  // status: new | in_review | replied | closed. The sync never changes status or category.
  comments: { key: ['network', 'external_id'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, account_id INT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    object_id INT NOT NULL REFERENCES social_comment_objects(id) ON DELETE CASCADE, network TEXT NOT NULL,
    external_id TEXT NOT NULL, parent_external_id TEXT, origin TEXT NOT NULL DEFAULT 'organic', author_id TEXT,
    author_name TEXT, text TEXT, written_at TIMESTAMPTZ NOT NULL, likes INT, replies INT,
    hidden BOOLEAN NOT NULL DEFAULT false, permalink TEXT, own BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'new', category_id INT REFERENCES social_categories(id) ON DELETE SET NULL,
    replied_at TIMESTAMPTZ, handled_by TEXT, handled_at TIMESTAMPTZ, seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (network, external_id)`,
    index: 'CREATE INDEX IF NOT EXISTS social_comments_account_written_idx ON social_comments (account_id, written_at)' },
  // An Instagram DM conversation with one person; status and category like a comment.
  conversations: { key: ['network', 'external_id'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, account_id INT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    network TEXT NOT NULL DEFAULT 'instagram', external_id TEXT NOT NULL, participant_id TEXT, participant_name TEXT,
    meta_updated_at TIMESTAMPTZ, last_message_at TIMESTAMPTZ, last_user_at TIMESTAMPTZ, last_account_at TIMESTAMPTZ,
    window_until TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'new',
    category_id INT REFERENCES social_categories(id) ON DELETE SET NULL, handled_by TEXT, handled_at TIMESTAMPTZ,
    checked_at TIMESTAMPTZ, error TEXT, seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (network, external_id)` },
  // One DM. The text is erased after 60 days (text_deleted_at); date and author stay.
  messages: { key: ['conversation_id', 'external_id'], serial: 'id', ddl: `
    id SERIAL PRIMARY KEY, conversation_id INT NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL, from_account BOOLEAN NOT NULL DEFAULT false, author_id TEXT, text TEXT,
    written_at TIMESTAMPTZ NOT NULL, text_deleted_at TIMESTAMPTZ, seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, external_id)` },
};
const LOCK_ID = 727001; // pg advisory lock: one syncer at a time, even across overlapping deploys

const tableName = (t) => {
  if (!TABLES[t]) throw new Error(`Unknown social table: ${t}`);
  return 'social_' + t;
};

// ---------------- Postgres ----------------
function pgStore(url) {
  const pg = require('pg');
  // Own type parsers (not the global ones, so the rest of the Hub is untouched):
  // DATE stays 'YYYY-MM-DD', BIGINT becomes a number.
  const types = {
    getTypeParser: (oid, format) => (oid === 1082 ? (v) => v : oid === 20 ? (v) => (v == null ? null : Number(v)) : pg.types.getTypeParser(oid, format)),
  };
  const pool = new pg.Pool({
    connectionString: url, types,
    ssl: /sslmode=require|railway\.app|rlwy\.net/.test(url) && !/localhost|\.internal/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  const q = (text, params) => pool.query(text, params);
  let ready;
  // Tables in dependency order (Object order above), each created only if missing.
  const init = () => ready || (ready = (async () => {
    for (const [t, def] of Object.entries(TABLES)) {
      await q(`CREATE TABLE IF NOT EXISTS ${tableName(t)} (${def.ddl})`);
      for (const col of def.add || []) await q(`ALTER TABLE ${tableName(t)} ADD COLUMN IF NOT EXISTS ${col}`);
      if (def.index) await q(def.index);
    }
  })());

  const value = (t, col, v) => ((TABLES[t].json || []).includes(col) && v != null ? JSON.stringify(v) : v);
  function whereSql(where, params) {
    const parts = Object.entries(where || {}).map(([col, v]) => {
      if (v === null) return `${col} IS NULL`;
      if (Array.isArray(v)) { params.push(v); return `${col} = ANY($${params.length})`; }
      if (typeof v === 'object' && !(v instanceof Date)) {
        const ops = { gte: '>=', lte: '<=', gt: '>', lt: '<' };
        return Object.entries(v).map(([op, x]) => { params.push(x); return `${col} ${ops[op]} $${params.length}`; }).join(' AND ');
      }
      params.push(v); return `${col} = $${params.length}`;
    });
    return parts.length ? ' WHERE ' + parts.join(' AND ') : '';
  }

  return {
    kind: 'postgres',
    init,
    async insert(t, row) {
      await init();
      const cols = Object.keys(row);
      const { rows } = await q(`INSERT INTO ${tableName(t)} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
        cols.map((c) => value(t, c, row[c])));
      return rows[0];
    },
    async upsert(t, rows) {
      await init();
      if (!rows.length) return [];
      const key = TABLES[t].key;
      const out = [];
      // Chunks keep each statement well under Postgres' 65k parameter limit.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const cols = Object.keys(chunk[0]);
        const params = [];
        const values = chunk.map((r) => '(' + cols.map((c) => { params.push(value(t, c, r[c])); return '$' + params.length; }).join(',') + ')');
        const set = cols.filter((c) => !key.includes(c)).map((c) => `${c}=EXCLUDED.${c}`);
        if (TABLES[t].ddl.includes('updated_at')) set.push('updated_at=now()');
        const { rows: res } = await q(`INSERT INTO ${tableName(t)} (${cols.join(',')}) VALUES ${values.join(',')}
          ON CONFLICT (${key.join(',')}) DO ${set.length ? 'UPDATE SET ' + set.join(',') : 'NOTHING'} RETURNING *`, params);
        out.push(...res);
      }
      return out;
    },
    async find(t, where, opts = {}) {
      await init();
      const params = [];
      const sql = `SELECT * FROM ${tableName(t)}${whereSql(where, params)}${opts.order ? ' ORDER BY ' + opts.order : ''}${opts.limit ? ' LIMIT ' + Number(opts.limit) : ''}`;
      return (await q(sql, params)).rows;
    },
    async update(t, where, patch) {
      await init();
      const params = [];
      const set = Object.entries(patch).map(([c, v]) => { params.push(value(t, c, v)); return `${c}=$${params.length}`; });
      return (await q(`UPDATE ${tableName(t)} SET ${set.join(',')}${whereSql(where, params)}`, params)).rowCount;
    },
    async remove(t, where) {
      await init();
      const params = [];
      return (await q(`DELETE FROM ${tableName(t)}${whereSql(where, params)}`, params)).rowCount;
    },
    async withLock(fn) {
      await init();
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
        if (!rows[0].ok) return null;
        try { return await fn(); } finally { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); }
      } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

// ---------------- Memory (local preview and tests) ----------------
function memoryStore() {
  const data = Object.fromEntries(Object.keys(TABLES).map((t) => [t, new Map()]));
  const seq = Object.fromEntries(Object.keys(TABLES).map((t) => [t, 0]));
  let locked = false;
  const copy = (r) => JSON.parse(JSON.stringify(r));
  const keyOf = (t, r) => (TABLES[t].key ? TABLES[t].key.map((k) => r[k]).join('\u0001') : String(r[TABLES[t].serial]));
  const inRange = (x, v) => x != null && (v.gte == null || x >= v.gte) && (v.lte == null || x <= v.lte) && (v.gt == null || x > v.gt) && (v.lt == null || x < v.lt);
  const matches = (r, where) => Object.entries(where || {}).every(([c, v]) => (v === null ? r[c] == null
    : Array.isArray(v) ? v.includes(r[c]) : typeof v === 'object' ? inRange(r[c], v) : r[c] === v));
  const stamp = (t, r) => { if (TABLES[t].ddl.includes('updated_at')) r.updated_at = new Date().toISOString(); return r; };
  function add(t, row) {
    const r = { ...row };
    const serial = TABLES[t].serial;
    if (serial && r[serial] == null) r[serial] = ++seq[t];
    // Same defaults Postgres applies (only the ones the code relies on).
    ['created_at', 'seen_at'].forEach((c) => { if (TABLES[t].ddl.includes(c) && !r[c]) r[c] = new Date().toISOString(); });
    data[t].set(keyOf(t, r), stamp(t, r));
    return copy(r);
  }
  return {
    kind: 'memory',
    async init() {},
    async insert(t, row) { tableName(t); return add(t, row); },
    async upsert(t, rows) {
      tableName(t);
      return rows.map((row) => {
        const cur = data[t].get(keyOf(t, row));
        if (!cur) return add(t, row);
        Object.assign(cur, row);
        return copy(stamp(t, cur));
      });
    },
    async find(t, where, opts = {}) {
      tableName(t);
      let rows = [...data[t].values()].filter((r) => matches(r, where)).map(copy);
      if (opts.order) {
        const [col, dir] = opts.order.split(/\s+/);
        rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (/desc/i.test(dir || '') ? -1 : 1));
      }
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return rows;
    },
    async update(t, where, patch) {
      tableName(t);
      let n = 0;
      for (const r of data[t].values()) if (matches(r, where)) { Object.assign(r, patch); n++; }
      return n;
    },
    async remove(t, where) {
      tableName(t);
      let n = 0;
      for (const [k, r] of data[t]) if (matches(r, where)) { data[t].delete(k); n++; }
      return n;
    },
    async withLock(fn) {
      if (locked) return null;
      locked = true;
      try { return await fn(); } finally { locked = false; }
    },
    async close() {},
  };
}

function createSocialStore() {
  return process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memoryStore();
}
// One store for the whole app (routes and webhook share it; one Postgres pool).
let shared;
const getSocialStore = () => shared || (shared = createSocialStore());

module.exports = { createSocialStore, getSocialStore, memoryStore, pgStore, TABLES };
