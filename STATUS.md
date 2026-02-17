# Agency Board - Implementation Status

> Auto-maintained status tracker. Each feature is marked as it's coded and again once tests pass.

## Legend
- **Coded**: Implementation complete (migrations, lib, API routes, components, pages)
- **Tested**: All unit/integration tests pass for this feature
- **E2E**: End-to-end Playwright tests pass
- **Build**: TypeScript + Next.js build clean

---

## Phase 1: Core MVP (v0.1.0 - v1.0.0)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P1.0 | Foundation (API layer, TanStack Query, Zustand, Vitest, Playwright) | v0.1.0 | YES | YES | YES | 14 store tests, smoke E2E |
| P1.1 | Enhanced Card Model (checklists, attachments, activity log, dependencies, custom fields, mentions) | v0.2.0 | YES | YES | YES | Migration 002, 13 type tests, card-enhanced E2E |
| P1.2 | RBAC & Permissions (6 roles, board members, column move rules, RLS rewrite) | v0.3.0 | YES | YES | YES | Migration 003, 342 permission tests, rbac E2E |
| P1.3 | Department Board Schemas + Automation Engine (8 board types, templates, triggers/actions) | v0.4.0 | YES | YES | YES | Migration 004, 75 schema+automation tests |
| P1.4 | Briefing System (templates, completeness scoring, card-move enforcement) | v0.5.0 | YES | YES | YES | Migration 005, 27 briefing tests, briefing E2E |
| P1.5 | Client Strategy Map (clients, credentials vault, training, doors/keys, map sections) | v0.6.0 | YES | YES | YES | Migration 006, 27 encryption+client tests, client-strategy-map E2E |
| P1.6 | Cross-Board Workflows & Notifications (notification center, handoff rules, onboarding templates) | v0.7.0 | YES | YES | YES | Migration 007, 11 notification tests, notifications E2E |
| P1.7 | Trello Migration (API client, entity mapping, wizard UI, progress tracking) | v0.8.0 | YES | YES | YES | Migration 008, 38 migration tests, migration E2E |
| P1.8 | Backup & Disaster Recovery (full backup/restore, checksum validation, storage upload) | v0.9.0 | YES | YES | YES | Migration 009, 36 backup tests, backup E2E |
| P1.9 | Stabilization & v1.0.0 | v1.0.0 | YES | YES | YES | 599 tests, TS clean, build clean |

---

## Phase 2: AI Systems & Client Boards (v1.1.0 - v2.0.0)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P2.0 | AI Infrastructure (API key mgmt, cost tracking, model config) | v1.1.0 | YES | YES | -- | Migration 010, 89 AI tests, 10 API routes, 6 components |
| P2.1 | AI Design Review (vision AI, change request matching) | v1.2.0 | YES | YES | YES | Migration 011, 45 tests |
| P2.2 | AI Dev QA (headless browser, viewport screenshots) | v1.3.0 | YES | YES | YES | Migration 012, 38 tests |
| P2.3 | AI Chatbot (3 scope levels, streaming) | v1.4.0 | YES | YES | YES | Migration 013, 43 tests |
| P2.4 | Client Boards & Portal (magic-link auth, ticket routing) | v1.5.0 | YES | YES | YES | Migration 014, 34 tests |
| P2.5 | Client AI Brain (pgvector RAG, auto-indexing) | v1.6.0 | YES | YES | YES | Migration 015, 23 tests |
| P2.6 | Nano Banana (Gemini image edit/generate) | v1.7.0 | YES | YES | YES | 11 tests |
| P2.7 | Digital Asset Library (auto-archive, version history) | v1.7.0 | YES | YES | YES | Migration 016, 52 tests |
| P2.8 | Wiki / Knowledge Base (TipTap editor, versioning) | v1.8.0 | YES | YES | YES | Migration 017, 29 tests |
| P2.9 | AM Client Update Emails (Resend.io, Google Calendar) | v1.8.0 | YES | YES | YES | Migration 018, 13 tests |
| P2.10 | Calendar/List Views & Reporting | v1.9.0 | YES | YES | YES | 11 tests |
| P2.11 | Phase 2 Stabilization | v2.0.0 | YES | YES | YES | 987 tests, 39 E2E |

---

## Phase 3: Power Features & AI Video (v2.1.0 - v3.0.0)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P3.1 | Time Tracking | v2.1.0 | YES | YES | YES | Migration 019 |
| P3.2 | Automation Rules Builder (visual UI) | v2.2.0 | YES | YES | YES | Migration 020 |
| P3.3 | AI Video Generation (Sora 2 + Veo 3) | v2.3.0 | YES | YES | YES | Migration 021 |
| P3.4 | AI Cost Profiling & Model Management | v2.4.0 | YES | YES | YES | Migration 022 |
| P3.5 | Integrations (Slack, GitHub, Figma) | v2.5.0 | YES | YES | YES | Migration 023 |
| P3.6 | Analytics, White-Label, Gantt | v2.6.0 | YES | YES | YES | Migration 024 |
| P3.7 | Phase 3 Stabilization | v3.0.0 | YES | YES | YES | 1172 tests |

---

## Phase 4: WhatsApp & Productivity (v3.1.0 - v4.0.0)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P4.0-4.1 | WhatsApp Integration (phone linking, DND, throttling, groups, quick actions, digest) | v3.1.0 | YES | YES | YES | Migration 025 |
| P4.2 | Team Productivity Analytics (cycle time, on-time rate, scorecards, snapshots) | v3.2.0 | YES | YES | YES | Migration 026 |
| P4.3 | Revision Analysis & Export (ping-pong detection, outliers, CSV export) | v3.3.0 | YES | YES | YES | Migration 027 |
| P4.4 | Phase 4 Stabilization | v4.0.0 | YES | YES | YES | 1297 tests |

---

## Phase 5: Scale & Optimize (v4.1.0 - v5.0.0)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P5.0 | Public API & Webhooks (API keys, rate limiting, HMAC webhooks, delivery log) | v4.1.0 | YES | YES | YES | Migration 028 |
| P5.1-5.2 | AI Enhancements + Enterprise (SSO SAML/OIDC, IP whitelist, audit log) | v4.2.0 | YES | YES | YES | Migration 029 |
| P5.3 | Performance Optimization (cursor pagination, N+1 fix, batch loading) | v4.3.0 | YES | YES | YES | Migration 030 |
| P5.4 | WhatsApp Advanced + Productivity Polish | v4.4.0 | YES | YES | YES | Migration 031 |
| P5.5 | Phase 5 Stabilization | v5.0.0 | YES | YES | YES | 1471 tests |
| P5.6 | Multi-Tenant + Billing (conditional) | v5.1.0 | -- | -- | -- | Deferred |

---

## Phase 6: Notifications, Dark Mode, Presence & AI QA (v5.1.0 - v6.0.0)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P6.1 | Browser Push Notifications (VAPID, web-push, Resend digest, cron) | v5.1.0 | YES | YES | -- | Migration 032, 15 tests |
| P6.2 | Dark Mode (`dark:` classes across 168+ components) | v5.1.0 | YES | YES | YES | Tailwind dark variant, 3 E2E tests |
| P6.3 | Live Presence & Conflict Resolution (Supabase Realtime, ConflictModal, useEditLock) | v5.1.0 | YES | YES | -- | Migration 033, 5 useEditLock tests |
| P6.4 | AI Lighthouse + axe-core Audits | v5.1.0 | YES | YES | -- | lighthouse-audit.ts, 25 tests |
| P6.5 | AI Visual Diff (pixelmatch) | v5.1.0 | YES | YES | -- | visual-diff.ts, 20 tests |
| P6.6 | AI Visual Regression Testing | v5.1.0 | YES | YES | -- | Migration 034, 17 tests |
| P6.7 | AI Scheduled QA Monitoring | v5.1.0 | YES | YES | -- | qa-scheduler.ts, 15 tests |
| P6.8 | AI Video Board Review | v5.1.0 | YES | YES | -- | video-frame-extractor.ts + video-review.ts, 35 tests |

---

## Phase 7: Board UX, Agents & Podcast Module (v6.1.0+)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P7.1 | Agency Roles & Signup Approval (agency_role enum, account_status, board_role_access) | v6.1.0 | YES | YES | -- | Migration 035, 15 tests |
| P7.2 | Board Positioning (manual board ordering) | v6.1.0 | YES | YES | -- | Migration 036 |
| P7.3 | Board UX Enhancements (backgrounds, favorites, card covers, archive) | v6.1.0 | YES | YES | YES | Migration 037, 8 archive/star tests, 6 E2E tests |
| P7.4 | Multi-Source Brain Indexing (map_board, wiki, asset, email sources) | v6.1.0 | YES | YES | -- | Migration 038, 19 brain-indexer tests |
| P7.5 | Agent Skills System (16 marketing skills, quality tiers, execution tracking) | v6.2.0 | YES | YES | YES | Migration 039, 29 skill + 81 engine + 15 executor tests, 4 E2E |
| P7.6 | Trello Alignment (migration data cleanup) | v6.2.0 | YES | YES | -- | Migration 040 |
| P7.7 | Board Archive & Star (star boards, archive boards) | v6.2.0 | YES | YES | YES | Migration 041, 8 tests, 6 E2E tests |
| P7.8 | Podcast Guest Acquisition (scout agent, approval queue, outreach pipeline) | v6.3.0 | YES | YES | YES | Migration 042, 37 scout + 34 email + 9 route tests, 6 E2E |
| P7.9 | Saved Filters & Tier B Features (burndown charts, satisfaction tracking, client approval workflows) | v6.3.0 | YES | YES | -- | Migration 043, 22 saved-filter + 18 gantt + 18 perf tests |
| P7.10 | Standalone Agent Launcher (/agents page, agent execution API) | v6.3.0 | YES | YES | YES | AgentsDashboard, 4 route tests, 4 E2E tests |
| P7.11 | Podcast Scout Web Search Grounding (two-phase: web_search + JSON extraction) | v6.3.0 | YES | YES | -- | podcast-scout.ts, 37 scout-pipeline tests |
| P7.12 | LinkedIn Scout Pipeline (4-step wizard: LinkedIn search, Snov.io enrichment, AI research, approval) | v6.4.0 | YES | YES | -- | Migration 045, ScoutWizard (826 lines), scout-pipeline.ts (793 lines), 3 API routes, Snov v2, 37 scout-pipeline tests |

---

## Tier B Features (implemented across phases)

| Feature | Coded | Notes |
|---------|-------|-------|
| Burndown Charts | YES | BurndownChart.tsx in analytics |
| Velocity Charts | YES | VelocityChart.tsx in analytics |
| Satisfaction Trends | YES | SatisfactionTrends.tsx, SurveyWidget.tsx |
| Saved Filter Views | YES | saved-filters.ts, Migration 043 |
| Client Approval Workflows | YES | pending-approval page, approval API routes |
| Map Board PDF Export | YES | MapBoardView with export |
| Gantt Chart View | YES | GanttView.tsx |
| Performance Monitor | YES | PerformanceMonitor.tsx, VirtualBoardNote.tsx |

---

## Codebase Statistics

| Metric | Count | Last Updated |
|--------|-------|-------------|
| SQL Migrations | 45 | 2026-02-14 |
| API Routes | 270 | 2026-02-15 |
| React Components | 198 | 2026-02-15 |
| Page Routes | 39 | 2026-02-15 |
| Lib Files | 73 | 2026-02-14 |
| AI Modules (src/lib/ai/) | 25 | 2026-02-14 |
| Hooks | 10 | 2026-02-14 |
| Unit/Integration Tests | 2200 across 91 files | 2026-02-16 |
| E2E Test Files | 13 | 2026-02-16 |
| Component Domain Folders | 36 | 2026-02-14 |
| App Route Groups | 21 | 2026-02-14 |
| TypeScript Clean | YES | 2026-02-16 |

---

## Phase 8: UI Shell Features + Performance (v6.5.0+)

| # | Feature | Version | Coded | Tested | E2E | Notes |
|---|---------|---------|-------|--------|-----|-------|
| P8.1 | Board Maintenance / Workspace Dedup (settings page, select boards, scan, cleanup report) | v6.5.0 | YES | YES | YES | `/settings/board-maintenance`, `/api/dedup/workspace`, 9 dedup tests, 13 E2E tests (shared). Ran cleanup: 3,118 dupes deleted |
| P8.2 | Performance Optimization (board load < 2s, card detail < 500ms) | v6.5.0 | YES | YES | -- | Reduced card payload, signed URL cache (50min TTL), 15 cache tests |
| P8.3 | Smart Search Bar with AI Bot (top center nav, keyword + AI mode, Create button) | v6.6.0 | YES | YES | YES | SmartSearchBar, /api/board-assistant, 36 search-mode + 6 assistant tests, 13 E2E tests (shared) |
| P8.4 | Team Presence Bar with Sharing Controls (top right nav, avatars, share modal) | v6.6.0 | YES | YES | YES | ShareButton + ShareModal, 15 presence-utils tests, 13 E2E tests (shared) |
| P8.5 | Bottom Navigation / View Switcher (floating tab bar, Inbox/Planner/Board/Switch views) | v6.5.0 | YES | YES | YES | BottomNavBar, InboxView, PlannerView, BoardSwitcher, 42 bottom-nav tests, 13 E2E tests (shared) |

---

## Current Work

**Phase 8 complete (all features coded + tested).** P8.1-P8.5 all coded and tested. 123 new unit tests + 13 E2E tests. Total: 2,200 unit tests across 91 files, 13 E2E spec files. TypeScript clean, all tests pass.

### P7.12 Scout Pipeline - Detailed Status

| Component | Status | Notes |
|-----------|--------|-------|
| Migration 045 (DB schema) | DONE | `current_step` column, `awaiting_input` status, `scout_config` service. **Needs SQL editor apply.** |
| Type definitions | DONE | `LinkedInSuggestion`, `EnrichedProfile`, `FullCandidateProfile`, `ScoutConfig` in types.ts |
| Fire-and-forget scout agent | DONE | `podcast-scout.ts` - two-phase web search + JSON extraction |
| Scout config DB seed | DONE | Default query/location/tool_focus seeded in `pga_integration_configs` |
| ScoutWizard.tsx | DONE | 826-line 4-step interactive wizard with resume, selection, SSE streaming |
| Step-specific API endpoints | DONE | `scout/route.ts` (create/get), `scout/[runId]/step/route.ts` (SSE per step), `scout/config/route.ts` |
| Pause/resume (awaiting_input) | DONE | `current_step` tracking, `awaiting_input` status, auto-resume on mount |
| Snov.io v2 enrichment (Step 2) | DONE | `enrichLinkedInProfiles()` in email-discovery.ts, `/v2/li-profiles-by-urls` start+poll |
| AI deep research (Step 3) | DONE | Per-candidate web search via `web_search_20250305`, JSON profile extraction |
| Scout config settings UI | DONE | `scout_config` service in PodcastIntegrationSettings with query/location/tools/max fields |
| Scout page | DONE | `/podcast/scout` page with Sidebar + Header + ScoutWizard |

### Pending User Actions
- Run Migration 044 + 045 SQL in Supabase SQL Editor (see CLAUDE.md for SQL)
