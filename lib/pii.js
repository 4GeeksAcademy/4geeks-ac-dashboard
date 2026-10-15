'use strict';
// Personal data never leaves the server in clear.
//
// Same rules as the 4Geeks CDP (apps/api/src/pii.ts), so a lead has the same
// fingerprint in both tools: hash = SHA-256 hex of the normalized value --
// email trimmed + lowercase, phone digits only, anything else trimmed +
// lowercase (the normalization Google Ads and Meta use to match audiences).
//
// The in-memory ActiveCampaign cache keeps the data in clear (the dashboard
// needs it to compute). Everything that leaves through /api (and so the
// browser, CSV exports and AI insights built from it) and every prompt sent to
// the AI goes through here. The full record stays in ActiveCampaign.
const crypto = require('crypto');

const HEX64 = /^[0-9a-f]{64}$/i;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Runs of numbers inside free text (+, digits, spaces, dots, dashes, brackets),
// never glued to letters, so a hash or an ID inside a word is not touched.
const NUMBER_RUN = /(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g;
// A date inside a run is a boundary: it stays readable and is never part of a phone.
const DATE_GROUP = /^\(?\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\)?$/;

/** Lowercase and drop `_`, `-` and spaces so snake_case and camelCase match. */
const norm = (key) => String(key).toLowerCase().replace(/[\s_-]/g, '');
const keySet = (list) => new Set(list.map(norm));

const EMAIL_KEYS = keySet(['email', 'emails', 'mail', 'correo']);
const PHONE_KEYS = keySet(['phone', 'phones', 'phone_number', 'telefono', 'tel', 'mobile', 'movil', 'celular', 'whatsapp']);
const OTHER_KEYS = keySet([
  'first_name', 'last_name', 'full_name', 'nombre', 'apellido', 'apellidos', 'display_name',
  'address', 'direccion', 'street', 'dni', 'nif', 'nie', 'document', 'documento', 'passport',
  'birth_date', 'birthday', 'ip', 'ip_address',
  // ActiveCampaign deal titles are usually the contact's name or email.
  'deal_title',
]);
/** Free-text fields: emails AND phone numbers written inside them are hashed. */
const FREE_TEXT_KEYS = keySet(['feedback', 'notes', 'note', 'comments', 'comment', 'client_comments', 'message', 'description']);
/** An object with any of these keys is a person (a lead or an AC contact/deal). */
const PERSON_KEYS = keySet(['email', 'phone', 'contact_id', 'contact', 'first_name', 'last_name']);
/** Derived phone keys (phone_digits, mobile_phone, work_phone...). */
const PHONE_IN_KEY = /phone|telefono|movil|mobile|celular|whatsapp/;

function looksLikePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return String(value).replace(/\D/g, '').length >= 6;
}

/**
 * Kind of personal data a key holds, or null. `name` and `title` are only
 * personal inside a person object: a campaign, a channel or a rep keep theirs.
 */
function keyKind(key, value, isPerson) {
  const k = norm(key);
  if (EMAIL_KEYS.has(k)) return 'email';
  if (PHONE_KEYS.has(k)) return 'phone';
  if (OTHER_KEYS.has(k)) return 'text';
  if (isPerson && (k === 'name' || k === 'title')) return 'text';
  // Only when the value looks like a number to call, so counters stay readable.
  if (PHONE_IN_KEY.test(k) && looksLikePhone(value)) return 'phone';
  return null;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// /api/summary sends every lead on each load: remember recent hashes.
const memo = new Map();
const MEMO_MAX = 100000;
function memoHash(input) {
  let h = memo.get(input);
  if (h === undefined) {
    if (memo.size >= MEMO_MAX) memo.clear();
    h = sha256(input);
    memo.set(input, h);
  }
  return h;
}

/** SHA-256 of a normalized value. Hashes and empty strings are returned as-is. */
function hashPii(value, kind = 'text') {
  const s = String(value);
  if (s === '' || HEX64.test(s)) return s;
  if (kind === 'phone') {
    const digits = s.replace(/\D/g, '');
    if (digits) return memoHash(digits);
  }
  return memoHash(s.trim().toLowerCase());
}

/** Hash every leaf under a sensitive key (strings, numbers, nested arrays/objects). */
function hashDeep(value, kind) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return hashPii(value, kind);
  if (Array.isArray(value)) return value.map((v) => hashDeep(v, kind));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hashDeep(v, kind)]));
  return value;
}

const digitCount = (s) => s.replace(/\D/g, '').length;

/**
 * A run of numbers from free text: every phone in it (a window of number groups
 * holding 9-15 digits) is hashed; dates, amounts and short numbers stay.
 * "2026-10-15 600 123 456" -> the date stays, the phone is hashed.
 */
function redactNumberRun(run) {
  const tokens = run.split(/(\s+)/); // number groups at even indexes, spaces at odd ones
  let out = '';
  let i = 0;
  while (i < tokens.length) {
    if (i % 2 === 1 || DATE_GROUP.test(tokens[i])) { out += tokens[i]; i += 1; continue; }
    // Longest window from here, not crossing a date, holding 9-15 digits.
    let end = -1;
    let digits = 0;
    for (let j = i; j < tokens.length && !DATE_GROUP.test(tokens[j]); j += 2) {
      digits += digitCount(tokens[j]);
      if (digits > 15) break;
      if (digits >= 9) end = j;
    }
    if (end >= 0) { out += hashPii(tokens.slice(i, end + 1).join(''), 'phone'); i = end + 1; } else { out += tokens[i]; i += 1; }
  }
  return out;
}

/** Emails (and, in free text, phone numbers) inside a string, hashed. */
function redactText(s, freeText = true) {
  const out = String(s).replace(EMAIL_IN_TEXT, (m) => hashPii(m, 'email'));
  return freeText ? out.replace(NUMBER_RUN, redactNumberRun) : out;
}

/** JSON kept as text is parsed and redacted; any other string gets redactText. */
function redactString(s, freeText) {
  const t = s.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.stringify(walk(JSON.parse(t), false));  // JSON in text: hashes only
    } catch (e) {
      // not JSON: plain text
    }
  }
  return redactText(s, freeText);
}

/**
 * Partial, human-readable versions so the team can recognise a lead without
 * the full value ever leaving the server: "Juan P. G.", "ju•••@gmail.com",
 * "+•••••• 456". Computed here from the clear value; the full one is hashed.
 */
function partialName(s) {
  const v = String(s).trim();
  // Names typed as a phone or an email happen in the CRM: mask them as such.
  if (/^[\d\s()+.-]+$/.test(v) && v.replace(/\D/g, '').length >= 6) return partialPhone(v);
  const words = v.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.map((w, i) => {
    if (w.includes('@')) return partialEmail(w);
    if (w.replace(/\D/g, '').length >= 6) return '•••';
    return i === 0 ? w : `${[...w][0].toUpperCase()}.`;
  }).join(' ');
}
function partialEmail(s) {
  const v = String(s).trim();
  const at = v.lastIndexOf('@');
  if (at < 1) return v ? `${[...v].slice(0, 2).join('')}•••` : '';
  const local = [...v.slice(0, at)];
  return `${local.slice(0, local.length > 3 ? 2 : 1).join('')}•••@${v.slice(at + 1)}`.toLowerCase();
}
function partialPhone(s) {
  const digits = String(s).replace(/\D/g, '');
  if (digits.length < 6) return '•••';
  return `${String(s).trim().startsWith('+') ? '+' : ''}•••••• ${digits.slice(-3)}`;
}
const PARTIAL = { name: partialName, email: partialEmail, phone: partialPhone };
const PARTIAL_KEY = /partial$/;

function walk(value, freeText, opts = {}) {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value, freeText);
  if (Array.isArray(value)) return value.map((v) => walk(v, freeText, opts));
  if (typeof value !== 'object' || value instanceof Date) return value;
  const entries = Object.entries(value);
  const isPerson = entries.some(([k]) => PERSON_KEYS.has(norm(k)));
  const out = {};
  for (const [k, v] of entries) {
    const nk = norm(k);
    // Partial versions only go to the browser: never to the AI, nor kept if they come back.
    if (!opts.partials && PARTIAL_KEY.test(nk)) continue;
    const kind = keyKind(k, v, isPerson);
    out[k] = kind ? hashDeep(v, kind) : walk(v, freeText || FREE_TEXT_KEYS.has(nk), opts);
    // name / email / phone of a person: add `<key>Partial` (computed from the clear value only).
    if (opts.partials && isPerson && PARTIAL[nk] && typeof v === 'string' && v.trim() && !HEX64.test(v)) {
      out[`${k}Partial`] = PARTIAL[nk](v);
    }
  }
  return out;
}

/**
 * Deep copy of any JSON value with personal data replaced by its SHA-256 (the
 * input is not modified). `partials: true` (responses to the browser) also adds
 * namePartial / emailPartial / phonePartial to each person; without it (prompts
 * for the AI) any partial field is dropped.
 */
function redactPii(value, { partials = false } = {}) {
  return walk(value, false, { partials });
}

/**
 * Express middleware: every JSON response goes through redactPii, except the
 * paths matched by `exempt` (e.g. the dashboard's own users, Proposal Studio).
 */
function redactJsonResponses({ exempt } = {}) {
  return (req, res, next) => {
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (exempt && exempt.test(path)) return next();
    const json = res.json.bind(res);
    res.json = (body) => json(redactPii(body, { partials: true }));
    next();
  };
}

module.exports = { hashPii, redactPii, redactText, redactJsonResponses, isHash: (v) => typeof v === 'string' && HEX64.test(v) };
