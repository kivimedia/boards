from __future__ import annotations
import logging
from typing import Any, Optional
import requests
from config import get_settings

logger = logging.getLogger(__name__)

HUNTER_BASE_URL = "https://api.hunter.io/v2"


class HunterService:
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.hunter_api_key

    async def domain_search(
        self, domain: str, limit: int = 10
    ) -> dict[str, Any]:
        """Find emails associated with a domain."""
        try:
            resp = requests.get(
                f"{HUNTER_BASE_URL}/domain-search",
                params={
                    "domain": domain,
                    "api_key": self.api_key,
                    "limit": limit,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return {
                "domain": data.get("domain", domain),
                "organization": data.get("organization", ""),
                "emails": [
                    {
                        "email": e.get("value", ""),
                        "type": e.get("type", ""),
                        "confidence": e.get("confidence", 0),
                        "first_name": e.get("first_name", ""),
                        "last_name": e.get("last_name", ""),
                        "position": e.get("position", ""),
                        "department": e.get("department", ""),
                    }
                    for e in data.get("emails", [])
                ],
            }
        except Exception as e:
            logger.error(f"Hunter domain search error for {domain}: {e}")
            return {"domain": domain, "organization": "", "emails": []}

    async def email_finder(
        self,
        domain: str,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        role: Optional[str] = None,
    ) -> dict[str, Any]:
        """Find a specific email at a domain."""
        try:
            params: dict[str, Any] = {
                "domain": domain,
                "api_key": self.api_key,
            }
            if first_name:
                params["first_name"] = first_name
            if last_name:
                params["last_name"] = last_name

            resp = requests.get(
                f"{HUNTER_BASE_URL}/email-finder",
                params=params,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return {
                "email": data.get("email", ""),
                "confidence": data.get("confidence", 0),
                "first_name": data.get("first_name", ""),
                "last_name": data.get("last_name", ""),
                "position": data.get("position", ""),
                "sources": data.get("sources", []),
            }
        except Exception as e:
            logger.error(f"Hunter email finder error for {domain}: {e}")
            return {"email": "", "confidence": 0}

    async def email_verifier(self, email: str) -> dict[str, Any]:
        """Verify an email address."""
        try:
            resp = requests.get(
                f"{HUNTER_BASE_URL}/email-verifier",
                params={
                    "email": email,
                    "api_key": self.api_key,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return {
                "email": data.get("email", email),
                "status": data.get("status", "unknown"),
                "result": data.get("result", "unknown"),
                "score": data.get("score", 0),
                "disposable": data.get("disposable", False),
                "webmail": data.get("webmail", False),
            }
        except Exception as e:
            logger.error(f"Hunter email verifier error for {email}: {e}")
            return {"email": email, "status": "unknown", "result": "unknown", "score": 0}
