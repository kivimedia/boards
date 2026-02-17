# Agency Board -- Claude Context

## Project
Agency Board is an internal project management platform for a marketing agency. Built with Next.js 14, Supabase, Tailwind CSS, TypeScript. See `PRD.md` for full requirements and `STATUS.md` for implementation status.

## User Preferences
- **Screenshots**: User saves screenshots to `C:\Users\raviv\Downloads\Screenshot_9999.jpg` (or `ss1.jpg`, `ss2.jpg` etc). When they say "check the ss", read the file, then rename it to `seen_FILENAME`.
- **Supabase service role key**: Already in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`
- **Supabase URL**: `https://uqoogrnrzfsurupqkgco.supabase.co`
- **No emdash in headlines**: Never use `---` in page titles or UI headlines (use plain dashes)
- **Start dev server**: `npx next dev --turbo` (runs on localhost:3000)
- **Run env vars in node**: `export $(grep -v '^#' .env.local | xargs) && node -e '...'`

## Session Summary (2026-02-17)

### What Was Done This Session
1. **P8.6 Board AI Assistant Inline Charts** -- Added chart generation to the board AI assistant. When users ask analytical questions ("show workload distribution", "chart cards per list", "priority breakdown"), the AI returns an inline SVG chart alongside its text response. Supports bar, pie (donut), and line charts. AI decides when a chart is appropriate via prompt instructions. `validateChartData()` server-side validation (type, bounds 2-12 items, truncation, rounding). 57 new tests, TypeScript clean.

### Previous Session (2026-02-16)
1. **P8.1 Dedup Cleanup** -- Ran workspace-wide dedup across all 7 boards. Deleted 3,118 duplicate cards (Mariz: 2,895, Glen: 72, Video Training: 65, Daily Cookie: 50, Abs: 35, Remember me: 1).
2. **P8.2 Performance Optimization** -- Reduced card payload from `cards(*)` to specific columns. Added 50-min in-memory signed URL cache for cover images. Batched cover signing in groups of 20. Added `staleTime: 30s` and `refetchOnMount: false` when SSR data exists to prevent double-fetch. Added 500ms debounced invalidation for real-time subscriptions. Added console.time instrumentation.
3. **P8.5 Bottom Navigation** -- Floating pill tab bar at bottom center. 4 tabs: Inbox (unassigned items list), Planner (weekly calendar view), Board (kanban), Switch Boards (overlay picker). View state in URL params (`?view=inbox|planner`). Components: BottomNavBar, NavTab, InboxView, PlannerView, BoardSwitcher.
4. **P8.4 Team Presence Bar** -- ShareButton + ShareModal integrated into BoardHeader. Modal shows member list with role badges, role change dropdown, remove button, email invite, copy board link. Uses existing board_members API.
5. **P8.3 Smart Search Bar with AI** -- SmartSearchBar replaces old BoardSearch in header. Dual-mode: keyword search (debounced 300ms, grouped by type) and AI mode (detects questions, 4+ words). AI endpoint `/api/board-assistant` gathers full board context and queries Claude API. CreateMenu with New Card/Board/Agent Run. Cmd/Ctrl+K shortcut. Cycling placeholder text.
6. **P8.1-P8.5 Test Coverage** -- Wrote 123 new unit tests across 6 test files + 13 E2E tests. Exported cache functions from board-data.ts for testability. All 2,200 unit tests pass, 13 E2E tests pass, TypeScript clean.

### Open Issues
- 2 Bad Gateway attachment uploads can be retried via "Backfill Attachments" button on migration history page
- P7.12 Scout Pipeline needs end-to-end testing with real API keys (Snov.io, Hunter.io)

## Phase 8: UI Shell Features + Performance (Coded + Tested)

### P8.1 Board Maintenance / Workspace Dedup (Coded + Tested)
- **Settings page**: `/settings/board-maintenance` with board selector and dedup UI
- **API**: `GET/POST /api/dedup/workspace` for scanning/cleaning across all boards
- **Cleanup results**: 3,118 duplicates removed (Mariz 2,895, Glen 72, Video Training 65, Daily Cookie 50, Abs 35, Remember me 1)

### P8.2 Performance Optimization (Coded + Tested)
- **Reduced card payload**: `card:cards(id, title, description, priority, due_date, cover_image_url, created_at, updated_at)` instead of `cards(*)`
- **Signed URL cache**: In-memory Map with 50-min TTL, batched signing in groups of 20
- **Client optimizations**: `staleTime: 30_000` when SSR data exists, `refetchOnMount: false`, 500ms debounced invalidation for realtime subscriptions
- **Instrumentation**: `console.time()` labels: board:placements, board:metadata, board:profiles, board:indexing, board:covers, board:total

### P8.3 Smart Search Bar with AI Bot (Coded + Tested)
- **SmartSearchBar** replaces BoardSearch in BoardHeader. Dual-mode detection (search vs AI)
- **AI mode**: Triggered by question marks, question words, or 4+ words. `POST /api/board-assistant` gathers all board context and queries Claude API
- **Inline chart generation**: AI autonomously decides when to include a chart (bar/pie/line) for analytical questions. `validateChartData()` server-side validation. `BoardChartRenderer` renders compact SVG charts (viewBox 320x200) with 8-color palette, light/dark mode support
- **Chart types**: Bar (comparisons), Pie/Donut (distributions with legend), Line (temporal with gradient fill). 2-12 data items enforced
- **Create button**: Green "Create" menu with New Card, New Board, New Agent Run
- **Components**: `smart-search/SearchBar.tsx`, `SearchResults.tsx`, `AiBotResponse.tsx`, `CreateMenu.tsx`, `BoardChartRenderer.tsx`, `hooks/useSmartSearch.ts`
- **API**: `GET /api/search?q={query}&board_id={id}`, `POST /api/board-assistant { query, board_id }`

### P8.4 Team Presence Bar with Sharing Controls (Coded + Tested)
- **ShareButton + ShareModal** integrated into BoardHeader right section
- **ShareModal**: Member list with role badges (Owner/Lead/Editor/Viewer), role change dropdown, remove button, email invite, copy board link
- **Uses existing API**: `GET/POST /api/boards/[id]/members`, `PATCH/DELETE /api/boards/[id]/members/[memberId]`
- **Components**: `team-presence/ShareButton.tsx`, `team-presence/ShareModal.tsx`

### P8.5 Bottom Navigation / View Switcher (Coded + Tested)
- **BottomNavBar**: Fixed pill at bottom center (`fixed bottom-6 left-1/2 -translate-x-1/2 z-40`)
- **4 tabs**: Inbox (unassigned cards), Planner (weekly calendar), Board (kanban), Switch Boards (overlay picker)
- **View state**: URL params `?view=inbox|planner` (kanban is default, no param needed)
- **InboxView**: All unassigned cards sorted by creation date, with priority dots, labels, due dates
- **PlannerView**: 7-day calendar grid with week navigation, unscheduled sidebar
- **BoardSwitcher**: Slide-up overlay with search, grouped by board type, card counts, star indicators
- **Components**: `bottom-nav/BottomNavBar.tsx`, `NavTab.tsx`, `InboxView.tsx`, `PlannerView.tsx`, `BoardSwitcher.tsx`

## Current Work -- LinkedIn Scout Pipeline (Phase 7, P7.12)

### LinkedIn Scout Pipeline (Complete - Coded, Needs E2E Testing)
4-step interactive wizard replacing the old fire-and-forget scout:
- **Step 1**: Claude `web_search_20250305` searches LinkedIn (`site:linkedin.com/in`) with location + tool filters
- **Step 2**: Snov.io v2 LinkedIn enrichment (`/v2/li-profiles-by-urls`) + email discovery (Hunter/Snov)
- **Step 3**: Claude deep research per candidate (website, portfolio, evidence of paid work)
- **Step 4**: User approval -> save to `pga_candidates`
- **ScoutWizard** (`src/components/podcast/ScoutWizard.tsx`): 826-line multi-step wizard with SSE streaming per step
- **Scout Config**: Saved defaults in `pga_integration_configs` (service='scout_config') with location, query, tool focus
- **Run state**: `pga_agent_runs.output_json` stores inter-step data, `current_step` column tracks progress, `status='awaiting_input'` between steps
- **Migration 045**: Applied. current_step column, awaiting_input status, scout_config service

### Podcast Guest Acquisition (Complete)
- **Approval Queue** (`/podcast/approval`): Bulk select/approve/reject, location filter, email filter, warning banner
- **Outreach Pipeline** (`/podcast/outreach`): Status progression (approved > outreach_active > replied > scheduled > interviewed)
- **Integrations** (`/settings/podcast`): Instantly.io, Hunter.io, Snov.io, Calendly, Scout Config
- **Email Discovery** (`src/lib/integrations/email-discovery.ts`): Hunter.io + Snov.io fallback chain, Snov LinkedIn enrichment
- **Stats**: Migration 042, 14 API routes, 4 components, 3 pages

### Agent System (Complete)
- **Agent Skills** (`/settings/agents`): 16 marketing skills, quality tiers, SkillQualityDashboard
- **Agent Launcher** (`/agents`): Standalone agent execution with skill picker, prompt input, SSE streaming
- **Board Agents**: Per-board agent configuration and execution tracking
- **API**: `/api/agents/run` (standalone), `/api/boards/[id]/agents` (board-scoped)
- **Stats**: Migration 039, agent-engine.ts, agent-executor.ts, agent-skill-seeds.ts

## Trello Migration (Complete)
- **Latest Job ID**: `a813b402-35cc-4d52-8e93-a960399ff991`
- **Status**: Complete (1 board, 13 lists, 3438 cards, 1000 comments, 7994 attachments, 11 labels, 52 checklists)
- **Previous Job**: `dd67d7d4-9673-4458-9db6-9a4aaf58fd60` (cancelled, was the original 7-board import)
- **Cross-job dedup**: `getGlobalMappings()` in trello-migration.ts prevents duplicates when re-importing same board
- **Resilience**: Retry with exponential backoff (3 attempts), rate limit handling, per-card error isolation, 15-min maxDuration, SSE heartbeat
- **Attachments**: Trello-hosted files need OAuth headers (`Authorization: OAuth oauth_consumer_key="...", oauth_token="..."`)
- **Errors**: 6 x HTTP 404 (files gone from Trello), 2 x Bad Gateway (retryable via Backfill button)

## Phase 6 (Complete + Tested)
All 8 workstreams implemented and tested (135+ tests):
1. Browser Push Notifications -- VAPID keys, web-push, migration 032, Resend digest, cron endpoint
2. Dark Mode -- `dark:` classes across 168/174 components, 3 E2E tests
3. Live Presence & Conflict Resolution -- migration 033, ConflictModal, useEditLock, 5 tests
4. AI: Lighthouse + axe-core -- lighthouse-audit.ts, LighthouseScoreGauge, 25 tests
5. AI: Visual Diff -- visual-diff.ts (pixelmatch), VisualDiffViewer, 20 tests
6. AI: Visual Regression -- migration 034, visual-regression.ts, 17 tests
7. AI: Scheduled QA Monitoring -- qa-scheduler.ts, cron endpoint, 15 tests
8. AI: Video Board AI Review -- video-frame-extractor.ts, video-review.ts, 35 tests

## Phase 7 Features (Complete - All Coded + Tested)
- Migration 035: Agency roles & signup approval (15 tests)
- Migration 036: Board positioning
- Migration 037: Board UX - backgrounds, favorites, card covers, archive (8 tests, 6 E2E)
- Migration 038: Multi-source brain indexing (19 tests)
- Migration 039: Agent skills system (125 tests, 4 E2E)
- Migration 040: Trello alignment
- Migration 041: Board archive & star (8 tests, 6 E2E)
- Migration 042: Podcast guest acquisition (80 tests, 6 E2E)
- Migration 043: Saved filters & Tier B features (58 tests)
- Migration 044: Candidate location column (applied)
- Migration 045: Scout pipeline - current_step, awaiting_input status, scout_config (applied)

## Tier B Features (Complete)
Burndown charts, velocity charts, satisfaction trends, saved filter views, client approval workflows, map board PDF export, Gantt chart view, performance monitor

## Tech Stack
- Next.js 14 (API routes), React 18, TypeScript 5.3, Tailwind 3.4
- Supabase (Postgres, Auth, Storage, Realtime)
- @hello-pangea/dnd (drag-drop), TanStack Query, Zustand
- AI: Anthropic SDK (v0.74.0 w/ web_search_20250305), OpenAI SDK, Google Generative AI SDK
- Testing: Vitest + Playwright
- 45 SQL migrations, 269+ API routes, 197+ components, 38 pages, 25 AI modules

## Conventions
- Migrations in `supabase/migrations/` numbered sequentially (next: 046)
- API routes in `src/app/api/`
- Components in `src/components/` organized by domain (36 folders)
- Lib code in `src/lib/` (AI code in `src/lib/ai/`)
- Tests in `src/__tests__/`, E2E in `e2e/`
- Hooks in `src/hooks/` (9 hooks including usePresence, useEditLock, useBoard)
- No emdash in UI headlines -- use plain text
- AIActivity union type must be kept in sync across 4 Record maps when adding new activities

## Key Architecture Notes
- `usePresence` hook with Supabase Realtime channels (`'app:global'` for sidebar online users)
- SSE streaming pattern for long-running agent executions (keeps serverless alive)
- `web_search_20250305` Anthropic server tool for grounded web search in scout agent
- Fire-and-forget pattern kills serverless functions -- must use streaming SSE
- Multi-step agent runs: `pga_agent_runs.output_json` stores inter-step state, `status='awaiting_input'` pauses for user input
- Snov.io v2 LinkedIn enrichment: `POST /v2/li-profiles-by-urls/start` -> poll `/result` (1 credit/URL, max 10/batch)
- `card-attachments` Supabase Storage bucket for file uploads (100MB limit)
- Idempotent migrations via `migration_entity_map` table
- Cross-job dedup via `getGlobalMappings()` in trello-migration.ts
- My Tasks pagination: 50 cards/page, parallel queries, Map lookups (fixed from timing out)

## Recent File Changes (This Session - 2026-02-17)
- `src/lib/types.ts` -- Added BoardChartType, BoardChartDataPoint, BoardChartData types; extended AiAssistantResponse with optional chart_data
- `src/app/api/board-assistant/route.ts` -- Added validateChartData() exported helper, extended system prompt with chart generation rules, integrated chart validation into response pipeline
- `src/hooks/useSmartSearch.ts` -- Added aiChartData state, reset/set from SSE done event, returned from hook
- `src/components/smart-search/AiBotResponse.tsx` -- Added chartData prop, renders BoardChartRenderer after response text (hidden during streaming)
- `src/components/smart-search/SearchBar.tsx` -- Wired aiChartData from hook to AiBotResponse chartData prop
- `src/components/smart-search/BoardChartRenderer.tsx` -- NEW: SVG chart component (bar/pie/line), 8-color palette, TrendBadge, light/dark mode
- `src/__tests__/lib/board-assistant-chart.test.ts` -- NEW: 57 tests for validateChartData, type shapes, SSE parsing, chart data prep

## Previous Session File Changes (2026-02-16)
- `src/lib/board-data.ts` -- Performance: reduced card payload, signed URL cache, batched cover signing, timing instrumentation
- `src/hooks/useBoard.ts` -- Performance: staleTime 30s, refetchOnMount false, debounced invalidation 500ms
- `src/lib/types.ts` -- Added 'inbox' | 'planner' to BoardViewMode union
- `src/components/board/BoardView.tsx` -- Integrated BottomNavBar, InboxView, PlannerView. URL param `?view=` routing
- `src/components/board/BoardHeader.tsx` -- Replaced BoardSearch with SmartSearchBar. Added ShareButton + ShareModal
- `src/components/bottom-nav/BottomNavBar.tsx` -- NEW: Floating pill tab container (4 tabs)
- `src/components/bottom-nav/NavTab.tsx` -- NEW: Individual tab component
- `src/components/bottom-nav/InboxView.tsx` -- NEW: Unassigned items flat list view
- `src/components/bottom-nav/PlannerView.tsx` -- NEW: Weekly calendar view with unscheduled sidebar
- `src/components/bottom-nav/BoardSwitcher.tsx` -- NEW: Board picker overlay with search and grouping
- `src/components/smart-search/SearchBar.tsx` -- NEW: Smart search with dual-mode (keyword/AI) + Create menu
- `src/components/smart-search/SearchResults.tsx` -- NEW: Grouped search results dropdown
- `src/components/smart-search/AiBotResponse.tsx` -- NEW: AI chat response panel
- `src/components/smart-search/CreateMenu.tsx` -- NEW: Quick-create dropdown (Card/Board/Agent)
- `src/hooks/useSmartSearch.ts` -- NEW: Hook for debounce, mode detection, API calls
- `src/components/team-presence/ShareButton.tsx` -- NEW: Share trigger button
- `src/components/team-presence/ShareModal.tsx` -- NEW: Member list, role mgmt, invite, copy link
- `src/app/api/board-assistant/route.ts` -- NEW: AI board assistant endpoint (Claude API)
- `src/components/settings/BoardMaintenanceContent.tsx` -- Fixed Set<string> TypeScript error
- `src/__tests__/lib/smart-search-mode.test.ts` -- NEW: 36 tests for detectMode() (P8.3)
- `src/__tests__/lib/bottom-nav-utils.test.ts` -- NEW: 42 tests for InboxView/PlannerView/BoardSwitcher utils (P8.5)
- `src/__tests__/lib/team-presence-utils.test.ts` -- NEW: 15 tests for role helpers (P8.4)
- `src/__tests__/lib/board-data-cache.test.ts` -- NEW: 15 tests for signed URL cache (P8.2)
- `src/__tests__/lib/dedup-workspace.test.ts` -- NEW: 9 tests for dedup scoring (P8.1)
- `src/__tests__/lib/board-assistant.test.ts` -- NEW: 6 tests for assistant API (P8.3)
- `e2e/phase8-ui.spec.ts` -- NEW: 13 E2E tests for P8.1-P8.5 auth guards + page navigation
