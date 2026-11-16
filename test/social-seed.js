'use strict';
// SOCIAL_SEED for the Social tests, with made-up ids (the real ones live only in .env / Railway).
// Require it before anything under lib/social: lib/social/defaults.js reads the env var on load.
process.env.SOCIAL_SEED = JSON.stringify({
  pages: {
    '100000000000001': 'global',
    '100000000000002': 'espana',
    '100000000000003': 'latam',
    '100000000000004': 'europa',
    '100000000000005': 'chile',
    '100000000000006': 'codigo_y_cambio',
    '100000000000007': 'beyond_the_resume',
  },
  ad_accounts: [
    { id: 'act_200000000000001', name: '4Geeks USA | USD', site: 'global', active: true },
    { id: 'act_200000000000002', name: '4Geeks España | USD', site: 'espana', active: true },
    { id: 'act_200000000000003', name: '4Geeks LATAM | USD', site: 'latam', active: true },
    { id: 'act_200000000000004', name: 'Backup - España - €', site: 'espana', active: false },
  ],
  tiktok: { '7000000000000000001': 'espana', '7000000000000000002': 'latam' },
});
