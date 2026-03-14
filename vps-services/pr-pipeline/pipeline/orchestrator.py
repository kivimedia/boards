from __future__ import annotations
import logging
import traceback
from typing import Any

from models import RunStatus
from services.supabase_client import SupabaseService
from services.tavily_client import TavilyService
from services.youtube_client import YouTubeService
from services.hunter_client import HunterService
from services.anthropic_client import AnthropicService
from pipeline.research import run_research
from pipeline.verification import run_verification
from pipeline.qa_loop import run_qa_loop, promote_reviewed_outlets
from pipeline.email_gen import run_email_gen

logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    def __init__(self):
        self.supabase = SupabaseService()
        self.tavily = TavilyService()
        self.youtube = YouTubeService()
        self.hunter = HunterService()
        self.claude = AnthropicService()

    async def run_pipeline(self, run_id: str) -> None:
        """Main entry point - run the pipeline from its current state."""
        run = await self.supabase.get_run(run_id)
        if not run:
            logger.error(f"Run {run_id} not found")
            return

        status = run.get("status", "PENDING")
        if status in ("COMPLETED", "FAILED", "CANCELLED"):
            logger.info(f"Run {run_id} already in terminal state: {status}")
            return

        # If at a gate, do nothing (wait for human advance)
        if status in ("GATE_A", "GATE_B", "GATE_C"):
            logger.info(f"Run {run_id} waiting at gate: {status}")
            return

        client = await self.supabase.get_client(run["client_id"])
        territory = await self.supabase.get_territory(run["territory_id"])

        if not client:
            await self.handle_error(run_id, "Client not found")
            return
        if not territory:
            await self.handle_error(run_id, "Territory not found")
            return

        try:
            if status == "PENDING":
                await self._run_from_research(run_id, run, client, territory)
            elif status == "RESEARCH":
                # Resume research if interrupted
                await self._run_from_research(run_id, run, client, territory)
            elif status == "VERIFICATION":
                await self._run_from_verification(run_id, run, client, territory)
            elif status == "QA_LOOP":
                await self._run_from_qa(run_id, run, client, territory)
            elif status == "EMAIL_GEN":
                await self._run_from_email_gen(run_id, run, client, territory)
        except Exception as e:
            tb = traceback.format_exc()
            await self.handle_error(run_id, f"{str(e)}\n{tb}")

    async def _run_from_research(
        self, run_id: str, run: dict, client: dict, territory: dict
    ) -> None:
        """Run Stage 1: Research, then pause at Gate A."""
        await self.update_run_status(run_id, RunStatus.RESEARCH, current_stage=1)
        run = await self.supabase.get_run(run_id)

        result = await run_research(
            run=run,
            client=client,
            territory=territory,
            supabase=self.supabase,
            tavily=self.tavily,
            youtube=self.youtube,
            claude=self.claude,
        )

        logger.info(f"Research complete for run {run_id}: {result}")
        await self.update_run_status(run_id, RunStatus.GATE_A, current_stage=1)

    async def _run_from_verification(
        self, run_id: str, run: dict, client: dict, territory: dict
    ) -> None:
        """Run Stage 2: Verification, then pause at Gate B."""
        await self.update_run_status(run_id, RunStatus.VERIFICATION, current_stage=2)
        run = await self.supabase.get_run(run_id)

        result = await run_verification(
            run=run,
            client=client,
            territory=territory,
            supabase=self.supabase,
            hunter=self.hunter,
            claude=self.claude,
        )

        logger.info(f"Verification complete for run {run_id}: {result}")
        await self.update_run_status(run_id, RunStatus.GATE_B, current_stage=2)

    async def _run_from_qa(
        self, run_id: str, run: dict, client: dict, territory: dict
    ) -> None:
        """Run Stage 3: QA Loop, then pause at Gate C."""
        await self.update_run_status(run_id, RunStatus.QA_LOOP, current_stage=3)
        run = await self.supabase.get_run(run_id)

        result = await run_qa_loop(
            run=run,
            client=client,
            territory=territory,
            supabase=self.supabase,
            claude=self.claude,
        )

        logger.info(f"QA Loop complete for run {run_id}: {result}")
        await self.update_run_status(run_id, RunStatus.GATE_C, current_stage=3)

    async def _run_from_email_gen(
        self, run_id: str, run: dict, client: dict, territory: dict
    ) -> None:
        """Run Stage 4: Email Generation, then complete."""
        await self.update_run_status(run_id, RunStatus.EMAIL_GEN, current_stage=4)
        run = await self.supabase.get_run(run_id)

        result = await run_email_gen(
            run=run,
            client=client,
            territory=territory,
            supabase=self.supabase,
            claude=self.claude,
        )

        logger.info(f"Email Gen complete for run {run_id}: {result}")
        await self.update_run_status(run_id, RunStatus.COMPLETED, current_stage=4)

    async def advance_gate(self, run_id: str) -> dict[str, Any]:
        """Move past the current gate to the next stage."""
        run = await self.supabase.get_run(run_id)
        if not run:
            return {"error": "Run not found"}

        status = run.get("status", "")
        client = await self.supabase.get_client(run["client_id"])
        territory = await self.supabase.get_territory(run["territory_id"])

        if status == "GATE_A":
            # Advance to Verification
            logger.info(f"Advancing run {run_id} past Gate A to Verification")
            await self._run_from_verification(run_id, run, client, territory)
            return {"advanced_to": "VERIFICATION"}

        elif status == "GATE_B":
            # Promote NEEDS_REVIEW outlets, then advance to QA Loop
            promoted = await promote_reviewed_outlets(run_id, self.supabase)
            logger.info(f"Advancing run {run_id} past Gate B to QA Loop (promoted {promoted} outlets)")
            await self._run_from_qa(run_id, run, client, territory)
            return {"advanced_to": "QA_LOOP", "outlets_promoted": promoted}

        elif status == "GATE_C":
            # Promote NEEDS_REVIEW outlets, then advance to Email Gen
            promoted = await promote_reviewed_outlets(run_id, self.supabase)
            logger.info(f"Advancing run {run_id} past Gate C to Email Gen (promoted {promoted} outlets)")
            await self._run_from_email_gen(run_id, run, client, territory)
            return {"advanced_to": "EMAIL_GEN", "outlets_promoted": promoted}

        else:
            return {"error": f"Run is not at a gate. Current status: {status}"}

    async def update_run_status(
        self,
        run_id: str,
        status: RunStatus,
        current_stage: int | None = None,
        stage_results: dict | None = None,
    ) -> None:
        """Update run status and optionally stage info."""
        data: dict[str, Any] = {"status": status.value}
        if current_stage is not None:
            data["current_stage"] = current_stage
        if stage_results is not None:
            run = await self.supabase.get_run(run_id)
            existing = run.get("stage_results") or {} if run else {}
            existing.update(stage_results)
            data["stage_results"] = existing
        await self.supabase.update_run(run_id, data)

    async def handle_error(self, run_id: str, error: str) -> None:
        """Mark run as failed with error details."""
        logger.error(f"Pipeline error for run {run_id}: {error}")
        await self.supabase.update_run(run_id, {
            "status": RunStatus.FAILED.value,
            "error_log": error[:5000],  # Truncate long errors
        })
