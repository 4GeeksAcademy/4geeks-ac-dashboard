require('dotenv').config();
const express = require('express');
const path = require('path');
const { ActiveCampaignClient } = require('./lib/ac-client');
const { buildDataset } = require('./lib/analysis');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 300);
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

// How far back to pull deals/contacts from ActiveCampaign. The account has
// ~47k deals across all pipelines going back years -- pulling everything is
// slow and, worse, silently truncates data for whichever pipeline sorts last
// once AC's pagination cap is hit (this is what caused LATAM lost reasons to
// show up empty). Scoping to a rolling window keeps requests complete for
// the window that actually matters day-to-day.
const DATA_WINDOW_MONTHS = Number(process.env.DATA_WINDOW_MONTHS || 6);
const DATA_WINDOW_MS = DATA_WINDOW_MONTHS * 30 * 24 * 60 * 60 * 1000;

let client;
try {
    client = new ActiveCampaignClient({ apiUrl: process.env.AC_API_URL, apiKey: process.env.AC_API_KEY });
} catch (e) {
    console.warn(`[startup] ${e.message} -- /api routes will return 500 until env vars are set.`);
}

// The ActiveCampaign pull (deals + contacts + per-deal/per-contact custom
// field data for the whole window) can take a couple of minutes on a cold
// cache -- longer than Railway's edge proxy will hold a request open. So we
// NEVER do this fetch inline inside a request handler. A background loop
// keeps `cache.records` warm; route handlers only ever read whatever is
// currently cached and return immediately.
let cache = { at: 0, records: null };
let refreshing = false;
let lastError = null;

async function refreshCache() {
    if (!client || refreshing) return;
    refreshing = true;
    const startedAt = Date.now();
    try {
          const windowStart = new Date(startedAt - DATA_WINDOW_MS).toISOString().slice(0, 10);

      const [deals, contactsRaw] = await Promise.all([
              client.listDeals({ createdAfter: windowStart }),
              client.listContacts({ createdAfter: windowStart }),
            ]);

      const dealIds = deals.map((d) => d.id);
          const contactIds = contactsRaw.map((c) => c.id);

      const [dealCustomFieldData, fieldValuesRaw] = await Promise.all([
              client.listDealCustomFieldDataForDeals(dealIds),
              client.listContactFieldValuesForContacts(contactIds),
            ]);

  const contactsById = new Map(contactsRaw.map((c) => [String(c.id), c]));
      const contactFieldValuesById = new Map();
      fieldValuesRaw.forEach((fv) => {
          const key = String(fv.contact);
          if (!contactFieldValuesById.has(key)) contactFieldValuesById.set(key, []);
          contactFieldValuesById.get(key).push(fv);
      });

  const records = buildDataset({ deals, dealCustomFieldData, contactsById, contactFieldValuesById });
      cache = { at: Date.now(), records };
      lastError = null;
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[refresh] ok -- ${records.length} records (${deals.length} deals, ${contactsRaw.length} contacts) in ${secs}s`);
    } catch (e) {
      lastError = e.message;
      console.error(`[refresh] failed: ${e.message}`);
    } finally {
      refreshing = false;
    }
}

if (client) {
  refreshCache();
  setInterval(refreshCache, CACHE_TTL_MS);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// Simple auth middleware
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'password';

function requireAuth(req, res, next) {
  const token = req.headers['x-dashboard-token'];
  if (!token || token !== process.env.DASHBOARD_TOKEN) {
    // Check if they're trying to login
    return res.status(401).json({ error: 'Unauthorized', needsAuth: true });
  }
  next();
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === DASHBOARD_USER && password === DASHBOARD_PASS) {
    // In production, use proper JWT or session tokens
    const token = Buffer.from(`${DASHBOARD_USER}:${Date.now()}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});


app.get('/api/status', (req, res) => {
  res.json({
    ready: !!cache.records,
    refreshing,
    lastUpdated: cache.at ? new Date(cache.at).toISOString() : null,
    dataWindowMonths: DATA_WINDOW_MONTHS,
    lastError,
  });
});

app.get('/api/summary', (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  if (!cache.records) {
    return res.status(202).json({ ready: false, refreshing, lastError });
  }
  const region = req.query.region;
  const records = region ? cache.records.filter((r) => r.region === region) : cache.records;
  res.json({
    records,
    generatedAt: new Date(cache.at).toISOString(),
    cacheAgeSeconds: Math.round((Date.now() - cache.at) / 1000),
    dataWindowMonths: DATA_WINDOW_MONTHS,
  });
});

app.post('/api/refresh', (req, res) => {
  refreshCache();
  res.json({ started: true, refreshing: true });
});

app.get('/api/schema', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
  try {
    const [pipelines, stages, dealFields, contactFields] = await Promise.all([
      client.listPipelines(),
      client.listDealStages(),
      client.listDealCustomFieldMeta(),
      client.listContactCustomFieldMeta(),
      ]);
    res.json({ pipelines, stages, dealFields, contactFields });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Free-text "ask AI" panel on the dashboard. The client sends the question
// plus an already-aggregated JSON summary of whatever is currently filtered
// on screen (not the raw record list -- keeps token usage sane even when
// thousands of deals are in view). Requires ANTHROPIC_API_KEY to be set.
app.post('/api/ask', async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    }
    const { question, context } = req.body || {};
    if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'question is required' });
    }
    try {
        const system = 'You are a sharp, concise data analyst helping the 4Geeks Academy admissions/sales team read their ActiveCampaign deal pipeline. You are given a JSON summary of the deals currently shown on their dashboard (already filtered to what they are looking at) -- counts, breakdowns by region/source/campaign/etc, and a small sample of individual deals. Answer the question using ONLY this data. Cite concrete numbers and percentages. If the data cannot answer the question, say so plainly instead of guessing. Keep the answer tight -- a short paragraph or a few bullet points, not a full report.';
        const userContent = `Question: ${question}\n\nDashboard data (JSON):\n${JSON.stringify(context || {})}`;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                max_tokens: 1024,
                system,
                messages: [{ role: 'user', content: userContent }],
            }),
        });
        if (!r.ok) {
            const errText = await r.text();
            return res.status(502).json({ error: `Anthropic API error (${r.status}): ${errText.slice(0, 300)}` });
        }
        const data = await r.json();
        const answer = (data.content || []).map((b) => b.text || '').join('\n').trim();
        res.json({ answer });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lead Coach: AI-powered coaching for a specific lead
// Provides insights about engagement, scoring, and personalized email/SMS templates
app.post('/api/lead-coach', async (req, res) => {
    if (!client) {
        return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
    }

    const { leadId, question } = req.body || {};
    if (!leadId) {
        return res.status(400).json({ error: 'leadId is required' });
    }

    try {
        // 1. Fetch deal and contact
        const deal = await client.getDeal(leadId);
        if (!deal) {
            return res.status(404).json({ error: 'Deal not found' });
        }

        const contact = await client.getContact(deal.contact);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // 2. Fetch custom field data
        const dealCustomFieldData = await client.listDealCustomFieldDataForDeal(leadId);
        const contactFieldValues = await client.listContactFieldValues(contact.id);

        // Helper to get deal custom field value
        const getDealField = (fieldId) => {
            const hit = dealCustomFieldData.find((row) => String(row.customFieldId) === String(fieldId));
            return hit ? hit.fieldValue : null;
        };

        // Helper to get contact custom field value
        const getContactField = (mappedName) => {
            const { CONTACT_FIELD_MAP } = require('./lib/config');
            for (const [fieldId, name] of Object.entries(CONTACT_FIELD_MAP)) {
                if (name !== mappedName) continue;
                const hit = contactFieldValues.find((v) => String(v.field) === String(fieldId));
                if (hit) return hit.value || null;
            }
            return null;
        };

        // 3. Fetch email engagement
        const emailEngagement = await client.getContactEmailEngagement(contact.id);
        const engagementTimeline = await client.buildContactEngagementTimeline(contact.id);

        // 4. Fetch config for region mapping
        const { PIPELINE_REGION_MAP, DEAL_FIELD_MAP } = require('./lib/config');
        const region = PIPELINE_REGION_MAP[String(deal.group)] || 'Unknown';

        // 5. Build comprehensive lead profile
        const leadProfile = {
            id: deal.id,
            contactId: contact.id,
            name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown',
            email: contact.email || null,
            phone: contact.phone || null,
            course: getContactField('course'),
            region,
            dealValue: deal.value ? Number(deal.value) / 100 : 0,
            dealStage: deal.stage || null,
            dealStatus: deal.status === 1 ? 'Won' : deal.status === 2 ? 'Lost' : 'Active',
            dealTitle: deal.title || null,
            assignedTo: deal.owner || null,
            createdDate: deal.cdate ? deal.cdate.slice(0, 10) : null,

            // Engagement metrics
            engagement: {
                emailsEngaged: emailEngagement.opened + emailEngagement.clicked,
                emailsOpened: emailEngagement.opened,
                emailOpenRate: Number(emailEngagement.openRate),
                linksClicked: emailEngagement.clicked,
                clickRate: Number(emailEngagement.clickRate),
                lastEmailDate: emailEngagement.lastEmailDate ? emailEngagement.lastEmailDate.slice(0, 10) : null,
                trackingAvailable: !emailEngagement.unavailable,
                timeline: engagementTimeline,
            },

            // Custom fields - prioritized for coaching
            customFields: {
                admissionsScore: getContactField('admissionsTestScore'),
                classification: getContactField('classification'),
                conversationType: getContactField('admissionsConversationType'),
                leadSentiment: getContactField('leadSentiment'),
                dealQuality: getDealField(DEAL_FIELD_MAP.dealQuality),
                feedback: getDealField(DEAL_FIELD_MAP.dealClientComments),
                offerSentDate: getDealField(DEAL_FIELD_MAP.offerSentDate),
                wonDate: getDealField(DEAL_FIELD_MAP.wonDate),
                lostDate: getDealField(DEAL_FIELD_MAP.lostDate),
                source: getContactField('utmSource'),
                campaign: getContactField('utmCampaign'),
            },
        };

        // 6. Call Claude with lead coaching prompt
        const coachingSystem = `You are an expert sales coach helping 4Geeks Academy admissions reps close more deals. You are given a specific lead's profile including their email engagement, custom scoring, and interaction history.

Your job is to:
1. **Analyze** — Why does this lead matter right now? What signals suggest they're ready to move forward (or stuck)?
2. **Recommend** — What should the rep do next? (Send offer, schedule call, provide financing info, etc.)
3. **Draft** — Generate 2 personalized templates they can copy and send TODAY:
   - A warm, personalized EMAIL addressing their specific situation, interests, and engagement level
   - A brief SMS they could send same-day (under 60 characters)

Use their name, course interest, engagement patterns, and signals from custom fields (sentiment, quality score, classification) to make templates feel personal and timely. If they've opened emails about financing but haven't replied, mention financing in your email. If their admission score is high, emphasize their qualification.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

**Analysis:**
[2-3 sentence analysis of where this lead stands]

**Next Steps:**
- [Action 1]
- [Action 2]

**EMAIL TEMPLATE:**
Subject: [subject line]

[Email body - max 100 words]

**SMS TEMPLATE:**
[SMS text - max 60 characters]`;

        const userContent = `Lead Profile:\n${JSON.stringify(leadProfile, null, 2)}${question ? `\n\nLead Rep Question: ${question}` : ''}`;

        const claudeReq = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                max_tokens: 2048,
                system: coachingSystem,
                messages: [{ role: 'user', content: userContent }],
            }),
        });

        if (!claudeReq.ok) {
            const errText = await claudeReq.text();
            return res.status(502).json({ error: `Anthropic API error (${claudeReq.status}): ${errText.slice(0, 300)}` });
        }

        const claudeData = await claudeReq.json();
        const coachingText = (claudeData.content || []).map((b) => b.text || '').join('\n').trim();

        // 7. Parse templates from Claude response
        const parseTemplates = (text) => {
            const emailMatch = text.match(/\*\*EMAIL TEMPLATE:\*\*\n([\s\S]*?)(?=\*\*SMS TEMPLATE:|$)/);
            const smsMatch = text.match(/\*\*SMS TEMPLATE:\*\*\n([\s\S]*?)$/);

            return {
                email: emailMatch ? emailMatch[1].trim() : '',
                sms: smsMatch ? smsMatch[1].trim() : '',
            };
        };

        const templates = parseTemplates(coachingText);

        // 8. Return complete response
        res.json({
            lead: leadProfile,
            aiCoaching: {
                fullAnalysis: coachingText,
                templates,
            },
        });
    } catch (e) {
        console.error('[lead-coach] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Lead Recommendations: Analyze leads and group by recommended action
app.post('/api/recommendations', async (req, res) => {
    if (!client) {
        return res.status(500).json({ error: 'AC_API_URL / AC_API_KEY not configured' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    try {
        // Get current filtered records (already in cache from dashboard)
        if (!cache.records) {
            return res.status(202).json({ ready: false, refreshing });
        }

        const records = cache.records;

        // Categorize leads by recommended action
        const today = new Date();
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const recommendations = {
            needsContact: [], // Active deals, no recent activity (> 30 days), low engagement
            needsFollowUp: [], // Engaged (opened emails), no offer yet, good scores
            atRisk: [], // Active > 60 days, declining engagement
            readyToClose: [], // High scores, recent engagement, no won yet
            wonRecently: [], // Won in last 7 days
            lostNeedAnalysis: [], // Lost but no reason recorded
        };

        records.forEach((r) => {
            // Skip already won deals
            if (r.bucket === 'Won') {
                if (r.date && r.date >= sevenDaysAgo) {
                    recommendations.wonRecently.push(r);
                }
                return;
            }

            // Skip already lost deals with reasons
            if (r.bucket === 'Lost - Classified') return;

            // Lost without reason - needs analysis
            if (r.bucket === 'Lost - Unclassified') {
                recommendations.lostNeedAnalysis.push(r);
                return;
            }

            // Active deals - categorize by engagement & time
            const daysSinceCreated = r.date ? Math.floor((today - new Date(r.date)) / (1000 * 60 * 60 * 24)) : 999;
            const hasOffer = r.offerSentDate ? true : false;
            const engagementScore = (r.admissionsScore || 0) + (r.dealQuality || 0);
            const recentlyEngaged = r.date && r.date >= thirtyDaysAgo;

            if (hasOffer && engagementScore >= 12 && recentlyEngaged) {
                // High engagement + offer sent + recent = ready to close
                recommendations.readyToClose.push(r);
            } else if (recentlyEngaged && !hasOffer && engagementScore >= 10) {
                // Engaged, good scores, no offer = needs follow-up with offer
                recommendations.needsFollowUp.push(r);
            } else if (daysSinceCreated > 60 && !recentlyEngaged) {
                // Old deal, no recent engagement = at risk
                recommendations.atRisk.push(r);
            } else if (!recentlyEngaged || daysSinceCreated > 30) {
                // No recent activity or aged = needs contact
                recommendations.needsContact.push(r);
            }
        });

        // Generate AI summary for each group using Claude
        const generateGroupSummary = async (groupName, leads) => {
            if (leads.length === 0) return null;

            const summary = {
                name: groupName,
                count: leads.length,
                leads: leads.slice(0, 5), // Top 5 per group
                recommendation: '',
            };

            if (process.env.ANTHROPIC_API_KEY) {
                try {
                    const context = {
                        groupName,
                        count: leads.length,
                        sampleLeads: leads.slice(0, 3).map(l => ({
                            name: l.name,
                            email: l.email,
                            course: l.course,
                            admissionsScore: l.admissionsScore,
                            dealQuality: l.dealQuality,
                            lastActivity: l.date,
                            sentiment: l.leadSentiment,
                        })),
                    };

                    const prompts = {
                        needsContact: 'These leads have been in the pipeline but not engaged recently. What should the admissions team prioritize for outreach?',
                        needsFollowUp: 'These leads are engaged but havent received an offer yet. What should be sent to convert them?',
                        atRisk: 'These leads are at risk of being lost due to inactivity. What interventions would help re-engage them?',
                        readyToClose: 'These leads are highly engaged with offers sent. What final actions should close these deals?',
                        wonRecently: 'These deals were won recently. What should the success team do next?',
                        lostNeedAnalysis: 'These lost deals have no reason recorded. What common patterns might explain why they failed?',
                    };

                    const question = prompts[groupName] || 'What recommendations do you have for this group of leads?';

                    const r = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-api-key': process.env.ANTHROPIC_API_KEY,
                            'anthropic-version': '2023-06-01',
                        },
                        body: JSON.stringify({
                            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
                            max_tokens: 512,
                            system: 'You are an expert sales coach for 4Geeks Academy. Provide concise, actionable recommendations for admissions teams based on lead data. Be specific about next steps and priorities.',
                            messages: [{ role: 'user', content: `${question}\n\nLead Group Data:\n${JSON.stringify(context, null, 2)}` }],
                        }),
                    });

                    if (r.ok) {
                        const data = await r.json();
                        summary.recommendation = (data.content || []).map((b) => b.text || '').join('\n').trim();
                    }
                } catch (e) {
                    console.warn(`[recommendations] Claude error for ${groupName}: ${e.message}`);
                }
            }

            return summary;
        };

        // Generate summaries for all groups in parallel
        const summaries = await Promise.all([
            generateGroupSummary('needsContact', recommendations.needsContact),
            generateGroupSummary('needsFollowUp', recommendations.needsFollowUp),
            generateGroupSummary('atRisk', recommendations.atRisk),
            generateGroupSummary('readyToClose', recommendations.readyToClose),
            generateGroupSummary('wonRecently', recommendations.wonRecently),
            generateGroupSummary('lostNeedAnalysis', recommendations.lostNeedAnalysis),
        ]);

        res.json({
            summary: {
                totalDeals: records.length,
                active: records.filter(r => r.bucket === 'Active / Other').length,
                won: records.filter(r => r.bucket === 'Won').length,
                lost: records.filter(r => r.bucket.includes('Lost')).length,
            },
            groups: summaries.filter(Boolean),
        });
    } catch (e) {
        console.error('[recommendations] error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`4Geeks AC dashboard listening on :${PORT}`));
