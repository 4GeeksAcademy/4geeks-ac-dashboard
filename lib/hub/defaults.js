// ---------------------------------------------------------------------------
// Marketing Hub — defaults the team can override in the app (Settings).
// ---------------------------------------------------------------------------

const MARKETS = ['USA', 'Spain', 'LATAM'];
const PROGRAMS = ['AI Engineering', 'AI Fluency', 'AI Flex', 'Master AI Engineering', 'General / brand'];

// ---------------- Events ----------------
const EVENT_TYPES = ['workshop', 'webinar', 'masterclass', 'open_house', 'info_session', 'meetup', 'hackathon', 'demo_day', 'b2b_session'];
const EVENT_STATUSES = ['idea', 'planned', 'promoting', 'live', 'done', 'cancelled'];

// Promo plan: every task is relative to the event day (negative = before).
const EVENT_CHECKLIST = [
  { key: 'brief', label: 'Topic, speaker and goal defined', offset: -21 },
  { key: 'landing', label: '4Geeks landing / event page live', offset: -14 },
  { key: 'luma', label: 'Luma event published', offset: -14 },
  { key: 'utm', label: 'Tracked links (UTM) created', offset: -14 },
  { key: 'graphics', label: 'Graphics ready (Campaign Studio /campaign)', offset: -12 },
  { key: 'email_invite', label: 'Invitation email sent (ActiveCampaign / Brevo)', offset: -10 },
  { key: 'social_announce', label: 'Social announcement posted', offset: -10 },
  { key: 'ads', label: 'Paid boost live (if budget)', offset: -10 },
  { key: 'partners', label: 'Partners / communities / admissions notified', offset: -7 },
  { key: 'email_reminder', label: 'Reminder email (24h)', offset: -1 },
  { key: 'speaker_ready', label: 'Speaker, slides and demo tested', offset: -1 },
  { key: 'reminder_social', label: 'Day-of stories / reminders', offset: 0 },
  { key: 'recording', label: 'Recording saved and uploaded', offset: 1 },
  { key: 'followup', label: 'Follow-up email + replay + offer sent', offset: 1 },
  { key: 'leads_to_admissions', label: 'Attendee list sent to admissions', offset: 1 },
  { key: 'results', label: 'Results logged (registrations, attendees, leads, enrollments)', offset: 7 },
];

// Promo posts generated from an event (offsets in days from the event).
const EVENT_PROMO_POSTS = [
  { offset: -10, format: 'carousel', funnel: 'MOFU', pillar: 'events', hook: 'Announcement: what you will build / learn' },
  { offset: -5, format: 'reel', funnel: 'MOFU', pillar: 'events', hook: 'Teaser: the speaker shows a 15s result' },
  { offset: -1, format: 'story', funnel: 'MOFU', pillar: 'events', hook: 'Reminder: tomorrow — save your spot' },
  { offset: 0, format: 'story', funnel: 'MOFU', pillar: 'events', hook: 'We go live in 1 hour' },
  { offset: 2, format: 'reel', funnel: 'BOFU', pillar: 'events', hook: 'Recap + replay + next step (program)' },
];

// ---------------- Social ----------------
const CHANNELS = ['instagram', 'tiktok', 'linkedin', 'facebook', 'youtube', 'x', 'threads'];
const FORMATS = ['reel', 'carousel', 'static', 'story', 'short', 'video', 'live', 'text', 'article'];
const POST_STATUSES = ['idea', 'drafting', 'design', 'ready', 'scheduled', 'published', 'skipped'];
const FUNNEL = ['TOFU', 'MOFU', 'BOFU'];
const PILLARS = [
  { key: 'trends_fun', label: 'Trends & humor (AI / coding memes)' },
  { key: 'ai_tips', label: 'AI tips & tools (what AI can do)' },
  { key: 'student_stories', label: 'Student stories & outcomes' },
  { key: 'how_it_works', label: 'How it works / behind the build' },
  { key: 'program', label: 'Program features & offer' },
  { key: 'events', label: 'Workshops & events' },
  { key: 'seasonal', label: 'Seasonal offers (Halloween, Black Friday…)' },
];

const DEFAULT_SETTINGS = {
  accounts: [
    { key: 'usa_ig', market: 'USA', channel: 'instagram', handle: '@4geeksacademy', url: 'https://www.instagram.com/4geeksacademy/' },
    { key: 'usa_tt', market: 'USA', channel: 'tiktok', handle: '@4geeksacademy', url: '' },
    { key: 'usa_li', market: 'USA', channel: 'linkedin', handle: '4Geeks Academy', url: 'https://www.linkedin.com/school/4geeksacademy/' },
    { key: 'es_ig', market: 'Spain', channel: 'instagram', handle: '', url: '' },
    { key: 'latam_ig', market: 'LATAM', channel: 'instagram', handle: '', url: '' },
  ],
  // Posts per week the plan aims for, per channel.
  weekly_targets: { instagram: 5, tiktok: 4, linkedin: 3, facebook: 2, youtube: 1, x: 0, threads: 0 },
  // Target share of posts (percent) per funnel stage and per pillar.
  funnel_mix: { TOFU: 60, MOFU: 30, BOFU: 10 },
  pillar_mix: { trends_fun: 25, ai_tips: 20, student_stories: 15, how_it_works: 15, program: 10, events: 10, seasonal: 5 },
  funnel_definitions: {
    TOFU: '"Look what I did / what AI can do / my agent doing this" — no product, no VSL. Goal: follow, save, share, download a guide.',
    MOFU: '"Let\'s see how I did it / how it works / join the next workshop" — then the VSL.',
    BOFU: 'Purchase-oriented: program, offer, deadline, student results, apply.',
  },
  links: {
    program_comparison_en: 'https://4geeks.com/en/program-comparison',
    program_comparison_es: 'https://4geeks.com/es/program-comparison',
    vsl_en: 'https://4geeks.com/landing/ai-fluency-vsl',
    vsl_es: 'https://4geeks.com/landing/ai-fluency-vsl-gana-hasta-un-62-mas',
  },
  luma_calendar_url: '',
};

// Weekly account-level Instagram history already reported for @4geeksacademy.
const SEED_METRICS = [
  { account: 'usa_ig', week_start: '2026-09-01', followers: 6929, views: 9079, non_follower_pct: 80.8, viewers: 4932, interactions: 1209, accounts_engaged: 157, profile_visits: 94, link_taps: 8, top_post: '"me when I hit my Claude limit at 2pm on a Tuesday" reel — 2,587 views' },
  { account: 'usa_ig', week_start: '2026-09-22', followers: 6944, views: 13357, non_follower_pct: 85.7, viewers: 5210, interactions: 1382, accounts_engaged: 170, profile_visits: 102, link_taps: 9, top_post: '"Say it 1000 times" coding-joke reel — 3,761 views' },
  { account: 'usa_ig', week_start: '2026-09-29', followers: 6949, views: 10485, non_follower_pct: 88, viewers: 4505, interactions: 815, accounts_engaged: 135, profile_visits: 96, link_taps: 7, top_post: '"Sorry baby" coding-joke reel — 4,859 views' },
  { account: 'usa_ig', week_start: '2026-10-06', followers: 6949, views: 7619, non_follower_pct: 78.4, viewers: 3167, interactions: 1842, accounts_engaged: 79, profile_visits: 99, link_taps: 2, top_post: '"POV me asking Claude to review my quick fix" reel — 1,337 views; Claude Connectors carousel — 100 interactions' },
];

module.exports = { MARKETS, PROGRAMS, EVENT_TYPES, EVENT_STATUSES, EVENT_CHECKLIST, EVENT_PROMO_POSTS, CHANNELS, FORMATS, POST_STATUSES, FUNNEL, PILLARS, DEFAULT_SETTINGS, SEED_METRICS };
