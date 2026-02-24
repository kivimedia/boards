# New Agent Skills: Website QC & Design QC

## Overview

Two quality control agents for the agency workflow. Both follow the same pattern: read a ticket, run a structured checklist, post findings as a card comment with pass/fail items, and can be re-run after fixes to verify resolution.

---

## Skill 1: Website QC Agent

**Slug:** `website-qc`
**Name:** Website QC Inspector
**Icon:** `🔍`
**Category:** `meta`
**Pack:** `skills`
**Quality Tier:** `solid`
**Quality Score:** 78

### What It Does

Takes a website URL (and optionally a ticket/card for context) and performs a structured live audit of the page. The agent actually browses the website, checks links, scrapes elements, and takes screenshots — then posts a checklist-style QC report as a card comment.

### How It Works

1. Read the card/ticket (if provided) to understand context — what page is this, what's the purpose, any specific things to check
2. Navigate to the live URL using `navigate_and_extract`
3. Run through the full checklist, using `scrape_elements` and `check_link` for each item
4. Take a screenshot of the page for reference
5. Post a structured pass/fail checklist comment on the card via `add_comment`

### Supported Tools

```
navigate_and_extract  — Browse the live page, extract rendered content
scrape_elements       — Check specific elements (meta tags, images, links, forms)
take_screenshot       — Capture visual state of the page
check_link            — Verify link health (HTTP status, redirects)
web_search            — Look up standards or reference material if needed
get_card              — Read the ticket for context on what to check
search_cards          — Find related tickets if needed
add_comment           — Post QC findings back on the card
think                 — Internal reasoning between checks
```

### Required Context

```
website_url           — The URL to inspect (required)
board_context         — Card/ticket with context about the page (optional but recommended)
```

### QC Checklist (v1)

The checklist is embedded in the system prompt and structured in sections. Each item is independently checkable. This list can be expanded over time by updating the skill's system_prompt in the database.

#### A. Page Health & Performance
- [ ] Page loads successfully (HTTP 200)
- [ ] No server errors or error pages displayed
- [ ] SSL certificate is valid (HTTPS)
- [ ] Page load time is reasonable (no excessive scripts/resources visible)
- [ ] No mixed content warnings (HTTP resources on HTTPS page)

#### B. SEO & Meta
- [ ] Page has a `<title>` tag (and it's descriptive, under 60 chars)
- [ ] Meta description exists (under 160 chars, compelling)
- [ ] Exactly one `<h1>` tag on the page
- [ ] Heading hierarchy is logical (h1 > h2 > h3, no skipping)
- [ ] Canonical URL is set
- [ ] Open Graph tags present (og:title, og:description, og:image)
- [ ] Twitter Card meta tags present
- [ ] Favicon is present and loads
- [ ] Structured data / JSON-LD present (if applicable)

#### C. Content & Copy
- [ ] Main heading is clear and relevant
- [ ] Body text is readable (no lorem ipsum, no placeholder text)
- [ ] No obvious spelling or grammar errors in visible text
- [ ] Contact information is present and correct (if applicable)
- [ ] Copyright year is current
- [ ] Legal links present (Privacy Policy, Terms) if applicable

#### D. Images & Media
- [ ] All images load correctly (no broken images)
- [ ] Images have alt text
- [ ] Logo is present and correct
- [ ] No placeholder or stock watermark images
- [ ] Hero/banner image is appropriate and high quality

#### E. Navigation & Links
- [ ] Main navigation works (all top-level links resolve)
- [ ] No broken internal links on the page
- [ ] External links open correctly
- [ ] CTA buttons are present and link to correct destinations
- [ ] Footer links work
- [ ] Social media links point to correct profiles

#### F. Forms & Interactivity
- [ ] Forms are present where expected
- [ ] Form fields have labels
- [ ] Required field indicators are visible
- [ ] Submit button is visible and labeled correctly

#### G. Responsiveness & Accessibility
- [ ] Viewport meta tag is set
- [ ] No horizontal scroll on standard viewport
- [ ] Text is readable (sufficient size, contrast)
- [ ] Interactive elements have sufficient tap/click targets
- [ ] ARIA landmarks present (header, main, footer)

#### H. Analytics & Tracking
- [ ] Google Analytics or similar tracking code detected
- [ ] Cookie consent banner present (if applicable)
- [ ] No exposed API keys or debug info in page source

### Output Format

The agent posts a comment on the card like this:

```
## Website QC Report
**URL:** https://example.com/landing-page
**Date:** 2026-02-21
**Overall:** 34/38 checks passed

### Page Health & Performance (5/5)
- [x] Page loads (HTTP 200)
- [x] No error pages
- [x] SSL valid
- [x] Reasonable load time
- [x] No mixed content

### SEO & Meta (7/9)
- [x] Title tag: "Product Landing | Brand"
- [x] Meta description present
- [x] Single h1 tag
- [ ] **FAIL: Heading hierarchy** — h2 followed by h4, skips h3
- [x] Canonical URL set
- [x] OG tags present
- [ ] **FAIL: Twitter Card tags** — missing twitter:image
- [x] Favicon loads
- [x] JSON-LD present

### ... (remaining sections)

### Summary
**4 issues found:**
1. Heading hierarchy skips h3 (SEO impact)
2. Missing Twitter Card image meta tag
3. 2 broken links in footer
4. Copyright year shows 2024

**Recommendation:** Fix the 4 issues above and re-run this QC check.
```

### Feedback Loop

1. **First run** → Agent posts QC report comment with all findings
2. **Developer/designer fixes issues**
3. **Re-run** → Agent reads the previous QC comment, re-checks the same URL, posts a new report showing what's now fixed vs still failing
4. **Repeat** until all checks pass

The agent reads previous comments on the card, so it knows what was flagged before and can explicitly call out "Previously failing, now fixed" items.

### Strengths

- Covers comprehensive web QC without manual clicking
- Structured, repeatable output that's easy to scan
- Can be re-run after fixes to verify resolution
- Uses live browsing — checks the actual deployed page, not a mockup
- Checklist is modular — add/remove items by editing the system_prompt

### Weaknesses

- Cannot interact with JavaScript-heavy SPAs perfectly (Browserless limitation)
- Cannot fill out and submit forms (read-only)
- Cannot test behind authentication (login-required pages)
- Cannot measure actual page load time (no Lighthouse integration)
- Screenshot is stored but not visually analyzed (text-based checks only)

### Improvement Suggestions

1. Add Lighthouse integration for performance scoring
2. Add visual regression testing (compare screenshots between runs)
3. Add authentication support for testing logged-in pages
4. Add mobile viewport screenshot comparison
5. Integrate with CI/CD for automatic QC on deployment

### Dependencies

```yaml
depends_on: []            # Standalone — no prerequisite skills
feeds_into: []            # Results are consumed by humans, not other agents
requires_mcp_tools: []    # Uses built-in Browserless, no MCP needed
fallback_behavior: null   # Web tools are required, no fallback
```

### Estimated Tokens

~4,000-6,000 per run (context gathering + multi-tool checklist)

---
---

## Skill 2: Design QC Agent

**Slug:** `design-qc`
**Name:** Design QC Reviewer
**Icon:** `🎨`
**Category:** `meta`
**Pack:** `skills`
**Quality Tier:** `has_potential`
**Quality Score:** 65

### What It Does

Quality checks a design submission on a design ticket. Reads the card comments to understand what fixes were requested in the previous review round, then verifies whether each fix was actually applied. Posts a structured pass/fail report as a card comment.

### How It Works

1. Read the card via `get_card` — gets the ticket description, last 10 comments, labels, checklists
2. Parse comments chronologically to identify the most recent review round:
   - Find comments that contain revision requests (keywords: "fix", "change", "update", "adjust", "move", "resize", "color", "font", "spacing", "align", etc.)
   - Extract a numbered list of requested changes
3. Look for the latest design submission:
   - Scan comments for design URLs (Figma, Canva, InVision, image hosting links)
   - If found: use `navigate_and_extract` + `take_screenshot` to view the current design
4. For each requested fix, assess whether it appears to be addressed:
   - If the design URL is browseable → check visible elements against fix requests
   - If no URL is available → flag as "unable to verify visually" and note what to check manually
5. Post a structured QC report as a card comment

### Supported Tools

```
get_card              — Read ticket description, comments (last 10), checklists, labels
search_cards          — Find related tickets if referenced
navigate_and_extract  — Browse design URLs (Figma preview, hosted images, staging pages)
take_screenshot       — Capture current state of the design
scrape_elements       — Extract specific text/elements from design preview pages
add_comment           — Post QC findings back on the card
think                 — Internal reasoning to compare requests vs current state
```

### Required Context

```
board_context         — The card/ticket with the design task (required)
```

### QC Process

#### Phase 1: Extract Revision Requests

The agent reads comments and extracts the fix list. Example:

> Comment by Sarah (Feb 18):
> "Please fix the following:
> 1. Logo is too small on mobile
> 2. CTA button color should be brand blue (#2563EB), not green
> 3. Footer links are misaligned
> 4. Typo in headline: 'Welcom' should be 'Welcome'
> 5. Add the client's phone number to the contact section"

Agent extracts: 5 revision items with specific details.

#### Phase 2: Verify Fixes

For each extracted item, the agent:
- Checks if the fix is verifiable via the available design URL
- If verifiable: navigates, inspects, and marks pass/fail
- If not verifiable: marks as "needs manual check" with reason

#### Phase 3: General Design QC Checks

Beyond the specific revision items, the agent also checks:

- [ ] Design matches the ticket description/brief
- [ ] Text content has no obvious typos or placeholder text
- [ ] Brand colors appear consistent (if brand guide is in ticket context)
- [ ] All required elements from the brief are present
- [ ] No lorem ipsum or placeholder images visible
- [ ] Text is readable (not cut off, not overlapping)

### Output Format

```
## Design QC Report
**Card:** [Card Title]
**Review Round:** 3 (based on comment history)
**Date:** 2026-02-21

### Revision Requests Verified (3/5)

Based on Sarah's review comment (Feb 18):

1. **Logo size on mobile**
   - Requested: Make logo larger on mobile
   - Status: **PASS** — Logo appears larger in current Figma frame

2. **CTA button color**
   - Requested: Change to brand blue (#2563EB)
   - Status: **PASS** — Button now shows blue color

3. **Footer link alignment**
   - Requested: Fix misaligned footer links
   - Status: **FAIL** — Footer links still appear left-aligned instead of centered

4. **Headline typo**
   - Requested: Fix "Welcom" → "Welcome"
   - Status: **PASS** — Headline now reads "Welcome"

5. **Client phone number**
   - Requested: Add phone number to contact section
   - Status: **NEEDS MANUAL CHECK** — Contact section visible but phone number not confirmed from screenshot

### General Design Checks (4/5)
- [x] Matches ticket brief
- [x] No placeholder text
- [x] Brand colors consistent
- [x] All required elements present
- [ ] **FAIL:** Text appears cut off in the testimonial section

### Summary
**3/5 revision items verified as fixed, 1 still needs work, 1 needs manual check.**
**1 additional issue found in general QC.**

**Action items:**
1. Fix footer link alignment (still failing from round 2)
2. Verify client phone number was added
3. Fix text cutoff in testimonial section
```

### Feedback Loop

1. **Designer submits revision** → comment on card or uploads new attachment
2. **Run Design QC** → Agent reads all comments, extracts latest fix requests, checks current design
3. **Posts QC report** → Team sees what passed and what still needs work
4. **Designer fixes remaining items** → re-submit
5. **Re-run Design QC** → Agent sees the previous QC report in comments, focuses on previously-failing items
6. **Repeat** until all items pass → agent posts "All items verified. Ready for client review."

The agent gets smarter over rounds because it reads its own previous QC comments and prioritizes checking previously-failing items.

### Strengths

- Eliminates manual "did they actually fix it?" review cycles
- Reads natural language fix requests from any team member's comments
- Structured output makes it easy to see what's left
- Tracks rounds — knows this is revision 3 vs revision 1
- Re-running verifies previous issues are resolved

### Weaknesses

- Cannot see card attachments directly (uploaded PSD/PNG/PDF files in Supabase storage)
- Relies on design URLs in comments (Figma, Canva, staging links) for visual verification
- Text-based analysis of screenshots — cannot do pixel-perfect comparison
- Limited to last 10 comments via `get_card` — may miss older review rounds
- Cannot analyze color values precisely from screenshots

### Improvement Suggestions

1. **Add attachment access to `get_card`** — extend the tool to return attachment URLs so the agent can browse uploaded designs
2. **Add vision analysis tool** — send screenshots to Claude Vision for detailed visual comparison (the infrastructure exists in `design-review.ts`)
3. **Increase comment limit** — fetch more than 10 comments for cards with long revision histories
4. **Add Figma API integration** — directly read Figma file properties (colors, fonts, spacing) instead of relying on screenshots
5. **Side-by-side comparison** — send previous + current design to Vision API for diff analysis

### Dependencies

```yaml
depends_on: []            # Standalone — reads context from the card itself
feeds_into: []            # Results consumed by team, not other agents
requires_mcp_tools: []    # Uses built-in tools only
fallback_behavior: "If no design URL is found in comments, the agent posts a comment listing all revision requests it found and asks the designer to share a preview link."
```

### Estimated Tokens

~3,000-5,000 per run (comment parsing + optional web browsing)

---
---

## Recommended Enhancement: Attachment Access

Both skills would benefit significantly from an enhanced `get_card` tool that includes attachment information. Current state:

**Today:** `get_card` returns title, description, priority, due_date, labels, comments (10), checklists, assignees. NO attachments.

**Recommended:** Add attachment data to `get_card` response:
```
Attachments:
- design-v3-final.png (image/png, 2.4MB, uploaded by Sarah, Feb 20)
  URL: https://storage.supabase.co/.../design-v3-final.png
- design-v2-revised.png (image/png, 2.1MB, uploaded by Sarah, Feb 18)
  URL: https://storage.supabase.co/.../design-v2-revised.png
```

This would let Design QC:
- See which files were uploaded and when
- Open the design URL directly via `navigate_and_extract`
- Compare current vs previous attachment names/dates

**Implementation:** ~15 lines added to `executeGetCard()` in `agent-executor.ts` — query `attachments` table, generate public URLs, append to output.

---

## Checklist Maintainability

Both skills store their QC checklists in the `system_prompt` field in the database. To update checklists:

1. **Admin UI:** Edit the skill's system prompt via Settings > Skill Quality Dashboard
2. **Seed update:** Modify `agent-skill-seeds.ts` and re-run seed
3. **Direct DB:** Update `agent_skills.system_prompt` for the skill

The prompts are structured with clearly labeled sections (`#### A. Page Health`, `#### B. SEO & Meta`, etc.) so individual items can be added, removed, or modified without affecting the overall prompt structure.

**For the Website QC specifically:** The checklist should evolve based on:
- Common issues found across QC runs (add checks for frequently-caught problems)
- Client-specific requirements (custom checklist items per board/client)
- Industry standards updates (new accessibility requirements, SEO best practices)

Future enhancement: Store checklist items in a separate `qc_checklist_items` table so they can be managed per-board or per-client without editing the system prompt.

---

## Skill Seed Summary

| Field | Website QC | Design QC |
|-------|-----------|-----------|
| slug | `website-qc` | `design-qc` |
| name | Website QC Inspector | Design QC Reviewer |
| icon | `🔍` | `🎨` |
| category | `meta` | `meta` |
| pack | `skills` | `skills` |
| quality_tier | `solid` | `has_potential` |
| quality_score | 78 | 65 |
| sort_order | 17 | 18 |
| output_format | `markdown` | `markdown` |
| estimated_tokens | 5000 | 4000 |
| supported_tools | navigate_and_extract, scrape_elements, take_screenshot, check_link, web_search, get_card, search_cards, add_comment, think | get_card, search_cards, navigate_and_extract, take_screenshot, scrape_elements, add_comment, think |
| required_context | website_url, board_context | board_context |
| depends_on | [] | [] |
| feeds_into | [] | [] |
| requires_mcp_tools | [] | [] |
