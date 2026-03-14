from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Any

from services.supabase_client import SupabaseService
from services.anthropic_client import AnthropicService
from utils.cost_tracker import log_cost
from utils.dedup import is_duplicate
from config import get_settings

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


QA_SYSTEM_PROMPT = load_prompt("qa_system.md")


async def run_qa_loop(
    run: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    supabase: SupabaseService,
    claude: AnthropicService,
) -> dict[str, Any]:
    """Stage 3: Quality-check verified outlets."""
    run_id = run["id"]
    client_id = client["id"]
    settings = get_settings()
    pass_threshold = settings.qa_pass_threshold
    review_threshold = settings.qa_review_threshold

    outlets = await supabase.get_outlets(run_id, pipeline_stage="VERIFIED")
    logger.info(f"QA Loop: {len(outlets)} outlets to QA for run {run_id}")

    passed_count = 0
    review_count = 0
    failed_count = 0
    total_cost = 0.0

    for outlet in outlets:
        try:
            result = await _qa_single_outlet(
                outlet=outlet,
                client=client,
                territory=territory,
                pass_threshold=pass_threshold,
                review_threshold=review_threshold,
                supabase=supabase,
                claude=claude,
                run_id=run_id,
            )
            total_cost += result.get("cost", 0)
            status = result.get("status")
            if status == "PASSED":
                passed_count += 1
            elif status == "NEEDS_REVIEW":
                review_count += 1
            else:
                failed_count += 1
        except Exception as e:
            logger.error(f"QA failed for outlet {outlet.get('name', 'unknown')}: {e}")
            await supabase.update_outlet(outlet["id"], {
                "qa_status": "FAILED",
                "qa_notes": f"QA error: {str(e)}",
                "qa_score": 0,
            })
            failed_count += 1

    # Update run
    await supabase.update_run(run_id, {
        "outlets_qa_passed": passed_count,
        "stage_results": {
            **(run.get("stage_results") or {}),
            "qa_loop": {
                "total_checked": len(outlets),
                "passed": passed_count,
                "needs_review": review_count,
                "failed": failed_count,
                "total_cost": round(total_cost, 4),
            },
        },
    })

    return {
        "outlets_passed": passed_count,
        "outlets_needs_review": review_count,
        "outlets_failed": failed_count,
        "total_cost": total_cost,
    }


async def _qa_single_outlet(
    outlet: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    pass_threshold: int,
    review_threshold: int,
    supabase: SupabaseService,
    claude: AnthropicService,
    run_id: str,
) -> dict[str, Any]:
    """Run QA on a single outlet."""
    outlet_id = outlet["id"]
    client_id = client["id"]

    # Check for global dedup (same client, different run)
    if await is_duplicate(supabase, client_id, outlet.get("name", ""), outlet.get("url")):
        # Already exists for this client from another run - mark as duplicate
        await supabase.update_outlet(outlet_id, {
            "qa_status": "FAILED",
            "qa_notes": "Duplicate: outlet already exists for this client from another run",
            "qa_score": 0,
        })
        return {"status": "FAILED", "cost": 0}

    user_prompt = f"""Outlet to QA:
- Name: {outlet.get('name', '')}
- Type: {outlet.get('outlet_type', '')}
- URL: {outlet.get('url', '')}
- Description: {outlet.get('description', '')}
- Topics: {json.dumps(outlet.get('topics', []))}
- Country: {outlet.get('country', '')}
- Audience size: {outlet.get('audience_size', 'unknown')}
- Relevance score: {outlet.get('relevance_score', 0)}
- Verification score: {outlet.get('verification_score', 0)}
- Contact: {outlet.get('contact_name', 'N/A')} - {outlet.get('contact_role', 'N/A')} ({outlet.get('contact_email', 'N/A')})
- Contact confidence: {outlet.get('contact_confidence', 0)}
- Verification criteria: {json.dumps(outlet.get('verification_criteria', {}))}

Client info:
- Name: {client.get('name', '')}
- Company: {client.get('company', '')}
- Industry: {client.get('industry', '')}
- Bio: {client.get('bio', '')}
- Pitch angles: {json.dumps(client.get('pitch_angles', []))}
- Tone rules: {json.dumps(client.get('tone_rules', {}))}

Territory: {territory.get('name', '')} ({territory.get('country_code', '')})
Pitch norms: {territory.get('pitch_norms', 'N/A')}
Market data: {json.dumps(territory.get('market_data', {}))}"""

    qa_result, response = await claude.complete_json(
        system_prompt=QA_SYSTEM_PROMPT,
        user_prompt=user_prompt,
    )
    cost = response.cost_usd
    await log_cost(
        supabase, run_id, outlet_id, "anthropic", "qa_check",
        cost_usd=response.cost_usd,
        metadata={
            "prompt_tokens": response.prompt_tokens,
            "completion_tokens": response.completion_tokens,
        },
    )

    qa_score = qa_result.get("total_score", 0)
    qa_notes = qa_result.get("qa_notes", "")
    recommendation = qa_result.get("recommendation", "FAIL")

    # Determine status based on score thresholds
    if qa_score >= pass_threshold:
        qa_status = "PASSED"
        pipeline_stage = "QA_PASSED"
    elif qa_score >= review_threshold:
        qa_status = "NEEDS_REVIEW"
        pipeline_stage = "VERIFIED"  # stays at VERIFIED until human advances
    else:
        qa_status = "FAILED"
        pipeline_stage = "VERIFIED"  # stays but marked failed

    update_data = {
        "qa_status": qa_status,
        "qa_notes": qa_notes,
        "qa_score": qa_score,
        "pipeline_stage": pipeline_stage,
    }
    await supabase.update_outlet(outlet_id, update_data)

    return {"status": qa_status, "cost": cost}


async def promote_reviewed_outlets(
    run_id: str,
    supabase: SupabaseService,
) -> int:
    """Promote NEEDS_REVIEW outlets to QA_PASSED after human gate advance."""
    outlets = await supabase.get_outlets(run_id, pipeline_stage="VERIFIED")
    promoted = 0
    for outlet in outlets:
        if outlet.get("qa_status") == "NEEDS_REVIEW":
            await supabase.update_outlet(outlet["id"], {
                "qa_status": "PASSED",
                "pipeline_stage": "QA_PASSED",
                "qa_notes": (outlet.get("qa_notes", "") or "") + " [Promoted by human review]",
            })
            promoted += 1

    if promoted > 0:
        run = await supabase.get_run(run_id)
        current_passed = run.get("outlets_qa_passed", 0) or 0
        await supabase.update_run(run_id, {
            "outlets_qa_passed": current_passed + promoted,
        })

    return promoted
