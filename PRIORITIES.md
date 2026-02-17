# Implementation Priorities -- Master Plan

> **Resume Guide**: When starting a new CLI session, share this file with Claude to pick up where you left off. Check the status column for the latest progress.
> **Last updated**: 2026-02-17

---

## Documentation Index

| File | Purpose | Status |
|------|---------|--------|
| `PRIORITIES.md` | **This file** -- master plan, priorities, statuses | Active |
| `STATUS.md` | Implementation status for all phases + codebase stats | Active |
| `ISSUES.md` | Known bugs + planned features with severity | Active |
| `CLAUDE.md` | Claude Code context (conventions, architecture, current work) | Active |
| `PRD.md` | Full product requirements document | Reference |
| `PLAN.md` | Phase 6 implementation plan (8 workstreams) | Complete |
| `AGENT-PLAN.md` | Agent skills execution pipeline plan | Complete |
| `TRELLO-ALIGNMENT.md` | Trello card UX gaps plan | Complete |
| `PODCAST-GUEST-ACQUISITION.md` | Podcast module plan (6 phases) | Complete |
| `CRON-SETUP.md` | Vercel cron configuration guide | Reference |

---

## Active Work

No active priorities. All planned phases complete.

---

## Completed Priorities

### Priority H: Phase 9 - PRD Future Features -- COMPLETE

6 sub-phases done. Migrations 048-052 applied. 2,798 tests across 110 files, TypeScript clean.

| # | Feature | Status |
|---|---------|--------|
| P9.1 | Productivity Analytics (cron, PDF/XLSX, dept rollup, anomaly alerts, 3 components) | **Done** |
| P9.2 | WhatsApp Business API (Meta client, webhook, media, digest cron, 2 components) | **Done** |
| P9.3 | AI Video Design Review (frame extraction, multi-frame review, VideoFrameComparison) | **Done** |
| P9.4 | AI QA Expansion (recurring monitoring, multi-browser, link-checker, WCAG, 4 components) | **Done** |
| P9.5 | Scout Pipeline Enhancements (dossiers, quality scoring, outreach emails, cost tracking) | **Done** |
| P9.6 | UI Integration (wired all orphaned P9 components into pages, extended types) | **Done** |

### Priority F: LinkedIn Scout Pipeline (P7.12) -- COMPLETE

10/10 tasks done. ScoutWizard, 4-step SSE pipeline, Snov.io enrichment, AI deep research, pause/resume.

| # | Component | Status |
|---|-----------|--------|
| 1 | Migration 044 (candidate location column) | **Applied** |
| 2 | Migration 045 (DB schema, current_step, awaiting_input) | **Applied** |
| 3 | Type definitions (LinkedInSuggestion, EnrichedProfile, etc.) | **Done** |
| 4 | Fire-and-forget scout agent (podcast-scout.ts) | **Done** |
| 5 | Scout config DB seed | **Done** |
| 6 | ScoutWizard.tsx -- 4-step interactive UI | **Done** |
| 7 | Step-specific API endpoints with SSE per step | **Done** |
| 8 | Pause/resume (awaiting_input status handling) | **Done** |
| 9 | Snov.io v2 enrichment + AI deep research | **Done** |
| 10 | Scout config settings UI in /settings/podcast | **Done** |

### Priority G: Bug Fixes + UX Polish -- COMPLETE

| ID | Item | Status |
|----|------|--------|
| BUG-001 | Card click not opening modal (drag/click conflict) | **Fixed** |
| BUG-002 | Board background color picker not applying | **Fixed** |
| FEAT-001 | Click-and-drag horizontal panning on boards | **Done** |
| FEAT-002 | Trello board-specific re-import | **Done** |

### Priority A: Agent Skills (AGENT-PLAN.md) -- COMPLETE

9/9 tasks done. Migration 039, 16 skills, execution engine, SSE streaming, settings UI.

### Priority B: Phase 6 (PLAN.md) -- COMPLETE

7/7 tasks done. Dark mode, live presence, push notifications, AI audit pipeline.

### Priority C: Trello UX (TRELLO-ALIGNMENT.md) -- COMPLETE

8/8 tasks done. Card covers, comment threading, quick actions, rich text.

### Priority D: Podcast Module (PODCAST-GUEST-ACQUISITION.md) -- COMPLETE

12/12 phases done. Scout agent, approval queue, outreach pipeline, 5 integrations.

### Priority E: Tier B Features -- COMPLETE

| # | Feature | Status |
|---|---------|--------|
| 1 | Bulk card operations (multi-select) | Done |
| 2 | Saved filter views | Done |
| 3 | Client satisfaction tracking | Done |
| 4 | Client approval workflows | Done |
| 5 | Burndown charts + velocity metrics | Done |
| 6 | Map Board PDF export | Done |
| 7 | Gantt Chart view | Done |
| 8 | Performance Monitor | Done |

---

## Backlog (Tier C -- NOT FOR NOW)

> These items are intentionally deferred. They are not planned for any upcoming phase.

| # | Task | Status | Priority |
|---|------|--------|----------|
| 1 | AI A/B testing | NOT FOR NOW | -- |
| 2 | Google Drive / Dropbox integration | NOT FOR NOW | -- |
| 3 | Email-to-card | NOT FOR NOW | -- |
| 4 | Zapier / Make | NOT FOR NOW | -- |
| 5 | Redis, CDN, Sentry, Framer Motion | NOT FOR NOW | -- |
| 6 | Multi-tenant + billing | NOT FOR NOW | -- |
| 7 | 1Password / Bitwarden integration | NOT FOR NOW | -- |

---

## Execution Order

| Step | Focus | Status |
|------|-------|--------|
| 1 | Phase 6 Polish (env, cron, testing) | **Done** |
| 2 | Trello UX (card covers, threading, quick actions) | **Done** |
| 3 | Agent Skills (16 skills, execution engine) | **Done** |
| 4 | Podcast Module (scout, outreach, integrations) | **Done** |
| 5 | Tier B Features (burndown, Gantt, saved filters) | **Done** |
| 6 | LinkedIn Scout Pipeline (4-step wizard) | **Done** |
| 7 | Bug fixes + UX polish | **Done** |
| 8 | Tier C backlog | **NOT FOR NOW** |
| 9 | Phase 9: PRD Future Features (P9.1-P9.6) | **Done** |
