# PageForge - Status & Remaining Work

*Last updated: 2026-03-04*

## Fully Implemented (7/7 PRD items done)

1. **Enhanced Markup Validation** - Done in worker (lorem ipsum, placeholder images, image dimensions, mobile checks)
2. **Figma Pre-Flight Scanner** - Done in worker lines 328-529 (mobile frame, auto-layout, naming, fonts)
3. **Board Sub-Task Integration** - Done (creation + completion tracking, 7 auto-tasks per build)
4. **Model Router Profiles** - Done (4 profiles, 7 models, full UI in build form)
5. **Credential Rotation Workflow** - Done (credentials_updated_at tracking, Figma/SSH edit fields, 90-day stale badge)
6. **Client Preview Workflow** - Done (shareable tokens, expiration, sanitized preview API)
7. **Kill Switch** - Done (abort route + UI button)

## Also Implemented

- **Cost Dashboard** - Done (model router cost estimates per profile)
- **Credentials Encryption** - Done (AES-256-GCM via `src/lib/encryption.ts`, encrypted on create/update, decrypted on read)

## Blockers for First Real E2E Test

- [ ] Add `BROWSERLESS_API_KEY` and `BROWSERLESS_URL` to VPS `.env` (needed for screenshots/VQA)
- [ ] Set `CREDENTIALS_ENCRYPTION_KEY` on VPS for worker decryption
- [ ] Run one-time `scripts/encrypt-pageforge-credentials.ts` to encrypt existing plaintext creds
- [ ] Verify VPS worker process is running and can reach Supabase
- [ ] Set up a real WordPress site with Gutenberg or Divi 5 for testing

## Stats

- 396 unit tests passing
- 15-phase pipeline fully coded
- Zero E2E tests on real sites (that's the next milestone)
