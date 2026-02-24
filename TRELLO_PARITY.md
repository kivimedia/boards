# Trello Parity - Feature Plan

> Priority features to bring Agency Board card/board UX closer to Trello.

## Status: Complete (TypeScript clean)

| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 1 | Card Cover / Featured Image picker | High | Done |
| 2 | "Set as Cover" from Attachments tab | High | Done |
| 3 | Import Trello card covers during migration | High | Done |
| 4 | List card count in header (filtered/total) | Medium | Done |
| 5 | Quick Copy card button on board card hover | Medium | Done |
| 6 | Description indicator icon on board cards | Low | Already exists (has metadata badges) |

---

## 1. Card Cover / Featured Image Picker

**What Trello does**: Cards show a full-width preview image at the top. Users can choose which attachment is the "cover" from the card detail. The cover shows on both the board (kanban) view and the card detail modal.

**Current state**:
- `cards.cover_image_url` column exists (TEXT, nullable)
- `CardModal.tsx` shows cover with Change/Remove buttons -- but only lets you upload a NEW file
- `board-data.ts` auto-picks the first image attachment as cover, ignoring the `card.cover_image_url` column
- No way to choose an existing attachment as the cover

**Implementation**:
- Add "Set as Cover" button on each image attachment in `CardAttachments.tsx`
- Show a star/cover badge on the currently-selected cover attachment
- Update `board-data.ts` to prefer `card.cover_image_url` over the auto-pick first-image logic
- When user clicks "Set as Cover", PATCH the card's `cover_image_url` with that attachment's storage path
- When user clicks "Remove Cover" in the modal, clear `cover_image_url` to null

**Files changed**:
- `src/components/card/CardAttachments.tsx` -- Add "Set as Cover" button per image attachment
- `src/lib/board-data.ts` -- Prefer card.cover_image_url over first-image fallback
- `src/components/card/CardModal.tsx` -- Pass cover state down, refresh on cover change

---

## 2. Import Trello Card Covers During Migration

**What Trello does**: Each Trello card has an `idAttachmentCover` field pointing to the attachment used as the card cover.

**Current state**: The migration imports all attachments but never reads `idAttachmentCover`. Covers are lost.

**Implementation**:
- When importing cards, fetch `idAttachmentCover` from Trello card data
- After attachments are imported, look up the mapping for `idAttachmentCover`
- Set `cards.cover_image_url` to the storage path of the mapped attachment
- This is a post-processing step after `importAttachments()` completes

**Files changed**:
- `src/lib/trello-migration.ts` -- Add cover resolution step after attachment import

---

## 3. List Card Count in Header (Filtered/Total)

**What Trello does**: Shows card count in list header like "3" or when filtered "3/15".

**Current state**: Already shows `list.cards.length` as a badge. But does NOT show filtered vs total when filters are active.

**Implementation**:
- Pass the filter to BoardList or compute visible count
- Show "visible/total" when a filter is reducing the count, otherwise just show total
- Format: `3/15` when filtered, `15` when unfiltered

**Files changed**:
- `src/components/board/BoardList.tsx` -- Update card count badge to show filtered vs total

---

## 4. Quick Copy Card Button on Board Card Hover

**What Trello does**: Small clipboard/copy icon appears on hover in the bottom-right of each card in the kanban view. Clicking it duplicates the card inline.

**Current state**: Duplicate exists in `CardActions.tsx` (inside modal sidebar). No hover-level copy button on the board card.

**Implementation**:
- Add a copy icon button next to the existing pencil (quick edit) button on hover
- Call `POST /api/cards/${cardId}/duplicate` on click
- Show brief loading state, then refresh the board

**Files changed**:
- `src/components/board/BoardCard.tsx` -- Add copy button next to pencil button on hover

---

## 5. Features NOT Implemented (Low Priority / Intentional Gaps)

| Feature | Trello | Decision |
|---------|--------|----------|
| Card stickers | Visual emoji/image stickers | Skip - rarely used, cosmetic only |
| Watch/subscribe to card | Eye icon for notifications | Already have notification system via digest; can add later |
| Power-Up vote counts | Red numbered badges | Our priority system serves same purpose |
| Card aging | Visual aging effect | Skip - cosmetic only |

---

## Architecture Notes

### Cover Image Resolution Priority (board-data.ts)
1. **Explicit cover** (`card.cover_image_url` column) - user chose this attachment as cover
2. **First image attachment** (fallback) - auto-pick if no explicit cover is set
3. **None** - no image attachments exist

### Cover URL Signing
- `board-data.ts`: Storage paths are signed (1hr expiry). Full URLs (http/https) passed through as-is.
- `CardModal.tsx`: On load, if `cover_image_url` is a storage path (not http), it signs it for display.
- `CardAttachments.tsx`: "Set as Cover" saves the raw storage path to the DB column, then signs for immediate display.

### Migration Cover Resolution
- Added `idAttachmentCover: string | null` to `TrelloCard` interface
- New `resolveCardCovers()` function runs as step 6b (after attachments, before checklists)
- For each Trello card with `idAttachmentCover`:
  1. Look up card mapping: `migration_entity_map` where `source_type='card'`
  2. Look up attachment mapping: `migration_entity_map` where `source_type='attachment'`
  3. Query target attachment's `storage_path`
  4. Update card's `cover_image_url` with the storage path

### Files Changed (Summary)
- `src/lib/board-data.ts` - Cover resolution: explicit > auto-pick, URL/path handling
- `src/components/card/CardAttachments.tsx` - "Set as Cover" / "Remove Cover" buttons, cover badge
- `src/components/card/CardModal.tsx` - Pass cover state to CardAttachments, sign storage paths
- `src/components/board/BoardList.tsx` - Filtered/total card count display
- `src/components/board/BoardCard.tsx` - Quick copy button on hover
- `src/lib/trello-migration.ts` - `resolveCardCovers()` function, step 6b
- `src/lib/types.ts` - `idAttachmentCover` on TrelloCard
- `src/app/api/cards/[id]/route.ts` - Accept `cover_image_url` in PATCH
