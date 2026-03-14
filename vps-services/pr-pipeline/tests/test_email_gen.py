"""Tests for pipeline/email_gen.py - pitch angle selection, word count validation, dry_run mode."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ClaudeResponse
from pipeline.email_gen import run_email_gen, _select_pitch_angle, _generate_email_for_outlet


class TestSelectPitchAngle:
    def test_returns_default_when_no_angles(self):
        result = _select_pitch_angle([], {"outlet_type": "blog", "topics": ["tech"]})
        assert isinstance(result, dict)
        assert result["name"] == "general"

    def test_selects_matching_outlet_type(self):
        angles = [
            {"name": "Blog Angle", "topics": [], "outlet_types": ["blog"]},
            {"name": "TV Angle", "topics": [], "outlet_types": ["tv"]},
        ]
        outlet = {"outlet_type": "blog", "topics": []}
        result = _select_pitch_angle(angles, outlet)
        assert result["name"] == "Blog Angle"

    def test_selects_matching_topic(self):
        angles = [
            {"name": "AI Pitch", "topics": ["ai", "ml"], "outlet_types": []},
            {"name": "Sports Pitch", "topics": ["sports"], "outlet_types": []},
        ]
        outlet = {"outlet_type": "blog", "topics": ["ai", "technology"]}
        result = _select_pitch_angle(angles, outlet)
        assert result["name"] == "AI Pitch"

    def test_falls_back_to_first_angle_when_no_match(self):
        angles = [
            {"name": "First", "topics": ["unrelated"], "outlet_types": ["radio"]},
            {"name": "Second", "topics": ["also_unrelated"], "outlet_types": ["wire"]},
        ]
        outlet = {"outlet_type": "blog", "topics": ["tech"]}
        result = _select_pitch_angle(angles, outlet)
        assert result["name"] == "First"

    def test_handles_string_angles(self):
        angles = ["AI and tech pitch", "Sports coverage"]
        outlet = {"outlet_type": "blog", "topics": ["ai"]}
        result = _select_pitch_angle(angles, outlet)
        assert result == "AI and tech pitch"


@pytest.mark.asyncio
class TestRunEmailGenDryRun:
    async def test_dry_run_generates_mock_drafts(
        self, mock_supabase, mock_claude,
        sample_run, sample_client, sample_territory, sample_outlet,
    ):
        mock_supabase.get_outlets = AsyncMock(return_value=[sample_outlet])

        with patch("pipeline.email_gen.get_settings") as mock_settings:
            mock_settings.return_value.email_max_words = 300
            result = await run_email_gen(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                claude=mock_claude,
                dry_run=True,
            )

        assert result["emails_generated"] == 1
        assert result["emails_failed"] == 0
        assert result["total_cost"] == 0.0
        mock_claude.complete_json.assert_not_awaited()
        mock_supabase.insert_email_draft.assert_awaited_once()

    async def test_dry_run_draft_contains_outlet_name(
        self, mock_supabase, mock_claude,
        sample_run, sample_client, sample_territory, sample_outlet,
    ):
        mock_supabase.get_outlets = AsyncMock(return_value=[sample_outlet])

        with patch("pipeline.email_gen.get_settings") as mock_settings:
            mock_settings.return_value.email_max_words = 300
            await run_email_gen(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                claude=mock_claude,
                dry_run=True,
            )

        draft_data = mock_supabase.insert_email_draft.call_args[0][0]
        assert "TechCrunch" in draft_data["subject"]
        assert draft_data["status"] == "DRAFT"


@pytest.mark.asyncio
class TestGenerateEmailForOutlet:
    async def test_successful_generation(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        email_json = {
            "subject": "Pitch: AI Innovation for TechCrunch",
            "body_html": "<p>Hello</p>",
            "body_text": "Hello, this is a pitch email with under three hundred words.",
            "language": "english",
            "pitch_angle_used": "AI Innovation",
            "personalization_hooks": ["recent AI article"],
        }
        mock_claude.complete_json = AsyncMock(return_value=(
            email_json,
            ClaudeResponse(content="{}", prompt_tokens=200, completion_tokens=100, cost_usd=0.002),
        ))

        with patch("pipeline.email_gen.log_cost", new_callable=AsyncMock):
            result = await _generate_email_for_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                max_words=300,
                supabase=mock_supabase,
                claude=mock_claude,
                run_id="run-1",
            )

        assert result["success"] is True
        mock_supabase.insert_email_draft.assert_awaited_once()
        mock_supabase.update_outlet.assert_awaited_once()

    async def test_word_count_over_limit_triggers_retry(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        """When body_text exceeds 300 words, the system should retry with a stricter prompt."""
        long_body = " ".join(["word"] * 350)
        short_body = " ".join(["word"] * 200)

        first_response = (
            {"subject": "Test", "body_html": "", "body_text": long_body},
            ClaudeResponse(content="{}", prompt_tokens=200, completion_tokens=100, cost_usd=0.002),
        )
        second_response = (
            {"subject": "Test", "body_html": "", "body_text": short_body},
            ClaudeResponse(content="{}", prompt_tokens=200, completion_tokens=80, cost_usd=0.001),
        )
        mock_claude.complete_json = AsyncMock(side_effect=[first_response, second_response])

        with patch("pipeline.email_gen.log_cost", new_callable=AsyncMock):
            result = await _generate_email_for_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                max_words=300,
                supabase=mock_supabase,
                claude=mock_claude,
                run_id="run-1",
            )

        assert result["success"] is True
        # Claude should have been called twice (original + retry)
        assert mock_claude.complete_json.await_count == 2

    async def test_word_count_retry_also_over_triggers_truncation(
        self, mock_supabase, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        """When even the retry exceeds 300 words, body should be truncated."""
        long_body = " ".join(["word"] * 350) + ". Final sentence."

        response = (
            {"subject": "Test", "body_html": "", "body_text": long_body},
            ClaudeResponse(content="{}", prompt_tokens=200, completion_tokens=100, cost_usd=0.002),
        )
        # Both calls return over-length
        mock_claude.complete_json = AsyncMock(side_effect=[response, response])

        with patch("pipeline.email_gen.log_cost", new_callable=AsyncMock):
            result = await _generate_email_for_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                max_words=300,
                supabase=mock_supabase,
                claude=mock_claude,
                run_id="run-1",
            )

        assert result["success"] is True
        # Verify the stored draft body was truncated
        draft_data = mock_supabase.insert_email_draft.call_args[0][0]
        word_count = len(draft_data["body_text"].split())
        assert word_count <= 300
