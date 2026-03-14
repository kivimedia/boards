# Team PR - Remaining Features (vs PRD v3.1)

**Created**: 2026-03-14 | **Last updated**: 2026-03-14
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

### High Priority
- [ ] Loop B: Calibration report every 5 runs (`feedback/calibration_report.py`)
- [ ] Loop C: Outcome tracker - mark outlet as REPLIED from UI, log outcome
- [ ] "What's Working" report after 50 emails sent
- [ ] Seasonal calendar warning in UI ("Do not pitch Jun-Jul" for Sweden)
- [ ] Native speaker review flag for first 3 Swedish runs

### Medium Priority
- [ ] `dry_run` mode implementation (flag exists, pipeline logic to skip real API calls missing)
- [ ] Exa client (`services/exa_client.py`) - optional additional research source
- [ ] QA re-evaluation branch - one retry for flagged outlets before failing them
- [ ] Hunter.io `email_finder` (by name+domain) in addition to `domain_search`
- [ ] Cross-run outlet ID persistence (same outlet keeps same code across runs)
- [ ] Settings persistence (currently returns defaults only, no DB storage)
- [ ] Cost estimate shown before launching a run
- [ ] `/team-pr/feedback` page - view feedback history and calibration reports
- [ ] Outlet exclusion selection at gate advance UI
- [ ] Nginx reverse proxy for PR pipeline (nice-to-have, direct IP works)

### Low Priority
- [ ] Tests (research, verification, QA, email gen)
- [ ] README.md for VPS service
- [ ] `run_pipeline.py` CLI entry point with dry_run flag
- [ ] `output/runs/` and `output/reports/` directory structure
