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

        # Gate A minimum check
        gate_a_stage_results: dict[str, Any] = {}
        outlets_discovered = result.get("outlets_discovered", 0)
        if outlets_discovered < 15:
            warning = (
                f"Low outlet count: only {outlets_discovered} outlets discovered "
                f"(minimum recommended: 15). Consider expanding search terms or territory."
            )
            logger.warning(f"Run {run_id} Gate A warning: {warning}")
            gate_a_stage_results["gate_warning"] = warning

        await self.update_run_status(
            run_id, RunStatus.GATE_A, current_stage=1,
            stage_results=gate_a_stage_results if gate_a_stage_results else None,
        )

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

        # Gate B minimum check
        gate_b_stage_results: dict[str, Any] = {}
        outlets_verified = result.get("outlets_verified", 0)
        if outlets_verified < 10:
            warning = (
                f"Low verified outlet count: only {outlets_verified} outlets verified "
                f"(minimum recommended: 10). Many outlets may have failed contact verification."
            )
            logger.warning(f"Run {run_id} Gate B warning: {warning}")
            gate_b_stage_results["gate_warning"] = warning

        await self.update_run_status(
            run_id, RunStatus.GATE_B, current_stage=2,
            stage_results=gate_b_stage_results if gate_b_stage_results else None,
        )

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

        # Gate C minimum check - hard fail if zero outlets passed QA
        outlets_qa_passed = result.get("outlets_qa_passed", 0)
        if outlets_qa_passed == 0:
            error_msg = "Zero outlets passed QA - all flagged or failed"
            logger.error(f"Run {run_id} QA hard fail: {error_msg}")
            await self.update_run_status(
                run_id, RunStatus.FAILED, current_stage=3,
                stage_results={"qa_failure_reason": error_msg},
            )
            await self.handle_error(run_id, error_msg)
            return

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
            # Check 60% rejection rate before advancing
            try:
                all_outlets = await self.supabase.get_outlets(run_id)
                qa_checked = [o for o in all_outlets if o.get("qa_status") in ("PASSED", "FAILED")]
                qa_failed = [o for o in qa_checked if o.get("qa_status") == "FAILED"]
                if qa_checked:
                    rejection_rate = len(qa_failed) / len(qa_checked)
                    if rejection_rate >= 0.6:
                        warning = (
                            f"High QA rejection rate: {len(qa_failed)}/{len(qa_checked)} outlets "
                            f"failed ({rejection_rate:.0%}). Human has chosen to proceed."
                        )
                        logger.warning(f"Run {run_id} Gate C high rejection: {warning}")
                        await self.update_run_status(
                            run_id, run.get("status", "GATE_C"),
                            stage_results={"gate_c_rejection_warning": warning},
                        )
            except Exception as e:
                logger.error(f"Gate C rejection-rate check failed for run {run_id}: {e}")

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
