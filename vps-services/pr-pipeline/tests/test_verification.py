"""Tests for pipeline/verification.py - scoring, Hunter fallback, dry_run mode."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ClaudeResponse
from pipeline.verification import (
    run_verification,
    _extract_domain,
    _find_best_contact,
    _verify_single_outlet,
)


class TestExtractDomain:
    def test_basic_url(self):
        assert _extract_domain("https://www.techcrunch.com/about") == "techcrunch.com"

    def test_no_scheme(self):
        assert _extract_domain("techcrunch.com") == "techcrunch.com"

    def test_strips_www(self):
        assert _extract_domain("https://www.bbc.co.uk") == "bbc.co.uk"

    def test_invalid_returns_empty(self):
        assert _extract_domain("") == ""


class TestFindBestContact:
    def test_returns_none_for_empty(self):
        assert _find_best_contact([], ["editor"]) is None

    def test_prefers_matching_role(self):
        emails = [
            {"email": "sales@ex.com", "position": "Sales Manager", "confidence": 90},
            {"email": "editor@ex.com", "position": "Editor in Chief", "confidence": 70},
        ]
        result = _find_best_contact(emails, ["editor"])
        assert result["email"] == "editor@ex.com"

    def test_falls_back_to_highest_confidence(self):
        emails = [
            {"email": "a@ex.com", "position": "Random", "confidence": 95},
            {"email": "b@ex.com", "position": "Other", "confidence": 30},
        ]
        result = _find_best_contact(emails, ["editor"])
        assert result["email"] == "a@ex.com"

    def test_role_priority_order_matters(self):
        """Earlier roles in preferred_roles list should score higher."""
        emails = [
            {"email": "a@ex.com", "position": "journalist", "confidence": 50},
            {"email": "b@ex.com", "position": "editor", "confidence": 50},
        ]
        result = _find_best_contact(emails, ["editor", "journalist"])
        assert result["email"] == "b@ex.com"


@pytest.mark.asyncio
class TestRunVerificationDryRun:
    async def test_dry_run_sets_mock_verification(
        self, mock_supabase, mock_hunter, mock_claude,
        sample_run, sample_client, sample_territory, sample_outlet,
    ):
        mock_supabase.get_outlets = AsyncMock(return_value=[sample_outlet])

        with patch("pipeline.verification.get_settings") as mock_settings:
            mock_settings.return_value.verification_threshold = 60
            result = await run_verification(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                hunter=mock_hunter,
                claude=mock_claude,
                dry_run=True,
            )

        assert result["outlets_verified"] == 1
        assert result["outlets_failed"] == 0
        assert result["total_cost"] == 0.0
        # Claude and Hunter should NOT have been called
        mock_claude.complete_json.assert_not_awaited()
        mock_hunter.domain_search.assert_not_awaited()

    async def test_dry_run_updates_outlet_to_verified(
        self, mock_supabase, mock_hunter, mock_claude,
        sample_run, sample_client, sample_territory, sample_outlet,
    ):
        mock_supabase.get_outlets = AsyncMock(return_value=[sample_outlet])

        with patch("pipeline.verification.get_settings") as mock_settings:
            mock_settings.return_value.verification_threshold = 60
            await run_verification(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                hunter=mock_hunter,
                claude=mock_claude,
                dry_run=True,
            )

        # Check that update_outlet was called with VERIFIED status
        mock_supabase.update_outlet.assert_awaited()
        call_args = mock_supabase.update_outlet.call_args
        assert call_args[0][1]["verification_status"] == "VERIFIED"
        assert call_args[0][1]["pipeline_stage"] == "VERIFIED"


@pytest.mark.asyncio
class TestVerifySingleOutlet:
    async def test_score_above_threshold_with_contact_passes(
        self, mock_supabase, mock_hunter, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        """Outlet with score >= threshold AND a valid contact should be VERIFIED."""
        mock_claude.complete_json = AsyncMock(return_value=(
            {"total_score": 75, "suggested_roles": ["editor"]},
            ClaudeResponse(content="{}", prompt_tokens=100, completion_tokens=50, cost_usd=0.001),
        ))
        mock_hunter.domain_search = AsyncMock(return_value={
            "emails": [{"email": "editor@techcrunch.com", "first_name": "John", "last_name": "Doe", "position": "Editor", "confidence": 90}]
        })

        with patch("pipeline.verification.log_cost", new_callable=AsyncMock):
            result = await _verify_single_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                threshold=60,
                supabase=mock_supabase,
                hunter=mock_hunter,
                claude=mock_claude,
                run_id="run-1",
            )

        assert result["verified"] is True

    async def test_score_below_threshold_fails(
        self, mock_supabase, mock_hunter, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        """Outlet with score below threshold should fail verification."""
        mock_claude.complete_json = AsyncMock(return_value=(
            {"total_score": 30, "suggested_roles": ["editor"]},
            ClaudeResponse(content="{}", prompt_tokens=100, completion_tokens=50, cost_usd=0.001),
        ))

        with patch("pipeline.verification.log_cost", new_callable=AsyncMock):
            result = await _verify_single_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                threshold=60,
                supabase=mock_supabase,
                hunter=mock_hunter,
                claude=mock_claude,
                run_id="run-1",
            )

        assert result["verified"] is False

    async def test_no_contact_found_fails(
        self, mock_supabase, mock_hunter, mock_claude,
        sample_client, sample_territory, sample_outlet,
    ):
        """High score but no contact email should fail."""
        mock_claude.complete_json = AsyncMock(return_value=(
            {"total_score": 90, "suggested_roles": ["editor"]},
            ClaudeResponse(content="{}", prompt_tokens=100, completion_tokens=50, cost_usd=0.001),
        ))
        mock_hunter.domain_search = AsyncMock(return_value={"emails": []})
        mock_hunter.email_finder = AsyncMock(return_value={})

        with patch("pipeline.verification.log_cost", new_callable=AsyncMock):
            result = await _verify_single_outlet(
                outlet=sample_outlet,
                client=sample_client,
                territory=sample_territory,
                threshold=60,
                supabase=mock_supabase,
                hunter=mock_hunter,
                claude=mock_claude,
                run_id="run-1",
            )

        assert result["verified"] is False
