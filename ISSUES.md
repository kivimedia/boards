# Agency Board - Known Issues & Planned Work

## Bugs

### BUG-001: Card click does not open modal (drag/click conflict)
- **File**: `src/components/board/BoardCard.tsx`
- **Severity**: High
- **Status**: **Fixed**
- **Description**: Clicking a card on the Kanban board sometimes fails to open the card modal. The `@hello-pangea/dnd` library's `dragHandleProps` and the `onClick` handler are both on the same outer div.
- **Fix applied**: Track mouse position on pointerDown, compare with click position. If moved >5px, suppress click (was a drag). Uses `onPointerDown` to avoid type conflicts with `DraggableProvidedDragHandleProps`.

### BUG-002: Board background color picker does not apply colors
- **File**: `src/components/board/BoardBackgroundPicker.tsx`
- **Severity**: Medium
- **Status**: **Fixed**
- **Description**: Clicking any color/gradient swatch in the Board Background picker panel has no visible effect. The `updateBackground` function calls `fetch(PATCH)` but does not check the response.
- **Fix applied**: Check `res.ok`, add try/catch error handling, only call `onUpdate` on success.

## Planned Features

### FEAT-001: Click-and-drag horizontal panning on board empty areas
- **Severity**: Medium
- **Status**: **Done**
- **Description**: Trello-like click-and-drag panning when clicking on empty board areas.
- **Implementation**: `useBoardPan` hook in `src/hooks/useBoardPan.ts`, wired into `Board.tsx`.

### FEAT-002: Trello migration - specific board re-import
- **Severity**: Low
- **Status**: **Done**
- **Description**: Re-import specific boards from Trello after initial migration.
- **Implementation**: "Re-import Boards" button added to `MigrationHistory.tsx` with board selection checkboxes.

### FEAT-003: LinkedIn Scout Pipeline (P7.12)
- **Severity**: High
- **Status**: **Done**
- **Description**: 4-step interactive scout wizard for LinkedIn-first podcast guest discovery.
- **Implementation**:
  - `ScoutWizard.tsx` -- 4-step interactive UI with SSE streaming
  - `scout-pipeline.ts` -- Step-by-step execution engine (LinkedIn search, Snov.io enrichment, AI deep research, candidate save)
  - `/api/podcast/scout/[runId]/step` -- SSE endpoint per step
  - `/api/podcast/scout/config` -- Scout config CRUD
  - `/api/podcast/scout` -- Run creation with resume support
  - `/podcast/scout` -- Dedicated page
  - Pause/resume via `awaiting_input` status between steps
  - Scout config in `/settings/podcast` integration settings
  - Migration 044 (location column) and 045 (scout pipeline) applied
