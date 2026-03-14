"""Shared fixtures for PR pipeline tests."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure the pipeline root is on sys.path
PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))


# ---------------------------------------------------------------------------
# Patch module-level load_prompt calls BEFORE importing pipeline modules.
# Each pipeline module calls load_prompt() at import time, so we need to
# make sure the prompts directory exists or mock the read.
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_supabase():
    """Mock SupabaseService with all async methods."""
    sb = AsyncMock()
    sb.client = MagicMock()
    sb.client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    sb.get_run = AsyncMock(return_value={"id": "run-1", "stage_results": {}, "outlets_qa_passed": 0})
    sb.update_run = AsyncMock(return_value={})
    sb.get_outlets = AsyncMock(return_value=[])
    sb.get_outlets_by_client = AsyncMock(return_value=[])
    sb.insert_outlet = AsyncMock(side_effect=lambda d: {**d, "id": "outlet-new"})
    sb.update_outlet = AsyncMock(return_value={})
    sb.insert_email_draft = AsyncMock(return_value={})
    sb.log_cost = AsyncMock(return_value={})
    sb.increment_run_cost = AsyncMock(return_value=None)
    return sb


@pytest.fixture
def mock_claude():
    """Mock AnthropicService - complete_json returns (parsed_json, ClaudeResponse)."""
    from models import ClaudeResponse

    claude = AsyncMock()
    claude.default_model = "claude-sonnet-4-20250514"

    default_response = ClaudeResponse(
        content="{}",
        prompt_tokens=100,
        completion_tokens=50,
        cost_usd=0.001,
    )
    claude.complete_json = AsyncMock(return_value=({}, default_response))
    claude.complete = AsyncMock(return_value=default_response)
    return claude


@pytest.fixture
def mock_hunter():
    """Mock HunterService."""
    hunter = AsyncMock()
    hunter.domain_search = AsyncMock(return_value={"emails": []})
    hunter.email_finder = AsyncMock(return_value={})
    hunter.email_verifier = AsyncMock(return_value={"result": "deliverable", "status": "valid"})
    return hunter


@pytest.fixture
def mock_tavily():
    """Mock TavilyService."""
    tavily = AsyncMock()
    tavily.search = AsyncMock(return_value=[])
    return tavily


@pytest.fixture
def mock_youtube():
    """Mock YouTubeService."""
    yt = AsyncMock()
    yt.search_channels = AsyncMock(return_value=[])
    yt.get_channel_details = AsyncMock(return_value=None)
    return yt


@pytest.fixture
def mock_exa():
    """Mock ExaService."""
    exa = AsyncMock()
    exa.available = True
    exa.search = AsyncMock(return_value=[])
    return exa


@pytest.fixture
def sample_run():
    return {
        "id": "run-1",
        "client_id": "client-1",
        "territory_id": "territory-1",
        "status": "RESEARCH",
        "stage_results": {},
        "outlets_discovered": 0,
        "outlets_verified": 0,
        "outlets_qa_passed": 0,
        "emails_generated": 0,
    }


@pytest.fixture
def sample_client():
    return {
        "id": "client-1",
        "name": "Acme Corp",
        "company": "Acme Corporation",
        "industry": "technology",
        "bio": "A leading tech company.",
        "brand_voice": {"tone": "professional"},
        "pitch_angles": [
            {
                "name": "AI Innovation",
                "description": "Cutting-edge AI products",
                "topics": ["ai", "machine learning"],
                "outlet_types": ["blog", "podcast"],
            },
            {
                "name": "Sustainability",
                "description": "Green tech initiatives",
                "topics": ["sustainability", "green"],
                "outlet_types": ["magazine", "news"],
            },
        ],
        "tone_rules": {"formality": "high"},
        "exclusion_list": ["Competitor Weekly"],
        "target_markets": ["US", "UK"],
    }


@pytest.fixture
def sample_territory():
    return {
        "id": "territory-1",
        "name": "United States",
        "country_code": "us",
        "language": "english",
        "signal_keywords": ["artificial intelligence", "machine learning", "deep tech"],
        "seed_outlets": [],
        "pitch_norms": "Standard US pitch conventions.",
        "market_data": {"gdp": "high"},
    }


@pytest.fixture
def sample_outlet():
    return {
        "id": "outlet-1",
        "run_id": "run-1",
        "client_id": "client-1",
        "outlet_code": "us-blog-techcrunch",
        "name": "TechCrunch",
        "outlet_type": "blog",
        "url": "https://techcrunch.com",
        "country": "us",
        "language": "english",
        "description": "A leading technology media property.",
        "audience_size": 5000000,
        "topics": ["technology", "startups", "ai"],
        "relevance_score": 85,
        "verification_score": 75,
        "verification_status": "VERIFIED",
        "verification_criteria": {"total_score": 75},
        "contact_name": "John Editor",
        "contact_email": "john@techcrunch.com",
        "contact_role": "editor",
        "contact_confidence": 0.85,
        "contact_source": "hunter",
        "qa_status": "PASSED",
        "qa_score": 80,
        "pipeline_stage": "QA_PASSED",
        "research_data": {"source": "tavily"},
    }
