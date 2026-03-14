from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from config import get_settings
from pipeline.orchestrator import PipelineOrchestrator
from services.supabase_client import SupabaseService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Global orchestrator instance
orchestrator: PipelineOrchestrator | None = None
poll_task: asyncio.Task | None = None


async def poll_pending_runs():
    """Background polling loop - checks for PENDING runs every 30s."""
    settings = get_settings()
    supabase = SupabaseService()
    interval = settings.poll_interval_seconds

    logger.info(f"Polling loop started (interval: {interval}s)")

    while True:
        try:
            pending = await supabase.get_pending_runs()
            if pending:
                logger.info(f"Found {len(pending)} pending runs")
                for run in pending:
                    run_id = run["id"]
                    logger.info(f"Auto-starting pending run: {run_id}")
                    try:
                        await orchestrator.run_pipeline(run_id)
                    except Exception as e:
                        logger.error(f"Failed to auto-start run {run_id}: {e}")
        except Exception as e:
            logger.error(f"Polling loop error: {e}")

        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan - start and stop the polling loop."""
    global orchestrator, poll_task

    orchestrator = PipelineOrchestrator()
    poll_task = asyncio.create_task(poll_pending_runs())
    logger.info("PR Pipeline service started")

    yield

    # Shutdown
    if poll_task:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
    logger.info("PR Pipeline service stopped")


app = FastAPI(
    title="PR Pipeline Service",
    description="Processes PR outreach pipeline runs through 4 stages with quality gates",
    version="1.0.0",
    lifespan=lifespan,
)


# --- Response models ---

class RunStatusResponse(BaseModel):
    id: str
    status: str
    current_stage: int
    outlets_discovered: int
    outlets_verified: int
    outlets_qa_passed: int
    emails_generated: int
    total_cost_usd: float
    error_log: str | None = None
    stage_results: dict[str, Any] | None = None


class AdvanceResponse(BaseModel):
    success: bool
    message: str
    advanced_to: str | None = None
    outlets_promoted: int = 0


class StartResponse(BaseModel):
    success: bool
    message: str
    run_id: str


# --- Endpoints ---

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "pr-pipeline"}


@app.get("/pr/run/{run_id}/status", response_model=RunStatusResponse)
async def get_run_status(run_id: str):
    """Get the current status of a pipeline run."""
    supabase = SupabaseService()
    run = await supabase.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return RunStatusResponse(
        id=run["id"],
        status=run.get("status", "PENDING"),
        current_stage=run.get("current_stage", 0),
        outlets_discovered=run.get("outlets_discovered", 0),
        outlets_verified=run.get("outlets_verified", 0),
        outlets_qa_passed=run.get("outlets_qa_passed", 0),
        emails_generated=run.get("emails_generated", 0),
        total_cost_usd=run.get("total_cost_usd", 0),
        error_log=run.get("error_log"),
        stage_results=run.get("stage_results"),
    )


@app.post("/pr/run/{run_id}/start", response_model=StartResponse)
async def start_run(run_id: str, background_tasks: BackgroundTasks):
    """Start processing a pipeline run."""
    supabase = SupabaseService()
    run = await supabase.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    status = run.get("status", "PENDING")
    if status not in ("PENDING",):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start run in status: {status}. Only PENDING runs can be started.",
        )

    background_tasks.add_task(orchestrator.run_pipeline, run_id)
    return StartResponse(
        success=True,
        message=f"Run {run_id} started processing",
        run_id=run_id,
    )


@app.post("/pr/run/{run_id}/advance", response_model=AdvanceResponse)
async def advance_run(run_id: str, background_tasks: BackgroundTasks):
    """Advance a run past its current quality gate."""
    supabase = SupabaseService()
    run = await supabase.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    status = run.get("status", "")
    if status not in ("GATE_A", "GATE_B", "GATE_C"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot advance run in status: {status}. Run must be at a gate (GATE_A, GATE_B, GATE_C).",
        )

    # Run advance in background since stages can take a while
    async def do_advance():
        try:
            result = await orchestrator.advance_gate(run_id)
            logger.info(f"Advance result for run {run_id}: {result}")
        except Exception as e:
            logger.error(f"Advance failed for run {run_id}: {e}")
            await orchestrator.handle_error(run_id, str(e))

    background_tasks.add_task(do_advance)

    return AdvanceResponse(
        success=True,
        message=f"Advancing run {run_id} past {status}",
        advanced_to=_next_stage(status),
    )


def _next_stage(gate: str) -> str:
    """Get the next stage after a gate."""
    mapping = {
        "GATE_A": "VERIFICATION",
        "GATE_B": "QA_LOOP",
        "GATE_C": "EMAIL_GEN",
    }
    return mapping.get(gate, "UNKNOWN")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8400, reload=True)
