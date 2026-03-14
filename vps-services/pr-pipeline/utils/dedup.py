from __future__ import annotations
import logging
import re
from typing import Optional
from urllib.parse import urlparse

from utils.outlet_code import generate_outlet_code

logger = logging.getLogger(__name__)


def normalize_domain(url: str) -> str:
    """Extract and normalize domain from URL."""
    if not url:
        return ""
    try:
        if not url.startswith("http"):
            url = "https://" + url
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Remove www prefix
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def normalize_name(name: str) -> str:
    """Normalize outlet name for comparison."""
    if not name:
        return ""
    lower = name.lower().strip()
    # Remove common suffixes
    for suffix in [" magazine", " news", " media", " tv", " radio", " podcast", " online"]:
        if lower.endswith(suffix):
            lower = lower[: -len(suffix)]
    # Remove non-alphanumeric
    cleaned = re.sub(r"[^a-z0-9]", "", lower)
    return cleaned


def names_are_similar(name1: str, name2: str) -> bool:
    """Check if two outlet names are similar using simple fuzzy matching."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if not n1 or not n2:
        return False
    # Exact match after normalization
    if n1 == n2:
        return True
    # One contains the other
    if n1 in n2 or n2 in n1:
        return True
    # Simple character overlap ratio
    if len(n1) < 3 or len(n2) < 3:
        return False
    common = set(n1) & set(n2)
    ratio = len(common) / max(len(set(n1)), len(set(n2)))
    return ratio > 0.8


async def is_duplicate(
    supabase,
    client_id: str,
    outlet_name: str,
    outlet_url: Optional[str] = None,
) -> bool:
    """Check if this outlet already exists for the given client."""
    try:
        existing = await supabase.get_outlets_by_client(client_id)

        url_domain = normalize_domain(outlet_url) if outlet_url else ""

        for existing_outlet in existing:
            # Exact URL domain match
            if url_domain and existing_outlet.get("url"):
                existing_domain = normalize_domain(existing_outlet["url"])
                if existing_domain and url_domain == existing_domain:
                    logger.info(
                        f"Duplicate found by URL: {outlet_url} matches {existing_outlet['url']}"
                    )
                    return True

            # Check by outlet_code (cross-run consistency)
            existing_code_raw = existing_outlet.get("outlet_code", "")
            if existing_code_raw and existing_outlet.get("country") and outlet_name:
                new_code = generate_outlet_code(
                    existing_outlet.get("country", ""),
                    existing_outlet.get("outlet_type", "other"),
                    outlet_name,
                )
                # Strip any legacy -rXXX suffix for comparison
                existing_base = re.sub(r"-r\d+$", "", existing_code_raw)
                if new_code and existing_base and new_code == existing_base:
                    logger.info(
                        f"Duplicate found by outlet_code: '{new_code}' matches '{existing_code_raw}'"
                    )
                    return True

            # Name similarity
            if names_are_similar(outlet_name, existing_outlet.get("name", "")):
                logger.info(
                    f"Duplicate found by name: '{outlet_name}' similar to '{existing_outlet['name']}'"
                )
                return True

        return False
    except Exception as e:
        logger.error(f"Dedup check error: {e}")
        return False
