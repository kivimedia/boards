from __future__ import annotations
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


async def log_cost(
    supabase,
    run_id: str,
    outlet_id: Optional[str],
    service_name: str,
    operation: str,
    cost_usd: float,
    credits_used: float = 0,
    success: bool = True,
    error_message: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """Log a cost event and increment the run's total cost."""
    try:
        await supabase.log_cost(
            {
                "run_id": run_id,
                "outlet_id": outlet_id,
                "service_name": service_name,
                "operation": operation,
                "credits_used": credits_used,
                "cost_usd": cost_usd,
                "success": success,
                "error_message": error_message,
                "metadata": metadata or {},
            }
        )
        if cost_usd > 0:
            await supabase.increment_run_cost(run_id, cost_usd)
    except Exception as e:
        logger.error(f"Failed to log cost for run {run_id}: {e}")
