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

## Notes

- This app never stores lead data on disk — it's pulled fresh from ActiveCampaign into
  memory on each cache cycle. Restarting the service clears the cache.
- `/api/schema` is a safe-to-leave-live introspection endpoint (pipelines/custom fields
  only, no lead data) — useful if you need to re-check IDs after AC account changes.
- If you add authentication later (recommended before sharing the Railway URL widely,
  since deal/contact data includes PII), Railway supports simple env-var-gated basic auth
  middleware — ask and I'll wire it in.
