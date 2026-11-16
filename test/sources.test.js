'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createBrevo, stageOfList, programOfList } = require('../lib/sources/brevo');
const { createCdp, compactNurture } = require('../lib/sources/cdp');
const { redactPii } = require('../lib/pii');

const quiet = { log() {}, warn() {} };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test('brevo: list names map to funnel steps and programs', () => {
  assert.strictEqual(stageOfList('AI Fluency Leads'), 'lead');
  assert.strictEqual(stageOfList('AI Flex Enrolled'), 'enrolled');
  assert.strictEqual(stageOfList('First module completed'), 'module1');
  assert.strictEqual(stageOfList('About to finish course'), 'finishing');
  assert.strictEqual(stageOfList('Course finished'), 'finished');
  assert.strictEqual(programOfList('AI Flex Leads'), 'AI Flex');
  assert.strictEqual(programOfList('Course finished'), null);
});

test('brevo: reads only the matching lists, counts each email once, joins the CRM by email, and never writes', async () => {
  const calls = [];
  const contacts = {
    106: [{ email: 'Ana@X.com', createdAt: '2026-11-10T10:00:00Z', emailBlacklisted: false, attributes: { FIRSTNAME: 'Ana', LASTNAME: 'Pérez', PROGRAM: 'ai-fluency', UTM_SOURCE: 'ig', UTM_MEDIUM: 'paid', UTM_LOCATION: 'madrid-spain' } },
      { email: 'bo@x.com', createdAt: '2026-11-09T10:00:00Z', attributes: { FIRSTNAME: 'Bo' } }],
    103: [{ email: 'ana@x.com', createdAt: '2026-11-10T10:00:00Z', attributes: { FIRSTNAME: 'Ana' } }],
  };
  const fetch = async (url, opts) => {
    calls.push({ url, method: (opts && opts.method) || 'GET', key: opts.headers['api-key'] });
    const u = new URL(url);
    if (u.pathname === '/v3/contacts/lists') return json({ lists: [{ id: 106, name: 'AI Fluency Leads' }, { id: 103, name: 'AI Fluency Enrolled' }, { id: 10, name: 'Discounts & Promotions' }] });
    const m = u.pathname.match(/^\/v3\/contacts\/lists\/(\d+)\/contacts$/);
    if (m) return json({ contacts: contacts[m[1]] || [] });
    if (u.pathname === '/v3/smtp/statistics/events') return json({ events: [
      { email: 'ana@x.com', event: 'requests', messageId: 'm1', subject: 'Tu guía, Ana', templateId: 225, date: '2026-11-10T10:01:00Z' },
      { email: 'ana@x.com', event: 'delivered', messageId: 'm1', subject: 'Tu guía, Ana', templateId: 225, date: '2026-11-10T10:01:05Z' },
      { email: 'ana@x.com', event: 'opened', messageId: 'm1', subject: 'Tu guía, Ana', templateId: 225, date: '2026-11-10T11:00:00Z' },
      { email: 'ana@x.com', event: 'opened', messageId: 'm1', subject: 'Tu guía, Ana', templateId: 225, date: '2026-11-10T12:00:00Z' },
      { email: 'ana@x.com', event: 'clicks', messageId: 'm1', subject: 'Tu guía, Ana', templateId: 225, date: '2026-11-10T11:01:00Z' },
      { email: 'bo@x.com', event: 'requests', messageId: 'm2', subject: 'Tu guía, Bo', templateId: 225, date: '2026-11-09T10:01:00Z' },
      { email: 'someone-else@x.com', event: 'requests', messageId: 'm3', subject: 'Bahamas', templateId: 9, date: '2026-11-09T10:01:00Z' },
    ] });
    return json({}, 404);
  };
  const brevo = createBrevo({ env: { BREVO_API_KEY: 'k' }, fetch, log: quiet,
    getRecords: () => [{ id: 77, email: 'ana@x.com', region: 'Spain', stage: 'SOFT feedback', bucket: 'Active / Other', admissionsScore: 'Good', date: '2026-11-10' }],
    getEnrollments: () => ({ rows: [] }) });
  await brevo.refresh();
  const v = brevo.view();
  assert.strictEqual(v.error, null);
  assert.deepStrictEqual(v.lists.map((l) => l.id), [106, 103]);
  assert.ok(calls.every((c) => c.method === 'GET' && c.key === 'k'));
  assert.ok(!calls.some((c) => c.url.includes('/lists/10/')));
  assert.strictEqual(v.rows.length, 2);
  const ana = v.rows.find((r) => r.email === 'ana@x.com');
  assert.strictEqual(ana.stage, 'enrolled');
  assert.strictEqual(ana.program, 'AI Fluency');
  assert.deepStrictEqual({ ...ana.sent, lastAt: null }, { sent: 1, delivered: 1, opened: 1, clicked: 1, bounced: 0, lastAt: null });
  assert.deepStrictEqual(ana.crm, { dealId: '77', region: 'Spain', stage: 'SOFT feedback', bucket: 'Active / Other', score: 'Good', course: null });
  assert.strictEqual(v.rows.find((r) => r.email === 'bo@x.com').crm, null);
  assert.deepStrictEqual(v.funnel, { lead: 2, enrolled: 1, module1: 0, finishing: 0, finished: 0 });
  // One row per email template, the person's name taken out of the subject.
  assert.strictEqual(v.messages.length, 1);
  assert.deepStrictEqual({ subject: v.messages[0].subject, sent: v.messages[0].sent, opened: v.messages[0].opened, clicked: v.messages[0].clicked }, { subject: 'Tu guía, {name}', sent: 2, opened: 1, clicked: 1 });
  // Each person's own emails: one line per email, with what they did with it.
  assert.deepStrictEqual(ana.timeline, [{ subject: 'Tu guía, {name}', templateId: 225, at: '2026-11-10T10:01:00Z', delivered: true, opened: true, clicked: true, bounced: false, unsubscribed: false }]);
  assert.strictEqual(v.rows.find((r) => r.email === 'bo@x.com').timeline[0].opened, false);
  const one = await brevo.personEmails('ANA@x.com');
  assert.strictEqual(one.inFunnel, true);
  assert.strictEqual(one.timeline.length, 1);
  // A lead outside the funnel lists is asked to Brevo live, by email.
  const other = await brevo.personEmails('someone-else@x.com');
  assert.ok(calls.some((c) => c.url.includes('email=someone-else%40x.com')));
  assert.strictEqual(other.inFunnel, false);
  assert.deepStrictEqual(await brevo.personEmails(''), { enabled: true, found: false, reason: 'no_email' });
  // What reaches the browser: identity hashed, counters intact.
  const out = redactPii(v, { partials: true });
  const row = out.rows.find((r) => r.sent.opened === 1);
  assert.match(row.email, /^[0-9a-f]{64}$/);
  assert.match(row.name, /^[0-9a-f]{64}$/);
  assert.strictEqual(row.namePartial, 'Ana P.');
  assert.strictEqual(row.sent.sent, 1);
  assert.strictEqual(out.messages[0].sent, 2);
});

test('brevo: off without a key, and a Brevo error is kept as the view\'s error', async () => {
  const off = createBrevo({ env: {}, log: quiet });
  assert.strictEqual(off.view().enabled, false);
  const bad = createBrevo({ env: { BREVO_API_KEY: 'k' }, log: quiet, fetch: async () => json({ message: 'Key not found' }, 401) });
  await bad.refresh();
  assert.match(bad.view().error, /401/);
});

test('cdp: looks a person up by email with a bearer token and drops personal values', async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, auth: opts.headers.authorization, method: opts.method || 'GET' });
    const u = new URL(url);
    if (u.pathname === '/v1/profiles/by/email/ana%40x.com') return json({ profile: {
      profile: { id: 'prof_1', createdAt: '2026-10-01T00:00:00Z' },
      identifiers: [{ type: 'email', value: 'ana@x.com' }, { type: 'anonymous_id', value: 'cid.1' }],
      traits: [{ key: 'name', value: 'Ana Pérez', source: 'crm' }, { key: 'country', value: 'ES', source: 'crm' }, { key: 'phone_number', value: '+34600111222' }],
      events: [{ name: 'form_submitted', source: 'web_forms', timestamp: '2026-11-10T10:00:00Z', properties: { email: 'ana@x.com' } }],
      segments: [{ name: 'persona:career_changer', kind: 'persona', enteredAt: '2026-11-10T10:00:05Z' }, { name: 'Spain leads', kind: 'rule' }],
      consent: { marketingAnywhere: true, channels: [{ channel: 'email', marketing: true, marketingBlock: null }, { channel: 'whatsapp', marketing: false, marketingBlock: 'no_opt_in' }] },
    } });
    if (u.pathname === '/v1/automations/profiles/prof_1') return json({ points: [{ persona: 'career_changer', points: 13 }], runs: [{ flow: 'Lead welcome', status: 'running', email: 'ana@x.com' }], goals: [] });
    if (u.pathname === '/v1/profiles/by/email/nobody%40x.com') return json({ error: { code: 'not_found', message: 'Not found' } }, 404);
    if (u.pathname === '/v1/profiles/summary') return json({ summary: { leadCounts: { leads: 1200, notLeads: 30 }, whoCounts: { known: 1210, nameless: 20 } } });
    return json({ error: { code: 'unauthorized', message: 'nope' } }, 401);
  };
  const cdp = createCdp({ env: { CDP_TOKEN: 'cdp_x', CDP_BASE_URL: 'https://cdp.test/' }, fetch, log: quiet });
  const p = await cdp.person(' Ana@X.com ');
  assert.ok(calls.every((c) => c.auth === 'Bearer cdp_x' && c.method === 'GET' && c.url.startsWith('https://cdp.test/v1/')));
  assert.strictEqual(p.found, true);
  assert.deepStrictEqual(p.identifierTypes, ['email', 'anonymous_id']);
  assert.deepStrictEqual(p.traits.map((t) => t.key), ['country']);
  assert.deepStrictEqual(p.personas.map((x) => x.segment), ['persona:career_changer']);
  assert.deepStrictEqual(p.segments.map((x) => x.segment), ['Spain leads']);
  assert.deepStrictEqual(p.activity, [{ event: 'form_submitted', source: 'web_forms', at: '2026-11-10T10:00:00Z' }]);
  assert.deepStrictEqual(p.consent.channels[1], { channel: 'whatsapp', marketing: false, block: 'no_opt_in' });
  assert.deepStrictEqual(p.nurture.points, { total: 1, items: [{ persona: 'career_changer', points: 13 }] });
  assert.deepStrictEqual(p.nurture.runs.items, [{ flow: 'Lead welcome', status: 'running' }]);
  assert.ok(!JSON.stringify(p).includes('ana@x.com') && !JSON.stringify(p).includes('Pérez') && !JSON.stringify(p).includes('600111222'));
  assert.deepStrictEqual(await cdp.person('nobody@x.com'), { found: false });
  assert.deepStrictEqual(await cdp.person(''), { found: false, reason: 'no_email' });
  assert.deepStrictEqual(await cdp.status(), { enabled: true, ok: true, baseUrl: 'https://cdp.test', leads: 1200, known: 1210 });
  assert.strictEqual(compactNurture(null), null);
});

test('cdp: off without a token; a rejected token shows as not ok', async () => {
  assert.deepStrictEqual(await createCdp({ env: {}, log: quiet }).status(), { enabled: false, baseUrl: 'https://cdp.4geeks.us' });
  const bad = createCdp({ env: { CDP_TOKEN: 'cdp_bad' }, log: quiet, fetch: async () => json({ error: { code: 'unauthorized', message: 'Invalid token' } }, 401) });
  const s = await bad.status();
  assert.strictEqual(s.ok, false);
  assert.strictEqual(s.error, 'Invalid token');
});
