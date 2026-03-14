# Team PR - Missing Features (vs PRD v3.1)

**Created**: 2026-03-14
**PRD**: `C:\Users\raviv\Downloads\caroline-ravn-outreach-agent-v3.1.md`

---

## High Priority

### Caroline Ravn Seed Data
- [ ] Create Caroline Ravn client record via UI or SQL seed (name, company, industry, brand voice, pitch angles, tone rules, bio, exclusion list)
- [ ] Create Sweden territory (country_code=SE, language=sv, signal_keywords, seed_outlets with 10+ known-good Swedish outlets, pitch_norms for Swedish media, seasonal_calendar with Jun-Jul blackout)
- [ ] Swedish email few-shot examples (`prompts/examples/swedish_email_examples.md`)
- [ ] English email few-shot examples (`prompts/examples/english_email_examples.md`)

### Swedish-Specific Pipeline Logic
- [ ] Dual-language search queries (parallel SV + EN queries in Stage 1)
- [ ] Jantelagen / undersell cultural instruction in email generation prompt
- [ ] Superlative reduction rules for Swedish outlets in email system prompt
- [ ] Swedish-specific few-shot examples injected into QA and email generation prompts
- [ ] "Why now" news hook requirement enforced in email prompt

### Quality Gate Minimums
- [ ] Gate A: Check minimum 15 outlets discovered - if fewer, rerun research with broader terms
- [ ] Gate B: Check minimum 10 verified outlets - notify team if fewer
- [ ] Gate C: If 100% flagged (zero confirmed), system pauses instead of advancing
- [ ] Silent drop guard: never advance with 0 outlets through any gate

### Feedback Loops
- [ ] Loop A: 60% rejection rate auto-pause at gates
- [ ] Loop B: Auto-log human edits/overrides (approve, reject, edit) to `pr_feedback` table
- [ ] Loop B: Calibration report every 5 runs (`feedback/calibration_report.py`)
- [ ] Loop C: Outcome tracker - mark outlet as REPLIED from UI, log outcome (`feedback/outcome_tracker.py`)
- [ ] "What's Working" report after 50 emails sent

### Missing DB Columns
- [ ] `pr_outlets.fit_type` - assigned at Gate C before email gen
- [ ] `pr_outlets.lead_time_weeks` - expected lead time per outlet (tagged during verification)
- [ ] `pr_outlets.pitch_timing_window` - seasonal pitch timing tags

---

## Medium Priority

### Pipeline Features
- [ ] `dry_run` flag on `pr_runs` - run pipeline without actually calling external APIs
- [ ] Exa client (`services/exa_client.py`) - optional additional research source
- [ ] Word count validation after email generation (code check, not just prompt instruction)
- [ ] QA re-evaluation branch - one retry for flagged outlets before failing them
- [ ] Hunter.io `email_finder` (by name+domain) in addition to `domain_search`
- [ ] Cross-run outlet ID persistence (same outlet keeps same code across runs)

### External Prompt Files
- [ ] `prompts/research_system.md` - externalize research system prompt
- [ ] `prompts/verification_system.md`
- [ ] `prompts/qa_system.md`
- [ ] `prompts/email_system.md`
- [ ] Load prompts from files instead of inline strings (easier to iterate)

### Infrastructure
- [ ] Nginx reverse proxy config for PR pipeline (port 8400 -> `/pr/` path)
- [ ] Settings persistence (currently returns defaults only, no DB storage)
- [ ] Cost estimate shown before launching a run
- [ ] Seasonal calendar warning in UI ("Do not pitch Jun-Jul" for Sweden)
- [ ] Native speaker review flag for first 3 Swedish runs

### UI Enhancements
- [ ] `/team-pr/feedback` page - view feedback history and calibration reports
- [ ] Outlet exclusion selection at gate advance (choose which outlets to exclude before advancing)
- [ ] "New Client" form accessible from clients page (currently modal-based, but no dedicated page)

---

## Low Priority

### Testing & Docs
- [ ] `tests/test_research.py`
- [ ] `tests/test_verification.py`
- [ ] `tests/test_qa.py`
- [ ] `tests/test_email_gen.py`
- [ ] `README.md` for VPS service
- [ ] `output/runs/` and `output/reports/` directory structure
- [ ] `run_pipeline.py` CLI entry point with dry_run flag

### Config Files
- [ ] `config/client_caroline.json` - JSON config for Caroline Ravn (alternative to DB)
- [ ] `config/territory_sweden.json` - JSON config for Sweden territory
