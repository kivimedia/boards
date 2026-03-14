from __future__ import annotations
import logging
from typing import Any, Optional
from supabase import create_client, Client
from config import get_settings

logger = logging.getLogger(__name__)


class SupabaseService:
    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

    # --- PR Runs ---

    async def get_run(self, run_id: str) -> Optional[dict[str, Any]]:
        result = self.client.table("pr_runs").select("*").eq("id", run_id).execute()
        return result.data[0] if result.data else None

    async def update_run(self, run_id: str, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("pr_runs").update(data).eq("id", run_id).execute()
        return result.data[0] if result.data else {}

    async def get_pending_runs(self) -> list[dict[str, Any]]:
        result = (
            self.client.table("pr_runs")
            .select("*")
            .eq("status", "PENDING")
            .order("created_at")
            .execute()
        )
        return result.data or []

    async def increment_run_cost(self, run_id: str, cost_usd: float) -> None:
        run = await self.get_run(run_id)
        if run:
            current = run.get("total_cost_usd", 0) or 0
            await self.update_run(run_id, {"total_cost_usd": current + cost_usd})

    # --- PR Clients ---

    async def get_client(self, client_id: str) -> Optional[dict[str, Any]]:
        result = self.client.table("pr_clients").select("*").eq("id", client_id).execute()
        return result.data[0] if result.data else None

    # --- PR Territories ---

    async def get_territory(self, territory_id: str) -> Optional[dict[str, Any]]:
        result = self.client.table("pr_territories").select("*").eq("id", territory_id).execute()
        return result.data[0] if result.data else None

    # --- PR Outlets ---

    async def get_outlets(
        self, run_id: str, pipeline_stage: Optional[str] = None
    ) -> list[dict[str, Any]]:
        query = self.client.table("pr_outlets").select("*").eq("run_id", run_id)
        if pipeline_stage:
            query = query.eq("pipeline_stage", pipeline_stage)
        result = query.execute()
        return result.data or []

    async def get_outlets_by_client(
        self, client_id: str, pipeline_stage: Optional[str] = None
    ) -> list[dict[str, Any]]:
        query = self.client.table("pr_outlets").select("*").eq("client_id", client_id)
        if pipeline_stage:
            query = query.eq("pipeline_stage", pipeline_stage)
        result = query.execute()
        return result.data or []

    async def insert_outlet(self, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("pr_outlets").insert(data).execute()
        return result.data[0] if result.data else {}

    async def update_outlet(self, outlet_id: str, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("pr_outlets").update(data).eq("id", outlet_id).execute()
        return result.data[0] if result.data else {}

    # --- PR Email Drafts ---

    async def insert_email_draft(self, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("pr_email_drafts").insert(data).execute()
        return result.data[0] if result.data else {}

    # --- PR Cost Events ---

    async def log_cost(self, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("pr_cost_events").insert(data).execute()
        return result.data[0] if result.data else {}

    # --- VPS Jobs ---

    async def get_vps_job(self, run_id: str) -> Optional[dict[str, Any]]:
        result = (
            self.client.table("vps_jobs")
            .select("*")
            .eq("type", "pr_pipeline")
            .contains("payload", {"run_id": run_id})
            .execute()
        )
        return result.data[0] if result.data else None

    async def update_vps_job(self, job_id: str, data: dict[str, Any]) -> dict[str, Any]:
        result = self.client.table("vps_jobs").update(data).eq("id", job_id).execute()
        return result.data[0] if result.data else {}
