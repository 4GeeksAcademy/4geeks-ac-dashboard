// node --test test/  (no dependencies: node:test + the app's own express)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { hashPii, redactPii, redactText, redactJsonResponses, isHash } = require('../lib/pii');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const lead = () => ({
  id: '81234', contactId: '55120', name: 'Juan Pérez', email: ' Juan.Perez@Example.com ', phone: '+34 600-12-34-56',
  dealTitle: 'Juan Pérez - Full Stack', date: '2026-10-15', dealValue: 4990, region: 'Spain', campaign: 'ES-Search-Brand',
  assignTo: 'Ana Admisiones', stage: 'Offer sent', reasons: ['Price'],
  feedback: 'Call him back on +34 611 22 33 44 or write to juan.perez@example.com after the 20th',
});

test('a lead: name, email, phone and deal title are hashed; the rest is untouched', () => {
  const out = redactPii(lead());
  assert.equal(out.name, sha('juan pérez'));
  assert.equal(out.email, sha('juan.perez@example.com'));
  assert.equal(out.phone, sha('34600123456'));
  assert.equal(out.dealTitle, sha('juan pérez - full stack'));
  for (const k of ['id', 'contactId', 'date', 'dealValue', 'region', 'campaign', 'assignTo', 'stage']) assert.deepEqual(out[k], lead()[k], k);
  assert.deepEqual(out.reasons, ['Price']);
});

test('same normalization (and so same hash) as the CDP and Google Ads / Meta', () => {
  assert.equal(hashPii('  JUAN.perez@example.COM ', 'email'), sha('juan.perez@example.com'));
  assert.equal(hashPii('(+34) 600 12 34 56', 'phone'), hashPii('34600123456', 'phone'));
  assert.equal(hashPii(sha('x')), sha('x'), 'a hash is not hashed again');
  assert.equal(hashPii(''), '');
});

test('free text: emails and phone numbers are hashed, dates and amounts are not', () => {
  const fb = redactPii(lead()).feedback;
  assert.ok(!/@/.test(fb), 'no email left');
  assert.ok(!/611 22 33 44/.test(fb), 'no phone left');
  assert.ok(fb.includes(sha('34611223344')) && fb.includes(sha('juan.perez@example.com')));
  assert.ok(fb.endsWith('after the 20th'));
  const t = redactPii({ notes: 'Paid 1.234,50 € on 2026-10-15, deal 81234' }).notes;
  assert.equal(t, 'Paid 1.234,50 € on 2026-10-15, deal 81234');
});

test('free text: a date next to a phone stays readable and the phone is still hashed', () => {
  assert.equal(redactText('call 2026-10-15 600 123 456 ok'), `call 2026-10-15 ${sha('600123456')} ok`);
  assert.equal(redactText('600 123 456 2026-10-15'), `${sha('600123456')} 2026-10-15`);
  assert.equal(redactText('(+34) 600 12 34 56 / 15/10'), `(${sha('34600123456')} / 15/10`);
  const h = sha('x');
  assert.equal(redactText(`id ${h} and ${h}123456789`), `id ${h} and ${h}123456789`, 'digits inside a hash are not touched');
});

test('emails are hashed in any string; phone-like numbers only in free text', () => {
  const out = redactPii({ question: 'what about ana@x.io?', campaign: 'ES 2026 600123456' });
  assert.equal(out.question, `what about ${sha('ana@x.io')}?`);
  assert.equal(out.campaign, 'ES 2026 600123456');
  assert.equal(redactText('ring 600 123 456'), `ring ${sha('600123456')}`);
});

test('`name` is only personal on a person: campaigns, channels and reps keep theirs', () => {
  const ads = { channels: [{ name: 'Google Ads', spend: 10 }], campaigns: [{ name: 'Brand', channel: 'Google' }] };
  assert.deepEqual(redactPii(ads), ads);
  assert.deepEqual(redactPii({ users: [{ name: 'marcelo', role: 'admin' }] }), { users: [{ name: 'marcelo', role: 'admin' }] });
});

test('raw ActiveCampaign objects (diagnostics): contact and deal', () => {
  const out = redactPii({ contact: { id: '1', email: 'a@b.co', phone: '600123456', firstName: 'Ana', lastName: 'Gil' }, deal: { id: '9', contact: '1', title: 'Ana Gil' } });
  assert.ok([out.contact.email, out.contact.phone, out.contact.firstName, out.contact.lastName, out.deal.title].every(isHash));
  assert.equal(out.contact.id, '1');
});

test('nested, arrays and JSON kept as text; the input is never modified', () => {
  const input = { records: [lead()], meta: JSON.stringify({ email: 'x@y.z' }) };
  const before = JSON.stringify(input);
  const out = redactPii(input);
  assert.equal(JSON.stringify(input), before, 'cache stays in clear');
  assert.ok(isHash(out.records[0].email));
  assert.equal(JSON.parse(out.meta).email, sha('x@y.z'));
});

test('idempotent: redacting twice gives the same result (with and without partials)', () => {
  const once = redactPii({ records: [lead()] });
  assert.deepEqual(redactPii(once), once);
  const browser = redactPii({ records: [lead()] }, { partials: true });
  assert.deepEqual(redactPii(browser, { partials: true }), browser);
});

test('partials for the browser: enough to recognise the lead, never the full value', () => {
  const out = redactPii(lead(), { partials: true });
  assert.equal(out.namePartial, 'Juan P.');
  assert.equal(out.emailPartial, 'ju•••@example.com');
  assert.equal(out.phonePartial, '+•••••• 456');
  assert.ok(isHash(out.name) && isHash(out.email) && isHash(out.phone), 'the full values stay hashed');
  assert.equal(redactPii({ name: 'Brand', spend: 1 }, { partials: true }).namePartial, undefined, 'only on persons');
  assert.equal(redactPii({ contactId: 1, phone: '123' }, { partials: true }).phonePartial, '•••');
  // Seen in real data: the CRM name holds an email or a phone.
  assert.equal(redactPii({ contactId: 1, name: 'JuanPerez1990@Gmail.com' }, { partials: true }).namePartial, 'ju•••@gmail.com');
  assert.equal(redactPii({ contactId: 1, name: '+34 600 123 456' }, { partials: true }).namePartial, '+•••••• 456');
  assert.equal(redactPii({ contactId: 1, name: 'Ana 600123456' }, { partials: true }).namePartial, 'Ana •••');
});

test('the AI never gets partials, not even when the browser sends them back', () => {
  const fromBrowser = { sample: [redactPii(lead(), { partials: true })] };
  const forAi = JSON.stringify(redactPii(fromBrowser));
  assert.ok(!/Partial|Juan P\.|•••/.test(forAi));
});

test('middleware: /api JSON is redacted, exempt routes are not', async () => {
  const app = express();
  app.use('/api', redactJsonResponses({ exempt: /^\/api\/(login|me|users|proposals|proposal-library)(\/|$)/ }));
  app.get('/api/summary', (req, res) => res.json({ records: [lead()] }));
  app.get('/api/users', (req, res) => res.json({ users: [{ name: 'marcelo', email: 'm@4geeks.co' }] }));
  app.get('/api/proposals/1', (req, res) => res.json({ contact: { name: 'Client CEO', email: 'ceo@client.com' } }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const summary = await (await fetch(`${base}/api/summary?region=Spain`)).text();
    assert.ok(!/juan\.perez@|611 22 33 44|600-12|Pérez/i.test(summary), 'no full email, phone or surname');
    assert.ok(summary.includes('"namePartial":"Juan P."') && summary.includes('ju•••@example.com'), 'partials to recognise the lead');
    assert.ok(summary.includes('ES-Search-Brand'));
    assert.ok((await (await fetch(`${base}/api/users`)).text()).includes('m@4geeks.co'));
    assert.ok((await (await fetch(`${base}/api/proposals/1`)).text()).includes('ceo@client.com'));
  } finally {
    server.close();
  }
});
