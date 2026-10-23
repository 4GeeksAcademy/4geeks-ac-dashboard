# 4Geeks AC Dashboard

Live lead & deal dashboard for 4Geeks Academy — USA, Spain, LATAM — pulled directly
from ActiveCampaign on demand (no data stored anywhere except a short in-memory cache).

## How it works

- `server.js` — Express app. `/api/summary` pulls deals + contacts from ActiveCampaign,
  joins them, classifies each deal as Won / Lost (classified) / Lost (no reason) / Active,
  and serves it as JSON. Results are cached in memory for `CACHE_TTL_SECONDS` (default 5 min)
  so opening the dashboard doesn't hammer the AC API.
- `public/` — the dashboard frontend (vanilla JS + Chart.js), fetches `/api/summary` and
  renders Overview / Compare Regions / Grouped-Pivot / Individual-deals tabs, same shape as
  the one-off LATAM dashboard this was built from.
- `lib/config.js` — **you must fill this in** with real ActiveCampaign IDs (pipelines →
  region, the lost-reason custom field, UTM/course/owner custom fields). Run the probe
  script below to get the real values from your account.

## 1. Local setup

```bash
cp .env.example .env
# edit .env: set AC_API_URL and AC_API_KEY (ActiveCampaign -> Settings -> Developer)
npm install
node scripts/probe-schema.js   # prints pipeline IDs, custom field IDs, etc.
```

Copy the relevant IDs from the probe output into `lib/config.js`
(`PIPELINE_REGION_MAP`, `LOST_REASON_FIELD_ID`, `CONTACT_FIELD_MAP`), then:

```bash
npm start
# open http://localhost:3000
```

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "4Geeks AC dashboard"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 3. Deploy on Railway

1. In Railway: New Project → Deploy from GitHub repo → select this repo.
2. Railway will detect the `Dockerfile` automatically.
3. In the Railway project's Variables tab, set:
   - `AC_API_URL`
   - `AC_API_KEY`
   - (optional) `CACHE_TTL_SECONDS`
4. Deploy. Railway gives you a public `*.up.railway.app` URL — that's your live dashboard.
   Add a custom domain later if you want.

## v2 (Sept 2026)

- **UI**: left sidebar navigation, English/Spanish toggle, light/dark/system theme,
  friendly filter bar (region, period presets, multi-select filters with counts,
  removable chips, "More filters" drawer), redesigned charts.
- **New filters**: admissions rep (owner names resolved from AC users), engagement
  score band (Deal Quality), lead score, lost reason (now populated), stage.
- **Overview**: day / week / month granularity (auto by range), win rate + loss rate,
  period-over-period deltas, admissions-rep leaderboard.
- **Lead details open instantly** from cached data; email engagement loads in the
  background on a separate "interactive" AC rate-limit lane (`AC_INTERACTIVE_RPS`,
  default 3/s) and AI coaching runs only when requested.
- **AI insights** can answer from Leads, Ads (4Geeks Center) or both, for the same
  region + period.
- **Fix**: deal custom fields (lost reasons, deal quality, feedback, won/lost dates)
  were never read because side-loaded rows use `deal`/`dealCustomFieldMetum` keys.
  Verify after deploy at `/api/diag/deal-fields?token=<token>`.
- **Security**: all data endpoints now require the dashboard login token
  (`/api/summary` was previously public). `/api/status` and `/api/load` stay open
  for the health check.
- Optional env: `AC_APP_URL` (defaults to `https://<account>.activehosted.com`,
  derived from `AC_API_URL`) for "Open in ActiveCampaign" links.

## Notes

- This app never stores lead data on disk — it's pulled fresh from ActiveCampaign into
  memory on each cache cycle. Restarting the service clears the cache.
- `/api/schema` is a safe-to-leave-live introspection endpoint (pipelines/custom fields
  only, no lead data) — useful if you need to re-check IDs after AC account changes.
- If you add authentication later (recommended before sharing the Railway URL widely,
  since deal/contact data includes PII), Railway supports simple env-var-gated basic auth
  middleware — ask and I'll wire it in.

## Proposal Studio (Oct 2026)

B2B proposals inside the dashboard (sidebar → **B2B → Proposal Studio**).

- **Intake → Claude draft → versions → branded PDF.** The team fills the deal intake
  (client, headcount, what they asked for, programs with people and price, call notes).
  "Draft with Claude" writes the proposal as structured JSON; "Ask Claude to change"
  applies one instruction and saves a new version. Every save is a version (v1, v2…)
  with author, note and source; any version can be opened, printed or duplicated
  for another client.
- **Always on brand.** Claude writes content only. `lib/proposals/render.js` lays it
  out with the 4Geeks brand kit (Inter, #2381FF, italic-blue key phrase, current
  logo in `public/brand/`). "Download PDF" opens the print dialog → Save as PDF.
  To swap in the high-resolution logo, replace `public/brand/4geeks-logo-dark.png`.
- **One source of truth.** `lib/proposals/library.js` holds programs, prices, proof
  points, ROI data with sources, payment terms and past deals. Admins can override
  any key via `PUT /api/proposal-library/:key`.
- **Users and roles (Admin → Users).** `admin` can do everything (approve/close/delete
  proposals, edit the library, manage users). `editor` uses the leads dashboard and
  Proposal Studio but can't approve, close, delete or manage users. Victor (editor) and
  Alejandro (admin) are created on first boot without a password: an admin sets it in
  Admin → Users (stored as a scrypt hash). The Railway login (`DASHBOARD_USER/PASS`, plus
  optional `DASHBOARD_USERS=name:pass[:admin]`) stays as the bootstrap admin.
  Set `TOKEN_SECRET` to a long random value.
- **Brief (1 page).** Built automatically from the same version: title, people in numbers,
  roadmap, investment table with the discount, next steps and contact. "Brief" button → Save as PDF.
- **Google Docs version.** The "Google Docs" button downloads an .html that Google Drive
  opens as an editable Google Doc (same content, Docs-native tables and headings).
- **Building blocks** Claude can use: stats, phases (roadmap), timeline (12-month Gantt),
  cards (with optional price tiers), tiers (volume pricing), tables, panels, checklists.
- **Storage.** Add a Railway Postgres service and set `DATABASE_URL`. Without it,
  proposals go to `./data/proposals.json` (fine locally, lost on redeploy).
- Model: `PROPOSALS_MODEL` (default `claude-opus-5-5`); needs `ANTHROPIC_API_KEY`.
- Build a PDF from the CLI: `node -e "…renderProposal(json)…"` then any HTML→PDF tool;
  `lib/proposals/seeds/deporvillage.json` is the reference example.

## Marketing Hub (Oct 2026)

The app is now the **4Geeks Marketing Hub**. Two new sections under *Content & events*:

- **Workshops & events** — calendar, list and results for every workshop / webinar /
  masterclass, by market (USA · Spain · LATAM). Each event has its links (Luma, 4Geeks
  landing, registration, recording, slides), a UTM link builder, a dated promo checklist
  (D-21 → D+7, overdue items flagged), results (registrations, attendees, leads,
  enrollments, cost) and one-click actions:
  - **Add promo posts to the social calendar** (announcement, teaser, reminder, day-of, recap).
  - **Write event copy with Claude** (description, announcement, reminder, email subject, follow-up).
  - **Luma**: paste any lu.ma / luma.com link to prefill an event. With `LUMA_API_KEY`
    (Luma Plus → Calendar → Settings → API keys) you also get **Import from Luma** and
    **Sync registrations** (approved guests + check-ins).
- **Social calendar** — organic posts per account: month calendar (events shown too),
  pipeline board (idea → drafting → design → ready → scheduled → published), plan view
  (funnel mix and pillar mix vs targets, posts per week vs target, **Plan the month with
  Claude**), history with per-post results and weekly account metrics (seeded with the
  @4geeksacademy weekly report), and shared settings (accounts, targets, mix, TOFU/MOFU/BOFU
  definitions, key links). Each post can be written with Claude.

Storage: `hub_items` table in the same Postgres (`DATABASE_URL`). Optional env:
`LUMA_API_KEY`, `HUB_SEED=0` to skip the metrics seed. Claude uses the existing `ANTHROPIC_API_KEY`.

## Press (Oct 2026)

Sidebar → **Marketing & AI → Press**: a read-only view of the press-release campaign
run in [4G Press](https://4gpress.duckdns.org) (releases in 19 countries, where they
got picked up, mentions of 4Geeks, links, spend and cost per appearance, and AI
visibility / GEO). Writing, sending and tracking releases stays in 4G Press; the
**Open 4G Press** button goes there (it has its own login).

- **Data.** `GET /api/press?pais=<ISO>` proxies 4G Press' public, read-only
  endpoint `/api/public/press-summary` with the `X-Api-Key` header. It never
  returns release bodies, internal notes or users. Cached 10 min; if 4G Press is
  down it serves the last good payload, marked as cached.
- **Config.** `PRESS_API_KEY` in Railway → Variables (optional: `PRESS_API_URL`,
  `PRESS_TTL_SECONDS`). Without the key the view shows "4G Press is not connected".
- **Who sees it.** Every signed-in user. To restrict it to admins, use
  `auth.requireAdmin` on `/api/press` in `server.js` and add `adminOnly: true` to
  the `press` entry of `NAV` in `public/dashboard.js`.

## Personal data (Oct 2026)

Lead names, emails and phones **never leave the server in clear**: the in-memory
ActiveCampaign cache keeps them (the dashboard needs them to compute), but every
JSON response under `/api` goes through `lib/pii.js`.

- **Hashed:** name, email, phone and deal title (usually the contact's name) become
  SHA-256 of the normalized value — email lowercase, phone digits only — the same
  rule as the 4Geeks CDP and as Google Ads / Meta customer match, so a lead has the
  same fingerprint everywhere. Emails and phone numbers written inside free text
  (feedback, notes) are hashed too; dates and amounts stay readable.
- **Partial, to recognise the lead:** `namePartial` ("Juan P."), `emailPartial`
  ("ju•••@gmail.com"), `phonePartial` ("+•••••• 456"), computed on the server. The
  full hash shows on hover.
- **Search** finds partial names as before, and an exact email or phone through its hash.
- **The lead drawer** no longer has email / call / WhatsApp buttons: contact the
  lead from **Open in ActiveCampaign**.
- **AI insights, lead coach and recommendations** get hashes only (no partials):
  templates carry `{first_name}`.
- **Not touched:** login, `/api/users` (the dashboard's own users) and Proposal
  Studio (B2B documents that must carry the client's contact).
- Tests: `npm test` (`node --test`, no extra dependencies).


## Brand redesign + Compare (Oct 2026)

- **Look:** same system as the 4Geeks decks, guides and Campaign Studio graphics —
  white surfaces, one dominant blue `#2381FF`, headline key word in italic blue,
  yellow section numbers / badges / CTA on blue, navy dark mode, pastel KPI cards,
  hairline borders, no gradients and no edge stripes. Tokens in `public/styles.css`,
  brand layer in `public/brand.css` (loaded last). Current logo pack in `public/brand/`.
  Chart colors follow the tokens: won = blue, open = slate, lost = red, lost without reason = amber.
- **Compare** replaces *Compare regions* and *Pivot / Group by* (removed; old links redirect).
  Pick a dimension — region, campaign, source, medium, location, course, admissions rep,
  test score, lost reason, stage or **period** (date ranges) — and up to 4 sets (A–D),
  each one or more values. You get a scorecard (best value highlighted, delta vs A),
  leads and win rate over time, outcome mix, a side-by-side breakdown by a second
  dimension, quick comparisons, a shareable URL (`cmp=` param) and "Explain the
  difference with AI". It respects every filter in the bar except the one being compared.

## Enrollments inside the Hub (Oct 2026)

Sidebar → **Pipeline → Enrollments** replaces the separate Enrollment Dashboard.
Sources per region:

- **USA — the "2026 USA DATA" sheet, tab ATTRIBUTION REPORT** (the one the USA
  team keeps and n8n "USA Won Sync" fills). Read through the n8n workflow
  *Marketing Hub — USA enrollments feed* (folder USA), which uses the existing
  Google Sheets credential and answers only with header `x-hub-key`.
  Env: `USA_ENROLL_FEED_URL`, `USA_ENROLL_FEED_KEY`. Each row is matched by
  email to the ActiveCampaign deal (pipeline 5) to add the admissions rep, name
  and the AC link. The sheet has no drops. Without the feed URL, USA falls back
  to AC pipeline 5.
- **Spain — ActiveCampaign pipeline 16 "4Geeks Madrid PT"**. B2B España is not counted.
- **LATAM — ActiveCampaign pipeline 67 "4Geeks Latinoamérica"**.
  (`ENROLL_PIPELINES`, default `16:Spain,67:LATAM`.)

For AC regions: deals with status **Won**, counted by **won date**, for deals
created since `ENROLL_SINCE` (default `2025-01-01`), pulled separately from the
6-month lead window. **Dropped** = won, then lost (won date set, status Lost) or
parked in a "BAJA" stage (Spain stage 1083).

Per enrollment: location, admissions rep, source, campaign, program, cohort
(Spain won stages) or plan (USA "ENR PLAN"), lead created date, converted date,
days to convert, ticket price in EUR/USD, status.

View: region and period (by enrollment date, month chips), KPIs vs previous
period (enrollments, tuition sold, avg ticket, drops, days to convert, top
source), stacked trend by week/month with drops, breakdowns by program, source,
location, rep and campaign (click to filter), sortable table with AC links,
CSV export. EUR → USD at `USD_PER_EUR` (1.08).

API: `GET /api/enrollments`, `POST /api/enrollments/refresh`; refreshed with the
main pull. Names, emails and phones are hashed like everywhere else.
Tests: `test/enrollments.test.js`.

## Proposal Studio — past proposals and the playbook

**Proposal Studio → Past proposals** takes the proposals sent before the Studio existed (PDF, Word .docx, PowerPoint .pptx, text; Google Docs/Slides via File → Download → PDF; up to 20 MB each). Each upload is stored (original file in Postgres), and Claude reads it once in the background and saves a digest: client, programs and prices, total, pricing model, terms, structure, the strongest lines, angles, strengths and weaknesses, and a condensed version. The team marks each one **won / lost / sent**.

Every new draft learns from them:

- **References**: the intake has a "Reference proposals" picker (uploaded and Studio proposals). Pinned ones are followed most closely; with none pinned, Claude gets the 3 most similar uploaded proposals (same language and words, won ones first).
- **Playbook**: Proposal Studio → Playbook → *Rebuild* has Claude read every past proposal (uploaded + Studio, with outcomes) and write the team's playbook: prices by program, what wins, what loses, lines that work, recommended structure, a pre-send checklist. Every draft reads it; admins can edit it.
- **Start from one**: on a past proposal, *Start a new client from this* creates a proposal whose intake carries its programs and prices and pins it as the reference; *Import as editable proposal* converts the original into an editable Studio proposal (versions, revisions, PDF, Google Docs).

The draft's version note says which past proposals it learned from. Needs `ANTHROPIC_API_KEY` (already used for drafting).

## Pipeline intelligence + interactive Recommendations (Oct 2026)

Why: the CRM fields don't say why qualified leads stop (USA: Offer Sent is never
filled, Lead Sentiment is empty for ~97% of leads, Feedback holds payment terms).
The why is in what reps write. `lib/pipeline/` reads it and acts on it.

- **Reads the conversation**: deal notes, contact notes and deal activities for
  every deal worth reading (open qualified first, then won and recently lost to
  learn from), on the slow background AC lane, re-read when the deal changes or
  daily. Stored in Postgres (`pipeline_items`, `pipeline_actions`).
- **Per-lead diagnosis (Claude)**: where it's stuck, who owes the next move
  ("Waiting on us"), objections, intent, next action, ready-to-send SMS / email /
  call opener. Only re-run when the conversation changed. Phones/emails are
  hashed before anything is sent to the AI.
- **Recommendations page**: intelligence strip (Very Good vs Good real win
  rates, waiting on us, quiet 8+ days, no notes, objections open vs won, won vs
  open medians, by rep) + a new "Waiting on us" list. USA "Ready to close" now
  uses F4/F5 stages and payment terms, not the never-filled Offer Sent date.
- **Work queue**: every lead has Script · Note · Move · Reassign · Snooze · Done
  · Lost. Note / Move / Reassign / Lost **write to ActiveCampaign** (signed
  "— user via Marketing Hub"). Bulk snooze / reassign / done / lost (max 500).
- **List advice**: must cite lead ids, compares with won leads, and says what
  changed since the previous advice (actions taken, leads moved). Follow-up
  questions per list.

Env (all optional): `INTEL_BATCH` (deals per tick, 25), `INTEL_TICK_SECONDS` (60),
`INTEL_AI_DAILY_MAX` (800), `INTEL_AI_CONCURRENCY` (2), `INTEL_MODEL`,
`INTEL_DISABLED=true` (emergency brake), `INTEL_CONTEXT_USA|SPAIN|LATAM`
(program facts the scripts may use).
Check progress at `/api/pipeline/status`; raw AC shapes for one deal at
`/api/pipeline/diag/<dealId>` (admin).

### Qualified leads → Google Ads

`lib/pipeline/ads-sync.js` posts every USA deal that reaches **Good** or **Very
Good** (created in the last `ADS_SYNC_LOOKBACK_DAYS`, default 30) to the n8n
workflow *USA Qualified Leads → Google Ads (Marketing Hub)*, once per deal and
tier. n8n uploads an offline click conversion to account 4759757599 (GCLID
first, hashed email fallback) into its own action per tier:
`USA Lead - Very Good (CRM, Marketing Hub)` (value $1,660) and
`USA Lead - Good (CRM, Marketing Hub)` (value $90) — values = observed win rate
× tuition. Both were created as **secondary** actions: they report but don't
steer bidding until someone makes them primary in Google Ads.
Env: `ADS_SYNC_WEBHOOK_URL`, `ADS_SYNC_KEY` (required to turn it on),
`ADS_SYNC_REGIONS` (USA), `ADS_VALUE_VERY_GOOD`, `ADS_VALUE_GOOD`,
`ADS_SYNC_DISABLED=true`. Status: `/api/pipeline/ads-sync`.
GCLID stays server-side (non-enumerable on the record, never in JSON).

### Speed (Oct 2026)
- `/api/summary` (~17 MB, every lead) is built once per data version and served
  pre-gzipped with an ETag: repeat loads get a 304, new loads skip ~0.6 s of
  server work.
- The redacted payload is saved to Postgres (`pipeline_blobs`, same hashed data
  the browser gets). After a deploy/restart the Hub opens instantly with the last
  data instead of waiting ~5 minutes for the first ActiveCampaign pull.
- Pipeline intelligence pauses while the main ActiveCampaign refresh runs, so it
  never slows the data down.

### Google Ads sync log
Marketing & AI → **Google Ads sync**: every qualified lead and its state
(pending, waiting for Google, uploaded, failed, can't be matched), the reason
for failures, retry one / retry all, and "send pending now". n8n reports
Google's answer to `POST /api/pipeline/ads-sync/result` (header `x-hub-key`).

## Proposal Studio — brand kit, styles, presentation and learning from finals

- **Brand kit built in** (`lib/proposals/brand-kit.js`): the rules of the team's Claude skills (4geeks-brand, 4geeks-yellow-touches, 4geeks-logo-pack, 4geeks-academy): tokens, logos (full-resolution pack from lali-repo `campaign-studio/assets`), yellow touches, voice, exact phrasing (Forbes, hiring-rate disclaimer) and terminology. The renderer draws with it, Claude writes with it, the brand check checks against it. See it in **Proposal Studio → Kit de marca**. When a skill changes, update this file and bump `VERSION`.
- **Styles** (`lib/proposals/styles.js`): each proposal has a style picked from a dropdown that names it in full; the one marked `current` is the default for new proposals. Today: *4Geeks 2026 · Azul + toques amarillos (actual)* (Deporvillage base + yellow touches + blue closing page) and *4Geeks Oct 2026 · Clásico Deporvillage (sin amarillo)*. Add a style there when the team settles on a new look; older styles stay selectable.
- **Presentation**: every version also renders as a 16:9 deck (`/proposals/:id/v/:n/deck`, Save as PDF in landscape) following the skill's deck recipe; the preview has a Document / Presentation switch.
- **Brand check** (`lib/proposals/brandcheck.js`): score and findings next to the preview (fill-ins left, headline accent and length, Forbes phrasing, hiring disclaimer, terminology, vosotros/ustedes, one blue panel per page, tables that add up, graduate count, closing contact). *Fix with Claude* applies the fixable ones as a new version; brand errors in a fresh draft get one automatic fix pass.
- **Learning from final versions**: marking a proposal *sent* or *won* freezes its latest version as the **final** (badge in the version list). Finals are the first examples every new draft imitates, and the playbook is rebuilt in the background comparing Claude's first draft with the final the team sent (plus the revision notes), so the next draft starts closer to what the team keeps. Set `PROPOSALS_AUTO_PLAYBOOK=0` to turn the automatic rebuild off.
- **Team rules**: when an admin asks Claude for a change, *Convertir en regla* makes that instruction apply to every future proposal (listed and removable in Kit de marca).

## Intelligence (Sales | Marketing)

The former Recommendations page is now **Intelligence**, with two tabs. Every number follows the page's filters (the browser sends the ids of the leads it shows).

- **Sales**: the action lists and Pipeline intelligence as before, plus **Lead score → real enrollment** (`lib/pipeline/scores.js`). A lead counts as enrolled when it matches the Enrollments section (USA attribution sheet, Spain/LATAM won deals) by deal id or email, not AC's Won stage. Per score: leads, enrolled, % enrolled, % of decided (enrolled ÷ enrolled + lost), still open, lost, enrolled but not marked Won in AC, median days to enroll; by month of entry; leads that enrolled without a Good/Very Good score, by program; and data to fix in AC (enrolled not marked Won, deals in a Won stage still open, Won in AC with no enrollment).
- **Score journeys**: ActiveCampaign keeps no history of the admissions score, so the app snapshots every lead's score after each refresh (`pipeline_blobs` id `score-history`) and shows the changes (Good → Very Good → Enrolled) from the day tracking started.
- **Marketing** (`lib/marketing/intel.js`, `public/marketing-intel.js`): by source, campaign or medium — leads and change vs the previous period of the same length, qualified %, junk %, enrolled, enrolled %, and (with a date range) spend and cost per enrollment from 4Geeks Center, matched to UTM campaigns by name. **Analyze with AI** writes 3–5 changes for this week from those numbers.
