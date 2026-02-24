# Agency Board — Phase 6 Implementation Plan

> **Created:** 2026-02-10
> **Status:** IN PROGRESS
> **Scope:** Dark Mode, Live Presence, Browser Push Notifications, Post-MVP AI Enhancements
> **Excluded:** Accessibility (WCAG) features — deferred to a separate phase

---

## Overview

Six workstreams, ordered by priority (bang for buck):

1. **Browser Push Notifications** — small effort, scaffolding already done
2. **Dark Mode** — mechanical but wide, infrastructure ready
3. **Live Presence & Conflict Resolution** — prevents data loss
4. **AI: Lighthouse + Accessibility Audit in Dev QA** — extends existing QA pipeline
5. **AI: Visual Diff for Design Review** — new UI component
6. **AI: Visual Regression Testing** — baseline management + pixel diff
7. **AI: Scheduled QA Monitoring** — cron + drift detection
8. **AI: Video Board AI Review** — frame extraction + existing review pipeline

---

## Workstream 1: Browser Push Notifications

### Current State
- `PushPermissionPrompt.tsx` — requests browser permission, registers service worker
- `sw.js` — handles push events and notification clicks
- API routes exist: `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/send`
- `push-notifications.ts` — all functions exist but `sendPush()` is a placeholder (just logs)
- `DigestSettings.tsx` — UI for configuring digest emails exists
- `digest-emails.ts` — scaffolded, `sendDigest()` is a placeholder

### Missing
- VAPID keys (env vars)
- `web-push` npm package
- `push_subscriptions` database table
- `digest_configs` database table
- Actual `sendPush()` implementation
- Wire push into `notification-service.ts` pipeline
- Wire digest emails through Resend.io (API key now configured)

### Steps

#### 1.1 Generate VAPID keys and configure environment
- [x] Run `npx web-push generate-vapid-keys`
- [x] Add to `.env.local`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g., `mailto:ziv@dailycookie.co`)
- [x] Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for client-side usage
- [ ] Update `.env.local.example` with placeholder entries

#### 1.2 Install web-push package
- [x] `npm install web-push`

#### 1.3 Create database migration (Migration 032)
- [x] Create `supabase/migrations/032_push_and_digest.sql`
- [x] Table `push_subscriptions`: id, user_id, endpoint, p256dh, auth_key, created_at
- [x] Table `digest_configs`: id, user_id, frequency (daily/weekly), include_assigned, include_overdue, include_mentions, include_completed, send_time, enabled, created_at, updated_at
- [x] RLS policies for both tables (users can only access their own rows)

#### 1.4 Implement sendPush()
- [x] Replace placeholder in `src/lib/push-notifications.ts`
- [x] Use `web-push.sendNotification()` with VAPID credentials
- [x] Handle expired/invalid subscriptions (delete on 410 response)
- [x] Add error handling and logging

#### 1.5 Wire push into notification pipeline
- [x] In `src/lib/notification-service.ts`, after `createNotification()`:
  - Check user's `notification_preferences.push_enabled`
  - Fetch user's active push subscriptions
  - Call `sendPush()` for each subscription
- [x] Respect quiet hours from preferences

#### 1.6 Wire digest emails through Resend
- [x] In `src/lib/digest-emails.ts`, implement `sendDigest()`:
  - Query notifications from the digest period
  - Format as HTML email template
  - Send via Resend.io using the configured API key
- [x] Add a digest cron endpoint: `/api/cron/digest` that checks all users with enabled digests and sends if due
- [ ] Use Vercel Cron or similar to trigger daily

#### 1.7 Test
- [ ] Verify push subscription flow in browser
- [ ] Verify push notification delivery when a card is assigned
- [ ] Verify digest email arrives via Resend
- [ ] Run existing notification tests to confirm no regressions
- [ ] Add new tests for push and digest functions

---

## Workstream 2: Dark Mode

### Current State
- `darkMode: 'class'` configured in `tailwind.config.ts`
- `useTheme` hook works: localStorage persistence, system-preference detection
- `ThemeToggle` component in Header (Light/Dark/System buttons)
- CSS variables defined in `globals.css` (`.dark` selector) but not used by components
- Only Header and ThemeToggle have `dark:` Tailwind variants
- ~48 hardcoded hex colors across 14 files
- ~202 TSX component files total

### Steps

#### 2.1 Audit and categorize components
- [x] Generate a list of all TSX files that use `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*` etc.
- [x] Categorize into: layout, board, card, modal/dialog, form, analytics/charts, settings, auth
- [x] Identify the ~14 files with hardcoded hex colors

#### 2.2 Define the dark palette mapping
- [x] Document the mapping: `bg-white` → `dark:bg-dark-surface`, `text-gray-900` → `dark:text-slate-100`, etc.
- [x] Standardize: light surfaces, dark surfaces, borders, muted text, primary text
- [x] Use the CSS variables already defined or Tailwind's built-in dark classes

#### 2.3 Update layout components (highest visibility)
- [x] `Sidebar.tsx` — already dark-first; works in both modes
- [x] `Header.tsx` — already partially done; verify fully correct
- [x] `layout.tsx` — base page background
- [x] `ThemeToggle.tsx` — already done; verify

#### 2.4 Update core UI components (propagates everywhere)
- [x] `Button.tsx` — add dark variants for all button styles
- [x] `Input.tsx` — dark input fields, borders, placeholder text
- [x] `Modal.tsx` — dark overlay and content background
- [x] `Avatar.tsx` — border/ring colors

#### 2.5 Update board and card components
- [x] `Board.tsx`, `BoardList.tsx`, `BoardCard.tsx` — card backgrounds, column backgrounds
- [x] `CardModal.tsx` — the big one, many nested sections and tabs
- [x] `CardChecklists.tsx`, `CardComments.tsx`, `CardActivityLog.tsx`, `CardAttachments.tsx`
- [x] `MentionInput.tsx`, `TypingIndicator.tsx`, `CardPresenceBar.tsx`
- [x] `CreateBoardModal.tsx`, `CommandPalette.tsx`

#### 2.6 Update dashboard, analytics, and settings pages
- [x] Dashboard widgets and stat cards
- [x] Analytics charts — replace hardcoded hex colors with theme-aware values
- [x] All settings pages and forms
- [x] Wiki, asset library, time tracking pages

#### 2.7 Update auth pages
- [x] Login form, magic link page, portal pages

#### 2.8 Fix hardcoded hex colors
- [x] Replace inline `backgroundColor` styles with Tailwind classes where possible
- [ ] For dynamic chart colors, create a `useChartColors()` hook that returns theme-aware color arrays
- [x] Priority badge colors, label colors — map to Tailwind classes

#### 2.9 Test
- [ ] Visual review of every major page in both light and dark mode
- [ ] Verify ThemeToggle persists across page reloads
- [ ] Verify system preference detection works
- [ ] Check that no white flashes appear on page load in dark mode
- [ ] Run existing E2E tests (should not break)

---

## Workstream 3: Live Presence & Conflict Resolution

### Current State
- `usePresence` hook — Supabase presence channels, tracks userId/displayName/avatarUrl/lastSeen
- `PresenceAvatars` — shows who's viewing a board (max 5 + overflow)
- `CardPresenceBar` — "Also viewing: [names]" in card modals
- `useTypingIndicator` + `TypingIndicator` — broadcast-based typing status
- No conflict resolution — last-write-wins silently

### Steps

#### 3.1 Optimistic locking on cards
- [x] Add `version` column to `cards` table (Migration 033, integer, default 1, auto-increment on update)
- [x] Or use the existing `updated_at` timestamp as a version check
- [x] On card save API routes, check that the version/timestamp matches what the client had when it loaded
- [x] If mismatch: return 409 Conflict with the current card data

#### 3.2 Client-side conflict handling
- [x] When save returns 409, show a conflict dialog:
  - "This card was edited by [name] while you were editing."
  - Options: "Reload their version" / "Overwrite with mine" / "Cancel"
- [x] Create a `ConflictDialog.tsx` component
- [x] Wire into `CardModal` save flow

#### 3.3 Field-level edit broadcasting
- [x] When a user starts editing a card field (title, description), broadcast via presence: `{ editing: 'description', user: 'Yael' }`
- [x] Other users viewing the same card see: "Yael is editing the description" and the field appears read-only/dimmed
- [x] Release lock on save, blur, or 30-second idle timeout
- [x] Create an `EditLockIndicator.tsx` component

#### 3.4 Extend presence to more surfaces
- [ ] Wiki page editing — show who's viewing/editing
- [ ] Settings pages — optional, lower priority

#### 3.5 Online status indicators
- [ ] Add green/gray dot to user avatars based on presence data
- [ ] Show in @mention dropdowns, team views, sidebar

#### 3.6 Test
- [ ] Open the same card in two browser tabs, edit in one, verify conflict detection
- [ ] Verify field lock broadcast works
- [ ] Verify lock releases on timeout
- [ ] Run existing tests to confirm no regressions
- [ ] Add tests for conflict detection and resolution

---

## Workstream 4: AI — Lighthouse + Accessibility Audit in Dev QA

### Current State
- `dev-qa.ts` captures screenshots at 3 viewports via Browserless.io
- Sends screenshots + QA checklist to Claude vision
- Results stored in `ai_qa_results` with `performance_metrics` JSON field
- Browserless.io integration already handles headless browser automation

### Steps

#### 4.1 Add Lighthouse to Dev QA pipeline
- [x] Install `lighthouse` package (or use Browserless.io's Lighthouse endpoint if available)
- [x] After screenshot capture in `dev-qa.ts`, run Lighthouse audit on the URL
- [x] Extract scores: Performance, Accessibility, Best Practices, SEO (0-100 each)
- [x] Store in `ai_qa_results.performance_metrics` JSON (extend the existing field)

#### 4.2 Add axe-core accessibility audit
- [x] Install `@axe-core/playwright` or `axe-core`
- [x] During the headless browser session, inject axe-core script and run audit
- [x] Capture violations with: rule ID, description, impact (critical/serious/moderate/minor), affected elements
- [x] Store alongside QA results

#### 4.3 Display results in UI
- [x] In the Dev QA results tab of CardModal, add a "Performance" section with Lighthouse gauge scores
- [x] Add an "Accessibility" section listing axe violations grouped by severity
- [x] Each violation shows: what's wrong, which element, how to fix

#### 4.4 Test
- [ ] Run Dev QA on a test URL and verify Lighthouse scores appear
- [ ] Verify axe-core violations are captured and displayed
- [ ] Add tests for the new pipeline steps
- [ ] Confirm existing Dev QA tests still pass

---

## Workstream 5: AI — Visual Diff for Design Review

### Current State
- Design Review stores `attachment_id` (current) and `previous_attachment_id` (previous)
- Both images are in Supabase Storage
- Results displayed as text verdicts in CardModal AI Review tab

### Steps

#### 5.1 Install image diff library
- [x] Install `pixelmatch` and `pngjs` for pixel-level comparison
- [x] Or use `resemble.js` for a higher-level API with mismatch percentage

#### 5.2 Create VisualDiffViewer component
- [x] Side-by-side view: previous image on left, current on right
- [x] Overlay mode: diff image highlighting changed pixels in pink/red
- [x] Slider mode: drag a slider left/right to reveal before/after
- [x] Toggle between modes
- [x] Show mismatch percentage

#### 5.3 Generate diff on the server
- [x] Add a `/api/cards/[id]/review/[reviewId]/diff` endpoint
- [x] Download both images from Supabase Storage
- [x] Run pixelmatch to generate a diff image
- [x] Upload diff image to Supabase Storage
- [x] Return diff image URL and mismatch stats

#### 5.4 Integrate into CardModal
- [x] In the AI Review tab, below the text verdicts, add the VisualDiffViewer
- [x] Load previous + current + diff images from storage
- [x] Show mismatch percentage as a summary stat

#### 5.5 Test
- [ ] Upload two versions of a design, trigger AI review, verify diff appears
- [ ] Verify all three view modes (side-by-side, overlay, slider)
- [ ] Add tests for the diff generation endpoint
- [ ] Confirm existing Design Review tests still pass

---

## Workstream 6: AI — Visual Regression Testing

### Current State
- Dev QA captures screenshots at 3 viewports and stores them in Supabase Storage
- Screenshots referenced in `ai_qa_results.screenshots` JSON array
- No baseline management or screenshot comparison

### Steps

#### 6.1 Baseline management
- [x] Add `qa_baselines` table (Migration 034): card_id, url, viewport, screenshot_path, approved_by, approved_at
- [x] When a Dev QA run passes and is approved, screenshots become the new baseline
- [x] UI: "Set as baseline" button on QA results

#### 6.2 Pixel-level comparison
- [x] After each QA run, compare each viewport screenshot against the baseline
- [x] Use pixelmatch (same library as Design Review visual diff)
- [x] Calculate mismatch percentage per viewport
- [x] Store diff images in Supabase Storage
- [x] Flag if mismatch exceeds threshold (configurable, default 5%)

#### 6.3 Display regression results
- [x] In Dev QA results, add a "Visual Regression" section
- [x] Show baseline vs. current vs. diff for each viewport
- [x] Highlight: "Desktop: 2% change (OK)" / "Mobile: 12% change (FLAGGED)"
- [x] "Accept changes" button to update the baseline

#### 6.4 Test
- [ ] Run QA twice on same URL, verify zero regression
- [ ] Change the page, run QA again, verify regression detected
- [ ] Add tests for baseline management and comparison

---

## Workstream 7: AI — Scheduled QA Monitoring

### Current State
- Dev QA pipeline is fully functional for on-demand runs
- No scheduling infrastructure

### Steps

#### 7.1 Database table for schedules
- [x] Add `qa_schedules` table (can be part of Migration 034): card_id, url, frequency (daily/weekly/biweekly), enabled, last_run_at, next_run_at, notify_user_id
- [x] RLS policies

#### 7.2 Cron endpoint
- [x] Create `/api/cron/qa-monitor` API route
- [x] Query all enabled schedules where `next_run_at <= now()`
- [x] For each: run the Dev QA pipeline, compare to baseline (visual regression), update next_run_at
- [x] If score drops or new critical issues: create notification for the responsible user

#### 7.3 Schedule UI
- [x] Add "Enable monitoring" toggle on Dev cards with a staging/production URL
- [x] Frequency selector: daily, weekly, biweekly
- [x] Show last monitoring run result and next scheduled time

#### 7.4 Drift alerts
- [x] Compare current run score to previous run score
- [x] If score drops by >10 points or new critical finding: send push notification + in-app notification
- [x] "Your client's homepage score dropped from 92 to 71 — 3 new issues found"

#### 7.5 Test
- [ ] Create a schedule, trigger cron manually, verify QA runs
- [ ] Verify notification on score drop
- [ ] Add tests for scheduling logic

---

## Workstream 8: AI — Video Board AI Review

### Current State
- Design Review pipeline: takes two images + change requests → Claude vision → structured verdicts
- Video Editing board exists with full card management
- No video frame extraction capability

### Steps

#### 8.1 Frame extraction
- [x] Install `ffmpeg` support — either `fluent-ffmpeg` + system ffmpeg, or a cloud transcoding API
- [x] Create `src/lib/ai/video-frame-extractor.ts`
- [x] Given a video file URL, extract key frames at regular intervals (e.g., every 5 seconds)
- [x] Also extract specific timestamps if provided by the user
- [x] Upload extracted frames to Supabase Storage

#### 8.2 Video review pipeline
- [x] Create `src/lib/ai/video-review.ts` extending the Design Review pattern
- [x] Accept: previous video frames, current video frames, change requests
- [x] Send selected frames (before/after) to Claude vision
- [x] Return structured verdicts per change request

#### 8.3 UI integration
- [x] Add "AI Review" tab to Video card modal (similar to Design board)
- [x] Frame selection UI: show extracted frames as thumbnails, user selects which frames to compare
- [x] Toggle AI Review on/off per video ticket
- [x] Display results in same format as Design Review

#### 8.4 Test
- [ ] Upload two versions of a video, extract frames, run review
- [ ] Verify verdicts make sense for visual changes
- [ ] Add tests for frame extraction and review pipeline

---

## Migration Summary

| Migration | Tables | Workstream |
|-----------|--------|------------|
| 032 | `push_subscriptions`, `digest_configs` | Push Notifications |
| 033 | `cards.version` column (or use updated_at) | Conflict Resolution |
| 034 | `qa_baselines`, `qa_schedules` | Visual Regression + Scheduled QA |

---

## Implementation Order

```
Week 1:  Workstream 1 (Push Notifications) — fills in existing scaffolding
Week 1-2: Workstream 2 (Dark Mode) — systematic component sweep
Week 2:  Workstream 3 (Conflict Resolution) — migration + dialog + broadcasting
Week 3:  Workstream 4 (Lighthouse + axe-core) — extends Dev QA pipeline
Week 3:  Workstream 5 (Visual Diff) — new component + diff endpoint
Week 4:  Workstream 6 (Visual Regression) — baseline management + comparison
Week 4:  Workstream 7 (Scheduled QA) — cron + drift alerts
Week 5:  Workstream 8 (Video AI Review) — frame extraction + review pipeline
```

---

## Progress Tracking

Mark items with `[x]` as they are completed. Update the "Status" field at the top of this file.

**Last updated:** 2026-02-10
**Current workstream:** All complete (testing remaining)
**Completed workstreams:** 1 (Push), 2 (Dark Mode), 3 (Conflict), 4 (Lighthouse), 5 (Visual Diff), 6 (Regression), 7 (Scheduled QA), 8 (Video Review)
