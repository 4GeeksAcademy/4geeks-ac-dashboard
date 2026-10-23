'use strict';
// ---------------------------------------------------------------------------
// Pipeline intelligence.
//
// The dashboard used to reason only over CRM fields (stage, score, source),
// and for USA those fields don't say WHY a qualified lead stops: Offer Sent
// is never filled, Lead Sentiment is empty for 97% of leads, and "Feedback"
// holds payment terms. The why lives in what reps write: AC deal notes,
// contact notes and deal activities. This module:
//
//   1. reads that conversation for every deal worth reading (qualified
//      open deals first, then won and recently lost ones to learn from),
//      slowly, on the background AC lane, and keeps it in Postgres;
//   2. asks Claude for a per-lead stall diagnosis (where it's stuck, who
//      owes the next move, objection, next action, ready-to-send scripts) --
//      only when the conversation actually changed;
//   3. aggregates hard numbers (no AI) for the Recommendations page; and
//   4. builds grounded list advice that must cite lead ids, compares with
//      what won, and says what changed since the last advice.
// ---------------------------------------------------------------------------
const C = require('./classify');
const { redactText } = require('../pii');

const DAY = 86400000;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

const OBJECTIONS = ['price', 'financing', 'timing', 'schedule', 'job', 'family', 'outcomes_doubt', 'program_fit', 'competitor', 'ghosting', 'not_interested', 'other'];
const STUCK_AT = ['not_reached', 'first_contact', 'qualification', 'offer', 'financing', 'decision', 'paperwork', 'enrolled', 'lost'];
const NEXT_TYPES = ['call', 'sms', 'email', 'whatsapp', 'send_offer', 'send_financing', 'book_call', 'close_lost', 'wait'];

const PROGRAM_CONTEXT = {
  USA: process.env.INTEL_CONTEXT_USA || 'AI Engineering bootcamp (main program), tuition $15,999 with discounts, payment plans and loan financing available. Rolling enrollment: the next class always starts in about 2 weeks; a Foundation Sprint runs before the cohort.',
  Spain: process.env.INTEL_CONTEXT_SPAIN || 'Programas de 4Geeks Academy en Madrid (presencial y part-time), con financiación disponible.',
  LATAM: process.env.INTEL_CONTEXT_LATAM || 'Programas online de 4Geeks Academy para Latinoamérica (principalmente AI Engineering), con planes de pago.',
};
const langFor = (region) => (region === 'USA' ? 'English' : 'Spanish');

function safeJson(text) {
  if (!text) return null;
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}

function cleanDiagnosis(d) {
  if (!d || typeof d !== 'object') return null;
  const str = (v, n) => (v == null ? null : String(v).slice(0, n));
  const next = d.nextAction || {};
  return {
    summary: str(d.summary, 400),
    stuckAt: STUCK_AT.includes(d.stuckAt) ? d.stuckAt : null,
    ballInCourt: ['rep', 'lead', 'none'].includes(d.ballInCourt) ? d.ballInCourt : 'none',
    lastLeadSignal: str(d.lastLeadSignal, 300),
    objections: (Array.isArray(d.objections) ? d.objections : []).filter((o) => OBJECTIONS.includes(o)).slice(0, 4),
    objectionDetail: str(d.objectionDetail, 300),
    intent: Math.max(1, Math.min(5, Math.round(num(d.intent, 3)))),
    nextAction: {
      type: NEXT_TYPES.includes(next.type) ? next.type : 'call',
      when: ['today', 'this_week', 'next_week', 'later'].includes(next.when) ? next.when : 'this_week',
      why: str(next.why, 300),
    },
    scripts: {
      sms: str(d.scripts && d.scripts.sms, 400),
      emailSubject: str(d.scripts && (d.scripts.email_subject || d.scripts.emailSubject), 120),
      // Not "email": that key name is treated as personal data and hashed on the way out.
      emailBody: str(d.scripts && (d.scripts.email || d.scripts.emailBody), 1200),
      callOpener: str(d.scripts && (d.scripts.call_opener || d.scripts.callOpener), 400),
    },
    evidence: (Array.isArray(d.evidence) ? d.evidence : []).slice(0, 4).map((e) => ({ at: str(e && e.at, 20), note: str(e && (e.note || e.quote), 200) })),
    dataGaps: (Array.isArray(d.dataGaps) ? d.dataGaps : []).slice(0, 3).map((x) => str(x, 160)),
  };
}

function createIntel({ client, store, getRecords, getLookups, callClaude, log = console }) {
  const intel = new Map(); // dealId -> intel row
  const queueState = new Map(); // dealId -> { snoozeUntil, doneUntil, lastAction }
  const status = {
    loaded: false, running: false, lastTickAt: null, lastTickFetched: 0, lastError: null,
    aiToday: 0, aiDay: new Date().toISOString().slice(0, 10), aiRunning: 0, aiQueue: 0, aiErrors: 0,
  };
  const BATCH = num(process.env.INTEL_BATCH, 25);
  const TICK_MS = num(process.env.INTEL_TICK_SECONDS, 60) * 1000;
  const AI_DAILY_MAX = num(process.env.INTEL_AI_DAILY_MAX, 800);
  const AI_CONCURRENCY = num(process.env.INTEL_AI_CONCURRENCY, 2);
  const DISABLED = String(process.env.INTEL_DISABLED || '').toLowerCase() === 'true';
  const aiQueue = [];
  const aiPending = new Set();

  async function load() {
    try {
      (await store.all('intel')).forEach((row) => intel.set(String(row.id), row));
      (await store.all('state')).forEach((row) => queueState.set(String(row.id), row));
      status.loaded = true;
      log.log(`[intel] loaded ${intel.size} conversations, ${queueState.size} queue states (${store.kind})`);
    } catch (e) {
      status.lastError = `load: ${e.message}`;
      log.error('[intel] load failed:', e.message);
    }
  }

  const records = () => getRecords() || [];
  const recordById = (id) => records().find((r) => String(r.id) === String(id)) || null;

  function candidates() {
    const now = Date.now();
    return records()
      .map((r) => ({ r, p: C.candidatePriority(r, now) }))
      .filter((x) => x.p != null)
      .sort((a, b) => a.p - b.p || String(b.r.dealUpdatedAt || b.r.date).localeCompare(String(a.r.dealUpdatedAt || a.r.date)));
  }

  // ---- reading the conversation ----
  async function fetchConversation(r) {
    const { usersById, stagesById } = getLookups();
    const [dealNotes, contactNotes, activities] = await Promise.all([
      client.listDealNotes(r.id).catch((e) => { throw new Error(`deal notes: ${e.message}`); }),
      r.contactId ? client.listContactNotes(r.contactId).catch(() => []) : Promise.resolve([]),
      client.listDealActivities(r.id).catch(() => []),
    ]);
    const timeline = C.buildTimeline({ dealNotes, contactNotes, activities, usersById, stagesById }).slice(0, 40);
    const prev = intel.get(String(r.id)) || {};
    const row = {
      ...prev,
      dealId: String(r.id), contactId: r.contactId ? String(r.contactId) : null, region: r.region,
      fetchedAt: new Date().toISOString(), dealUpdatedAt: r.dealUpdatedAt || null,
      timeline, metrics: C.timelineMetrics(r, timeline), hash: C.timelineHash(r, timeline),
      raw: { dealNotes: dealNotes.length, contactNotes: contactNotes.length, activities: activities.length,
        activityTypes: [...new Set(activities.map((a) => `${a.dataType || '?'}/${a.dataAction || '?'}`))].slice(0, 12) },
    };
    delete row.id; delete row.updatedAt;
    intel.set(String(r.id), row);
    await store.put('intel', r.id, row);
    return row;
  }

  async function tick() {
    if (DISABLED || status.running || !client) return;
    if (!status.loaded) await load();
    const list = candidates();
    if (!list.length) return;
    status.running = true;
    status.lastTickAt = new Date().toISOString();
    let fetched = 0;
    try {
      const now = Date.now();
      const due = list.filter(({ r }) => C.needsRefresh(r, intel.get(String(r.id)), now)).slice(0, BATCH);
      for (const { r, p } of due) {
        try {
          const row = await fetchConversation(r);
          fetched++;
          if (row.hash !== row.diagnosisHash) enqueueDiagnosis(r, p);
        } catch (e) {
          status.lastError = `deal ${r.id}: ${e.message}`;
          if (/AC API 4\d\d/.test(e.message)) continue; // deleted / no access: skip this one
          break; // timeouts or 5xx: stop this tick, try again next minute
        }
      }
      // Conversations read earlier but never diagnosed (AI cap, restart...).
      list.forEach(({ r, p }) => {
        const row = intel.get(String(r.id));
        if (row && row.hash && row.hash !== row.diagnosisHash) enqueueDiagnosis(r, p);
      });
    } finally {
      status.running = false;
      status.lastTickFetched = fetched;
    }
  }

  // ---- AI diagnosis ----
  function enqueueDiagnosis(r, priority = 5) {
    const id = String(r.id);
    if (aiPending.has(id) || !process.env.ANTHROPIC_API_KEY) return;
    aiPending.add(id);
    aiQueue.push({ id, priority });
    aiQueue.sort((a, b) => a.priority - b.priority);
    status.aiQueue = aiQueue.length;
    pumpAi();
  }

  function pumpAi() {
    const today = new Date().toISOString().slice(0, 10);
    if (status.aiDay !== today) { status.aiDay = today; status.aiToday = 0; }
    while (status.aiRunning < AI_CONCURRENCY && aiQueue.length && status.aiToday < AI_DAILY_MAX) {
      const job = aiQueue.shift();
      status.aiQueue = aiQueue.length;
      status.aiRunning++;
      status.aiToday++;
      diagnose(job.id).catch((e) => { status.aiErrors++; status.lastError = `diagnose ${job.id}: ${e.message}`; })
        .finally(() => { status.aiRunning--; aiPending.delete(job.id); pumpAi(); });
    }
  }

  function leadProfile(r, row) {
    return {
      id: r.id, region: r.region, course: r.course, stage: r.stage, status: r.bucket,
      createdDate: r.date, owner: r.assignTo, admissionCodeTestScore: r.admissionsScore,
      conversationType: r.admissionsConversationType, leadSentiment: r.leadSentiment,
      dealClientComments: r.feedback, offerSentDate: r.offerSentDate, wonDate: r.wonDate, lostDate: r.lostDate,
      lostReasons: r.reasons, source: r.source, medium: r.medium,
      metrics: row.metrics,
    };
  }

  async function diagnose(id) {
    const r = recordById(id);
    const row = intel.get(String(id));
    if (!r || !row) return null;
    const lang = langFor(r.region);
    const system = `You are the admissions analyst for 4Geeks Academy. You read ONE lead's real conversation history from ActiveCampaign (rep notes, contact notes, stage changes, tasks) and say precisely where the sale is stuck and what to do next.
Program context (${r.region}): ${PROGRAM_CONTEXT[r.region] || PROGRAM_CONTEXT.USA}
Rules:
- Base every statement on the timeline and fields given. Never invent facts, prices, dates or names that are not there. If the notes are empty or say nothing useful, say so in summary and put what the rep should record in dataGaps.
- ballInCourt = "rep" when the lead asked a question, replied, requested info or was promised something and nothing from the rep came after; "lead" when the rep's last touch is waiting on the lead; "none" when closed or nothing pending.
- objections only from what the lead actually expressed (use "ghosting" for repeated no-answers after earlier engagement).
- Scripts must reference the specific situation from the notes (not generic), be in ${lang}, use {first_name} for the name, and must not include prices or deadlines unless they appear in the data.
- Reply with ONLY a JSON object, no prose, with exactly these keys:
{"summary":"one or two sentences: where this lead is and why it is stuck (${lang})",
 "stuckAt":"${STUCK_AT.join('|')}",
 "ballInCourt":"rep|lead|none",
 "lastLeadSignal":"what the lead last said or did, with date, or null",
 "objections":[${OBJECTIONS.map((o) => `"${o}"`).join(',')}],
 "objectionDetail":"short, in ${lang}, or null",
 "intent":1-5,
 "nextAction":{"type":"${NEXT_TYPES.join('|')}","when":"today|this_week|next_week|later","why":"short, in ${lang}"},
 "scripts":{"sms":"max 300 chars","email_subject":"...","email":"max 120 words","call_opener":"1-2 sentences"},
 "evidence":[{"at":"YYYY-MM-DD","note":"max 20 words paraphrased from the timeline"}],
 "dataGaps":["what is missing in the CRM to judge this lead, max 3"]}`;
    const content = `Lead:\n${JSON.stringify(leadProfile(r, row), null, 1)}\n\nTimeline (newest first):\n${row.timeline.slice(0, 30).map((e) => `- ${String(e.at).slice(0, 16).replace('T', ' ')} [${e.kind}] (${e.by}) ${redactText(e.note, true)}`).join('\n') || '(no notes or activities recorded)'}\n\nToday is ${new Date().toISOString().slice(0, 10)}.`;
    const text = await callClaude({ system, messages: [{ role: 'user', content }], maxTokens: 1200, model: process.env.INTEL_MODEL });
    const diagnosis = cleanDiagnosis(safeJson(text));
    if (!diagnosis) throw new Error('AI did not return valid JSON');
    const fresh = intel.get(String(id)) || row;
    const updated = { ...fresh, diagnosis, diagnosisHash: row.hash, diagnosedAt: new Date().toISOString() };
    intel.set(String(id), updated);
    await store.put('intel', id, updated);
    return updated;
  }

  /** Read one lead now (someone is looking at it) and re-diagnose if needed. */
  async function refreshOne(id, { force = false } = {}) {
    const r = recordById(id);
    if (!r) return null;
    let row = intel.get(String(id));
    if (force || C.needsRefresh(r, row)) row = await client.interactive(() => fetchConversation(r));
    if (row && (force || row.hash !== row.diagnosisHash) && process.env.ANTHROPIC_API_KEY) {
      row = (await diagnose(id)) || row;
    }
    return row;
  }

  // ---- queue state ----
  function stateFor(id) { return queueState.get(String(id)) || null; }
  async function setState(id, patch) {
    const next = { ...(queueState.get(String(id)) || {}), ...patch };
    delete next.id; delete next.updatedAt;
    queueState.set(String(id), next);
    await store.put('state', id, next);
    return next;
  }
  function hiddenUntil(id, now = Date.now()) {
    const s = stateFor(id);
    if (!s) return null;
    const until = [s.snoozeUntil, s.doneUntil].filter(Boolean).map((x) => Date.parse(x)).filter((x) => x > now);
    return until.length ? new Date(Math.max(...until)).toISOString() : null;
  }
  function markStale(id) {
    const row = intel.get(String(id));
    if (row) { row.fetchedAt = null; intel.set(String(id), row); }
  }

  // ---- numbers for the page (no AI) ----
  function insights(region = 'all') {
    const all = records().filter((r) => region === 'all' || r.region === region);
    const qualified = all.filter(C.isGood);
    const byScore = {};
    ['Very Good', 'Good'].forEach((s) => {
      const rows = all.filter((r) => r.admissionsScore === s);
      const won = rows.filter(C.isWon).length;
      byScore[s] = { total: rows.length, won, open: rows.filter(C.isOpen).length, winRate: rows.length ? won / rows.length : null };
    });
    const openQualified = qualified.filter(C.isOpen);
    const stageCounts = {};
    openQualified.forEach((r) => { const g = C.stageGroup(r.stage); stageCounts[g] = (stageCounts[g] || 0) + 1; });
    const wonQualified = qualified.filter(C.isWon).length;

    const withIntel = (rows) => rows.map((r) => ({ r, row: intel.get(String(r.id)) })).filter((x) => x.row && x.row.fetchedAt !== undefined && x.row.timeline);
    const openRead = withIntel(openQualified);
    const openDiag = openRead.filter((x) => x.row.diagnosis);
    const wonRead = withIntel(all.filter(C.isWon));

    const count = (arr, f) => { const m = {}; arr.forEach((x) => [].concat(f(x) || []).forEach((k) => { m[k] = (m[k] || 0) + 1; })); return m; };
    const silence = { '0-2': 0, '3-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
    openRead.forEach(({ row }) => {
      const d = row.metrics && row.metrics.daysSinceLastTouch;
      if (d == null) return;
      silence[d <= 2 ? '0-2' : d <= 7 ? '3-7' : d <= 14 ? '8-14' : d <= 30 ? '15-30' : '30+']++;
    });
    const noNotes = openRead.filter(({ row }) => !row.metrics || !row.metrics.notes).length;

    const reps = {};
    openQualified.forEach((r) => {
      const k = r.assignTo || 'Unassigned';
      const rr = reps[k] || (reps[k] = { rep: k, openQualified: 0, waitingOnUs: 0, quiet7: 0, read: 0 });
      rr.openQualified++;
      const row = intel.get(String(r.id));
      if (row && row.metrics) {
        rr.read++;
        if ((row.metrics.daysSinceLastTouch || 0) > 7) rr.quiet7++;
      }
      if (row && row.diagnosis && row.diagnosis.ballInCourt === 'rep') rr.waitingOnUs++;
    });

    const m = (arr, f) => C.median(arr.map(f));
    const cand = candidates().filter(({ r }) => region === 'all' || r.region === region);
    const fresh = cand.filter(({ r }) => { const row = intel.get(String(r.id)); return row && row.fetchedAt; }).length;
    const diagnosed = cand.filter(({ r }) => { const row = intel.get(String(r.id)); return row && row.diagnosis; }).length;

    return {
      region,
      generatedAt: new Date().toISOString(),
      byScore,
      qualified: { total: qualified.length, open: openQualified.length, won: wonQualified, lost: qualified.length - openQualified.length - wonQualified },
      stageCounts,
      coverage: { candidates: cand.length, read: fresh, diagnosed, openQualifiedRead: openRead.length, openQualifiedDiagnosed: openDiag.length },
      ballInCourt: count(openDiag, (x) => x.row.diagnosis.ballInCourt),
      stuckAt: count(openDiag, (x) => x.row.diagnosis.stuckAt),
      objectionsOpen: count(openDiag, (x) => x.row.diagnosis.objections),
      objectionsWon: count(wonRead.filter((x) => x.row.diagnosis), (x) => x.row.diagnosis.objections),
      nextActions: count(openDiag, (x) => x.row.diagnosis.nextAction && x.row.diagnosis.nextAction.type),
      silence,
      noNotes,
      compare: {
        won: { n: wonRead.length, firstTouchHours: m(wonRead, (x) => x.row.metrics.firstTouchHours), touches: m(wonRead, (x) => x.row.metrics.touches), notes: m(wonRead, (x) => x.row.metrics.notes) },
        open: { n: openRead.length, firstTouchHours: m(openRead, (x) => x.row.metrics.firstTouchHours), touches: m(openRead, (x) => x.row.metrics.touches), notes: m(openRead, (x) => x.row.metrics.notes), daysSinceLastTouch: m(openRead, (x) => x.row.metrics.daysSinceLastTouch), daysInStage: m(openRead, (x) => x.row.metrics.daysInStage) },
      },
      reps: Object.values(reps).sort((a, b) => b.openQualified - a.openQualified).slice(0, 12),
      sync: syncStatus(),
    };
  }

  function syncStatus() {
    return { ...status, conversations: intel.size, diagnosed: [...intel.values()].filter((x) => x.diagnosis).length, store: store.kind, disabled: DISABLED };
  }

  // Compact per-lead view for the browser and for list advice.
  function leadSummary(id) {
    const row = intel.get(String(id));
    if (!row) return null;
    const d = row.diagnosis;
    return {
      fetchedAt: row.fetchedAt, diagnosedAt: row.diagnosedAt || null, metrics: row.metrics || null,
      ballInCourt: d ? d.ballInCourt : null, stuckAt: d ? d.stuckAt : null, objections: d ? d.objections : [],
      intent: d ? d.intent : null, next: d ? d.nextAction : null, summary: d ? d.summary : null,
      stale: !!(row.hash && row.hash !== row.diagnosisHash),
    };
  }

  // ---- grounded list advice ----
  async function advice({ region = 'all', group, groupName, rule, ids = [], lang = 'en', question = '', user }) {
    const key = `${region}:${group}`;
    const previous = await store.get('advice', key);
    const now = Date.now();
    const rows = ids.map((id) => ({ r: recordById(id), row: intel.get(String(id)) })).filter((x) => x.r);
    const read = rows.filter((x) => x.row && x.row.metrics);
    const diag = read.filter((x) => x.row.diagnosis);
    const leadLines = rows.slice(0, 60).map(({ r, row }) => {
      const d = row && row.diagnosis;
      const mt = row && row.metrics;
      return [
        `#${r.id}`, r.assignTo || 'unassigned', r.stage, r.admissionsScore || 'no score',
        mt ? `last touch ${mt.daysSinceLastTouch}d ago by ${mt.lastTouchBy || '?'}` : 'conversation not read yet',
        mt ? `${mt.touches} touches, ${mt.daysInStage}d in stage` : '',
        d ? `ball:${d.ballInCourt} stuck:${d.stuckAt} obj:${(d.objections || []).join('/') || '-'} intent:${d.intent}` : '',
        d && d.summary ? `"${d.summary}"` : '',
      ].filter(Boolean).join(' | ');
    });
    const won = records().filter((r) => C.isWon(r) && (region === 'all' || r.region === region))
      .map((r) => ({ r, row: intel.get(String(r.id)) })).filter((x) => x.row && x.row.diagnosis).slice(0, 15)
      .map(({ r, row }) => `#${r.id} ${r.admissionsScore || ''} | first touch ${row.metrics.firstTouchHours ?? '?'}h, ${row.metrics.touches} touches | obj overcome: ${(row.diagnosis.objections || []).join('/') || '-'} | ${row.diagnosis.summary || ''}`);

    // What happened since the previous advice: actions taken + where its leads are now.
    let since = null;
    if (previous && previous.at) {
      const acts = await store.actionsSince(previous.at).catch(() => []);
      const idSet = new Set((previous.snapshot || []).map((s) => String(s.id)));
      const mine = acts.filter((a) => idSet.has(String(a.dealId)));
      const moved = { stage: 0, won: 0, lost: 0, gone: 0 };
      (previous.snapshot || []).forEach((s) => {
        const r = recordById(s.id);
        if (!r) { moved.gone++; return; }
        if (r.bucket === 'Won' && s.bucket !== 'Won') moved.won++;
        else if (/Lost/.test(r.bucket) && !/Lost/.test(s.bucket)) moved.lost++;
        else if (r.stage !== s.stage) moved.stage++;
      });
      const byType = {};
      mine.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + 1; });
      since = { at: previous.at, previousSize: (previous.snapshot || []).length, nowSize: rows.length, actions: byType, moved, previousText: String(previous.text || '').slice(0, 1500) };
    }

    const ins = insights(region);
    const system = `You are the head of admissions analytics at 4Geeks Academy. You advise on ONE action list of leads, using real CRM data and AI readings of each lead's conversation.
Hard rules:
- Every recommendation must name specific leads as #<id> (from the list below) and use numbers from the data. Never write advice that would fit any sales team.
- Prefer what the conversation data shows (ball in our court, objections, days of silence) over CRM fields.
- Compare with what the WON leads had in common when it explains something.
- If conversations are not read yet or notes are empty, say how many and what that prevents you from knowing; don't fill gaps with assumptions.
- ${since ? 'Open with "What changed since last time" using the "since" data: actions taken, leads that moved, and whether the previous advice was followed. If nothing was done, say so plainly.' : 'This is the first advice for this list.'}
- Max ~220 words. Markdown with these bold headings: ${since ? '**What changed since last time**, ' : ''}**What the data says**, **Do today**, **Pattern to fix**.
- Answer in ${lang === 'es' ? 'Spanish' : 'English'}.`;
    const content = `List: ${groupName} (${rows.length} leads). Rule: ${rule}. Region: ${region}.
Conversations read: ${read.length}/${rows.length}; AI-diagnosed: ${diag.length}.
Ball in court (diagnosed): ${JSON.stringify(count(diag, (x) => x.row.diagnosis.ballInCourt))}
Objections (diagnosed): ${JSON.stringify(count(diag, (x) => x.row.diagnosis.objections))}
Stuck at: ${JSON.stringify(count(diag, (x) => x.row.diagnosis.stuckAt))}
Median days since last touch: ${C.median(read.map((x) => x.row.metrics.daysSinceLastTouch)) ?? 'n/a'}; leads with zero notes: ${read.filter((x) => !x.row.metrics.notes).length}
Region benchmarks: Very Good ${JSON.stringify(ins.byScore['Very Good'])}, Good ${JSON.stringify(ins.byScore.Good)}; won vs open medians ${JSON.stringify(ins.compare)}
Leads (first ${leadLines.length}):
${leadLines.join('\n')}

Won leads (what worked):
${won.join('\n') || '(none diagnosed yet)'}
${since ? `\nSince previous advice (${since.at.slice(0, 10)}): ${JSON.stringify({ previousSize: since.previousSize, nowSize: since.nowSize, actions: since.actions, moved: since.moved })}\nPrevious advice was:\n${since.previousText}` : ''}
${question ? `\nThe manager asks: ${question}` : ''}`;
    const text = await callClaude({ system, messages: [{ role: 'user', content }], maxTokens: 1100 });
    const record = {
      at: new Date(now).toISOString(), user: user || null, region, group, lang, question: question || null, text,
      snapshot: rows.slice(0, 300).map(({ r }) => ({ id: String(r.id), stage: r.stage, bucket: r.bucket })),
      basis: { leads: rows.length, read: read.length, diagnosed: diag.length },
    };
    if (!question) await store.put('advice', key, record); // follow-up questions don't replace the baseline
    return { text, basis: record.basis, since: since ? { at: since.at, actions: since.actions, moved: since.moved } : null, previousAt: previous ? previous.at : null };
    function count(arr, f) { const o = {}; arr.forEach((x) => [].concat(f(x) || []).forEach((k) => { o[k] = (o[k] || 0) + 1; })); return o; }
  }

  async function lastAdvice(region, group) {
    return store.get('advice', `${region}:${group}`);
  }

  function start() {
    if (DISABLED || !client) { log.log('[intel] disabled'); return; }
    load().then(() => {
      setTimeout(() => tick().catch((e) => { status.lastError = e.message; }), num(process.env.INTEL_START_DELAY_SECONDS, 30) * 1000);
      setInterval(() => tick().catch((e) => { status.lastError = e.message; }), TICK_MS);
    });
  }

  return {
    start, tick, load, refreshOne, diagnose, insights, leadSummary, advice, lastAdvice,
    get: (id) => intel.get(String(id)) || null,
    stateFor, setState, hiddenUntil, markStale, syncStatus,
    logAction: (a) => store.logAction(a),
    actionsFor: (id) => store.actionsFor(id),
    allStates: () => Object.fromEntries(queueState),
    summaries: (ids) => Object.fromEntries(ids.map((id) => [String(id), leadSummary(id)]).filter(([, v]) => v)),
  };
}

module.exports = { createIntel, cleanDiagnosis, safeJson, OBJECTIONS, STUCK_AT, NEXT_TYPES };
