'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createEnrollments, money, programFrom, cohortFrom } = require('../lib/enrollments');

const stages = new Map([
  ['965', { id: '965', group: '5', title: 'Won' }],
  ['1024', { id: '1024', group: '16', title: 'Won AI ENG ROTATIVOS (28 SEP - 16 ABR) - ES-AIE-2YBSU2' }],
  ['1083', { id: '1083', group: '16', title: 'BAJA - Leads WON que finalmente acaban como LOST' }],
  ['900', { id: '900', group: '67', title: 'Ganado' }],
]);
const users = new Map([['7', { firstName: 'Pablo', lastName: 'B.' }], ['8', { firstName: 'Marcia', lastName: 'R.' }]]);

function stubClient() {
  const dealsByGroup = {
    5: [{ id: '1', group: '5', stage: '965', status: '1', contact: '11', owner: '8', value: '1299900', currency: 'usd', cdate: '2026-08-01T10:00:00-04:00', mdate: '2026-09-02T10:00:00-04:00' }],
    16: [{ id: '2', group: '16', stage: '1024', status: '1', contact: '12', owner: '7', value: '450000', currency: 'eur', cdate: '2026-09-20T10:00:00+02:00', mdate: '2026-10-13T10:00:00+02:00' }],
    75: [],
    67: [{ id: '3', group: '67', stage: '900', status: '1', contact: '13', owner: '8', value: '140000', currency: 'usd', cdate: '2025-11-01T10:00:00-03:00', mdate: '2026-10-05T10:00:00-03:00' }],
  };
  return {
    calls: [],
    async listDealsWithCustomFields(f) {
      this.calls.push(['deals', f.group, f.status]);
      const deals = dealsByGroup[f.group] || [];
      const dcf = [];
      if (f.group === '16') dcf.push({ deal_id: '2', custom_field_id: '74', custom_field_date_value: '2026-10-13T03:47:59-04:00' }, { deal_id: '2', custom_field_id: '8', custom_field_text_value: 'facebook' }, { deal_id: '2', custom_field_id: '45', custom_field_text_value: '4.500' });
      if (f.group === '5') dcf.push({ deal_id: '1', custom_field_id: '74', custom_field_date_value: '2026-09-01' });
      return { deals, dealCustomFieldData: dcf, includeSupported: true };
    },
    async _paginateAllWithInclude(path, params) {
      this.calls.push(['stage', params['filters[stage]']]);
      return { items: [{ id: '4', group: '16', stage: '1083', status: '2', contact: '14', owner: '7', value: '450000', currency: 'eur', cdate: '2026-07-01', mdate: '2026-09-15' }], included: [{ deal_id: '4', custom_field_id: '74', custom_field_date_value: '2026-08-01' }] };
    },
    async _get(path) {
      this.calls.push(['contacts', path]);
      return { contacts: [{ id: '13', firstName: 'Ana', email: 'ana@x.com' }], fieldValues: [{ contact: '13', field: '59', value: 'google' }, { contact: '13', field: '18', value: 'Bogotá' }] };
    },
  };
}

test('enrollments: won deals per pipeline, Spain included, drops and contact fallback', async () => {
  const client = stubClient();
  const enr = createEnrollments({
    client,
    getLookups: () => ({ usersById: users, stagesById: stages }),
    getMainRecords: () => [{ id: '5', pipelineId: '67', bucket: 'Lost - Classified', wonDate: '2026-06-10', date: '2026-05-01', dealValue: 1400, region: 'LATAM', stage: 'Perdido' }],
    getContactCaches: () => ({ contactsById: new Map([['11', { id: '11', email: 'a@b.com' }], ['12', { id: '12', email: 'c@d.com' }]]), fieldValuesById: new Map([['11', [{ contact: '11', field: '59', value: 'google' }, { contact: '11', field: '2', value: 'AI Engineering' }]], ['12', []]]) }),
  });
  await enr.refresh();
  const { rows, error } = enr.get();
  assert.equal(error, null);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(byId).sort(), ['1', '2', '3', '4', '5']);
  // Spain: deal-level UTM + final price + won date + cohort from stage
  assert.equal(byId[2].region, 'Spain');
  assert.equal(byId[2].source, 'facebook');
  assert.equal(byId[2].price, 4500);
  assert.equal(byId[2].currency, 'EUR');
  assert.ok(Math.abs(byId[2].priceUsd - 4860) < 0.01);
  assert.equal(byId[2].converted, '2026-10-13');
  assert.equal(byId[2].cohort, '28 SEP - 16 ABR');
  assert.equal(byId[2].program, 'AI Engineering');
  assert.equal(byId[2].assignTo, 'Pablo B.');
  // USA: contact fields from the main cache, deal value in cents
  assert.equal(byId[1].source, 'google');
  assert.equal(byId[1].price, 12999);
  assert.equal(byId[1].daysToConvert, 31);
  // LATAM: contact fetched (not in cache), created in 2025, converted 2026
  assert.equal(byId[3].location, 'Bogotá');
  assert.equal(byId[3].converted, '2026-10-05');
  // Drops: BAJA stage and won-then-lost from the main cache
  assert.equal(byId[4].status, 'dropped');
  assert.equal(byId[5].status, 'dropped');
  assert.equal(byId[1].status, 'enrolled');
  // Only the missing contact was fetched
  const contactCalls = client.calls.filter((c) => c[0] === 'contacts');
  assert.equal(contactCalls.length, 1);
  assert.match(contactCalls[0][1], /ids\[\]=13/);
  assert.ok(!/ids\[\]=11/.test(contactCalls[0][1]));
  // Newest conversion first
  assert.equal(rows[0].id, '2');
});

test('money / program / cohort parsing', () => {
  assert.equal(money('4.500,00 €'), 4500);
  assert.equal(money('$12,999'), 12999);
  assert.equal(money(''), null);
  assert.equal(programFrom(null, 'Won AI ENG DEVELOPERS TARDES (14 SEP - 03 FEB)'), 'AI Engineering for Developers');
  assert.equal(programFrom('AI Fluency', null), 'AI Fluency');
  assert.equal(cohortFrom('WON CS TARDES (01 JUN - 18 SEPT) - fecha 2026/06/01'), '01 JUN - 18 SEPT');
});
