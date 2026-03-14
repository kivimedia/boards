# Team PR - Remaining Features (vs PRD v3.1)

**Created**: 2026-03-14 | **Last updated**: 2026-03-14 (round 4 - medium priority done)
**PRD**: `C:\Users\raviv\Downloads\caroline-ravn-outreach-agent-v3.1.md`

---

## Completed (this session)

- [x] Caroline Ravn client + Sweden territory seeded (20 seed outlets, seasonal calendar, pitch norms)
- [x] Swedish/English few-shot email examples
- [x] Dual-language search queries (SV+EN parallel) in Stage 1
- [x] Jantelagen / undersell instructions in email system prompt
- [x] "Why now" news hook requirement in email prompt
- [x] Gate A minimum 15 check (warns if fewer)
- [x] Gate B minimum 10 check (warns if fewer)
- [x] Gate C hard fail if 0 outlets pass QA
- [x] 60% rejection rate warning at Gate C
- [x] Auto-log feedback on draft approve/reject and gate advance
- [x] Externalized all prompts to markdown files
- [x] Few-shot examples injected based on outlet language
- [x] Word count validation + retry + truncation in email gen
- [x] DB columns: fit_type, lead_time_weeks, pitch_timing_window, dry_run

---

## Still Missing

### High Priority - ALL DONE
- [x] Loop B: Calibration report every 5 runs (API + UI in feedback page)
- [x] Loop C: Outcome tracker - mark outlet outcome from UI (positive/neutral/negative/no_response)
- [x] "What's Working" report after 50 emails sent (API + UI in feedback page)
- [x] Seasonal calendar warning in UI ("Do not pitch Jun-Jul" for Sweden)
- [x] Native speaker review flag for first 3 Swedish runs (auto-set + banner + completion flow)

### Medium Priority - ALL DONE
- [x] `dry_run` mode implementation (all 4 stages generate mock data, no API calls)
- [x] Exa client (`services/exa_client.py`) - neural search for additional research
- [x] QA re-evaluation branch - one retry for NEEDS_REVIEW outlets
- [x] Hunter.io `email_finder` (by name+domain) fallback when domain_search low confidence
- [x] Cross-run outlet ID persistence (removed run_number from codes, code-based dedup)
- [x] Settings persistence (pr_user_settings table + upsert, migration 102)
- [x] Cost estimate shown before launching a run (estimate endpoint + UI in start modal)
- [x] `/team-pr/feedback` page - view feedback history and calibration reports
- [x] Outlet exclusion selection at gate advance UI (GateOutletsPanel with checkboxes)
- [x] Nginx reverse proxy for PR pipeline (port 8098 -> 8400)

### Low Priority
- [ ] Tests (research, verification, QA, email gen)
- [ ] README.md for VPS service
- [ ] `run_pipeline.py` CLI entry point with dry_run flag
- [ ] `output/runs/` and `output/reports/` directory structure
