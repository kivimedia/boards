from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from services.supabase_client import SupabaseService
from services.hunter_client import HunterService
from services.anthropic_client import AnthropicService
from utils.cost_tracker import log_cost
from config import get_settings

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8")


VERIFICATION_SYSTEM_PROMPT = load_prompt("verification_system.md")


async def run_verification(
    run: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    supabase: SupabaseService,
    hunter: HunterService,
    claude: AnthropicService,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Stage 2: Verify discovered outlets with 5-criteria check + contact finding."""
    run_id = run["id"]
    settings = get_settings()
    threshold = settings.verification_threshold

    outlets = await supabase.get_outlets(run_id, pipeline_stage="DISCOVERED")
    logger.info(f"Verification: {len(outlets)} outlets to verify for run {run_id}")

    verified_count = 0
    failed_count = 0
    total_cost = 0.0

    if dry_run:
        # DRY RUN: skip Hunter.io and Claude calls, set mock verification data
        logger.info(f"DRY RUN: Setting mock verification for {len(outlets)} outlets")
        for outlet in outlets:
            await supabase.update_outlet(outlet["id"], {
                "verification_status": "VERIFIED",
                "verification_score": 80,
                "contact_email": "dryrun@example.com",
                "contact_name": "Dry Run Contact",
                "contact_role": "editor",
                "contact_confidence": 0.9,
                "contact_source": "dry_run",
                "pipeline_stage": "VERIFIED",
                "verification_criteria": {"dry_run": True, "total_score": 80},
            })
            verified_count += 1

        await supabase.update_run(run_id, {
            "outlets_verified": verified_count,
            "stage_results": {
                **(run.get("stage_results") or {}),
                "verification": {
                    "dry_run": True,
                    "total_checked": len(outlets),
                    "verified": verified_count,
                    "failed": 0,
                    "total_cost": 0.0,
                },
            },
        })
        return {"outlets_verified": verified_count, "outlets_failed": 0, "total_cost": 0.0}

    for outlet in outlets:
        try:
            result = await _verify_single_outlet(
                outlet=outlet,
                client=client,
                territory=territory,
                threshold=threshold,
                supabase=supabase,
                hunter=hunter,
                claude=claude,
                run_id=run_id,
            )
            total_cost += result.get("cost", 0)
            if result.get("verified"):
                verified_count += 1
            else:
                failed_count += 1
        except Exception as e:
            logger.error(f"Verification failed for outlet {outlet.get('name', 'unknown')}: {e}")
            await supabase.update_outlet(outlet["id"], {
                "verification_status": "FAILED",
                "verification_criteria": {"error": str(e)},
            })
            failed_count += 1

    # Update run
    await supabase.update_run(run_id, {
        "outlets_verified": verified_count,
        "stage_results": {
            **(run.get("stage_results") or {}),
            "verification": {
                "total_checked": len(outlets),
                "verified": verified_count,
                "failed": failed_count,
                "total_cost": round(total_cost, 4),
            },
        },
    })

    return {
        "outlets_verified": verified_count,
        "outlets_failed": failed_count,
        "total_cost": total_cost,
    }


async def _verify_single_outlet(
    outlet: dict[str, Any],
    client: dict[str, Any],
    territory: dict[str, Any],
    threshold: int,
    supabase: SupabaseService,
    hunter: HunterService,
    claude: AnthropicService,
    run_id: str,
) -> dict[str, Any]:
    """Verify a single outlet: criteria check + contact finding."""
    outlet_id = outlet["id"]
    cost = 0.0

    # --- 5-criteria check with Claude ---
    user_prompt = f"""Outlet to verify:
- Name: {outlet.get('name', '')}
- Type: {outlet.get('outlet_type', '')}
- URL: {outlet.get('url', '')}
- Description: {outlet.get('description', '')}
- Topics: {json.dumps(outlet.get('topics', []))}
- Country: {outlet.get('country', '')}
- Audience size: {outlet.get('audience_size', 'unknown')}

Client info:
- Name: {client.get('name', '')}
- Industry: {client.get('industry', '')}
- Pitch angles: {json.dumps(client.get('pitch_angles', []))}

Territory: {territory.get('name', '')} ({territory.get('country_code', '')})"""

    criteria, response = await claude.complete_json(
        system_prompt=VERIFICATION_SYSTEM_PROMPT,
        user_prompt=user_prompt,
    )
    cost += response.cost_usd
    await log_cost(
        supabase, run_id, outlet_id, "anthropic", "verification_check",
        cost_usd=response.cost_usd,
        metadata={
            "prompt_tokens": response.prompt_tokens,
            "completion_tokens": response.completion_tokens,
        },
    )

    verification_score = criteria.get("total_score", 0)
    suggested_roles = criteria.get("suggested_roles", ["editor"])

    # --- Find contact using Hunter.io ---
    contact_name = None
    contact_email = None
    contact_role = None
    contact_confidence = 0.0
    contact_source = None

    outlet_url = outlet.get("url", "")
    if outlet_url:
        domain = _extract_domain(outlet_url)
        if domain:
            # First try domain search
            try:
                domain_results = await hunter.domain_search(domain)
                await log_cost(
                    supabase, run_id, outlet_id, "hunter", "domain_search",
                    cost_usd=0.01, credits_used=1,
                    metadata={"domain": domain, "emails_found": len(domain_results.get("emails", []))},
                )
                cost += 0.01

                # Find best matching contact by role
                best_match = _find_best_contact(domain_results.get("emails", []), suggested_roles)
                if best_match:
                    contact_email = best_match["email"]
                    contact_name = f"{best_match.get('first_name', '')} {best_match.get('last_name', '')}".strip()
                    contact_role = best_match.get("position", "")
                    contact_confidence = best_match.get("confidence", 0) / 100.0
                    contact_source = "hunter"

                    # Verify the email
                    if contact_email:
                        verification = await hunter.email_verifier(contact_email)
                        await log_cost(
                            supabase, run_id, outlet_id, "hunter", "email_verify",
                            cost_usd=0.01, credits_used=1,
                            metadata={"email": contact_email, "status": verification.get("status", "")},
                        )
                        cost += 0.01

                        if verification.get("result") == "undeliverable":
                            contact_email = None
                            contact_confidence = 0.0
            except Exception as e:
                logger.error(f"Hunter search failed for {domain}: {e}")

            # If domain_search didn't find a good contact, try email_finder with suggested roles
            if (not contact_email or contact_confidence < 0.5) and domain:
                for role in suggested_roles[:2]:
                    try:
                        finder_result = await hunter.email_finder(domain=domain, role=role)
                        await log_cost(
                            supabase, run_id, outlet_id, "hunter", "email_finder",
                            cost_usd=0.01, credits_used=1,
                            metadata={"domain": domain, "role": role},
                        )
                        cost += 0.01
                        if finder_result.get("email") and finder_result.get("confidence", 0) > 50:
                            contact_email = finder_result["email"]
                            contact_name = f"{finder_result.get('first_name', '')} {finder_result.get('last_name', '')}".strip()
                            contact_role = finder_result.get("position", role)
                            contact_confidence = finder_result["confidence"] / 100.0
                            contact_source = "hunter"
                            # Verify the found email
                            email_verification = await hunter.email_verifier(contact_email)
                            await log_cost(
                                supabase, run_id, outlet_id, "hunter", "email_verify",
                                cost_usd=0.01, credits_used=1,
                                metadata={"email": contact_email, "status": email_verification.get("status", "")},
                            )
                            cost += 0.01
                            if email_verification.get("result") == "undeliverable":
                                contact_email = None
                                contact_confidence = 0.0
                            else:
                                break  # Found a good one
                    except Exception as e:
                        logger.error(f"Hunter email_finder failed for {domain}/{role}: {e}")

    # Determine verification status
    contact_found = contact_email is not None and contact_confidence > 0.3
    verified = verification_score >= threshold and contact_found

    update_data = {
        "verification_status": "VERIFIED" if verified else "FAILED",
        "verification_criteria": criteria,
        "verification_score": verification_score,
        "contact_name": contact_name,
        "contact_email": contact_email,
        "contact_role": contact_role,
        "contact_confidence": contact_confidence,
        "contact_source": contact_source,
    }
    if verified:
        update_data["pipeline_stage"] = "VERIFIED"

    await supabase.update_outlet(outlet_id, update_data)

    return {"verified": verified, "cost": cost}


def _extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        if not url.startswith("http"):
            url = "https://" + url
        parsed = urlparse(url)
        domain = parsed.netloc
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def _find_best_contact(
    emails: list[dict[str, Any]], preferred_roles: list[str]
) -> dict[str, Any] | None:
    """Find the best contact from Hunter results based on preferred roles."""
    if not emails:
        return None

    # Score each email by role match and confidence
    scored = []
    for email_data in emails:
        position = (email_data.get("position") or "").lower()
        department = (email_data.get("department") or "").lower()
        confidence = email_data.get("confidence", 0)

        role_score = 0
        for i, role in enumerate(preferred_roles):
            role_lower = role.lower()
            if role_lower in position or role_lower in department:
                role_score = 100 - (i * 10)  # Earlier roles score higher
                break

        total_score = role_score + confidence
        scored.append((total_score, email_data))

    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1] if scored else emails[0]
