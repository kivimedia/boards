# Phase 9: PRD Future Features - Implementation Plan

> **Scope**: Fill remaining gaps in Productivity Analytics & WhatsApp, extend AI Design Review to video, expand Lighthouse/QA automation.
> **Migrations**: 048-051
> **Estimated new tests**: ~120
> **Builds on**: Phase 4 (productivity, WhatsApp, revision analysis), Phase 3 (AI review, AI QA)

---

## Overview

| # | Feature | What Exists | What's New | Migration | Est. Effort |
|---|---------|------------|------------|-----------|-------------|
| P9.1 | Team Productivity Analytics (complete) | 90% -- snapshots, scorecards, leaderboard, trend charts, report configs | Nightly cron, PDF/XLSX generation, department rollup, anomaly alerts, comparison mode | 048 | Medium |
| P9.2 | WhatsApp Integration (complete) | 85% -- phone linking, DND, throttle, groups, quick actions, digests, custom actions | Meta Business API client, inbound webhook, receipt polling, media messages, auto-digest cron, group member sync | 049 | Large |
| P9.3 | AI Design Review for Video | 100% design review for images | Frame extraction from video attachments, multi-frame review, thumbnail comparison, video-specific prompts | 050 | Medium |
| P9.4 | AI QA Expansion (Lighthouse+) | 100% Lighthouse + axe-core + visual diff | Scheduled recurring QA runs, multi-browser comparison, automated link checking, WCAG 2.1 AA report, trend dashboard | 051 | Medium |

---

## P9.1 -- Team Productivity Analytics (Complete the Module)

### What Already Exists
- **DB**: `card_column_history`, `productivity_snapshots`, `scheduled_reports`, `productivity_report_configs`, `productivity_report_files` (migrations 026, 031)
- **Lib**: `productivity-analytics.ts` (354 lines) -- `logColumnMove()`, `calculateCycleTime()`, `calculateOnTimeRate()`, `calculateRevisionRate()`, `aggregateSnapshots()`, `buildUserScorecards()`
- **API**: 6 endpoints under `/api/productivity/` (snapshots, metrics, scorecards, report-configs, reports)
- **Components**: `MetricCards`, `UserLeaderboard`, `TrendChart`, `DateRangeFilter`, `ReportConfigManager`, `ScheduledReportManager`, `ReportFileList`
- **Revision analysis**: `revision-analysis.ts` (311 lines) -- `detectPingPong()`, `detectOutliers()`, `computeBoardRevisionMetrics()`

### What's Missing (PRD 12.3 Gaps)

#### 1. Nightly Snapshot Cron (`/api/cron/productivity-snapshot`)
- Vercel cron job (runs at 2:00 AM UTC daily)
- Iterates all active boards, computes metrics per user per board
- Calls existing `logColumnMove()` data to calculate cycle time, on-time rate, revision rate
- Writes rows to `productivity_snapshots` table
- Skips weekends (configurable)

#### 2. PDF/XLSX Report Generation
- **New lib**: `src/lib/productivity-report-generator.ts`
- Uses `@react-pdf/renderer` for PDF generation (already in package.json for map board export)
- Uses `xlsx` (SheetJS) for XLSX export
- Report types from `productivity_report_configs`:
  - **Individual scorecard**: One person, all metrics, trend sparklines, period comparison
  - **Team leaderboard**: Ranked table with all members, sortable columns
  - **Department comparison**: Aggregate metrics per department with bar charts
  - **Executive summary**: Cross-department KPIs, top performers, risk flags
- API endpoint: `POST /api/productivity/reports/generate` -- triggers generation, stores file in Supabase Storage `productivity-reports` bucket
- Scheduled email delivery via Resend (already integrated for AM client updates)

#### 3. Department-Level Analytics Rollup
- **New API**: `GET /api/productivity/departments` -- aggregate snapshots by board type (Design, Dev, AM, Video, etc.)
- Groups users by their primary board membership
- Returns: avg cycle time, total tickets, on-time rate, revision rate per department
- Comparison mode: `?compare=previous` returns current vs previous period side-by-side

#### 4. Anomaly Detection & Alerts
- **Migration 048**: New `productivity_alerts` table
  ```
  id, board_id, user_id, metric_name, current_value, threshold_value,
  alert_type ('above_threshold' | 'below_threshold' | 'trend_change'),
  severity ('info' | 'warning' | 'critical'), acknowledged, created_at
  ```
- Alert thresholds configurable per board (stored in `productivity_report_configs.metadata`)
- Default thresholds:
  - Revision rate > 1.5x team average = warning
  - Cycle time > 2x team average = warning
  - On-time rate < 60% = critical
  - AI pass rate < 50% = warning
- Alerts generated during nightly cron run
- Surfaced in existing notification center + optional email

#### 5. Comparison Mode UI
- **Modify**: `DateRangeFilter.tsx` -- add "Compare to previous period" toggle
- **Modify**: `MetricCards.tsx` -- show delta arrows (green up / red down) with % change
- **Modify**: `TrendChart.tsx` -- overlay previous period as dashed line
- **Modify**: `UserLeaderboard.tsx` -- add "Change" column showing rank movement

#### 6. Revision Deep-Dive View
- **New component**: `RevisionDeepDive.tsx` -- drill into tickets with high revision counts
- Shows: card title, revision count, time in revision, client name, assignee
- Categorizes patterns: "Unclear brief", "Client indecisiveness", "Skill gap", "Scope creep"
- Links to existing `revision-analysis.ts` outlier detection
- Filter by: team member, client, ticket type, date range

### Migration 048 Schema

```sql
-- Productivity alerts table
CREATE TABLE IF NOT EXISTS productivity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL CHECK (metric_name IN (
    'cycle_time', 'on_time_rate', 'revision_rate', 'ai_pass_rate',
    'tickets_completed', 'revision_outliers'
  )),
  current_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('above_threshold', 'below_threshold', 'trend_change')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_productivity_alerts_board ON productivity_alerts(board_id, created_at DESC);
CREATE INDEX idx_productivity_alerts_user ON productivity_alerts(user_id, acknowledged);

ALTER TABLE productivity_alerts ENABLE ROW LEVEL SECURITY;
```

### Files to Create/Modify

| Action | File | What |
|--------|------|------|
| CREATE | `src/app/api/cron/productivity-snapshot/route.ts` | Nightly cron endpoint |
| CREATE | `src/lib/productivity-report-generator.ts` | PDF/XLSX generation |
| CREATE | `src/app/api/productivity/reports/generate/route.ts` | Trigger report generation |
| CREATE | `src/app/api/productivity/departments/route.ts` | Department-level rollup |
| CREATE | `src/app/api/productivity/alerts/route.ts` | GET alerts, POST acknowledge |
| CREATE | `src/components/productivity/RevisionDeepDive.tsx` | Drill-into revision outliers |
| CREATE | `src/components/productivity/ComparisonOverlay.tsx` | Period comparison delta UI |
| CREATE | `src/components/productivity/AlertsBanner.tsx` | Alert notification strip |
| MODIFY | `src/components/productivity/DateRangeFilter.tsx` | Add comparison toggle |
| MODIFY | `src/components/productivity/MetricCards.tsx` | Delta arrows + % change |
| MODIFY | `src/components/productivity/TrendChart.tsx` | Dashed overlay for previous period |
| MODIFY | `src/components/productivity/UserLeaderboard.tsx` | Rank change column |
| MODIFY | `src/lib/productivity-analytics.ts` | Add `generateAlerts()`, `getDepartmentRollup()` |
| CREATE | `supabase/migrations/048_productivity_alerts.sql` | Alert table + indexes |
| CREATE | `src/__tests__/lib/productivity-cron.test.ts` | ~20 tests |
| CREATE | `src/__tests__/lib/productivity-reports.test.ts` | ~15 tests |

### Estimated Tests: ~35

---

## P9.2 -- WhatsApp Integration (Complete the Module)

### What Already Exists
- **DB**: `whatsapp_users`, `whatsapp_groups`, `whatsapp_messages`, `whatsapp_quick_actions`, `whatsapp_digest_config`, `whatsapp_custom_actions`, `whatsapp_digest_templates` (migrations 025, 031)
- **Lib**: `whatsapp.ts` (470 lines), `whatsapp-advanced.ts` (385 lines) -- phone linking, DND, throttle, quick actions, digest config, custom actions, dispatch
- **API**: 15 endpoints under `/api/whatsapp/`
- **Components**: `PhoneLinkForm`, `WhatsAppSettings`, `QuickActionManager`, `DigestConfigForm`, `MessageLog`, `CustomActionBuilder`, `DigestTemplateEditor`

### What's Missing (PRD 13.4 Gaps)

#### 1. Meta WhatsApp Business API Client
- **New lib**: `src/lib/integrations/whatsapp-business-api.ts`
- Meta Cloud API v21.0 (graph.facebook.com)
- Functions:
  - `sendTextMessage(phone, text)` -- POST `/messages` with type=text
  - `sendTemplateMessage(phone, templateName, params)` -- HSM template messages
  - `sendMediaMessage(phone, mediaUrl, caption)` -- images, documents
  - `createGroup(name, participants)` -- department group creation (via Catalog API)
  - `addGroupParticipant(groupId, phone)` / `removeGroupParticipant()`
  - `getMessageStatus(messageId)` -- delivery/read receipts
  - `uploadMedia(buffer, mimeType)` -- media upload for attachments
- Auth: Long-lived system user token stored in `whatsapp_config` (env var `WHATSAPP_ACCESS_TOKEN`)
- Phone number ID stored in env var `WHATSAPP_PHONE_NUMBER_ID`
- Rate limiting: max 80 messages/second (Meta tier 1), queue with backpressure

#### 2. Inbound Webhook
- **New route**: `POST /api/whatsapp/webhook` -- Meta webhook verification + message handling
- GET handler: Hub challenge verification (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`)
- POST handler: Parse webhook payload, route by message type:
  - **Text messages**: Match against quick actions (existing `processQuickAction()`), else log as unhandled
  - **Interactive messages**: Button replies, list replies
  - **Status updates**: Delivery/read receipts -> update `whatsapp_messages.status`
- Webhook signature verification: `X-Hub-Signature-256` with HMAC-SHA256
- Idempotent processing: check `whatsapp_messages.external_id` before re-processing

#### 3. Receipt/Status Polling
- Update `whatsapp_messages` table with delivery status changes from webhook:
  - `sent` -> `delivered` -> `read` (or `failed`)
- **Modify**: `MessageLog.tsx` -- show status icons (single check = sent, double = delivered, blue = read)
- No separate polling needed -- webhook handles status updates in real-time

#### 4. Media Message Support
- **Modify**: `whatsapp-business-api.ts` -- `sendMediaMessage()` with attachment upload
- Support types: image/jpeg, image/png, application/pdf, video/mp4
- Max sizes: images 5MB, documents 100MB, video 16MB (Meta limits)
- Integration: When a card has attachments and a WhatsApp notification triggers, include first image as media message
- **Modify**: `dispatchNotification()` in `whatsapp.ts` -- check for card attachments, use media message if available

#### 5. Auto-Digest Cron
- **New route**: `POST /api/cron/whatsapp-digest` -- runs daily at configured send_time per user
- Reads `whatsapp_digest_config` for each user with active digest
- Uses existing `buildDigestContent()` from `whatsapp-advanced.ts`
- Calls `sendTextMessage()` for each user (respects DND window)
- Logs digest messages in `whatsapp_messages`

#### 6. Group Member Sync
- **New function**: `syncGroupMembers()` in `whatsapp-business-api.ts`
- When board membership changes (member added/removed), sync WhatsApp group
- Triggered by: `POST /api/boards/[id]/members` and `DELETE /api/boards/[id]/members/[memberId]`
- Maps board type to WhatsApp group (Design board -> Designers group, etc.)
- Only syncs if user has verified WhatsApp number

#### 7. Department Group Auto-Creation
- **Modify**: Board creation flow -- when a new department board is created, auto-create corresponding WhatsApp group
- Uses Meta API `createGroup()` with board name as group subject
- Stores `external_group_id` in `whatsapp_groups` table
- Adds all existing board members who have verified WhatsApp numbers

### Migration 049 Schema

```sql
-- Add delivery status tracking columns
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video', 'document', 'audio'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_external_id
  ON whatsapp_messages(external_id) WHERE external_id IS NOT NULL;

-- WhatsApp config table (API credentials, per-agency)
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL,
  business_account_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
```

### Files to Create/Modify

| Action | File | What |
|--------|------|------|
| CREATE | `src/lib/integrations/whatsapp-business-api.ts` | Meta Cloud API client |
| CREATE | `src/app/api/whatsapp/webhook/route.ts` | Inbound webhook (verify + receive) |
| CREATE | `src/app/api/cron/whatsapp-digest/route.ts` | Daily digest cron |
| CREATE | `src/components/whatsapp/MessageStatusIcon.tsx` | Sent/delivered/read icons |
| CREATE | `src/components/whatsapp/WhatsAppConfigForm.tsx` | API credentials setup |
| MODIFY | `src/lib/whatsapp.ts` | Add `dispatchWithMedia()`, integrate business API |
| MODIFY | `src/lib/whatsapp-advanced.ts` | Add `syncGroupMembers()` |
| MODIFY | `src/components/whatsapp/MessageLog.tsx` | Status icons, media previews |
| MODIFY | `src/app/api/boards/[id]/members/route.ts` | Trigger group sync on member change |
| CREATE | `supabase/migrations/049_whatsapp_business_api.sql` | Config table + message columns |
| CREATE | `src/__tests__/lib/whatsapp-business-api.test.ts` | ~25 tests |
| CREATE | `src/__tests__/lib/whatsapp-webhook.test.ts` | ~15 tests |

### Estimated Tests: ~40

---

## P9.3 -- AI Design Review for Video

### What Already Exists
- **AI Design Review**: `design-review.ts` (482 lines) -- full pipeline for image review with Claude Vision
- **Video Frame Extraction**: `video-frame-extractor.ts` -- extract frames from video (Phase 6, P6.8)
- **Video Review**: `video-review.ts` -- AI review of video board content (Phase 6, P6.8)
- **DB**: `ai_review_results` table with verdicts, change requests, confidence scoring

### What's New (PRD 4.7)

#### 1. Video Attachment Detection
- **Modify**: `design-review.ts` -- detect video MIME types (video/mp4, video/quicktime, video/webm)
- When a card's attachment is video instead of image, route to video review pipeline

#### 2. Multi-Frame Review Pipeline
- **New function**: `runVideoDesignReview()` in `design-review.ts`
- Steps:
  1. Download video from Supabase Storage
  2. Extract key frames using existing `video-frame-extractor.ts` (at 0s, 25%, 50%, 75%, 100%)
  3. If previous version exists, extract matching frames from previous version
  4. Send frame pairs to Claude Vision with video-specific prompt
  5. Analyze: brand consistency across frames, motion quality, text readability, color grading
  6. Return structured verdicts per change request + overall video quality score

#### 3. Video-Specific Review Prompts
- Brand color consistency across frames
- Text/overlay readability at different timestamps
- Transition quality assessment
- Thumbnail suitability (first frame analysis)
- Audio sync indicators (if waveform visible in frames)
- Resolution/quality consistency

#### 4. Thumbnail Comparison
- Extract first frame as thumbnail candidate
- Compare against existing thumbnail (if set on card)
- Suggest thumbnail from "best frame" based on composition scoring
- Store thumbnail suggestion in review result metadata

#### 5. UI Integration
- **Modify**: `AIReviewSubmit.tsx` -- detect video attachments, show "Review Video" button
- **Modify**: `AIReviewResults.tsx` -- display frame-by-frame verdicts with frame thumbnails
- **New component**: `VideoFrameComparison.tsx` -- side-by-side frame viewer (before/after)
- Timeline scrubber showing which frames were reviewed + verdict indicators

### Migration 050 Schema

```sql
-- Extend ai_review_results for video reviews
ALTER TABLE ai_review_results
  ADD COLUMN IF NOT EXISTS review_type TEXT DEFAULT 'image' CHECK (review_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS frame_count INTEGER,
  ADD COLUMN IF NOT EXISTS frame_verdicts JSONB,
  ADD COLUMN IF NOT EXISTS thumbnail_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds NUMERIC;
```

### Files to Create/Modify

| Action | File | What |
|--------|------|------|
| MODIFY | `src/lib/ai/design-review.ts` | Add `runVideoDesignReview()`, video detection |
| CREATE | `src/components/card/VideoFrameComparison.tsx` | Side-by-side frame viewer |
| MODIFY | `src/components/card/AIReviewSubmit.tsx` | Video attachment detection |
| MODIFY | `src/components/card/AIReviewResults.tsx` | Frame-by-frame verdicts display |
| CREATE | `supabase/migrations/050_video_design_review.sql` | Review type + frame columns |
| CREATE | `src/__tests__/lib/video-design-review.test.ts` | ~20 tests |

### Estimated Tests: ~20

---

## P9.4 -- AI QA Expansion (Lighthouse+)

### What Already Exists
- **AI Dev QA**: `dev-qa.ts` (492 lines) -- screenshots, Claude vision, Lighthouse, axe-core
- **Lighthouse**: `lighthouse-audit.ts` (127 lines) -- performance/accessibility/SEO/best-practices scores
- **Visual Diff**: `visual-diff.ts` -- pixelmatch comparison
- **Visual Regression**: `visual-regression.ts` -- baseline management + comparison
- **QA Scheduler**: `qa-scheduler.ts` -- scheduled QA runs
- **DB**: `ai_qa_results`, `qa_checklists`, `qa_console_errors`, `qa_performance_metrics`

### What's New (PRD 5.7)

#### 1. Scheduled Recurring QA Monitoring (24h cycle)
- **Modify**: `qa-scheduler.ts` -- extend to support production URL monitoring
- Currently runs on-demand per card; add recurring schedule config
- Cron endpoint: `POST /api/cron/qa-monitoring` (runs daily at 3:00 AM UTC)
- Monitors configured URLs (production deployments linked to cards)
- Compares scores to previous run, alerts on regression (>10% drop)
- **QA Monitoring Dashboard** (`/settings/qa-monitoring`): manage monitored URLs, view run history, toggle active/inactive, see score trends

#### 2. Multi-Browser Testing
- **New function**: `runMultiBrowserQA()` in `dev-qa.ts`
- Use Browserless.io's browser selection (Chrome, Firefox, WebKit)
- Capture screenshots at same 3 viewports across all 3 browsers
- Run visual diff between browsers (pixelmatch cross-browser comparison)
- Report: highlight rendering differences between browsers
- Store results with browser tag in `ai_qa_results.metadata`

#### 3. Automated Link Checking
- **New lib**: `src/lib/ai/link-checker.ts`
- Crawl page DOM, extract all `<a>` href attributes
- Classify: internal links, external links, anchor links, mailto, tel
- HEAD request each link with 5s timeout, capture status code
- Report: broken links (4xx/5xx), redirects (3xx), slow links (>3s), mixed content (http on https page)
- Store in `ai_qa_results.metadata.link_check`

#### 4. WCAG 2.1 AA Compliance Report
- **Modify**: `lighthouse-audit.ts` -- expand axe-core output into structured WCAG report
- Map axe-core violations to WCAG 2.1 success criteria
- Group by principle: Perceivable, Operable, Understandable, Robust
- Severity mapping: critical = Level A failures, serious = Level AA failures
- Generate compliance percentage per principle
- **New component**: `WCAGReport.tsx` -- accordion UI with pass/fail per criterion

#### 5. QA Trend Dashboard
- **New component**: `QATrendDashboard.tsx` -- show QA score trends over time
- Line charts: Lighthouse performance, accessibility, SEO, best-practices over runs
- Anomaly highlighting: drops >10% marked with red indicator
- URL selector: switch between monitored production URLs
- Export: CSV of all QA runs for a URL

### Migration 051 Schema

```sql
-- QA monitoring configuration
CREATE TABLE IF NOT EXISTS qa_monitoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  frequency TEXT DEFAULT '24h' CHECK (frequency IN ('12h', '24h', '48h', '7d')),
  browsers TEXT[] DEFAULT ARRAY['chrome'],
  alert_threshold NUMERIC DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qa_monitoring_active ON qa_monitoring_configs(is_active, last_run_at);

ALTER TABLE qa_monitoring_configs ENABLE ROW LEVEL SECURITY;

-- Link check results (separate table for queryability)
CREATE TABLE IF NOT EXISTS qa_link_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_result_id UUID REFERENCES ai_qa_results(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  link_type TEXT CHECK (link_type IN ('internal', 'external', 'anchor', 'mailto', 'tel')),
  is_broken BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qa_link_checks_broken ON qa_link_checks(qa_result_id, is_broken);
```

### Files to Create/Modify

| Action | File | What |
|--------|------|------|
| CREATE | `src/lib/ai/link-checker.ts` | DOM crawl + HEAD request link validation |
| CREATE | `src/components/qa/WCAGReport.tsx` | WCAG 2.1 AA compliance accordion |
| CREATE | `src/components/qa/QATrendDashboard.tsx` | Score trends over time + anomaly detection |
| CREATE | `src/components/qa/MultiBrowserResults.tsx` | Cross-browser diff viewer |
| CREATE | `src/components/qa/LinkCheckResults.tsx` | Broken link report table |
| CREATE | `src/app/api/cron/qa-monitoring/route.ts` | Recurring QA monitoring cron |
| CREATE | `src/app/api/qa/monitoring-configs/route.ts` | CRUD monitoring configs |
| MODIFY | `src/lib/ai/dev-qa.ts` | Add `runMultiBrowserQA()`, integrate link checker |
| MODIFY | `src/lib/ai/lighthouse-audit.ts` | WCAG mapping, compliance scoring |
| MODIFY | `src/lib/ai/qa-scheduler.ts` | Production URL monitoring support |
| CREATE | `supabase/migrations/051_qa_monitoring.sql` | Monitoring configs + link checks |
| CREATE | `src/__tests__/lib/link-checker.test.ts` | ~15 tests |
| CREATE | `src/__tests__/lib/qa-monitoring.test.ts` | ~10 tests |

### Estimated Tests: ~25

---

## Execution Order

| Step | Feature | Dependencies | Estimated Scope |
|------|---------|-------------|-----------------|
| 1 | **P9.1** Productivity Analytics | None (extends existing) | 1 migration, ~16 files, ~35 tests |
| 2 | **P9.3** AI Video Design Review | None (extends existing) | 1 migration, ~6 files, ~20 tests |
| 3 | **P9.4** AI QA Expansion | None (extends existing) | 1 migration, ~12 files, ~25 tests |
| 4 | **P9.2** WhatsApp Business API | Requires Meta Business verification | 1 migration, ~12 files, ~40 tests |

> **Why this order**: P9.1, P9.3, P9.4 are self-contained extensions of existing code. P9.2 (WhatsApp) requires Meta Business Account verification which may take days -- start that process early but code it last.

---

## Totals

| Metric | Count |
|--------|-------|
| New migrations | 4 (048-051) |
| New files | ~30 |
| Modified files | ~20 |
| New API routes | ~8 |
| New components | ~10 |
| New lib files | ~4 |
| New cron endpoints | 3 |
| Estimated tests | ~120 |

---

## Cron Jobs Summary

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/productivity-snapshot` | Daily 2:00 AM UTC | Nightly metrics aggregation + alert generation |
| `/api/cron/whatsapp-digest` | Daily (per user send_time) | Morning digest delivery |
| `/api/cron/qa-monitoring` | Daily 3:00 AM UTC | Production URL QA monitoring (24h default) |

Add to `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/productivity-snapshot", "schedule": "0 2 * * *" },
    { "path": "/api/cron/whatsapp-digest", "schedule": "0 * * * *" },
    { "path": "/api/cron/qa-monitoring", "schedule": "0 3 * * *" }
  ]
}
```

---

## External Dependencies

| Service | Purpose | Setup Required |
|---------|---------|----------------|
| Meta WhatsApp Business API | Send/receive WhatsApp messages | Meta Business verification, phone number registration, message templates approval |
| Browserless.io | Multi-browser screenshots | Already configured (Chrome). Add Firefox/WebKit support via config |
| Resend.io | Scheduled report delivery | Already integrated for AM emails |
| SheetJS (xlsx) | XLSX report generation | `npm install xlsx` |

---

## Phase 9 Stabilization Checklist

After all 4 features are coded and tested:
- [ ] All 4 migrations applied to Supabase
- [ ] TypeScript clean (`npx tsc --noEmit` = 0 errors)
- [ ] All unit tests pass (~2,320+ tests)
- [ ] E2E tests pass for new features
- [ ] Cron jobs configured in vercel.json
- [ ] Dark mode verified on all new components
- [ ] STATUS.md updated with Phase 9 rows
- [ ] CLAUDE.md updated with Phase 9 context
