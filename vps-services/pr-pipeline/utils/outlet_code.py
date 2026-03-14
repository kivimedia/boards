from __future__ import annotations
import re
import unicodedata
from models import OutletCode, OutletType

# Map full outlet type to abbreviation
TYPE_ABBREV_MAP = {
    "tv": "tv",
    "television": "tv",
    "magazine": "mag",
    "podcast": "pod",
    "youtube": "yt",
    "blog": "blog",
    "trade": "trade",
    "trade publication": "trade",
    "news": "news",
    "newspaper": "news",
    "radio": "radio",
    "wire": "wire",
    "wire service": "wire",
    "online": "online",
    "online publication": "online",
    "other": "other",
}


def slugify(name: str, max_length: int = 30) -> str:
    """Convert name to lowercase, hyphenated, ASCII-safe slug."""
    # Normalize unicode to ASCII
    normalized = unicodedata.normalize("NFKD", name)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    # Lowercase
    lower = ascii_text.lower()
    # Replace non-alphanumeric with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", lower)
    # Strip leading/trailing hyphens
    slug = slug.strip("-")
    # Collapse multiple hyphens
    slug = re.sub(r"-+", "-", slug)
    # Truncate
    if len(slug) > max_length:
        slug = slug[:max_length].rstrip("-")
    return slug


def get_type_abbrev(outlet_type: str) -> str:
    """Get the abbreviation for an outlet type."""
    normalized = outlet_type.lower().strip()
    return TYPE_ABBREV_MAP.get(normalized, "other")


def generate_outlet_code(
    country_code: str, outlet_type: str, name: str, run_number: int = 0
) -> str:
    """Generate outlet code. Format: {country}-{type}-{slug}. Run number is ignored for cross-run consistency."""
    country = country_code.lower()[:2]
    type_abbrev = get_type_abbrev(outlet_type)
    slug = slugify(name)
    return f"{country}-{type_abbrev}-{slug}"


def parse_outlet_code(code: str) -> dict[str, str | int]:
    """Parse an outlet code into its components."""
    parsed = OutletCode.parse(code)
    return {
        "country": parsed.country,
        "type": parsed.type_abbrev,
        "slug": parsed.slug,
        "run_number": parsed.run_number,
    }
