from __future__ import annotations
import logging
from typing import Any, Optional
import requests
from config import get_settings

logger = logging.getLogger(__name__)

EXA_BASE_URL = "https://api.exa.ai"


class ExaService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.exa_api_key

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def search(
        self,
        query: str,
        num_results: int = 10,
        use_autoprompt: bool = True,
    ) -> list[dict[str, Any]]:
        """Search using Exa's neural search API."""
        if not self.available:
            logger.debug("Exa API key not configured, skipping")
            return []
        try:
            resp = requests.post(
                f"{EXA_BASE_URL}/search",
                headers={
                    "x-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "query": query,
                    "numResults": num_results,
                    "useAutoprompt": use_autoprompt,
                    "type": "neural",
                },
                timeout=15,
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            return [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "text": r.get("text", ""),
                    "score": r.get("score", 0),
                }
                for r in results
            ]
        except Exception as e:
            logger.error(f"Exa search error: {e}")
            return []
