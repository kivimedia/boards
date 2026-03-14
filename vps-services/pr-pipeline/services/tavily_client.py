from __future__ import annotations
import logging
from typing import Any, Optional
from tavily import TavilyClient
from config import get_settings

logger = logging.getLogger(__name__)


class TavilyService:
    def __init__(self):
        settings = get_settings()
        self.client = TavilyClient(api_key=settings.tavily_api_key)

    async def search(
        self,
        query: str,
        max_results: int = 10,
        include_domains: Optional[list[str]] = None,
        exclude_domains: Optional[list[str]] = None,
        search_depth: str = "basic",
    ) -> list[dict[str, Any]]:
        """Search using Tavily API and return structured results."""
        try:
            kwargs: dict[str, Any] = {
                "query": query,
                "max_results": max_results,
                "search_depth": search_depth,
            }
            if include_domains:
                kwargs["include_domains"] = include_domains
            if exclude_domains:
                kwargs["exclude_domains"] = exclude_domains

            response = self.client.search(**kwargs)
            results = []
            for item in response.get("results", []):
                results.append(
                    {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "content": item.get("content", ""),
                        "score": item.get("score", 0),
                    }
                )
            return results
        except Exception as e:
            logger.error(f"Tavily search error: {e}")
            return []

    async def research(self, query: str) -> list[dict[str, Any]]:
        """Use Tavily advanced search for deeper results."""
        return await self.search(query, max_results=20, search_depth="advanced")
