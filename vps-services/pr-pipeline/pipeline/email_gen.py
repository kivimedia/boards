from __future__ import annotations
import json
import logging
from typing import Any

from services.supabase_client import SupabaseService
from services.anthropic_client import AnthropicService
from utils.cost_tracker import log_cost
from config import get_settings

logger = logging.getLogger(__name__)

EMAIL_SYSTEM_PROMPT = """You are an expert PR pitch email writer. Write a personalized outreach email
for a client to send to a media outlet contact.

Requirements:
- Maximum {max_words} words
- Professional but warm tone
- Clear, compelling subject line
- Personalized opening referencing the outlet's recent work or focus
- Brief client intro (2-3 sentences max)
- Clear pitch angle
- Specific call to action
- Follow the client's tone rules and brand voice

Territory-specific rules: {pitch_norms}

Respond with JSON:
{{
    "subject": "Email subject line",
    "body_html": "<p>HTML formatted email body</p>",
    "body_text": "Plain text email body",
    "pitch_angle_used": "Name of the pitch angle selected",
    "personalization_hooks": ["hook1", "hook2"],
    "language": "en"
}}"""


async def run_email_gen(
    run: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    supabase: SupabaseService,
    claude: AnthropicService,
) -> dict[str, Any]:
    """Stage 4: Generate pitch emails for QA-passed outlets."""
    run_id = run["id"]
    settings = get_settings()

    outlets = await supabase.get_outlets(run_id, pipeline_stage="QA_PASSED")
    logger.info(f"Email Gen: {len(outlets)} outlets to generate emails for run {run_id}")

    generated_count = 0
    failed_count = 0
    total_cost = 0.0

    for outlet in outlets:
        try:
            result = await _generate_email_for_outlet(
                outlet=outlet,
                client=client,
                territory=territory,
                max_words=settings.email_max_words,
                supabase=supabase,
                claude=claude,
                run_id=run_id,
            )
            total_cost += result.get("cost", 0)
            if result.get("success"):
                generated_count += 1
            else:
                failed_count += 1
        except Exception as e:
            logger.error(f"Email gen failed for outlet {outlet.get('name', 'unknown')}: {e}")
            failed_count += 1

    # Update run
    await supabase.update_run(run_id, {
        "emails_generated": generated_count,
        "stage_results": {
            **(run.get("stage_results") or {}),
            "email_gen": {
                "total_outlets": len(outlets),
                "emails_generated": generated_count,
                "failed": failed_count,
                "total_cost": round(total_cost, 4),
            },
        },
    })

    return {
        "emails_generated": generated_count,
        "emails_failed": failed_count,
        "total_cost": total_cost,
    }


async def _generate_email_for_outlet(
    outlet: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    max_words: int,
    supabase: SupabaseService,
    claude: AnthropicService,
    run_id: str,
) -> dict[str, Any]:
    """Generate a pitch email for a single outlet."""
    outlet_id = outlet["id"]
    client_id = client["id"]

    # Select best pitch angle
    pitch_angles = client.get("pitch_angles", []) or []
    best_angle = _select_pitch_angle(pitch_angles, outlet)

    # Build language context
    language = outlet.get("language") or territory.get("language", "english")
    pitch_norms = territory.get("pitch_norms", "Standard professional pitch conventions.")

    system_prompt = EMAIL_SYSTEM_PROMPT.format(
        max_words=max_words,
        pitch_norms=pitch_norms,
    )

    user_prompt = f"""Write a pitch email with these details:

CLIENT:
- Name: {client.get('name', '')}
- Company: {client.get('company', '')}
- Industry: {client.get('industry', '')}
- Bio: {client.get('bio', '')}
- Brand voice: {json.dumps(client.get('brand_voice', {}))}
- Tone rules: {json.dumps(client.get('tone_rules', {}))}
- Selected pitch angle: {json.dumps(best_angle)}

OUTLET:
- Name: {outlet.get('name', '')}
- Type: {outlet.get('outlet_type', '')}
- Description: {outlet.get('description', '')}
- Topics: {json.dumps(outlet.get('topics', []))}
- Research data: {json.dumps(outlet.get('research_data', {}))}

CONTACT:
- Name: {outlet.get('contact_name', '')}
- Role: {outlet.get('contact_role', '')}
- Email: {outlet.get('contact_email', '')}

LANGUAGE: {language}
TERRITORY: {territory.get('name', '')} ({territory.get('country_code', '')})"""

    email_data, response = await claude.complete_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    cost = response.cost_usd

    await log_cost(
        supabase, run_id, outlet_id, "anthropic", "email_generation",
        cost_usd=response.cost_usd,
        metadata={
            "prompt_tokens": response.prompt_tokens,
            "completion_tokens": response.completion_tokens,
            "model": claude.default_model,
        },
    )

    # Insert email draft
    draft = {
        "run_id": run_id,
        "outlet_id": outlet_id,
        "client_id": client_id,
        "subject": email_data.get("subject", ""),
        "body_html": email_data.get("body_html", ""),
        "body_text": email_data.get("body_text", ""),
        "language": email_data.get("language", language),
        "pitch_angle": email_data.get("pitch_angle_used", ""),
        "personalization_hooks": email_data.get("personalization_hooks", []),
        "status": "DRAFT",
        "model_used": claude.default_model,
        "prompt_tokens": response.prompt_tokens,
        "completion_tokens": response.completion_tokens,
        "generation_cost_usd": response.cost_usd,
    }

    try:
        await supabase.insert_email_draft(draft)

        # Update outlet stage
        await supabase.update_outlet(outlet_id, {
            "pipeline_stage": "EMAIL_DRAFTED",
        })

        return {"success": True, "cost": cost}
    except Exception as e:
        logger.error(f"Failed to insert email draft for outlet {outlet.get('name', '')}: {e}")
        return {"success": False, "cost": cost}


def _select_pitch_angle(
    pitch_angles: list[dict[str, Any] | str],
    outlet: dict[str, Any],
) -> dict[str, Any] | str:
    """Select the best pitch angle for the given outlet."""
    if not pitch_angles:
        return {"name": "general", "description": "General company pitch"}

    outlet_type = (outlet.get("outlet_type") or "").lower()
    outlet_topics = [t.lower() for t in (outlet.get("topics") or [])]

    # Score each angle by relevance to outlet
    best_angle = pitch_angles[0]
    best_score = 0

    for angle in pitch_angles:
        score = 0
        if isinstance(angle, dict):
            angle_name = (angle.get("name", "") or "").lower()
            angle_topics = [t.lower() for t in (angle.get("topics", []) or [])]
            angle_types = [t.lower() for t in (angle.get("outlet_types", []) or [])]

            # Check if outlet type matches
            if outlet_type in angle_types:
                score += 50

            # Check topic overlap
            for topic in outlet_topics:
                if any(at in topic or topic in at for at in angle_topics):
                    score += 10

            # Check name relevance
            for topic in outlet_topics:
                if topic in angle_name:
                    score += 5
        else:
            # String angle - basic matching
            angle_lower = str(angle).lower()
            for topic in outlet_topics:
                if topic in angle_lower:
                    score += 10

        if score > best_score:
            best_score = score
            best_angle = angle

    return best_angle
