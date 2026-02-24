# Carolina Balloons HQ -- Claude Context

## Project
Carolina Balloons HQ is a purpose-built business management platform for Carolina Balloons, a balloon decor company owned by Halley Foye. It is a derivative of KM Boards (the Kivi Media agency board system) that reuses the core board/card/list infrastructure but replaces the agency-oriented board types with balloon-business-specific pipelines.

Built with Next.js 14, Supabase, Tailwind CSS, TypeScript. See `Carolina-Balloons-HQ-PRD.md` in the parent directory for full requirements.

## Users
- **Halley Foye** (Owner): Full access to all boards, settings, analytics, AI config. Approves proposals. Creates invoices. Role: `owner`
- **Tiffany** (VA): Access to VA Workspace, Private Clients. Can create proposals for review. Cannot modify pricing/products. Role: `va`

## Board Types (6)
| Type | Icon | Lists | Purpose |
|------|------|-------|---------|
| `boutique_decor` | 🎈 | 15 | Boutique balloon decor lead pipeline |
| `marquee_letters` | 💡 | 15 | Marquee letter rental pipeline |
| `private_clients` | 🎉 | 17 | Tiffany's private client pipeline |
| `owner_dashboard` | 👑 | 15 | Halley's cross-board review dashboard |
| `va_workspace` | 📋 | 21 | Tiffany's task/template workspace |
| `general_tasks` | ✅ | 4 | Personal to-do/notes |

## Key Features
- **Proposal Intelligence System**: AI learns from historical proposals, generates drafts with confidence tiers (no_brainer/suggested/needs_human)
- **Lead Intake Engine**: WP Form webhook -> auto-triage -> auto-response drafts
- **Cross-Board Mirroring**: Automatic card mirroring between Owner Dashboard and VA Workspace
- **Google Workspace Integration**: Gmail API (email learning + sending), Calendar API (capacity awareness)
- **Venue Database**: Auto-population from booked events, friendor email tracking
- **Pricing Rules Engine**: Location, mileage, minimums, product catalog
- **"Where I Am" Session Bookmarking**: Separator cards + last_touched_at tracking
- **"Didn't Book" Analytics**: Structured reasons with sub-reasons

## Tech Stack
- Next.js 14 (App Router), React 18, TypeScript 5.3, Tailwind 3.4
- Supabase (Postgres, Auth, Storage, Realtime)
- @hello-pangea/dnd (drag-drop), TanStack Query, Zustand
- AI: Anthropic SDK (Claude API for proposals, email drafting, lead triage)
- Testing: Vitest + Playwright

## Database
- Migrations 001-053: Inherited from KM Boards (core infrastructure)
- Migrations 054-060: Carolina Balloons HQ specific:
  - 054: Balloon board type enum values
  - 055: Lead/inquiry fields on cards table
  - 056: Venues table
  - 057: Pricing rules + product catalog tables
  - 058: Proposal patterns + proposal drafts tables
  - 059: Mirror rules table
  - 060: Google integrations table

## Conventions
- Migrations in `supabase/migrations/` numbered sequentially (next: 061)
- API routes in `src/app/api/`
- Components in `src/components/` organized by domain
- Lib code in `src/lib/` (AI code in `src/lib/ai/`, Google services in `src/lib/google/`)
- Tests in `src/__tests__/`, E2E in `e2e/`
- Hooks in `src/hooks/`
- No emdash in UI headlines -- use plain text
- Start dev server: `npx next dev --turbo`

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GOOGLE_CLIENT_ID=          # Phase 2
GOOGLE_CLIENT_SECRET=       # Phase 2
ENCRYPTION_KEY=             # 32-byte hex for Google token encryption
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:halley@carolinaballoons.com
```

## Launch Phases
- Phase 1 (Week 1-2): Foundation - board types, migrations, separator cards, lead fields
- Phase 2 (Week 2-3): Google Integration + Trello Migration
- Phase 3 (Week 3-4): Cross-Board Mirroring
- Phase 4 (Week 4-6): Proposal Intelligence (AI learning + generation)
- Phase 5 (Week 6-7): Lead Intake & Automation
- Phase 6 (Week 7-8): Polish & Go-Live
