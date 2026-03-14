from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from services.supabase_client import SupabaseService
from services.tavily_client import TavilyService
from services.youtube_client import YouTubeService
from services.anthropic_client import AnthropicService
from utils.outlet_code import generate_outlet_code
from utils.cost_tracker import log_cost
from utils.dedup import is_duplicate

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


RESEARCH_SYSTEM_PROMPT = load_prompt("research_system.md")


async def run_research(
    run: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    supabase: SupabaseService,
    tavily: TavilyService,
    youtube: YouTubeService,
    claude: AnthropicService,
) -> dict[str, Any]:
    """Stage 1: Discover media outlets via search and YouTube."""
    run_id = run["id"]
    client_id = client["id"]
    country_code = territory.get("country_code", "us")
    signal_keywords = territory.get("signal_keywords", [])
    seed_outlets = territory.get("seed_outlets", [])
    exclusion_list = client.get("exclusion_list", []) or []

    # Extract a run number from the run record
    run_number = 1
    try:
        existing_runs = supabase.client.table("pr_runs").select("id").eq(
            "client_id", client_id
        ).execute()
        run_number = len(existing_runs.data or [])
    except Exception:
        pass

    discovered_outlets = []
    total_cost = 0.0

    # Build search queries from client profile + territory keywords
    queries = _build_search_queries(client, territory, signal_keywords)

    # --- Tavily searches ---
    all_tavily_results = []
    for query in queries:
        try:
            results = await tavily.search(query, max_results=10)
            all_tavily_results.extend(results)
            await log_cost(
                supabase, run_id, None, "tavily", "search",
                cost_usd=0.01, credits_used=1,
                metadata={"query": query, "results_count": len(results)},
            )
            total_cost += 0.01
        except Exception as e:
            logger.error(f"Tavily search failed for query '{query}': {e}")
            await log_cost(
                supabase, run_id, None, "tavily", "search",
                cost_usd=0.0, success=False, error_message=str(e),
            )

    # --- YouTube searches ---
    yt_results = []
    yt_queries = [
        f"{client.get('industry', '')} {kw} youtube channel"
        for kw in signal_keywords[:3]
    ]
    for query in yt_queries:
        try:
            channels = await youtube.search_channels(query, max_results=5)
            for ch in channels:
                details = await youtube.get_channel_details(ch["channel_id"])
                if details:
                    yt_results.append(details)
            await log_cost(
                supabase, run_id, None, "youtube", "search",
                cost_usd=0.0, credits_used=1,
                metadata={"query": query, "results_count": len(channels)},
            )
        except Exception as e:
            logger.error(f"YouTube search failed for '{query}': {e}")

    # --- Parse Tavily results with Claude ---
    if all_tavily_results:
        try:
            user_prompt = f"""Client: {client.get('name', '')} ({client.get('industry', '')})
Territory: {territory.get('name', '')} ({country_code})
Target markets: {json.dumps(client.get('target_markets', []))}

Search results to parse:
{json.dumps(all_tavily_results, indent=2)}"""

            parsed_outlets, response = await claude.complete_json(
                system_prompt=RESEARCH_SYSTEM_PROMPT,
                user_prompt=user_prompt,
            )
            total_cost += response.cost_usd
            await log_cost(
                supabase, run_id, None, "anthropic", "research_parse",
                cost_usd=response.cost_usd,
                metadata={
                    "prompt_tokens": response.prompt_tokens,
                    "completion_tokens": response.completion_tokens,
                    "outlets_parsed": len(parsed_outlets) if isinstance(parsed_outlets, list) else 0,
                },
            )

            if isinstance(parsed_outlets, list):
                for outlet_data in parsed_outlets:
                    outlet_record = await _process_outlet(
                        outlet_data=outlet_data,
                        source_url=outlet_data.get("url", ""),
                        run_id=run_id,
                        client_id=client_id,
                        country_code=country_code,
                        run_number=run_number,
                        exclusion_list=exclusion_list,
                        supabase=supabase,
                    )
                    if outlet_record:
                        discovered_outlets.append(outlet_record)

        except Exception as e:
            logger.error(f"Claude parsing of Tavily results failed: {e}")

    # --- Process YouTube results ---
    for yt in yt_results:
        outlet_data = {
            "name": yt.get("title", ""),
            "outlet_type": "youtube",
            "url": yt.get("url", ""),
            "description": yt.get("description", "")[:500],
            "audience_size": yt.get("subscriber_count"),
            "topics": [],
            "relevance_score": 50,
            "country": yt.get("country", country_code),
        }
        outlet_record = await _process_outlet(
            outlet_data=outlet_data,
            source_url=yt.get("url", ""),
            run_id=run_id,
            client_id=client_id,
            country_code=country_code,
            run_number=run_number,
            exclusion_list=exclusion_list,
            supabase=supabase,
        )
        if outlet_record:
            discovered_outlets.append(outlet_record)

    # --- Process seed outlets ---
    for seed in seed_outlets:
        outlet_data = {
            "name": seed.get("name", ""),
            "outlet_type": seed.get("type", "other"),
            "url": seed.get("url", ""),
            "description": seed.get("description", ""),
            "audience_size": seed.get("audience_size"),
            "topics": seed.get("topics", []),
            "relevance_score": seed.get("relevance_score", 70),
            "country": seed.get("country", country_code),
        }
        outlet_record = await _process_outlet(
            outlet_data=outlet_data,
            source_url=seed.get("url", ""),
            run_id=run_id,
            client_id=client_id,
            country_code=country_code,
            run_number=run_number,
            exclusion_list=exclusion_list,
            supabase=supabase,
        )
        if outlet_record:
            discovered_outlets.append(outlet_record)

    # Update run with results
    await supabase.update_run(run_id, {
        "outlets_discovered": len(discovered_outlets),
        "stage_results": {
            **(run.get("stage_results") or {}),
            "research": {
                "queries_run": len(queries) + len(yt_queries),
                "tavily_results": len(all_tavily_results),
                "youtube_results": len(yt_results),
                "seed_outlets": len(seed_outlets),
                "outlets_discovered": len(discovered_outlets),
                "total_cost": round(total_cost, 4),
            },
        },
    })

    return {
        "outlets_discovered": len(discovered_outlets),
        "total_cost": total_cost,
    }


_SWEDISH_TERMS: dict[str, str] = {
    "magic": "magi",
    "entertainment": "underhållning",
    "events": "evenemang",
    "mentalism": "mentalism",
    "corporate": "företag",
    "keynote": "talare",
    "speaker": "talare",
    "performance": "föreställning",
    "show": "show",
}


def _translate_to_swedish(text: str) -> str:
    """Translate common industry terms in a query string to Swedish."""
    result = text
    for english, swedish in _SWEDISH_TERMS.items():
        result = result.replace(english, swedish)
    return result


def _build_search_queries(
    client: dict[str, Any],
    territory: dict[str, Any],
    signal_keywords: list[str],
) -> list[str]:
    """Build search queries from client and territory data."""
    queries = []
    industry = client.get("industry", "")
    company = client.get("company", client.get("name", ""))
    country = territory.get("name", "")
    language = territory.get("language", "english")
    is_swedish = language.lower() in ("sv", "swedish", "svenska")

    # Base queries
    if industry:
        queries.append(f"{industry} media outlets {country}")
        queries.append(f"{industry} journalists {country}")
        queries.append(f"{industry} podcasts {country}")
        queries.append(f"{industry} trade publications {country}")

    # Keyword-based queries
    for kw in signal_keywords[:5]:
        queries.append(f"{kw} media coverage {country}")

    # Pitch angle queries
    pitch_angles = client.get("pitch_angles", []) or []
    for angle in pitch_angles[:3]:
        angle_text = angle.get("name", "") if isinstance(angle, dict) else str(angle)
        if angle_text:
            queries.append(f"{angle_text} {industry} press {country}")

    english_queries = queries[:10]  # Cap English queries at 10

    if not is_swedish:
        return english_queries

    # Add parallel Swedish queries for each English query
    swedish_queries = []
    for q in english_queries:
        sv_q = _translate_to_swedish(q)
        if sv_q != q:  # Only add if something actually changed
            swedish_queries.append(sv_q)

    return (english_queries + swedish_queries)[:20]  # Cap combined at 20


async def _process_outlet(
    outlet_data: dict[str, Any],
    source_url: str,
    run_id: str,
    client_id: str,
    country_code: str,
    run_number: int,
    exclusion_list: list[str],
    supabase: SupabaseService,
) -> dict[str, Any] | None:
    """Process a single discovered outlet - check exclusions, dedup, insert."""
    name = outlet_data.get("name", "").strip()
    if not name:
        return None

    url = outlet_data.get("url", source_url) or ""
    outlet_type = outlet_data.get("outlet_type", "other")

    # Check exclusion list
    name_lower = name.lower()
    for excluded in exclusion_list:
        if excluded.lower() in name_lower or name_lower in excluded.lower():
            logger.info(f"Excluded outlet: {name} (matches exclusion: {excluded})")
            return None

    # Check for duplicates
    if await is_duplicate(supabase, client_id, name, url):
        logger.info(f"Duplicate outlet skipped: {name}")
        return None

    # Generate outlet code
    outlet_code = generate_outlet_code(country_code, outlet_type, name, run_number)

    record = {
        "run_id": run_id,
        "client_id": client_id,
        "outlet_code": outlet_code,
        "name": name,
        "outlet_type": outlet_type,
        "url": url,
        "country": outlet_data.get("country", country_code),
        "language": outlet_data.get("language"),
        "description": outlet_data.get("description", ""),
        "audience_size": outlet_data.get("audience_size"),
        "topics": outlet_data.get("topics", []),
        "relevance_score": outlet_data.get("relevance_score", 50),
        "research_data": {
            "source": "tavily" if "tavily" not in outlet_type else "youtube",
            "raw_data": outlet_data,
        },
        "pipeline_stage": "DISCOVERED",
    }

    try:
        inserted = await supabase.insert_outlet(record)
        return inserted
    except Exception as e:
        logger.error(f"Failed to insert outlet {name}: {e}")
        return None
