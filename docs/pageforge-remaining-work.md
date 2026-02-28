# KM PageForge - Remaining Work & Testing Plan

## Status: What's Built vs What's Missing

### Built (Code Complete, Untested)
- 15-phase pipeline engine + VPS worker with real per-phase logic
- 5 AI agents (orchestrator, builder, VQA, QA, SEO)
- WordPress REST API + WP-CLI SSH clients
- Figma REST API client
- 10 API routes, 5 UI components, 3 pages
- Site profiles with credential storage
- Gate approval/revision flow
- Cost tracking + cost dashboard
- 396 tests passing

### Missing from PRD (Buildable Now)

#### 1. Model Router Profiles (PRD Section 12.3)
**What:** Build creation should offer model profiles:
- Cost-Optimized (~$2.50/build) - Gemini Flash for everything except Builder
- Quality-First (~$6/build) - Claude Sonnet for Builder, Gemini Pro for VQA
- Custom - per-agent model picker

**Where:** New Build modal in PageForgeDashboard.tsx + API route + pipeline support
**Work:** ~200 lines UI + ~80 lines API + ~50 lines pipeline

#### 2. Board Sub-Task Integration (PRD Section 10.2)
**What:** Each build auto-creates 7 sub-tasks on the KM Board:
1. Pre-flight Check (auto-completes)
2. Builder - Page Construction (auto-completes)
3. VQA - Visual QA (auto-completes)
4. QA - Functional Testing (auto-completes)
5. SEO - Metadata Configuration (auto-completes)
6. Developer Review (manual)
7. AM Sign-off (manual)

**Where:** Build creation API + phase completion hooks
**Pattern:** cards + card_placements tables (two-step insert)
**Work:** ~150 lines in build creation + ~100 lines phase hooks

#### 3. Kill Switch / Mid-Build Abort (PRD Section 14.3)
**What:** Cancel button on active builds that:
- Stops the VPS worker mid-phase
- Rolls back any deployed draft (deletes WP page)
- Marks build as cancelled with reason

**Where:** BuildDetail component + new API route + VPS worker abort signal
**Work:** ~100 lines UI + ~60 lines API + ~40 lines worker

#### 4. Enhanced Markup Validation (PRD Section 9.1)
**What:** Additional pre-deploy checks:
- Lorem ipsum / placeholder text detection
- Image dimension validation (flag >4000px originals)
- Mobile style presence verification
- All Figma text content present in output

**Where:** Enhance existing markup_validation phase in worker
**Work:** ~80 lines validation logic

#### 5. Credential Rotation Reminders (PRD Section 14.3)
**What:** Track when credentials were last rotated, show warning badge on site profiles older than 90 days
**Where:** Site profile UI + new column `credentials_last_rotated_at`
**Work:** ~40 lines migration + ~30 lines UI

#### 6. Figma Pre-Flight Scanner (PRD Section 15.2)
**What:** Before build starts, validate the Figma file:
- Has mobile frame (375px width)
- Uses auto-layout (not absolute positioning)
- Follows naming conventions
- No missing fonts
- Generate "Designer Fix Request" if issues found

**Where:** Enhance preflight phase + new validation in builder
**Work:** ~120 lines validation logic

#### 7. Client Preview Workflow (PRD Section 15.3)
**What:** After build + dev review, generate shareable staging link for client approval
**Where:** New component + API route
**Work:** ~100 lines

---

## VPS Infrastructure Gaps

### Browser Automation (CRITICAL for VQA + QA)
The VPS has NO headless browser installed:
- No Chrome/Chromium binary
- No Puppeteer
- No Browserless token
- No Docker

**Options:**
1. **Browserless.io cloud** (recommended) - Add BROWSERLESS_TOKEN to .env, use their API for screenshots + Lighthouse. $0 for 1000 sessions/month free tier.
2. **Install Chromium on VPS** - `sudo apt install chromium-browser`, use puppeteer-core. Free but uses VPS resources (3.7GB RAM is tight).
3. **Puppeteer in worker** - `npm install puppeteer` in km-worker (downloads Chromium). ~400MB disk.

**Decision needed:** Option 1 (Browserless.io) is easiest. Sign up, get token, add to .env.

### Missing VPS Env Vars
Need to add to `~/km-worker/.env`:
```
BROWSERLESS_TOKEN=<from browserless.io>
BROWSERLESS_URL=https://chrome.browserless.io
```

---

## End-to-End Testing Plan

### Prerequisites
1. **Divi 5 WordPress site** with:
   - REST API enabled (default in WP 5.6+)
   - Application Password created for a user with Editor role
   - Divi 5 theme active
   - Yoast SEO plugin active (optional, for SEO phase)
   - Staging site preferred (not production)

2. **Figma file** with:
   - A real 5-section page design (hero, about, services, testimonials, CTA)
   - Desktop frame at 1440px width
   - Mobile frame at 375px width (ideal, not required)
   - Named layers following conventions
   - Figma Personal Access Token

3. **Browserless.io account** (or alternative browser automation)

4. **VPS env vars updated** with browser token

### Test Sequence

#### Test 1: Site Profile + Connection Test
1. Go to https://kmboards.co/pageforge/sites
2. Click "New Site Profile"
3. Fill in:
   - Site Name: "Divi 5 Test Site"
   - Site URL: https://your-staging-site.com
   - WP REST URL: https://your-staging-site.com/wp-json/wp/v2
   - WP Username: pageforge-user
   - WP App Password: xxxx xxxx xxxx xxxx
   - Figma Token: figd_xxxxx
   - Page Builder: Divi 5
4. Click "Test Connection"
5. **Expected:** Green checkmarks for WP connection + Figma token

#### Test 2: Simple Gutenberg Build (Start Here)
1. Go to https://kmboards.co/pageforge
2. Click "New Build"
3. Select the test site profile
4. Enter Figma file key + page title
5. Click "Start Build"
6. **Expected:** Build appears in list, status progresses through phases
7. Watch VPS logs: `ssh ziv@157.180.37.69 "tail -f ~/km-worker/logs/out.log"`

#### Test 3: Gate Approval Flow
1. Wait for build to reach developer_review_gate
2. Review VQA scores, screenshots, QA checklist
3. Click "Approve" or "Revise" with feedback
4. **Expected:** Pipeline resumes or loops back

#### Test 4: Divi 5 Build (After Gutenberg Works)
1. Same flow but select Divi 5 as page builder
2. Builder agent generates Divi 5 format markup
3. **Expected:** This WILL need debugging - Divi 5 format is undocumented
4. Check wp_posts.post_content format on the staging site

### Divi 5 Format Research (Do First)
Before Test 4, manually research Divi 5's format:
1. Create a 3-section page manually in Divi 5 visual builder
2. Check `post_content` via REST API: `GET /wp-json/wp/v2/pages/{id}?context=edit`
3. Check `post_meta` via REST API for Divi-specific meta
4. Try creating a page via REST API with that same content
5. Document the format for the Builder agent

---

## Development Priority Order

1. **Model Router Profiles** - directly improves UX, pure UI/API work
2. **Kill Switch** - safety feature, needed before real testing
3. **Enhanced Validation** - catches bad markup before deploy
4. **Figma Pre-Flight Scanner** - catches bad Figma files early
5. **Board Sub-Task Integration** - connects to existing workflow
6. **Credential Rotation Reminders** - nice to have
7. **Client Preview Workflow** - Phase 4 feature

Items 1-4 should be done before first real test.
Items 5-7 can wait until after pipeline is validated.
