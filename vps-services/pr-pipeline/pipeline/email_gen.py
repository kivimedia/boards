from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Any

from services.supabase_client import SupabaseService
from services.anthropic_client import AnthropicService
from utils.cost_tracker import log_cost
from config import get_settings

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


def _build_email_system_prompt(max_words: int, pitch_norms: str, language: str) -> str:
    """Build the email generation system prompt with runtime values and a language-appropriate few-shot example."""
    base_prompt = load_prompt("email_system.md")

    # Inject max_words and pitch_norms as a runtime context block appended to the base prompt
    runtime_context = (
        f"\n\n---\n\n"
        f"**Runtime configuration for this campaign:**\n"
        f"- Maximum word count for email body: {max_words} words\n"
        f"- Territory pitch norms: {pitch_norms}\n"
    )

    # Select the appropriate few-shot example based on outlet language
    is_swedish = language in ("sv", "swedish") or "sv" in language.lower()
    example_file = "examples/swedish_email_example.md" if is_swedish else "examples/english_email_example.md"

    try:
        example_content = load_prompt(example_file)
        few_shot_block = (
            f"\n\n---\n\n"
            f"**Reference example - study this carefully before writing:**\n\n"
            f"{example_content}"
        )
    except Exception as e:
        logger.warning(f"Could not load example prompt {example_file}: {e}")
        few_shot_block = ""

    return base_prompt + runtime_context + few_shot_block


async def run_email_gen(
    run: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    supabase: SupabaseService,
    claude: AnthropicService,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Stage 4: Generate pitch emails for QA-passed outlets."""
    run_id = run["id"]
    settings = get_settings()

    outlets = await supabase.get_outlets(run_id, pipeline_stage="QA_PASSED")
    logger.info(f"Email Gen: {len(outlets)} outlets to generate emails for run {run_id}")

    generated_count = 0
    failed_count = 0
    total_cost = 0.0

    if dry_run:
        # DRY RUN: skip Claude email gen, insert mock drafts
        logger.info(f"DRY RUN: Inserting mock email drafts for {len(outlets)} outlets")
        for outlet in outlets:
            outlet_id = outlet["id"]
            client_id = client["id"]
            outlet_name = outlet.get("name", "Unknown Outlet")
            draft = {
                "run_id": run_id,
                "outlet_id": outlet_id,
                "client_id": client_id,
                "subject": f"[DRY RUN] Test pitch to {outlet_name}",
                "body_html": "<p>This is a dry run test email.</p>",
                "body_text": "This is a dry run test email.",
                "language": outlet.get("language") or territory.get("language", "english"),
                "pitch_angle": "dry_run",
                "personalization_hooks": [],
                "status": "DRAFT",
                "model_used": "dry_run",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "generation_cost_usd": 0.0,
            }
            try:
                await supabase.insert_email_draft(draft)
                await supabase.update_outlet(outlet_id, {"pipeline_stage": "EMAIL_DRAFTED"})
                generated_count += 1
            except Exception as e:
                logger.error(f"DRY RUN: Failed to insert mock draft for {outlet_name}: {e}")
                failed_count += 1

        await supabase.update_run(run_id, {
            "emails_generated": generated_count,
            "stage_results": {
                **(run.get("stage_results") or {}),
                "email_gen": {
                    "dry_run": True,
                    "total_outlets": len(outlets),
                    "emails_generated": generated_count,
                    "failed": failed_count,
                    "total_cost": 0.0,
                },
            },
        })
        return {"emails_generated": generated_count, "emails_failed": failed_count, "total_cost": 0.0}

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

    system_prompt = _build_email_system_prompt(
        max_words=max_words,
        pitch_norms=pitch_norms,
        language=language,
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

    # Word count validation on body_text
    body_text: str = email_data.get("body_text", "")
    word_count = len(body_text.split()) if body_text.strip() else 0
    if word_count > 300:
        logger.warning(
            f"Email for outlet {outlet.get('name', '')} is {word_count} words - regenerating with stricter prompt"
        )
        retry_user_prompt = (
            f"Your previous draft was {word_count} words. "
            f"Rewrite to be under 250 words while keeping the key message.\n\n"
            + user_prompt
        )
        email_data_retry, response_retry = await claude.complete_json(
            system_prompt=system_prompt,
            user_prompt=retry_user_prompt,
        )
        cost += response_retry.cost_usd
        await log_cost(
            supabase, run_id, outlet_id, "anthropic", "email_generation_retry",
            cost_usd=response_retry.cost_usd,
            metadata={
                "prompt_tokens": response_retry.prompt_tokens,
                "completion_tokens": response_retry.completion_tokens,
                "model": claude.default_model,
                "reason": "word_count_exceeded",
                "original_word_count": word_count,
            },
        )
        body_text_retry: str = email_data_retry.get("body_text", "")
        retry_word_count = len(body_text_retry.split()) if body_text_retry.strip() else 0
        if retry_word_count <= 300:
            email_data = email_data_retry
            body_text = body_text_retry
        else:
            # Truncate to 300 words at nearest sentence boundary
            logger.warning(
                f"Retry still {retry_word_count} words for outlet {outlet.get('name', '')} - truncating"
            )
            words = body_text_retry.split()[:300]
            truncated = " ".join(words)
            # Walk back to the nearest sentence boundary
            for punct in (".", "!", "?"):
                last_punct = truncated.rfind(punct)
                if last_punct != -1 and last_punct > len(truncated) // 2:
                    truncated = truncated[: last_punct + 1]
                    break
            email_data = dict(email_data_retry)
            email_data["body_text"] = truncated
            body_text = truncated

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
