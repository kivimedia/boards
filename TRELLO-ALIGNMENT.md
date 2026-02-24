# Trello Card UX Alignment Plan

## Overview
Align Agency Board's card detail modal with Trello's card UX patterns, based on side-by-side comparison. This focuses on UX/layout gaps — not features Agency Board already exceeds Trello on (reactions, custom fields, dependencies, AI, briefs, etc.).

## Reference
Trello card layout (when "Comments" bottom tab is active):
- **Left column**: Cover image, title, quick-action bar (+ Add, Labels, Dates, Checklist, Members), size field, description with rendered links
- **Right column**: Comments & activity feed with avatars, timestamps, reply/delete, link-as-attachment
- **Bottom bar**: Power-ups | Automations | Comments (toggle tabs)

---

## Changes Needed

### 1. Two-Column Comments Layout (HIGH PRIORITY)
**Current**: Comments are embedded at the bottom of the Details tab, below description and custom fields — users must scroll past everything to read/write comments.
**Target**: When viewing details, show a two-column split — card content (description, custom fields, labels) on the left, comments/activity on the right — matching Trello's side-by-side layout.

**Implementation**:
- In `CardModal.tsx`, when `activeTab === 'details'`, render the main content area as a two-column grid on `lg:` screens
- Left sub-column: labels, description, custom fields
- Right sub-column: `<CardComments />` component
- On mobile: stack vertically (comments below content, same as now)
- Remove the current inline comments from the single-column details flow

**Files**: `src/components/card/CardModal.tsx`

---

### 2. Quick-Action Button Bar (MEDIUM PRIORITY)
**Current**: To add labels, dates, checklists, or members, users must use the sidebar or switch tabs.
**Target**: Horizontal button row under the title: `+ Add | Labels | Dates | Checklist | Members` — one-click access to common actions.

**Implementation**:
- Add a row of small buttons below the title/priority badge area
- Each button opens a popover/dropdown:
  - `+ Add`: dropdown with Description, Attachment, etc.
  - `Labels`: inline label picker (reuse `CardLabels` toggle logic)
  - `Dates`: date picker popover (start + due date)
  - `Checklist`: quick-add checklist (navigate to checklists tab or inline create)
  - `Members`: assignee picker popover
- Styled as compact pill buttons matching Trello's `+ Add` bar

**Files**: `src/components/card/CardModal.tsx`, new `src/components/card/CardQuickActions.tsx`

---

### 3. Cover Image Support (MEDIUM PRIORITY)
**Current**: No cover image feature on cards.
**Target**: Cards can have a cover image displayed prominently at the top of the card modal (and optionally as a thumbnail on the board view).

**Implementation**:
- Add `cover_image_url` column to `cards` table (migration 035)
- In `CardModal.tsx`, render cover image above the title if set
- Add a "Cover" button in the quick-action bar or top-right area
- Allow setting cover from: uploaded attachment, external URL, or color
- Optionally show cover thumbnail on `CardItem.tsx` (board column view)

**Files**: `supabase/migrations/035_card_cover_image.sql`, `src/components/card/CardModal.tsx`, `src/components/card/CardCoverPicker.tsx`, `src/components/board/CardItem.tsx`
**DB**: `ALTER TABLE cards ADD COLUMN cover_image_url TEXT;`

---

### 4. Card Size / Story Points (LOW PRIORITY)
**Current**: No size/estimation field.
**Target**: Optional card sizing (T-shirt: XS/S/M/L/XL or numeric story points).

**Implementation**:
- Add `size` column to `cards` table (TEXT or INTEGER)
- Add size selector in the card modal sidebar or quick-action bar
- Display size badge on card in board view
- Consider making this a board-level setting (enable/disable, choose scale)

**Files**: Migration SQL, `src/components/card/CardModal.tsx`, `src/components/board/CardItem.tsx`
**DB**: `ALTER TABLE cards ADD COLUMN size TEXT;`

---

### 5. Rich Text / Markdown Description (MEDIUM PRIORITY)
**Current**: Plain text description — no Markdown rendering, no clickable links.
**Target**: Render description with Markdown support (bold, italic, links, lists, code blocks) and auto-detect URLs.

**Implementation**:
- Add `react-markdown` (or `@uiw/react-md-editor`) for rendering
- Edit mode: textarea (or Markdown editor) — Save renders as Markdown
- Display mode: rendered Markdown with clickable links
- Auto-linkify URLs in the description

**Files**: `src/components/card/CardModal.tsx` (description section), `package.json`

---

### 6. Start Date (LOW PRIORITY)
**Current**: Only due date.
**Target**: Both start date and due date, matching Trello.

**Implementation**:
- Add `start_date` column to `cards` table
- Add start date picker alongside due date in the sidebar
- Show date range on card if both are set

**Files**: Migration SQL, `src/components/card/CardModal.tsx`
**DB**: `ALTER TABLE cards ADD COLUMN start_date TIMESTAMPTZ;`

---

### 7. Comment Reply Threading (LOW PRIORITY)
**Current**: Flat comment list — no threading.
**Target**: "Reply" button on each comment that creates a threaded reply.

**Implementation**:
- Add `parent_comment_id` column to `comments` table (self-referential FK)
- In `CardComments.tsx`, render replies indented under parent comments
- Add "Reply" button that opens inline reply input below the parent

**Files**: Migration SQL, `src/components/card/CardComments.tsx`
**DB**: `ALTER TABLE comments ADD COLUMN parent_comment_id UUID REFERENCES comments(id);`

---

### 8. "Add Link as Attachment" from Comments (LOW PRIORITY)
**Current**: Links in comments are plain text.
**Target**: Detect URLs in comments and offer "Add link as attachment" action (like Trello).

**Implementation**:
- Parse comment text for URLs when rendering
- Show small "Add as attachment" button next to detected links
- On click, create a link-type attachment record for the card

**Files**: `src/components/card/CardComments.tsx`

---

## Priority Summary

| # | Feature | Priority | Effort |
|---|---------|----------|--------|
| 1 | Two-column comments layout | HIGH | Small (layout refactor) |
| 2 | Quick-action button bar | MEDIUM | Medium (new component + popovers) |
| 3 | Cover image | MEDIUM | Medium (DB + UI + storage) |
| 4 | Card size / story points | LOW | Small (DB + UI) |
| 5 | Rich text / Markdown description | MEDIUM | Medium (add library + rendering) |
| 6 | Start date | LOW | Small (DB + UI) |
| 7 | Comment reply threading | LOW | Medium (DB + UI restructure) |
| 8 | Add link as attachment | LOW | Small (URL parsing + action) |

## Already Ahead of Trello
These features exist in Agency Board but NOT in Trello (no action needed):
- Comment reactions
- Native custom fields (7 types)
- Card dependencies (4 relationship types)
- Brief editor with completeness scoring
- AI Review & AI QA
- Client Brain integration
- Agent tasks panel
- Dedicated activity log tab
- Live presence indicators
- Card watch/subscribe notifications
