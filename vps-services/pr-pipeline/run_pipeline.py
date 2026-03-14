"""
CLI entry point to trigger a PR pipeline run directly (without vps_jobs).

Usage:
    python run_pipeline.py --client-id UUID [--territory-id UUID] [--max-outlets 50] [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import uuid

from config import get_settings
from pipeline.orchestrator import PipelineOrchestrator
from services.supabase_client import SupabaseService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("run_pipeline")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trigger a PR pipeline run directly via CLI"
    )
    parser.add_argument(
        "--client-id",
        required=True,
        help="UUID of the pr_clients row",
    )
    parser.add_argument(
        "--territory-id",
        default=None,
        help="UUID of the pr_territories row. If omitted, uses the client's first territory.",
    )
    parser.add_argument(
        "--max-outlets",
        type=int,
        default=50,
        help="Max outlets to discover (default: 50)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run in dry_run mode - no real API calls, mock outlets inserted",
    )
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    # Validate settings are loaded
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)

    supabase = SupabaseService()

    # Validate client exists
    client = await supabase.get_client(args.client_id)
    if not client:
        logger.error(f"Client not found: {args.client_id}")
        sys.exit(1)
    logger.info(f"Client: {client.get('name', 'unknown')} ({args.client_id})")

    # Resolve territory
    territory_id = args.territory_id
    if not territory_id:
        # Try to find client's first territory via pr_runs or territories table
        result = (
            supabase.client.table("pr_territories")
            .select("id, name")
            .limit(1)
            .execute()
        )
        if result.data:
            territory_id = result.data[0]["id"]
            logger.info(f"Auto-selected territory: {result.data[0].get('name', '')} ({territory_id})")
        else:
            logger.error("No territory_id provided and no territories found in database")
            sys.exit(1)

    territory = await supabase.get_territory(territory_id)
    if not territory:
        logger.error(f"Territory not found: {territory_id}")
        sys.exit(1)
    logger.info(f"Territory: {territory.get('name', 'unknown')} ({territory_id})")

    # Create a pr_runs row directly
    run_id = str(uuid.uuid4())
    run_data = {
        "id": run_id,
        "client_id": args.client_id,
        "territory_id": territory_id,
        "status": "PENDING",
        "current_stage": 0,
        "outlets_discovered": 0,
        "outlets_verified": 0,
        "outlets_qa_passed": 0,
        "emails_generated": 0,
        "total_cost_usd": 0.0,
        "dry_run": args.dry_run,
        "max_outlets": args.max_outlets,
    }

    logger.info(f"Creating run: {run_id} (dry_run={args.dry_run}, max_outlets={args.max_outlets})")
    supabase.client.table("pr_runs").insert(run_data).execute()

    # Run the pipeline
    orchestrator = PipelineOrchestrator()
    logger.info(f"Starting pipeline for run {run_id}...")

    await orchestrator.run_pipeline(run_id)

    # Fetch final state
    final_run = await supabase.get_run(run_id)
    if final_run:
        status = final_run.get("status", "UNKNOWN")
        discovered = final_run.get("outlets_discovered", 0)
        verified = final_run.get("outlets_verified", 0)
        qa_passed = final_run.get("outlets_qa_passed", 0)
        emails = final_run.get("emails_generated", 0)
        cost = final_run.get("total_cost_usd", 0)
        error = final_run.get("error_log")

        print("\n--- Pipeline Result ---")
        print(f"Run ID:      {run_id}")
        print(f"Status:      {status}")
        print(f"Discovered:  {discovered}")
        print(f"Verified:    {verified}")
        print(f"QA Passed:   {qa_passed}")
        print(f"Emails:      {emails}")
        print(f"Cost:        ${cost:.4f}")
        if error:
            print(f"Error:       {error[:200]}")
        print("---")

        if status in ("GATE_A", "GATE_B", "GATE_C"):
            print(f"\nPipeline paused at {status}. Review outlets, then advance via:")
            print(f"  curl -X POST http://localhost:8400/pr/run/{run_id}/advance")
    else:
        logger.error("Could not fetch final run state")


if __name__ == "__main__":
    asyncio.run(main())
