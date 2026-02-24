# Local Trello Sync - 2026-02-21

## Why Local?

The Vercel-hosted migration engine (`src/lib/trello-migration.ts`) has a 5-minute serverless timeout. A full 6-board sync with 10K+ cards and 50K+ comments takes ~54 minutes. Running locally via `node` avoids the timeout.

## What Was Synced

All 6 Trello boards synced to KMBoards in merge mode (update existing, create new, never delete).

### Board Mapping

| Trello Board | Trello ID | KMBoard Name | KMBoard ID |
|---|---|---|---|
| Abs | `5f2ebfea3379be79550b60f0` | Dev Board | `fd5f0606-e30c-4c1a-9cc8-fb6a02057619` |
| Daily Cookie Copywriters | `5f7e01bd200e1e0ff8c23320` | Account Managers | `00b502d5-c05b-46ef-900a-ba594e8ac730` |
| Glen | `5f73325f53a6451d2618d238` | Design Board | `a4523939-07d2-4c8b-a4cc-1764f1bb7c12` |
| Jesus | `5e0ee7c8c98da78b707c2944` | Design Board | `18413c78-473c-4fb6-9f42-5c2428140d66` |
| Mariz | `5cd58c883cbb325032444b5c` | Executive Assistant | `2a7b6c44-4380-4c60-a14b-de94ab70facb` |
| Video Editing | `68c68b2fd8a6ec847872837c` | Video Board | `94b7b432-3f62-41ee-8e2a-7d6caa568a38` |

### Trello API Credentials

Set via environment variables:
```
TRELLO_KEY=<your-trello-api-key>
TRELLO_TOKEN=<your-trello-api-token>
```

These can be found in the latest migration job config in the DB. The sync scripts read from `process.env.TRELLO_KEY` and `process.env.TRELLO_TOKEN`.

### User Mapping (Trello Member ID -> KMBoard Profile UUID)

```
5be1cb5a2a1f1f4523e35fd7 -> b4ccc99c-6c0b-4530-8f98-06aa5fc3c975  (Ziv)
5e0ebbb13c0b1e8b5a61c51b -> 8f04591f-bbb5-4f16-83d3-c230fa3540fa  (Jesus)
5f3db7bc4d58db0a94e0c0fb -> ee76a98c-adf3-48be-9156-0038a4c0b84e  (Glen)
60f0f3a26ae9de3ff7c530dd -> ba66e07f-b09f-41bb-a2ce-12024cee0308  (Mike)
62a3dbb7a0c3ee0c7fa97def -> 4b63c33b-0120-45b5-b528-cb3f472df300  (Keren)
5f7e019d3bec750e1d7eaab1 -> c7e42b6f-f585-4caa-bc10-57a3e42e08fb  (Mariz)
5c9a0bd0d3f6a072c04e0b46 -> 7c2f77ef-aa2e-4f3f-80de-a2a2f387b862  (Abs)
63f19e1ac6b04200bf93cd62 -> 65d0dfe8-2963-4d32-aada-09fc17f70b84  (Abs second)
5cd58c18bdf7d80c12f7d3bf -> 7c2f77ef-aa2e-4f3f-80de-a2a2f387b862  (Abs third)
```

## Sync Rules

1. **Don't move cards** - If a card already exists on KMBoards and the user moved it to a different list, the sync does NOT override that. It only updates title, description, due date, priority, labels, and assignees.
2. **Don't delete comments** - Comments added on KMBoards are preserved. Sync only adds new Trello comments that don't exist yet (matched by `migration_entity_map`).
3. **Archived cards skipped** - Only open Trello cards (`closed === false`) are synced.
4. **Cross-job dedup** - Uses `migration_entity_map` table to check if a Trello entity was already imported by any prior job. Prevents duplicate cards/lists.

## Sync Results

**Job ID**: `b4aaecd6-29cc-4e81-ab71-be7cbca1db80`
**Duration**: 53 minutes 50 seconds
**Script**: `scripts/local-trello-sync.js`

| Metric | Count |
|---|---|
| Cards updated | 10,311 |
| Cards created (new) | 6 |
| Comments added | 49,817 |
| New lists created | 18 |
| Errors | 0 |

### Performance

- Card sync: 8x concurrency (semaphore pattern)
- Comment sync: 10x concurrency
- Throughput: ~600 cards/min (up from ~50/min sequential)

## Post-Sync Issues Found

Ran `scripts/board-discrepancy-report.js` to compare KMBoard vs Trello card counts per list.

### Issue 1: Glen Board Empty (0 cards on KM, 743 on Trello)

**Root cause**: Glen's cards were imported by a prior migration job and existed in the `cards` table, but had no `card_placements` rows linking them to Glen's board lists. The sync script saw them in `migration_entity_map` and skipped them (thinking they were already imported). Additionally, 70 of those cards had been deleted from the `cards` table entirely.

**Fix**: `scripts/fix-glen-placements.js`
- Checked each of Glen's 743 Trello cards against `migration_entity_map`
- For 672 cards already placed on Glen: skipped
- For cards in entity map but no placement on Glen: created `card_placements` row
- For cards in entity map but deleted from `cards` table: recreated card + placement
- Position values capped at Postgres INT max (2,147,483,647) - Trello uses large floats

**Result**: 71 new placements, 70 cards recreated, 0 errors. Glen board now has 793 cards.

### Issue 2: Mariz Duplicate Empty Lists

**Root cause**: The sync created new lists matching Trello list names, but the cards were all on the original lists (imported by a prior job). This left 15 empty duplicate lists.

**Fix**: `scripts/fix-glen-and-mariz.js` (Fix 1 section)
- Grouped lists by lowercase name
- For each group with duplicates, kept the one with cards, deleted the empty ones
- Deleted 15 empty duplicate lists

## Scripts Reference

| Script | Purpose | Status |
|---|---|---|
| `scripts/local-trello-sync.js` | Full 6-board sync with 8x/10x concurrency | Complete |
| `scripts/board-discrepancy-report.js` | Compare KM vs Trello card counts per list per board | Utility |
| `scripts/fix-glen-and-mariz.js` | Delete Mariz dupes + attempt Glen populate (partially worked) | Superseded by fix-glen-placements |
| `scripts/fix-glen-placements.js` | Create missing Glen card placements + recreate deleted cards | Complete |
| `scripts/check-glen.js` | Diagnostic: entity map state for Glen cards | Utility |

## How to Run Scripts

```bash
cd agency-board
export $(grep -v '^#' .env.local | xargs) && node scripts/<script-name>.js
```

All scripts use `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

## Key Technical Notes

- **`migration_entity_map`** table stores `source_type` + `source_id` -> `target_id` per job. `getGlobalMappings()` checks across ALL jobs for dedup.
- **`card_placements`** links cards to lists (and therefore boards). A card with no placement on a board is invisible on that board even if the card exists in the `cards` table.
- **Position column** in `card_placements` is INTEGER. Trello positions are floats that can exceed 2^31. Must cap at 2,147,483,647.
- **Trello rate limits**: 429 responses with `Retry-After` header. Scripts handle this with exponential backoff.
- **Bash `!` escaping**: Node.js `-e` inline scripts break in bash because `!` triggers history expansion. Use standalone `.js` files instead.
- **Stale jobs**: Before running the local sync, cancelled 4 stale running/pending jobs in `migration_jobs` table.
