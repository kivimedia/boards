# Podcast Guest Acquisition Module — PRD

> **Module for**: Vibe Coding Deals Podcast (vibecodingdeals.co)
> **Status**: Planning
> **Priority**: 1 (next batch)

---

## Overview

Automates the full pipeline of finding and securing guests for the Vibe Coding Deals podcast. Two AI agents (Scout + Outreach), an approval workflow, and a tracking dashboard — all integrated into the existing KM Boards agent skills framework.

**Target guests**: Freelancers, agency owners, consultants, and builders who use AI coding tools (Lovable, Cursor, Replit, Claude Code, Bolt, etc.) to deliver **paid client work** or sell their own products. Not educators, not tool reviewers — people making money from vibe coding.

---

## Architecture Decisions

### Build on existing KM Boards infrastructure (no new stack)

| Concern | Approach |
|---------|----------|
| Frontend | Existing React + TypeScript + Tailwind components |
| Backend | Next.js API routes (existing pattern) |
| Database | Supabase Postgres (new `pga_*` tables) |
| Agent Runtime | Existing agent skills framework (`/settings/agents`) |
| Job Queue | Supabase + SSE streaming (same as migration jobs) |
| Auth | Existing Supabase Auth |
| Email (Sequences) | Instantly.io API (new integration) |
| Email (Transactional) | Existing Resend setup |
| LLM | Existing Claude API (Anthropic SDK) |

### Why not the separate stack from the original PRD?

The original PRD proposed Express + Prisma + BullMQ + Clerk. We already have all equivalent capabilities in the current stack. Adding a second runtime would double deployment complexity for zero benefit.

---

## Components

### 1. Scout Agent (Agent Skill)

**Purpose**: Find people actively making money from vibe coding.

**Registered as**: Agent skill in the existing skills framework (`/settings/agents`).

**Search channels** (parallel):
- **LinkedIn** — profiles mentioning AI coding tools, job titles like "Vibe Coder", "AI Developer", "No-Code Consultant"
- **Google** — portfolio sites, case studies, Fiverr/Upwork profiles offering vibe coding services
- **YouTube** — creators showing real client work (not tutorials), channels under 50K subs preferred
- **Reddit** — r/vibecoding, r/SideProject, r/SaaS, r/Entrepreneur — users sharing revenue numbers or client stories

**Output per candidate** (structured JSON):

| Field | Description |
|-------|-------------|
| `name` | Full name |
| `one_liner` | Single compelling sentence — primary review field |
| `platform_presence` | LinkedIn URL, YouTube, Twitter/X, personal site, Reddit |
| `evidence_of_paid_work` | Specific projects/clients/products shipped with vibe coding |
| `estimated_reach` | Follower/subscriber counts |
| `tools_used` | Which AI coding tools they use |
| `email` | Via Hunter.io > Snov.io > LinkedIn > website scraping |
| `contact_method` | Best channel: email, LinkedIn DM, Twitter DM |
| `scout_confidence` | High / Medium / Low |
| `source` | Which search channel + specific query/URL |

**Operational params**:
- Daily schedule: ~2 hours active searching per run
- Batch size: 10-15 new candidates per run
- On-demand: "Give me 50 more" queues multiple runs
- Deduplication: match on name + primary platform URL
- Quality filter: must have evidence of paid work

**Email discovery priority**:
1. Hunter.io API (name + domain)
2. Snov.io fallback
3. LinkedIn profile inspection
4. Personal website scraping
5. Flag for LinkedIn DM if no email found

---

### 2. Approval Queue (UI)

Card-based review interface where Ziv reviews Scout output before outreach.

**Actions per candidate**:
- **Approve** — moves to Outreach Agent queue
- **Reject** — marked not suitable, excluded from future runs
- **More Details** — expands full profile with all evidence links

**Filters**: confidence level, source channel, tools used
**Sort**: date added, confidence, estimated reach

**Implementation**: New page at `/podcast/approval` using existing card/kanban UI patterns.

---

### 3. Outreach Agent (Agent Skill)

**Purpose**: Write and send hyper-personalized email sequences to approved candidates via Instantly.io.

**Research phase** (before writing emails):
- Read latest blog posts, tweets, YouTube descriptions
- Identify 2-3 specific projects shipped with vibe coding
- Note recent wins, milestones, public statements
- Find unique angle for personal invitation

**Email sequence** (3-5 emails via Instantly.io):

| # | Day | Purpose | Max Words |
|---|-----|---------|-----------|
| 1 | 0 | The Invitation — specific compliment + real project reference | 150 |
| 2 | 3 | The Value Add — why their story resonates | 100 |
| 3 | 7 | The Social Proof — other guests / podcast angle | 80 |
| 4 | 12 | The Gentle Nudge — short and casual | 60 |
| 5 | 18 | The Breakup — friendly close, door open | 50 |

**Personalization requirements** (at least one per email):
- Specific project name they shipped
- Tool they're known for using
- Quote/paraphrase from their content
- Reference to platform where work was featured

Generic compliments without specifics are NOT acceptable.

**Sending params**:
- Dedicated email: podcast@kivimedia.com or ziv@vibecodingdeals.co
- Daily limit: start at 20/day, scale up
- Warmup: 2+ weeks via Instantly.io before first sends
- Reply handling: positive replies → notification; negative/unsubscribe → stop sequence

**Link tracking**:
- Scheduling link: kivimedia.com/15 with `?ref=CANDIDATE_ID`
- Instantly.io native open/click tracking
- Cal.com/Calendly webhook → update candidate status to "Scheduled"

---

### 4. Dashboard

**Weekly overview metrics**:

| Metric | Source |
|--------|--------|
| Candidates Found | Scout agent runs |
| Candidates Approved | Approval queue |
| Emails Created | Outreach agent output |
| Emails Sent | Instantly.io API |
| Emails Opened | Instantly.io tracking |
| Links Clicked | Instantly.io + custom params |
| Calls Scheduled | Cal.com/Calendly webhook |
| Interviews Completed | Manual status update |

**Pipeline view** (kanban stages):
Scouted → Approved → Outreach Active → Replied → Scheduled → Interviewed → Rejected

**Agent health**: Last run time, status, tokens consumed, next scheduled run.

**Implementation**: New page at `/podcast/dashboard`.

---

## Database Schema

All tables prefixed with `pga_` (Podcast Guest Acquisition).

```sql
-- Migration: 042_podcast_guest_acquisition.sql

CREATE TABLE pga_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  one_liner text,
  email text,
  email_verified boolean DEFAULT false,
  platform_presence jsonb DEFAULT '{}',
  evidence_of_paid_work jsonb DEFAULT '[]',
  estimated_reach jsonb DEFAULT '{}',
  tools_used text[] DEFAULT '{}',
  contact_method text DEFAULT 'email',
  scout_confidence text CHECK (scout_confidence IN ('high', 'medium', 'low')),
  source jsonb DEFAULT '{}',
  status text DEFAULT 'scouted' CHECK (status IN ('scouted', 'approved', 'outreach_active', 'replied', 'scheduled', 'interviewed', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE pga_email_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES pga_candidates(id) ON DELETE CASCADE,
  instantly_campaign_id text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'stopped')),
  emails jsonb DEFAULT '[]', -- Array of { step, subject, body, sent_at, opened_at, clicked_at }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE pga_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL CHECK (agent_type IN ('scout', 'outreach')),
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  candidates_found integer DEFAULT 0,
  emails_created integer DEFAULT 0,
  tokens_used integer DEFAULT 0,
  output_json jsonb DEFAULT '{}',
  error_message text
);

CREATE INDEX idx_pga_candidates_status ON pga_candidates (status);
CREATE INDEX idx_pga_candidates_confidence ON pga_candidates (scout_confidence);
CREATE INDEX idx_pga_email_sequences_candidate ON pga_email_sequences (candidate_id);
CREATE INDEX idx_pga_agent_runs_type ON pga_agent_runs (agent_type, started_at DESC);
```

---

## External Integrations

| Service | Purpose | API Key Location |
|---------|---------|------------------|
| Instantly.io | Email sequences, warmup, tracking | Settings > AI Configuration |
| Hunter.io | Email discovery (primary) | Settings > AI Configuration |
| Snov.io | Email discovery (fallback) | Settings > AI Configuration |
| Cal.com / Calendly | Booking webhook | Settings > AI Configuration |

---

## Implementation Plan

### Phase 1: Foundation (Migration + Data Model)
1. Apply migration 042 (pga_* tables)
2. Add Podcast module routes (`/podcast/*`)
3. Register Scout and Outreach as agent skills
4. API key management in Settings > AI Configuration

### Phase 2: Scout Agent
5. Scout agent skill implementation (multi-channel search)
6. Hunter.io / Snov.io email discovery integration
7. Candidate deduplication logic
8. Scout run API route with SSE streaming

### Phase 3: Approval Queue
9. `/podcast/approval` page — card-based review UI
10. Approve/reject/expand actions
11. Filters and sorting
12. Sidebar navigation entry

### Phase 4: Outreach Agent
13. Outreach agent skill (research phase + email writing)
14. Instantly.io API integration (campaign creation, sending)
15. Email personalization quality checks
16. Tracking parameter injection (ref=CANDIDATE_ID)

### Phase 5: Dashboard + Webhooks
17. `/podcast/dashboard` — metrics + pipeline kanban
18. Cal.com/Calendly webhook endpoint
19. Instantly.io webhook for opens/clicks/replies
20. Agent health monitoring panel

### Phase 6: Polish
21. Sidebar module entry with icon
22. Notification integration (new candidates, replies, bookings)
23. On-demand "Give me 50 more" batch trigger
24. Auto-warmup status display

---

## Key Files (planned)

| Purpose | Path |
|---------|------|
| Scout Agent | `src/lib/ai/podcast-scout.ts` |
| Outreach Agent | `src/lib/ai/podcast-outreach.ts` |
| Instantly.io Client | `src/lib/instantly.ts` |
| Hunter.io Client | `src/lib/hunter.ts` |
| Approval Page | `src/app/podcast/approval/page.tsx` |
| Dashboard Page | `src/app/podcast/dashboard/page.tsx` |
| API Routes | `src/app/api/podcast/*` |
| Migration | `supabase/migrations/042_podcast_guest_acquisition.sql` |
| **This file** | `PODCAST-GUEST-ACQUISITION.md` |
