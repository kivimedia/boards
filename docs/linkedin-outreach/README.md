# LinkedIn Outreach Agent

A multi-agent LinkedIn outreach management system built into KM Boards. It handles the full lead lifecycle - from importing raw leads, through enrichment and qualification, to generating personalized message sequences, daily send queues, A/B testing, and performance tracking.

## Quick Links

- [Team How-To Guide](team-howto.md) - start here if you're new
- [Page-by-Page Guide](pages.md)
- [Technical Architecture](architecture.md)
- [API Reference](api-reference.md)

## What It Does

The system manages 3 AI agents coordinated by an orchestrator:

1. **Scout Agent** - Imports leads, finds emails (Hunter.io, Snov.io, SerpAPI), validates websites, scores leads 0-100
2. **Qualifier Agent** - Checks job titles, detects IT false positives, identifies competitors, classifies growth stage
3. **Outreach Agent** - Generates personalized messages from a 10-step template sequence, manages daily send queues, runs A/B tests

## Browser Automation (Phase 4)

The system includes end-to-end LinkedIn browser automation via Camoufox (anti-detection Firefox) running on the VPS:

- Approved batches can be sent automatically - click "Send via LinkedIn" in the Queue page
- Connection requests and messages are sent with human-like behavior (typing delays, random scrolling, session breaks)
- Response detection runs every 4 hours - checks inbox for replies and pending connection acceptances
- Session health is monitored every 30 minutes - auto-pauses if logged out or blocked
- Emergency stop button kills the browser immediately

The system uses warm-up limits (5/day week 1, up to 25/day week 5+) and random delays (45-120s between actions) to keep LinkedIn accounts safe.

## Multi-Tenant

The system is per-user. Each logged-in KM Boards user gets their own leads, templates, settings, and budget. Nothing is shared between users. Any client with a KM Boards account can use it for their own outreach campaigns.

## Getting Started

1. Log into https://kmboards.co
2. Click **LinkedIn Outreach** in the left sidebar
3. Click **Import Leads** on the dashboard
4. Upload a CSV (LinkedIn Sales Navigator export) or paste lead data
5. The system will deduplicate, enrich, qualify, and score each lead automatically

## Typical Workflow

```
Import -> Enrich -> Qualify -> Review -> Queue -> Approve -> Send -> Track
```

1. **Import** - Upload CSV from LinkedIn Sales Navigator or paste lead data
2. **Enrich** - System finds emails via Hunter.io/Snov.io, validates websites via Scrapling, scores leads 0-100
3. **Qualify** - System checks job titles against approved list, detects IT false positives (2+ red flags = disqualify), identifies competitors
4. **Review** - Browse leads at /outreach/leads, override bad decisions, adjust scores manually
5. **Queue** - System generates a daily batch respecting warm-up limits (5/day week 1, up to 25/day week 5+)
6. **Approve** - Review today's batch at /outreach/queue, edit messages inline, approve individually or in bulk
7. **Send** - Click "Send via LinkedIn" to trigger browser automation, or send manually
8. **Track** - System auto-detects responses every 4 hours. Pipeline stages update automatically (CONNECTION_SENT -> CONNECTED, MESSAGE_SENT -> REPLIED)

## Safety Features

- **Warm-up schedule** - starts at 5/day, ramps to 25/day over 5 weeks
- **Auto-pause** - triggers if acceptance rate drops below 20%, rapid rejections (>5 in 24h), budget exceeded, high error rate (>30%), or weekend block
- **Budget cap** - set a monthly USD cap with configurable alert threshold
- **Dry run mode** - generate batches without marking as sendable
- **Shadow mode** - agent runs but you compare its decisions before trusting it
- **Circuit breakers** - auto-disable external APIs (Hunter, Snov, SerpAPI, Scrapling, Claude) if error rates spike

## Lead Scoring (0-100)

Leads are scored with 6 weighted factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Growth stage | 30% | Classified from website signals (growing, established, emerging, unknown) |
| Website quality | 25% | Professional design, entertainment content, name match |
| Website recency | 15% | Copyright year on site (recent = higher score) |
| Connections | 10% | LinkedIn connection degree |
| Enrichment confidence | 10% | How much data was found (email, website, etc.) |
| Historical conversion | 10% | Based on similar lead outcomes |

## Pipeline Stages

Leads move through these stages:

```
TO_ENRICH -> ENRICHING -> TO_QUALIFY -> QUALIFYING -> TO_SEND_CONNECTION
-> CONNECTION_SENT -> CONNECTED -> MESSAGE_SENT -> NUDGE_SENT
-> REPLIED -> INTERESTED -> MEETING_BOOKED -> WON / LOST / DISQUALIFIED
```

## Message Templates

10-step sequence with A/B variants:

1. **Connection Request** - initial connect message (3 rotation variants for anti-detection)
2. **Welcome After Connect** - sent after connection accepted
3. **Value-First Follow-up** - shares useful content
4. **Soft Ask** - suggests a conversation
5. **Social Proof** - shares success stories
6. **Direct CTA** - clear call to action
7. **Break-Up** - final attempt before closing
8. **Re-engagement** - for leads that went cold
9. **Event-Based** - triggered by LinkedIn activity
10. **Referral Ask** - request for introductions

Each template supports variables: `{{First Name}}`, `{{Position}}`, `{{Company}}`, `{{City}}`, `{{Loom Link}}`, `{{Session Topic}}`

## Configuration

All settings at /outreach/settings:

- **Warm-up week** (1-5) - controls daily send limits
- **Daily send limit** (1-50)
- **Weekly send limit** (1-200)
- **Budget cap** (USD/month)
- **Budget alert threshold** (% of cap)
- **Shadow mode** on/off
- **Dry run mode** on/off
- **Auto-generate batches** on/off
- **Pause outreach** on/off
- **Slack webhook URL** for alerts

## File Structure

```
src/
  app/
    outreach/                    # 15 page routes
      page.tsx                   # Dashboard
      leads/page.tsx             # Lead list
      leads/[id]/page.tsx        # Lead detail
      queue/page.tsx             # Daily send queue
      templates/page.tsx         # Template editor
      pipeline/page.tsx          # Pipeline board
      engagement/page.tsx        # Engagement analytics
      costs/page.tsx             # Cost tracking
      trash/page.tsx             # Deleted leads
      ab-tests/page.tsx          # A/B test results
      health/page.tsx            # System health
      safety/page.tsx            # LinkedIn safety
      settings/page.tsx          # Configuration
      shadow/page.tsx            # Shadow mode
      jobs/page.tsx              # Background jobs
    api/outreach/                # 16 API route files
  components/outreach/           # 22 UI components
  lib/outreach/                  # 17 backend modules
supabase/
  migrations/
    081_linkedin_outreach.sql    # 15 tables, RLS, indexes, seed function
    083_linkedin_outreach_schema_align.sql  # Schema fixes
```

## VPS Worker

Background processing runs on the VPS (157.180.37.69) as part of the `km-worker` service:

- **BullMQ queue**: `li-outreach` with concurrency 2
- **14 job types**: scout import, enrich, qualify, generate outreach, web research, personalize message, follow-up check, recovery, feedback collect, A/B evaluate, purge trash, send batch, check responses, session health
- **7 cron schedules**: daily batch (9 AM EST weekdays), 6h recovery, weekly A/B + feedback (Mondays 10 AM EST), daily trash purge (2 AM EST), daily follow-up check (8 AM EST weekdays), response detection (every 4h), session health (every 30min)

### LinkedIn Browser Service

Separate Python FastAPI service on VPS port 8098 (PM2-managed):

- **Camoufox** anti-detection browser with persistent login session
- Human-like behavior: 50-120ms typing, random scrolling, 45-120s between actions
- Session breaks every 5 actions (3-7 min pause)
- Daily action limits enforced per warm-up week
