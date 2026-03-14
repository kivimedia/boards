"""Tests for pipeline/qa_loop.py - QA scoring thresholds, re-evaluation retry, dry_run mode."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ClaudeResponse
from pipeline.qa_loop import run_qa_loop, _qa_single_outlet, promote_reviewed_outlets


@pytest.mark.asyncio
class TestRunQaLoopDryRun:
    async def test_dry_run_passes_all_outlets(
        self, mock_supabase, mock_claude,
        sample_run, sample_client, sample_territory, sample_outlet,
    ):
        mock_supabase.get_outlets = AsyncMock(return_value=[sample_outlet])

        with patch("pipeline.qa_loop.get_settings") as mock_settings:
            mock_settings.return_value.qa_pass_threshold = 70
            mock_settings.return_value.qa_review_threshold = 40
            result = await run_qa_loop(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                claude=mock_claude,
                dry_run=True,
            )

        assert result["outlets_passed"] == 1
        assert result["outlets_needs_review"] == 0
        assert result["outlets_failed"] == 0
        assert result["total_cost"] == 0.0
        mock_claude.complete_json.assert_not_awaited()

    async def test_dry_run_updates_stage_to_qa_passed(
        self, mock_supabase, mock_claude,
        sample_run, sample_client, sample_territory, sample_outlet,
    ):
        mock_supabase.get_outlets = AsyncMock(return_value=[sample_outlet])

        with patch("pipeline.qa_loop.get_settings") as mock_settings:
            mock_settings.return_value.qa_pass_threshold = 70
            mock_settings.return_value.qa_review_threshold = 40
            await run_qa_loop(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                claude=mock_claude,
                dry_run=True,
            )

        call_args = mock_supabase.update_outlet.call_args
        assert call_args[0][1]["pipeline_stage"] == "QA_PASSED"
        assert call_args[0][1]["qa_status"] == "PASSED"


@pytest.mark.asyncio
class TestQaSingleOutlet:
    async def test_score_above_pass_threshold(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        mock_claude.complete_json = AsyncMock(return_value=(
            {"total_score": 80, "qa_notes": "Good outlet", "recommendation": "PASS"},
            ClaudeResponse(content="{}", prompt_tokens=100, completion_tokens=50, cost_usd=0.001),
        ))
        with patch("pipeline.qa_loop.is_duplicate", new_callable=AsyncMock, return_value=False):
            with patch("pipeline.qa_loop.log_cost", new_callable=AsyncMock):
                result = await _qa_single_outlet(
                    outlet=sample_outlet,
                    client=sample_client,
                    territory=sample_territory,
                    pass_threshold=70,
                    review_threshold=40,
                    supabase=mock_supabase,
                    claude=mock_claude,
                    run_id="run-1",
                )
        assert result["status"] == "PASSED"

    async def test_score_between_thresholds_needs_review(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        mock_claude.complete_json = AsyncMock(return_value=(
            {"total_score": 55, "qa_notes": "Borderline", "recommendation": "REVIEW"},
            ClaudeResponse(content="{}", prompt_tokens=100, completion_tokens=50, cost_usd=0.001),
        ))
        with patch("pipeline.qa_loop.is_duplicate", new_callable=AsyncMock, return_value=False):
            with patch("pipeline.qa_loop.log_cost", new_callable=AsyncMock):
                result = await _qa_single_outlet(
                    outlet=sample_outlet,
                    client=sample_client,
                    territory=sample_territory,
                    pass_threshold=70,
                    review_threshold=40,
                    supabase=mock_supabase,
                    claude=mock_claude,
                    run_id="run-1",
                )
        assert result["status"] == "NEEDS_REVIEW"

    async def test_score_below_review_threshold_fails(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        mock_claude.complete_json = AsyncMock(return_value=(
            {"total_score": 20, "qa_notes": "Poor fit", "recommendation": "FAIL"},
            ClaudeResponse(content="{}", prompt_tokens=100, completion_tokens=50, cost_usd=0.001),
        ))
        with patch("pipeline.qa_loop.is_duplicate", new_callable=AsyncMock, return_value=False):
            with patch("pipeline.qa_loop.log_cost", new_callable=AsyncMock):
                result = await _qa_single_outlet(
                    outlet=sample_outlet,
                    client=sample_client,
                    territory=sample_territory,
                    pass_threshold=70,
                    review_threshold=40,
                    supabase=mock_supabase,
                    claude=mock_claude,
                    run_id="run-1",
                )
        assert result["status"] == "FAILED"

    async def test_duplicate_outlet_fails_immediately(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        with patch("pipeline.qa_loop.is_duplicate", new_callable=AsyncMock, return_value=True):
            result = await _qa_single_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                pass_threshold=70,
                review_threshold=40,
                supabase=mock_supabase,
                claude=mock_claude,
                run_id="run-1",
            )
        assert result["status"] == "FAILED"
        assert result["cost"] == 0
        # Claude should NOT have been called for duplicates
        mock_claude.complete_json.assert_not_awaited()


@pytest.mark.asyncio
class TestPromoteReviewedOutlets:
    async def test_promotes_needs_review_outlets(self, mock_supabase):
        outlets = [
            {"id": "o1", "qa_status": "NEEDS_REVIEW", "qa_notes": "Borderline"},
            {"id": "o2", "qa_status": "PASSED", "qa_notes": "Good"},
        ]
        mock_supabase.get_outlets = AsyncMock(return_value=outlets)
        mock_supabase.get_run = AsyncMock(return_value={"outlets_qa_passed": 3})

        promoted = await promote_reviewed_outlets("run-1", mock_supabase)

        assert promoted == 1
        # Should update o1 but not o2
        update_calls = mock_supabase.update_outlet.call_args_list
        assert len(update_calls) == 1
        assert update_calls[0][0][0] == "o1"
        assert update_calls[0][0][1]["pipeline_stage"] == "QA_PASSED"
