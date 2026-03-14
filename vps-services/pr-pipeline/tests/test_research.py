"""Tests for pipeline/research.py - seed outlet processing, query building, dry_run mode."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.research import _build_search_queries, run_research


class TestBuildSearchQueries:
    def test_includes_industry_queries(self):
        client = {"industry": "technology", "name": "Acme"}
        territory = {"name": "United States", "language": "english"}
        queries = _build_search_queries(client, territory, signal_keywords=[])
        assert any("technology" in q and "media outlets" in q for q in queries)
        assert any("technology" in q and "journalists" in q for q in queries)
        assert any("technology" in q and "podcasts" in q for q in queries)

    def test_includes_signal_keywords(self):
        client = {"industry": "tech", "name": "Acme"}
        territory = {"name": "US", "language": "english"}
        queries = _build_search_queries(client, territory, signal_keywords=["AI", "robotics"])
        assert any("AI" in q for q in queries)
        assert any("robotics" in q for q in queries)

    def test_caps_at_10_english_queries(self):
        client = {"industry": "tech", "name": "Acme"}
        territory = {"name": "US", "language": "english"}
        kws = [f"keyword{i}" for i in range(20)]
        queries = _build_search_queries(client, territory, signal_keywords=kws)
        # English-only should be capped at 10
        assert len(queries) <= 10

    def test_swedish_territory_adds_translated_queries(self):
        client = {"industry": "magic entertainment", "name": "Magician"}
        territory = {"name": "Sweden", "language": "swedish"}
        queries = _build_search_queries(client, territory, signal_keywords=[])
        # Should have Swedish translations alongside English
        swedish_queries = [q for q in queries if "magi" in q or "underhållning" in q]
        assert len(swedish_queries) > 0

    def test_pitch_angles_included(self):
        client = {
            "industry": "tech",
            "name": "Acme",
            "pitch_angles": [{"name": "AI Innovation"}],
        }
        territory = {"name": "US", "language": "english"}
        queries = _build_search_queries(client, territory, signal_keywords=[])
        assert any("AI Innovation" in q for q in queries)

    def test_no_industry_returns_keyword_queries_only(self):
        client = {"industry": "", "name": "Acme"}
        territory = {"name": "US", "language": "english"}
        queries = _build_search_queries(client, territory, signal_keywords=["AI"])
        # No industry base queries, but keyword queries should exist
        assert any("AI" in q for q in queries)
        assert not any("media outlets" in q and " " == q.split("media outlets")[0] for q in queries)


@pytest.mark.asyncio
class TestRunResearchDryRun:
    async def test_dry_run_inserts_mock_outlets(
        self, mock_supabase, mock_tavily, mock_youtube, mock_claude, mock_exa,
        sample_run, sample_client, sample_territory,
    ):
        # Make insert_outlet return records with IDs
        call_count = 0
        async def mock_insert(data):
            nonlocal call_count
            call_count += 1
            return {**data, "id": f"outlet-{call_count}"}
        mock_supabase.insert_outlet = mock_insert

        # Mock dedup to always say "not duplicate"
        with patch("pipeline.research.is_duplicate", new_callable=AsyncMock, return_value=False):
            result = await run_research(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                tavily=mock_tavily,
                youtube=mock_youtube,
                claude=mock_claude,
                exa=mock_exa,
                dry_run=True,
            )

        assert result["outlets_discovered"] == 5  # 5 mock outlets, 0 seeds
        assert result["total_cost"] == 0.0
        # Tavily/YouTube/Claude should NOT have been called
        mock_tavily.search.assert_not_awaited()
        mock_youtube.search_channels.assert_not_awaited()
        mock_claude.complete_json.assert_not_awaited()

    async def test_dry_run_processes_seed_outlets(
        self, mock_supabase, mock_tavily, mock_youtube, mock_claude, mock_exa,
        sample_run, sample_client, sample_territory,
    ):
        sample_territory["seed_outlets"] = [
            {"name": "Seed Blog", "type": "blog", "url": "https://seedblog.com"},
        ]
        call_count = 0
        async def mock_insert(data):
            nonlocal call_count
            call_count += 1
            return {**data, "id": f"outlet-{call_count}"}
        mock_supabase.insert_outlet = mock_insert

        with patch("pipeline.research.is_duplicate", new_callable=AsyncMock, return_value=False):
            result = await run_research(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                tavily=mock_tavily,
                youtube=mock_youtube,
                claude=mock_claude,
                exa=mock_exa,
                dry_run=True,
            )

        # 5 mock + 1 seed
        assert result["outlets_discovered"] == 6

    async def test_exclusion_list_filters_outlets(
        self, mock_supabase, mock_tavily, mock_youtube, mock_claude, mock_exa,
        sample_run, sample_client, sample_territory,
    ):
        """Outlets matching the exclusion list should be skipped."""
        sample_client["exclusion_list"] = ["DryRun-TV-1"]

        call_count = 0
        async def mock_insert(data):
            nonlocal call_count
            call_count += 1
            return {**data, "id": f"outlet-{call_count}"}
        mock_supabase.insert_outlet = mock_insert

        with patch("pipeline.research.is_duplicate", new_callable=AsyncMock, return_value=False):
            result = await run_research(
                run=sample_run,
                client=sample_client,
                territory=sample_territory,
                supabase=mock_supabase,
                tavily=mock_tavily,
                youtube=mock_youtube,
                claude=mock_claude,
                exa=mock_exa,
                dry_run=True,
            )

        # 5 mock minus 1 excluded = 4
        assert result["outlets_discovered"] == 4
