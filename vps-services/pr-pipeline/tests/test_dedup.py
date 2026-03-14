"""Tests for utils/dedup.py - URL dedup, name similarity, code-based dedup."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils.dedup import normalize_domain, normalize_name, names_are_similar, is_duplicate


class TestNormalizeDomain:
    def test_strips_www(self):
        assert normalize_domain("https://www.techcrunch.com/article") == "techcrunch.com"

    def test_adds_scheme_if_missing(self):
        assert normalize_domain("techcrunch.com") == "techcrunch.com"

    def test_lowercase(self):
        assert normalize_domain("https://TechCrunch.COM") == "techcrunch.com"

    def test_empty_returns_empty(self):
        assert normalize_domain("") == ""
        assert normalize_domain(None) == ""


class TestNormalizeName:
    def test_basic_normalize(self):
        assert normalize_name("TechCrunch") == "techcrunch"

    def test_strips_suffixes(self):
        assert normalize_name("Vogue Magazine") == "vogue"
        assert normalize_name("BBC News") == "bbc"
        assert normalize_name("CNET TV") == "cnet"

    def test_removes_special_chars(self):
        assert normalize_name("The New York Times") == "thenewyorktimes"

    def test_empty(self):
        assert normalize_name("") == ""


class TestNamesAreSimilar:
    def test_exact_match_after_normalize(self):
        assert names_are_similar("TechCrunch", "techcrunch") is True

    def test_suffix_stripped_match(self):
        assert names_are_similar("Vogue Magazine", "Vogue") is True

    def test_containment_match(self):
        assert names_are_similar("TechCrunch", "TechCrunch Blog") is True

    def test_clearly_different(self):
        assert names_are_similar("TechCrunch", "Vogue") is False

    def test_empty_strings(self):
        assert names_are_similar("", "anything") is False
        assert names_are_similar("something", "") is False

    def test_short_names_no_false_positive(self):
        assert names_are_similar("AB", "CD") is False


@pytest.mark.asyncio
class TestIsDuplicate:
    async def test_url_domain_match(self, mock_supabase):
        mock_supabase.get_outlets_by_client = AsyncMock(return_value=[
            {"name": "TechCrunch", "url": "https://techcrunch.com/about", "outlet_code": "us-blog-techcrunch", "country": "us", "outlet_type": "blog"},
        ])
        result = await is_duplicate(mock_supabase, "client-1", "Different Name", "https://www.techcrunch.com")
        assert result is True

    async def test_name_similarity_match(self, mock_supabase):
        mock_supabase.get_outlets_by_client = AsyncMock(return_value=[
            {"name": "TechCrunch", "url": "https://techcrunch.com", "outlet_code": "us-blog-techcrunch", "country": "us", "outlet_type": "blog"},
        ])
        result = await is_duplicate(mock_supabase, "client-1", "Techcrunch", None)
        assert result is True

    async def test_code_based_match(self, mock_supabase):
        mock_supabase.get_outlets_by_client = AsyncMock(return_value=[
            {"name": "Other Name", "url": "https://other.com", "outlet_code": "us-blog-techcrunch", "country": "us", "outlet_type": "blog"},
        ])
        result = await is_duplicate(mock_supabase, "client-1", "TechCrunch", None)
        assert result is True

    async def test_no_match(self, mock_supabase):
        mock_supabase.get_outlets_by_client = AsyncMock(return_value=[
            {"name": "Vogue", "url": "https://vogue.com", "outlet_code": "us-mag-vogue", "country": "us", "outlet_type": "magazine"},
        ])
        result = await is_duplicate(mock_supabase, "client-1", "TechCrunch", "https://techcrunch.com")
        assert result is False

    async def test_legacy_code_with_run_suffix(self, mock_supabase):
        """Legacy codes with -rN suffix should still match new codes without suffix."""
        mock_supabase.get_outlets_by_client = AsyncMock(return_value=[
            {"name": "Old Name", "url": "https://old.com", "outlet_code": "us-blog-techcrunch-r3", "country": "us", "outlet_type": "blog"},
        ])
        result = await is_duplicate(mock_supabase, "client-1", "TechCrunch", None)
        assert result is True

    async def test_error_returns_false(self, mock_supabase):
        mock_supabase.get_outlets_by_client = AsyncMock(side_effect=Exception("DB error"))
        result = await is_duplicate(mock_supabase, "client-1", "TechCrunch", None)
        assert result is False
