// ---------------------------------------------------------------------------
// Dashboard auth: one login per person, two roles.
//
//   admin   everything: leads dashboard, Proposal Studio, approve/delete
//           proposals, edit the proposal library, manage users.
//   editor  leads dashboard + Proposal Studio (create, draft, revise, clone,
//           move to "in review"). Cannot approve, mark sent/won/lost, delete,
//           edit the library or manage users.
//
// Users come from two places:
//   - env (bootstrap): DASHBOARD_USER/DASHBOARD_PASS (admin) and
//     DASHBOARD_USERS="name:pass[:admin|:editor],..."
//   - the database: users an admin creates in Admin → Users. Passwords are
//     stored as scrypt hashes, never in clear text.
// Tokens: "<base64url user>.<issuedAt>.<hmac>" signed with TOKEN_SECRET.
// ---------------------------------------------------------------------------
const crypto = require('crypto');

const ROLES = ['admin', 'editor'];
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pass), salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function checkPassword(pass, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt64, key64] = stored.split('$');
  const key = crypto.scryptSync(String(pass), Buffer.from(salt64, 'base64'), 32);
  const want = Buffer.from(key64, 'base64');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function createAuth({ store, env = process.env }) {
  const envUsers = new Map();
  const legacy = (env.DASHBOARD_USER || 'admin').toLowerCase();
  envUsers.set(legacy, { name: legacy, pass: env.DASHBOARD_PASS || 'password', role: 'admin', source: 'env' });
  String(env.DASHBOARD_USERS || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((entry) => {
    const [name, pass, role] = entry.split(':');
    if (name && pass) envUsers.set(name.toLowerCase(), { name: name.toLowerCase(), pass, role: role === 'admin' ? 'admin' : 'editor', source: 'env' });
  });
  let dbUsers = new Map();
  const secret = env.TOKEN_SECRET
    || crypto.createHash('sha256').update('4geeks-dash:' + [...envUsers.values()].map((u) => u.name + u.pass).join('|')).digest('hex');
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

  async function reload() {
    if (!store || !store.listUsers) return;
    try { dbUsers = new Map((await store.listUsers()).map((u) => [u.name, u])); } catch (e) { console.error('[auth] could not load users:', e.message); }
  }

  // Env users win over database users with the same name (so an env admin can't be locked out).
  const find = (name) => envUsers.get(name) || dbUsers.get(name) || null;

  async function login(username, password) {
    const name = String(username || '').trim().toLowerCase();
    const u = find(name);
    if (!u || !password) return null;
    const ok = u.source === 'env' ? safeEq(u.pass, password) : checkPassword(password, u.pass_hash);
    if (!ok) return null;
    const payload = `${Buffer.from(u.name).toString('base64url')}.${Date.now()}`;
    return { token: `${payload}.${sign(payload)}`, user: { name: u.name, role: u.role, admin: u.role === 'admin' } };
  }

  function userFromToken(token) {
    if (!token) return null;
    if (env.DASHBOARD_TOKEN && token === env.DASHBOARD_TOKEN) return { name: 'token', role: 'admin', admin: true };
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [u64, issued, sig] = parts;
    if (!safeEq(sig, sign(`${u64}.${issued}`))) return null;
    if (!(Date.now() - Number(issued) < TOKEN_TTL_MS)) return null;
    const u = find(Buffer.from(u64, 'base64url').toString('utf8'));
    return u ? { name: u.name, role: u.role, admin: u.role === 'admin' } : null;
  }

  function requireAuth(req, res, next) {
    const user = userFromToken(req.headers['x-dashboard-token'] || req.query.token);
    if (!user) return res.status(401).json({ error: 'Unauthorized', needsAuth: true });
    req.user = user;
    next();
  }
  function requireAdmin(req, res, next) {
    requireAuth(req, res, () => (req.user.admin ? next() : res.status(403).json({ error: 'Admins only' })));
  }

  // Admin → Users
  async function listUsers() {
    const rows = [...envUsers.values()].map((u) => ({ name: u.name, role: u.role, source: 'env', has_password: true }));
    for (const u of dbUsers.values()) if (!envUsers.has(u.name)) rows.push({ name: u.name, role: u.role, source: 'app', has_password: !!u.pass_hash, created_by: u.created_by, updated_at: u.updated_at });
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  async function saveUser({ name, role, password }, by) {
    name = String(name || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,40}$/.test(name)) throw Object.assign(new Error('Username: 2–40 letters, numbers, dot, dash or underscore'), { status: 400 });
    if (!ROLES.includes(role)) throw Object.assign(new Error(`Role must be ${ROLES.join(' or ')}`), { status: 400 });
    if (envUsers.has(name)) throw Object.assign(new Error('This user is set in Railway variables; change it there'), { status: 400 });
    if (password !== undefined && password !== '' && String(password).length < 10) throw Object.assign(new Error('Password must be at least 10 characters'), { status: 400 });
    await store.upsertUser({ name, role, pass_hash: password ? hashPassword(password) : null, created_by: by });
    await reload();
  }
  async function removeUser(name, by) {
    name = String(name || '').toLowerCase();
    if (name === by) throw Object.assign(new Error('You cannot delete your own user'), { status: 400 });
    if (envUsers.has(name)) throw Object.assign(new Error('This user is set in Railway variables; remove it there'), { status: 400 });
    await store.deleteUser(name);
    await reload();
  }

  // Make sure the named people exist as app users (no password until an admin sets one).
  async function ensureUsers(list) {
    await reload();
    for (const u of list) if (!envUsers.has(u.name) && !dbUsers.has(u.name)) await store.upsertUser({ ...u, pass_hash: null, created_by: 'system' });
    await reload();
  }

  return { login, userFromToken, requireAuth, requireAdmin, listUsers, saveUser, removeUser, ensureUsers, reload, ROLES };
}

module.exports = { createAuth, hashPassword, checkPassword };
