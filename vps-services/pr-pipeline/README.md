# PR Pipeline - VPS Service

Python FastAPI service that processes PR outreach pipeline runs through 4 stages with quality gates. Each gate pauses for human review before advancing.

## Architecture

- **FastAPI** app on port 8400, managed by **PM2** via `start.sh`
- **Nginx** reverse proxy in front
- Polls `pr_runs` table every 30s for PENDING runs (no vps_jobs dependency for auto-start)
- Uses Supabase as the data layer (`pr_runs`, `pr_outlets`, `pr_email_drafts`, `pr_cost_events`)
- Claude (Sonnet) for research parsing, QA scoring, and email generation

## Pipeline Stages

```
Research -> Gate A -> Verification -> Gate B -> QA Loop -> Gate C -> Email Gen -> COMPLETED
```

1. **Research** (Stage 1) - Discovers media outlets via Tavily web search, YouTube channel search, and Exa neural search. Claude parses raw results into structured outlet records. Deduplicates against existing client outlets.
2. **Gate A** - Human reviews discovered outlets. Warns if < 15 found.
3. **Verification** (Stage 2) - Validates outlet contacts via Hunter.io email finder. Claude scores verification confidence.
4. **Gate B** - Human reviews verified outlets. Warns if < 10 verified. NEEDS_REVIEW outlets can be promoted.
5. **QA Loop** (Stage 3) - Claude scores each outlet on relevance, audience fit, and contact quality. Hard-fails if zero outlets pass.
6. **Gate C** - Human reviews QA results. Warns if >= 60% rejection rate. NEEDS_REVIEW outlets can be promoted.
7. **Email Gen** (Stage 4) - Claude generates personalized outreach emails per outlet using client brand voice, pitch angles, and tone rules.

## Env Vars

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role JWT |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `TAVILY_API_KEY` | Yes | Tavily web search |
| `YOUTUBE_DATA_API_KEY` | Yes | YouTube Data API v3 |
| `HUNTER_API_KEY` | Yes | Hunter.io email verification |
| `EXA_API_KEY` | No | Exa neural search (optional, skipped if missing) |

## Running

```bash
# PM2 (production)
pm2 start start.sh --name pr-pipeline

# Direct (dev)
uvicorn main:app --host 0.0.0.0 --port 8400 --reload

# CLI - trigger a run without vps_jobs
python run_pipeline.py --client-id <UUID> --territory-id <UUID> [--max-outlets 50] [--dry-run]
```

## Endpoints

- `GET /health` - Returns `{"status": "ok", "service": "pr-pipeline"}`
- `GET /pr/run/{run_id}/status` - Current run status, stage counts, cost, errors
- `POST /pr/run/{run_id}/start` - Manually start a PENDING run
- `POST /pr/run/{run_id}/advance` - Advance past current gate (GATE_A/B/C)

## dry_run Mode

When `dry_run: true` is set on a pr_runs row, the pipeline:
- Inserts 5 mock outlets instead of calling Tavily/YouTube/Exa
- Still processes seed outlets from the territory
- Skips real API calls in verification and email gen stages
- Useful for testing the pipeline flow without burning API credits
