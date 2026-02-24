# Trello UX Gaps - Visual Comparison (Feb 14, 2026)

> Side-by-side comparison of Agency Board's CardModal vs Trello's card modal.
> Based on screenshots of a real Agency Board card ("CBUS fixes") and a real Trello card ("Ziv Raviv - IG + LI").

---

## Status: 9 Gaps Identified - ALL FIXED

### Round 1 - Functional Gaps
| # | Gap | Severity | Effort | Status |
|---|-----|----------|--------|--------|
| 1 | No explicit "Edit" button on description | Medium | Small | DONE |
| 2 | No "Show more" collapse for long descriptions | Medium | Small | DONE |
| 3 | "Add link as attachment" action missing on comments | Low | Medium | DONE |
| 4 | Comments header should show "Comments and activity" with hide/show toggle | Low | Small | DONE |
| 5 | Board/list breadcrumb badge at top of card modal | Low | Small | DONE |

### Round 2 - Visual Polish
| # | Gap | Severity | Effort | Status |
|---|-----|----------|--------|--------|
| 6 | Comment input at bottom instead of top of column | Medium | Small | DONE |
| 7 | Too much vertical spacing in header area (6 zones before content) | Medium | Medium | DONE |
| 8 | Assignees list shows ALL profiles instead of compact assigned-only view | Medium | Medium | DONE |
| 9 | Priority badge on its own row instead of inline with title | Low | Small | DONE |

---

## Gap 1: Description "Edit" Button

### Trello
- Description section has an explicit **"Edit"** button in the top-right corner
- Users know immediately the field is editable without guessing

### Agency Board (current)
- Entire description block is clickable to enter edit mode (`onClick={() => setIsEditingDescription(true)}`)
- No visual "Edit" button; relies on hover cursor change and placeholder text
- Easy to miss, especially when description already has content

### Fix
**File:** `src/components/card/CardModal.tsx` (lines 559-605)

Add an "Edit" button next to the "Description" heading:

```tsx
{/* Description */}
<div>
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
      Description
    </h3>
    {!isEditingDescription && (
      <button
        onClick={() => setIsEditingDescription(true)}
        className="text-xs font-medium text-navy/40 dark:text-slate-500 hover:text-electric px-2 py-1 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
      >
        Edit
      </button>
    )}
  </div>
  {/* ... rest of description render/edit logic stays the same ... */}
</div>
```

Keep the click-to-edit behavior on the description body as well (doesn't hurt), but the explicit button provides better discoverability.

---

## Gap 2: Description "Show More" Collapse

### Trello
- Long descriptions are collapsed with a **"Show more"** button at the bottom
- Prevents the description from pushing comments/content far down the page

### Agency Board (current)
- Description renders at full height regardless of length
- No collapse/expand behavior
- Long descriptions dominate the left column and push custom fields out of view

### Fix
**File:** `src/components/card/CardModal.tsx` (lines 591-604)

Wrap the non-editing description in a collapsible container:

```tsx
// New state
const [descriptionExpanded, setDescriptionExpanded] = useState(false);
const DESCRIPTION_COLLAPSE_HEIGHT = 200; // px

// In the render (non-editing state):
<div
  onClick={() => setIsEditingDescription(true)}
  className="p-3 rounded-xl bg-cream dark:bg-navy hover:bg-cream-dark dark:hover:bg-slate-800 cursor-pointer transition-colors text-sm text-navy dark:text-slate-200 font-body relative"
>
  <div
    className={!descriptionExpanded ? 'max-h-[200px] overflow-hidden' : ''}
  >
    <div className="prose prose-sm dark:prose-invert max-w-none ...">
      <ReactMarkdown>{description}</ReactMarkdown>
    </div>
  </div>
  {/* Show more / Show less toggle */}
  {description && description.length > 300 && (
    <button
      onClick={(e) => {
        e.stopPropagation(); // Don't trigger edit mode
        setDescriptionExpanded(!descriptionExpanded);
      }}
      className="mt-2 text-xs font-medium text-electric hover:text-electric-bright transition-colors"
    >
      {descriptionExpanded ? 'Show less' : 'Show more'}
    </button>
  )}
</div>
```

A more precise approach could measure the actual rendered height via a ref, but character count (>300 chars) is a simpler heuristic that works well enough.

---

## Gap 3: "Add Link as Attachment" on Comments

### Trello
- Each comment has action buttons: **Reaction | Reply | Add link as attachment | Delete**
- "Add link as attachment" detects URLs in the comment and creates a card attachment from them

### Agency Board (current)
- Comment actions: **Reaction | Reply | Delete** (for own comments)
- No "Add link as attachment" action
- URLs in comments are plain text (not even auto-linked)

### Fix
**File:** `src/components/card/CardComments.tsx` (lines 115-136)

Two changes:

#### 3a. Auto-linkify URLs in comment text
Replace plain `<p>` render with URL detection:

```tsx
// Helper: detect and linkify URLs in comment text
const linkifyContent = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-electric hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

// Replace line 115-117:
<p className="text-sm text-navy/70 dark:text-slate-300 mt-0.5 font-body whitespace-pre-wrap">
  {linkifyContent(comment.content)}
</p>
```

#### 3b. "Add link as attachment" action button
Extract URLs from comment, show button if URLs exist:

```tsx
// Helper: extract URLs from text
const extractUrls = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
};

// In the comment actions row (after Reply button):
{extractUrls(comment.content).length > 0 && (
  <button
    onClick={() => handleAddLinkAsAttachment(comment)}
    className="text-[11px] text-navy/40 dark:text-slate-500 hover:text-electric transition-colors font-medium"
  >
    Add link as attachment
  </button>
)}
```

The `handleAddLinkAsAttachment` function would:
1. Extract URLs from the comment content
2. For each URL, insert into the `card_attachments` table as a link-type attachment
3. Call `onRefresh()` to update the card

Props needed: Pass `cardId` is already available. May need to add an `onRefresh` that also refreshes the attachments tab.

---

## Gap 4: Comments Header with Activity Toggle

### Trello
- Header reads **"Comments and activity"** with a **"Hide details"** toggle button
- Toggling hides/shows the activity log mixed in with comments

### Agency Board (current)
- Header reads **"Comments (0)"** - just a count
- Activity log is a separate tab entirely (which is actually better for organization)
- No toggle behavior

### Fix
**File:** `src/components/card/CardComments.tsx` (lines 186-189)

Update the header to be more descriptive and add a compact activity toggle:

```tsx
<div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
    Comments and activity
    <span className="ml-1.5 text-navy/30 dark:text-slate-500 font-normal">
      ({comments.length})
    </span>
  </h3>
  {/* Optional: link to activity tab */}
  {/*
  <button className="text-[11px] text-navy/40 dark:text-slate-500 hover:text-electric transition-colors font-medium">
    Show activity
  </button>
  */}
</div>
```

Since Agency Board already has a dedicated Activity tab (which is better UX than Trello's mixed view), the main change here is just the header text. The toggle is optional and low-value given we have tabs.

---

## Gap 5: Board/List Breadcrumb Badge

### Trello
- Top-left corner shows a colored badge: **"Riza 3+1=4 SPEAKING"** (board name + list name)
- Instantly tells users where this card lives

### Agency Board (current)
- No indication of which board or list/column the card belongs to
- Title shows the card name but not its location in the hierarchy

### Fix
**File:** `src/components/card/CardModal.tsx`

Fetch board name and list name, show as a breadcrumb above the title:

```tsx
// New state
const [boardName, setBoardName] = useState('');
const [listName, setListName] = useState('');

// In fetchCardDetails or fetchBoardType, also fetch board name + list name:
// Board name (already fetched in fetchBoardType - just capture the name):
if (json.data) {
  setBoardType(json.data.type || null);
  setBoardName(json.data.name || '');
}

// List name (from card_placements + lists):
const { data: placement } = await supabase
  .from('card_placements')
  .select('list:lists(name)')
  .eq('card_id', cardId)
  .eq('is_mirror', false)
  .single();
if (placement?.list) {
  setListName((placement.list as any).name || '');
}

// Render above the title (line ~435):
{(boardName || listName) && (
  <div className="text-xs text-navy/40 dark:text-slate-500 font-medium mb-1.5 font-body">
    {boardName}
    {boardName && listName && <span className="mx-1.5">{'>'}</span>}
    {listName}
  </div>
)}
```

---

## What's Already Matching (No Action Needed)

| Feature | Trello | Agency Board | Verdict |
|---------|--------|-------------|---------|
| Two-column layout | Left/right split | Same grid pattern | Match |
| Quick-action button bar | + Add, Labels, Dates, etc. | Labels, Members, Checklist, Attach, Brief, Cover | Match |
| Cover image | Photo at top | Supported with change/remove | Match |
| Card size | N/A | Small/Medium/Large (we have MORE) | Ahead |
| Priority selector | N/A | Urgent/High/Medium/Low/None | Ahead |
| Markdown description | Links rendered | ReactMarkdown with prose styling | Match |
| Start + due dates | Dates button | Inline pickers in sidebar | Match |
| Comment threading | Reply button | Reply + nested threads | Match |
| Comment reactions | N/A | CommentReactions component | Ahead |
| Assignees | Members at top | List with avatars in sidebar | Match |

## Features Agency Board Has That Trello Doesn't

- AI Review & AI QA tabs
- Brief editor with completeness scoring
- Card dependencies (4 relationship types)
- Native custom fields (7 types)
- Client Brain integration
- Agent tasks panel
- Dedicated activity log tab
- Live presence indicators (CardPresenceBar)
- Card watch/subscribe notifications
- Approval workflow tab
- Card navigation (prev/next with arrow keys)

---

## Implementation Order

1. **Gap 1** (Edit button) - 10 min, immediate discoverability win
2. **Gap 2** (Show more) - 15 min, prevents long descriptions from dominating
3. **Gap 5** (Board/list breadcrumb) - 20 min, provides context at a glance
4. **Gap 4** (Comments header) - 5 min, cosmetic alignment
5. **Gap 3** (Add link as attachment) - 45 min, URL parsing + attachment creation + refresh
