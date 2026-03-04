# LinkedIn Outreach - Team How-To Guide

> Last updated: March 2026

## What This System Does

The LinkedIn Outreach system is a fully automated pipeline that finds potential clients on LinkedIn, writes personalized messages, and sends them - all from one dashboard.

**The flow:**

```
Import Leads -> Enrich (find emails/websites) -> Qualify & Score -> Generate Messages
-> Review Daily Batch -> Approve -> Send via LinkedIn -> Track Responses -> Book Meetings
```

**Three AI agents work behind the scenes:**

| Agent | What it does |
|-------|-------------|
| **Scout** | Finds emails (Hunter.io, Snov.io), validates websites, discovers company info |
| **Qualifier** | Checks if the lead is a real fit - scores them 0-100, filters out false positives |
| **Outreach** | Writes personalized messages using a 10-step template sequence, runs A/B tests |

**Browser automation** sends approved messages directly on LinkedIn using an anti-detection browser on our server. You don't need to copy-paste messages manually.

---

## Running Two Niches in Parallel

The system supports multiple users running independent outreach campaigns at the same time - for example, one person doing outreach to **balloon decorators** and another to **magicians**.

### How it works

- Each niche operator needs their own **KM Boards account** (separate login)
- All data is completely isolated - leads, templates, messages, settings, budget, costs
- Both users go to the same URL (https://kmboards.co/outreach) but only see their own data
- Each user writes their own message templates tailored to their niche
- Each user sets their own daily limits, budget cap, and warm-up schedule

### LinkedIn browser sessions

The server currently runs **one LinkedIn browser session at a time**. If both niches need to send on the same day:

- **Option A (recommended)**: Time-slot it - niche A sends in the morning, niche B sends in the afternoon
- **Option B**: Set up a second browser session on the server (ask the dev team)

Each niche needs its own LinkedIn account logged into the browser.

### What needs to change per niche

| Setting | Magicians (current) | Balloon Decorators (needs setup) |
|---------|---------------------|----------------------------------|
| Approved job titles | magician, illusionist, entertainer, mentalist | balloon artist, balloon decorator, balloon designer, event decorator |
| Message templates | Magic/entertainment focused | Balloon/event decor focused |
| LinkedIn account | Your magician outreach account | A separate LinkedIn account |
| Budget cap | Set per user | Set per user |

> Note: The approved job titles for qualification are currently configured for magicians. For balloon decorators, the dev team needs to make a quick code update to add balloon-related titles. This is a 5-minute change.

---

## Getting Started

1. Go to **https://kmboards.co** and log in (or create an account)
2. Click **LinkedIn Outreach** in the left sidebar
3. You'll land on the **Dashboard** - your home base

### First-time setup

Before importing leads, configure your settings:

1. Go to **Settings** (https://kmboards.co/outreach/settings)
2. Set your **warm-up week** to 1 (starts with 5 sends/day, increases each week)
3. Set your **daily send limit** (max 25 when fully warmed up)
4. Set your **budget cap** (monthly USD limit for API costs like email lookups)
5. Write your **message templates** at https://kmboards.co/outreach/templates

### Import your first leads

1. On the Dashboard, click **Import Leads**
2. Choose your method:
   - **CSV upload** - export from LinkedIn Sales Navigator and upload the file
   - **Paste** - copy-paste lead info from LinkedIn search results
   - **Manual** - enter leads one by one
3. The system will automatically deduplicate, enrich, qualify, and score each lead

---

## Page-by-Page Guide

### Dashboard
**URL**: https://kmboards.co/outreach

Your home base. Shows pipeline stats (total leads, qualified count, average score, total cost), a visual funnel of leads across stages, recent imports, and quick action buttons. Start here every day.

### Leads
**URL**: https://kmboards.co/outreach/leads

A searchable table of all your leads. Filter by pipeline stage, qualification status, or search by name/company. Select multiple leads for bulk actions (enrich, qualify, delete). Click any lead to see their full details.

### Lead Detail
**URL**: https://kmboards.co/outreach/leads/[id]

Everything about one lead: contact info, enrichment data, score breakdown, pipeline history, generated messages, and timeline of all events. Override qualification decisions here if the system got it wrong.

### Queue (Daily Batch)
**URL**: https://kmboards.co/outreach/queue

**This is where you approve daily sends.** The system generates a batch of messages each day (respecting warm-up limits). You can:
- Preview each message
- Edit messages inline
- Approve individual messages or the whole batch
- Click **Send via LinkedIn** to trigger browser automation

### Pipeline
**URL**: https://kmboards.co/outreach/pipeline

A Kanban board showing leads organized by stage (columns). Drag leads between stages. Great for visualizing where your pipeline is healthy or stuck.

### Templates
**URL**: https://kmboards.co/outreach/templates

Create and edit your 10-step message sequence. Each template supports:
- **A/B variants** - test two versions against each other
- **Rotation variants** - multiple phrasings of the same message (anti-detection)
- **Variables** - `{{First Name}}`, `{{Company}}`, `{{Position}}`, `{{City}}`

### A/B Tests
**URL**: https://kmboards.co/outreach/ab-tests

See which message variants perform better. The system uses statistical analysis (p-values, confidence intervals) to determine winners. Minimum 75 samples per variant before declaring a winner.

### Engagement
**URL**: https://kmboards.co/outreach/engagement

Your conversion funnel:
- Connections sent -> Connected -> Messages sent -> Replied -> Booked
- Acceptance rate, reply rate, booking rate
- Weekly trends
- Average days between each stage

### Health
**URL**: https://kmboards.co/outreach/health

Browser session status - is the LinkedIn session active? How many actions today? Last health check timestamp. Use this to verify the automation is running.

### Safety
**URL**: https://kmboards.co/outreach/safety

Account health dashboard:
- **Green** = all good
- **Yellow** = something needs attention (budget near cap, acceptance declining)
- **Red** = auto-paused (acceptance rate too low, account may be at risk)

Shows circuit breaker status for each external service, auto-pause triggers, and the **Emergency Stop** button.

### Shadow Mode
**URL**: https://kmboards.co/outreach/shadow

Dry-run results. When shadow mode is on, the system generates everything but doesn't actually send. Review results here before going live.

### Costs
**URL**: https://kmboards.co/outreach/costs

Breakdown of API spending by service:

| Service | What it costs for |
|---------|------------------|
| Hunter.io | Email lookups |
| Snov.io | Email verification |
| SerpAPI | Google search for company info |
| Claude (Anthropic) | AI message generation, qualification |
| Scrapling | Website content analysis |

Shows total spend, cost per qualified lead, and budget usage percentage.

### Trash
**URL**: https://kmboards.co/outreach/trash

Soft-deleted leads. They stay here for 30 days before permanent deletion. You can restore any lead from trash.

### Browser Actions
**URL**: https://kmboards.co/outreach/browser-actions

Audit log of every automated LinkedIn action: connection requests sent, messages delivered, inbox checks, profile views. Filter by action type, status, or date. Use this to verify what the automation actually did.

### Settings
**URL**: https://kmboards.co/outreach/settings

All configuration in one place:

| Setting | What it controls |
|---------|-----------------|
| Warm-up week (1-5) | How many sends per day (5/10/15/20/25) |
| Daily send limit | Max messages/connections per day |
| Weekly send limit | Max per week |
| Budget cap (USD) | Monthly spending limit on API costs |
| Budget alert % | Alert when spending hits this percentage |
| Shadow mode | Dry-run - no real sends |
| Auto-generate batches | System generates daily batch automatically |
| Pause outreach | Master on/off switch |
| Slack webhook | Get alerts in Slack |
| Auto-send approved | Send approved batches without manual trigger |
| Min/max delay | Seconds between each automated action (safety) |
| Response detection | Auto-check LinkedIn inbox for replies |

---

## What the Human Does

### Daily routine (10-15 minutes)

1. **Check Dashboard** - glance at pipeline stats, any new alerts
2. **Go to Queue** - review today's generated batch of messages
3. **Edit if needed** - tweak any messages that don't sound right
4. **Approve the batch** - click Approve All (or approve one by one)
5. **Click "Send via LinkedIn"** - the automation handles the rest
6. **Check Safety** - make sure account health is green, no red flags

### Weekly routine (20-30 minutes)

1. **Review Engagement** - are acceptance and reply rates healthy?
2. **Check Costs** - are you within budget?
3. **Review A/B Tests** - any winners to apply?
4. **Browse "needs review" leads** - override any bad qualification decisions
5. **Bump warm-up week** in Settings if it's time (after 7 days at current level)
6. **Import new leads** if your pipeline is getting thin

### Monthly routine

1. **Review overall conversion** - connections to bookings rate
2. **Update templates** based on A/B test winners
3. **Adjust budget cap** if needed
4. **Clean up trash** - anything worth restoring?

### What the system does automatically

You don't need to touch these - they run on the server:

| Task | Frequency | What it does |
|------|-----------|-------------|
| Generate daily batch | 9 AM EST weekdays | Picks leads and writes messages |
| Check for responses | Every 4 hours | Scans LinkedIn inbox for replies |
| Session health check | Every 30 minutes | Verifies LinkedIn login is still active |
| Follow-up check | 8 AM EST weekdays | Flags leads that need follow-up |
| Recovery | Every 6 hours | Retries failed enrichments/sends |
| A/B evaluation | Mondays 10 AM EST | Calculates A/B test statistics |
| Trash purge | 2 AM EST daily | Deletes leads in trash for 30+ days |

---

## Tracking Results

### Where to see what

| Question | Where to look |
|----------|--------------|
| How many leads do I have? | Dashboard or Leads page |
| Where is each lead in the pipeline? | Pipeline (kanban view) |
| What's my acceptance rate? | Engagement page |
| How much am I spending? | Costs page |
| Did my messages actually send? | Browser Actions page |
| Is my LinkedIn account safe? | Safety page |
| Which message version works better? | A/B Tests page |
| What happened to a specific lead? | Lead Detail page (click any lead) |

### Key metrics to watch

| Metric | Healthy range | Where to find it |
|--------|--------------|-----------------|
| Acceptance rate (7-day) | 25-40% | Safety page |
| Reply rate | 10-25% | Engagement page |
| Booking rate (from replies) | 20-40% | Engagement page |
| Cost per qualified lead | Under $2 | Costs page |
| Daily actions used | Below daily limit | Health page |
| Account health | Green | Safety page |

### Cost breakdown

The system uses several paid APIs. Typical costs per lead:

| Service | Typical cost | Used for |
|---------|-------------|----------|
| Hunter.io | ~$0.03/lookup | Finding email addresses |
| Snov.io | ~$0.02/verification | Verifying emails |
| SerpAPI | ~$0.01/search | Finding company websites |
| Claude AI | ~$0.01/message | Writing personalized messages |
| Scrapling | ~$0.005/page | Analyzing websites |
| **Total per lead** | **~$0.08-0.15** | **End to end** |

With a $500 monthly budget, you can process roughly 3,000-6,000 leads.

---

## Safety and Limits

### Warm-up schedule

New LinkedIn accounts (or accounts new to automation) need to ramp up slowly:

| Week | Daily limit | Weekly max |
|------|------------|------------|
| 1 | 5 | 25 |
| 2 | 10 | 50 |
| 3 | 15 | 75 |
| 4 | 20 | 100 |
| 5+ | 25 | 125 |

You control which week you're on in Settings. Don't skip weeks.

### Auto-pause triggers

The system will automatically pause outreach if:

| Trigger | Threshold | Severity |
|---------|-----------|----------|
| Low acceptance rate | Below 20% over 7 days | Critical - pauses immediately |
| Rapid rejections | More than 5 in 24 hours | Critical - pauses immediately |
| Budget exceeded | Spend >= 100% of cap | Warning |
| High API error rate | Over 30% failures | Warning |
| Weekend block | Saturday/Sunday | Warning |
| Browser session unhealthy | Logged out or blocked | Critical - pauses immediately |

When paused, go to Settings to see the reason and un-pause once the issue is resolved.

### Emergency Stop

If anything looks wrong, hit the **Emergency Stop** button on the Safety page. This:
- Kills the browser immediately
- Pauses all outreach
- Marks the session as inactive
- Logs the event

---

## Glossary

| Term | Meaning |
|------|---------|
| **Pipeline stage** | Where a lead is in the outreach process (e.g., TO_ENRICH, CONNECTION_SENT, REPLIED) |
| **Warm-up week** | Current ramp-up phase - controls how many sends per day |
| **Daily batch** | The set of messages queued to send today |
| **Circuit breaker** | Auto-disables a service (Hunter, Snov, etc.) if it's failing too much |
| **Shadow mode** | Dry-run mode - generates everything but doesn't actually send |
| **Rotation variant** | Different phrasings of the same connection message (anti-detection) |
| **A/B test** | Testing two versions of a message to see which gets more replies |
| **Lead score** | 0-100 rating based on growth stage, website quality, connections, and more |
| **Enrichment** | The process of finding a lead's email, website, and company info |
| **Qualification** | Checking if a lead is actually a good fit (right job title, not a competitor) |
| **RLS** | Row Level Security - database rule that keeps each user's data private |
| **Camoufox** | Anti-detection browser used to send LinkedIn messages (looks like a real person) |
| **Emergency stop** | Red button that immediately kills all automation |
| **Budget cap** | Monthly spending limit on API costs (not LinkedIn, just data lookups and AI) |
