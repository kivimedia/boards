# Fathom Video Intelligence - Integration Plan

## Overview
Connect Fathom meeting recordings to KM Boards. Fathom handles all transcription/recording.
KM Boards receives webhooks, stores metadata, matches participants to clients, and uses Haiku for summaries/action items.

**Estimated new cost: ~$5/month** (Haiku + embeddings only, Fathom subscription already paid)

## Env Vars (in .env.local)
- `FATHOM_API_KEY` - API key for Fathom Video API (base: https://api.fathom.video)
- `FATHOM_WEBHOOK_SECRET` - whsec_ prefixed secret for HMAC-SHA256 signature validation
- `CRON_SECRET` - existing, reused for admin endpoints

## Phase 1: Foundation (Current)
- [x] Add env vars to .env.local
- [ ] Migration 071: fathom_recordings, participant_identities, meeting_participants tables
- [ ] Webhook endpoint: POST /api/webhooks/fathom (signature validation, idempotent upsert)
- [ ] Fathom API client: src/lib/integrations/fathom.ts (fetch recordings, transcripts, meetings list)
- [ ] Participant matching: calendar email lookup against clients table
- [ ] Past Meetings page: /meetings (list + filter + detail)
- [ ] Historical backfill endpoint: POST /api/admin/fathom-backfill

## Phase 2: Routing + AI Analysis
- [ ] Migration 072: routing_rules, meeting_action_items tables
- [ ] Routing rules engine + config UI
- [ ] Haiku transcript analysis (action items, key decisions, next steps)
- [ ] Auto ticket updates (summary + action items + Fathom link on matched ticket)
- [ ] Speaker name fuzzy matching (secondary identification)
- [ ] Identity confirmation page

## Phase 3: Communication Layer
- [ ] Per-client AI rules (natural language, stored per client)
- [ ] Meeting summary email composer (rich text editor + preview)
- [ ] Weekly client update emails with Fathom references
- [ ] Scheduling engine (configurable per client)

## Phase 4: Intelligence + Portal
- [ ] Vector embeddings for transcript chunks (pgvector - already set up)
- [ ] Semantic search across meeting history ("when did David mention...")
- [ ] Client portal meetings section
- [ ] Feedback system (thumbs up/down on summaries)

## Phase 5: Reporting
- [ ] Meeting activity dashboard
- [ ] Client engagement reports
- [ ] Cost monitoring

## Key Architecture Decisions
- Fathom API base: https://api.fathom.video (NOT api.fathom.ai)
- Webhook signature: HMAC-SHA256 with whsec_ secret, check webhook-id + webhook-timestamp + webhook-signature headers
- Haiku 4.5 for ALL AI processing (summaries, action items, rules) - upgrade to Sonnet only if quality is bad
- Use Fathom's own summary/action items as base, only re-process with Claude when custom rules apply
- Recordings stay on Fathom servers - we store share_url links only
- Rate limit: 60 API calls/minute, exponential backoff on 429
- Webhook returns 200 immediately, processes async

## Data Model (Migration 071)
### fathom_recordings
- id (uuid PK)
- fathom_recording_id (text UNIQUE) - Fathom's ID
- title (text)
- share_url (text)
- duration_seconds (int)
- recorded_at (timestamptz)
- transcript (jsonb) - full transcript from Fathom
- fathom_summary (text) - Fathom's own summary
- fathom_action_items (jsonb) - Fathom's extracted items
- ai_summary (text) - our Haiku-generated summary (with client rules applied)
- calendar_invitees (jsonb) - raw invitee data from Fathom
- processing_status (text) - pending/processing/matched/needs_review/error
- matched_client_id (uuid FK clients)
- matched_card_id (uuid FK cards)
- matched_by (text) - email/name/rule/manual
- raw_payload (jsonb) - full webhook payload for audit
- created_at, updated_at (timestamptz)

### participant_identities
- id (uuid PK)
- email (text)
- display_name (text)
- fathom_speaker_name (text)
- client_id (uuid FK clients)
- contact_name (text)
- source (text) - calendar_email/speaker_name/manual
- confidence (text) - high/medium/low
- confirmed_at (timestamptz)
- confirmed_by (uuid FK profiles)
- created_at, updated_at (timestamptz)

### meeting_participants
- id (uuid PK)
- recording_id (uuid FK fathom_recordings)
- identity_id (uuid FK participant_identities)
- is_external (boolean)
- speaker_label (text)
- created_at (timestamptz)
