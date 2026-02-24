# Mobile Responsiveness Audit — KM Boards

## Issue Table

| # | File | Element | Issue | Severity |
|---|------|---------|-------|----------|
| 1 | `app/layout.tsx` | `<head>` | Missing viewport meta tag — without `<meta name="viewport">` mobile browsers default to 980px width | **High** |
| 2 | `components/layout/Sidebar.tsx` | `<aside>` | Sidebar always visible; consumes `w-16`–`w-64` of a 375px screen with no mobile drawer/overlay pattern | **High** |
| 3 | `components/layout/Header.tsx` | `<header>` | No hamburger/menu button to toggle sidebar on mobile; `px-6` padding too wide on small screens | **High** |
| 4 | `components/board/BoardHeader.tsx` | `<header>` | Header renders ~10 controls (view switcher, search bar, filter, bg picker, dedup, member avatars, share, profiling, theme, notifications) in one row — overflows completely on mobile | **High** |
| 5 | `components/smart-search/SearchBar.tsx` | search input | Fixed `w-[200px] sm:w-[280px]` / `w-[320px] sm:w-[420px]` when focused — way too wide on a board header mobile layout | **High** |
| 6 | `components/card/CardModal.tsx` | properties panel | Properties sidebar `w-64 absolute right-0` overflows the modal container on mobile; `sm:hidden` backdrop but panel width fixed | **High** |
| 7 | All authenticated pages | page wrapper | `flex h-screen overflow-hidden` with visible sidebar — no space reserved for mobile hamburger toggle | **High** |
| 8 | `components/board/BoardList.tsx` | list column | Kanban list columns `w-72` shrink-0 — fine on mobile since board uses overflow-x scroll, but kanban board padding `p-6` wastes space on mobile | **Medium** |
| 9 | `components/board/ListView.tsx` | `<table>` | Table has `min-w-[640px]` — on mobile the container needs explicit `overflow-x-auto`; currently uses `overflow-auto` but outer wrapper `p-6` padding could cause issue | **Medium** |
| 10 | `components/board/BoardHeader.tsx` | ViewSwitcher area | ViewSwitcher shows icons only on mobile (`hidden sm:inline` for labels) — good, but the entire header row still overflows | **Medium** |
| 11 | `components/board/DashboardContent.tsx` | stats grid | `p-6` padding — fine but could be `p-4` on mobile for better space utilization | **Medium** |
| 12 | `components/bottom-nav/BottomNavBar.tsx` | nav bar | `fixed bottom-6` — the content beneath it isn't padded to account for this bar | **Medium** |
| 13 | `components/ui/Modal.tsx` | modal | `pt-[5vh] sm:pt-[10vh]` already responsive; `max-h-[80vh]` on mobile could be `max-h-[90vh]` to maximize screen real estate | **Medium** |
| 14 | `components/board/BoardHeader.tsx` | buttons | Multiple action buttons lack `min-h-[44px]` / `min-w-[44px]` touch targets on mobile | **Medium** |
| 15 | `app/settings/page.tsx` | settings grid | `grid grid-cols-1 md:grid-cols-2` with `p-6` padding — fine, but should be `p-4 sm:p-6` | **Low** |
| 16 | `components/board/BulkSelectToolbar.tsx` | toolbar | Fixed bottom bar may conflict with BottomNavBar on mobile | **Medium** |
| 17 | `components/board/CreateBoardModal.tsx` | modal | Likely inherits Modal's good responsiveness, but form padding needs check | **Low** |
| 18 | `components/board/FilterDropdown.tsx` | dropdown | Dropdown panel may overflow screen edges on mobile | **Medium** |
| 19 | `components/board/BoardCard.tsx` | card tap target | Card click area fine but checkboxes/action buttons may be too small | **Low** |
| 20 | `components/analytics/`, `components/productivity/` | tables/charts | Data tables and charts not responsive — need `overflow-x-auto` wrappers | **Medium** |
| 21 | `app/team/page.tsx`, `components/team/TeamContent.tsx` | team columns | Team layout may break on narrow screens | **Low** |
| 22 | `components/board/CalendarView.tsx` | calendar | Calendar grids typically need overflow-x on mobile | **Medium** |
| 23 | `components/gantt/GanttView.tsx` | gantt | Gantt charts are notoriously non-mobile-friendly — needs overflow + scroll | **Medium** |
| 24 | All pages | font sizes | Some text uses `text-[10px]` and `text-[9px]` — below readable threshold on mobile | **Low** |
| 25 | `components/chat/ChatPanel.tsx` | chat panel | Chat panel positioning may not adapt on mobile | **Medium** |

---

## Prioritized Fix Plan

### Phase 1 — Critical Layout Fixes

1. **viewport meta tag** (`app/layout.tsx`)
2. **Sidebar mobile drawer** (`stores/app-store.ts`, `components/layout/Sidebar.tsx`)
3. **Header hamburger** (`components/layout/Header.tsx`)
4. **BoardHeader mobile** (`components/board/BoardHeader.tsx`) — collapse controls
5. **SearchBar mobile** (`components/smart-search/SearchBar.tsx`) — icon-only on board header
6. **CardModal properties panel** (`components/card/CardModal.tsx`) — full-width on mobile
7. **BottomNavBar padding** — board content gets `pb-24` on mobile for nav bar clearance

### Phase 2 — Medium Issues

8. **Modal sizing** (`components/ui/Modal.tsx`)
9. **ListView table** — confirm overflow-x works correctly
10. **BoardCard/BulkSelectToolbar** touch targets
11. **FilterDropdown** edge overflow
12. **Dashboard padding** on mobile

### Phase 3 — Low / Polish

13. Settings padding adjustments
14. Font size review
15. CalendarView / GanttView overflow

---

*All fixes target 375px (iPhone SE) as minimum viewport.*
