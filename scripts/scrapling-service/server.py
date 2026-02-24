"""
Scrapling Microservice — FastAPI bridge for the agency-board TypeScript agents.

Exposes 4 endpoints that wrap Scrapling's 3 fetcher tiers + adaptive extraction:
  POST /fetch    → Fetcher (fast HTTP with TLS fingerprint spoofing)
  POST /dynamic  → DynamicFetcher (Playwright/Chromium for JS-rendered pages)
  POST /stealth  → StealthyFetcher (Camoufox for Cloudflare/anti-bot bypass)
  POST /extract  → Adaptive CSS/XPath extraction with element tracking
  GET  /health   → Health check

Usage:
  cd scripts/scrapling-service
  py -3.12 -m venv .venv
  .venv/Scripts/activate  (Windows) or source .venv/bin/activate (Linux/Mac)
  pip install -r requirements.txt
  scrapling install
  uvicorn server:app --port 8099

The TypeScript agents call this service at http://localhost:8099.
"""

import asyncio
import time
import traceback
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Scrapling Service",
    description="Stealth web scraping microservice for agency-board agents",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Blocked hosts — same list as browserless.ts for safety parity
# ---------------------------------------------------------------------------
BLOCKED_HOSTS = {
    "localhost", "127.0.0.1", "0.0.0.0", "::1",
    "supabase.co", "supabase.com",
}
BLOCKED_PREFIXES = (
    "169.254.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
    "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
    "192.168.",
)


def _is_blocked(url: str) -> Optional[str]:
    """Return reason string if URL is blocked, else None."""
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
    except Exception:
        return "Invalid URL"
    host = (parsed.hostname or "").lower()
    if host in BLOCKED_HOSTS:
        return f"Blocked host: {host}"
    for prefix in BLOCKED_PREFIXES:
        if host.startswith(prefix):
            return f"Blocked host: {host}"
    if any(host.endswith(f".{b}") for b in BLOCKED_HOSTS):
        return f"Blocked host: {host}"
    return None


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class FetchRequest(BaseModel):
    url: str
    impersonate: str = Field(default="chrome", description="Browser to impersonate TLS for (chrome, firefox, safari, etc.)")
    timeout: int = Field(default=30, description="Timeout in seconds")
    headers: Optional[dict] = None

class DynamicRequest(BaseModel):
    url: str
    wait_selector: Optional[str] = Field(default=None, description="CSS selector to wait for before extracting")
    timeout: int = Field(default=30, description="Timeout in seconds")
    headless: bool = True

class StealthRequest(BaseModel):
    url: str
    timeout: int = Field(default=45, description="Timeout in seconds")
    headless: bool = True
    disable_resources: bool = Field(default=True, description="Disable loading images/fonts/etc for faster loading")

class ExtractRequest(BaseModel):
    url: str
    selectors: list[str] = Field(description="CSS selectors to extract")
    fetcher: str = Field(default="stealth", description="Which fetcher to use: fetch, dynamic, stealth")
    timeout: int = Field(default=30)

class ScrapeResponse(BaseModel):
    success: bool
    url: str
    status: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    error: Optional[str] = None
    fetcher_used: str
    duration_ms: int
    content_length: int = 0

class ExtractResponse(BaseModel):
    success: bool
    url: str
    results: dict[str, list[str]]
    fetcher_used: str
    duration_ms: int
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Lazy-loaded fetchers (heavy imports, only load when first called)
# ---------------------------------------------------------------------------
_fetcher_cls = None
_dynamic_cls = None
_stealthy_cls = None


def _get_fetcher():
    global _fetcher_cls
    if _fetcher_cls is None:
        from scrapling import Fetcher
        _fetcher_cls = Fetcher
    return _fetcher_cls


def _get_dynamic():
    global _dynamic_cls
    if _dynamic_cls is None:
        from scrapling import DynamicFetcher
        _dynamic_cls = DynamicFetcher
    return _dynamic_cls


def _get_stealthy():
    global _stealthy_cls
    if _stealthy_cls is None:
        from scrapling import StealthyFetcher
        _stealthy_cls = StealthyFetcher
    return _stealthy_cls


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
MAX_CONTENT = 50_000  # 50KB cap on returned content


def _extract_page_info(page) -> tuple[str, str, int]:
    """Extract title, text content, and status from a scrapling page response."""
    title = ""
    try:
        title_el = page.css("title")
        if title_el:
            title = title_el[0].text or ""
    except Exception:
        pass

    text = ""
    try:
        text = page.get_all_text(ignore_tags=("script", "style", "nav", "footer", "header"))
    except Exception:
        try:
            text = page.body.text if page.body else ""
        except Exception:
            text = str(page.text) if hasattr(page, "text") else ""

    text = text[:MAX_CONTENT]
    status = getattr(page, "status", None) or 200
    return title, text, status


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "scrapling", "version": "1.0.0"}


@app.post("/fetch", response_model=ScrapeResponse)
async def fetch_endpoint(req: FetchRequest):
    """Fast HTTP fetch with TLS fingerprint impersonation. No browser needed."""
    blocked = _is_blocked(req.url)
    if blocked:
        raise HTTPException(status_code=403, detail=blocked)

    start = time.time()
    try:
        Fetcher = _get_fetcher()
        page = Fetcher.get(
            req.url,
            impersonate=req.impersonate,
            timeout=req.timeout,
            headers=req.headers,
        )
        title, text, status = _extract_page_info(page)
        dur = int((time.time() - start) * 1000)
        return ScrapeResponse(
            success=True, url=req.url, status=status,
            title=title, content=text, fetcher_used="fetch",
            duration_ms=dur, content_length=len(text),
        )
    except Exception as e:
        dur = int((time.time() - start) * 1000)
        return ScrapeResponse(
            success=False, url=req.url, error=str(e),
            fetcher_used="fetch", duration_ms=dur,
        )


@app.post("/dynamic", response_model=ScrapeResponse)
async def dynamic_endpoint(req: DynamicRequest):
    """Full Chromium browser for JS-rendered pages."""
    blocked = _is_blocked(req.url)
    if blocked:
        raise HTTPException(status_code=403, detail=blocked)

    start = time.time()
    try:
        Dynamic = _get_dynamic()
        kwargs = {
            "headless": req.headless,
            "timeout": req.timeout * 1000,
        }
        if req.wait_selector:
            kwargs["wait_selector"] = req.wait_selector

        # Run sync Playwright call in a thread to avoid asyncio conflict
        page = await asyncio.to_thread(Dynamic.fetch, req.url, **kwargs)
        title, text, status = _extract_page_info(page)
        dur = int((time.time() - start) * 1000)
        return ScrapeResponse(
            success=True, url=req.url, status=status,
            title=title, content=text, fetcher_used="dynamic",
            duration_ms=dur, content_length=len(text),
        )
    except Exception as e:
        dur = int((time.time() - start) * 1000)
        return ScrapeResponse(
            success=False, url=req.url, error=str(e),
            fetcher_used="dynamic", duration_ms=dur,
        )


@app.post("/stealth", response_model=ScrapeResponse)
async def stealth_endpoint(req: StealthRequest):
    """Maximum anti-bot evasion via Camoufox (modified Firefox)."""
    blocked = _is_blocked(req.url)
    if blocked:
        raise HTTPException(status_code=403, detail=blocked)

    start = time.time()
    try:
        Stealthy = _get_stealthy()

        def _run_stealthy():
            return Stealthy.fetch(
                req.url,
                headless=req.headless,
                timeout=req.timeout * 1000,
                disable_resources=req.disable_resources,
            )

        # Run sync Playwright/Camoufox call in a thread to avoid asyncio conflict
        page = await asyncio.to_thread(_run_stealthy)
        title, text, status = _extract_page_info(page)
        dur = int((time.time() - start) * 1000)
        return ScrapeResponse(
            success=True, url=req.url, status=status,
            title=title, content=text, fetcher_used="stealth",
            duration_ms=dur, content_length=len(text),
        )
    except Exception as e:
        dur = int((time.time() - start) * 1000)
        return ScrapeResponse(
            success=False, url=req.url, error=str(e),
            fetcher_used="stealth", duration_ms=dur,
        )


@app.post("/extract", response_model=ExtractResponse)
async def extract_endpoint(req: ExtractRequest):
    """Adaptive CSS selector extraction using any fetcher tier."""
    blocked = _is_blocked(req.url)
    if blocked:
        raise HTTPException(status_code=403, detail=blocked)

    start = time.time()
    try:
        if req.fetcher == "fetch":
            cls = _get_fetcher()
            page = cls.get(req.url, impersonate="chrome", timeout=req.timeout)
        elif req.fetcher == "dynamic":
            cls = _get_dynamic()
            page = await asyncio.to_thread(cls.fetch, req.url, headless=True, timeout=req.timeout * 1000)
        else:
            cls = _get_stealthy()
            page = await asyncio.to_thread(cls.fetch, req.url, headless=True, timeout=req.timeout * 1000)

        results: dict[str, list[str]] = {}
        for sel in req.selectors:
            try:
                elements = page.css(sel)
                results[sel] = [
                    (el.text or el.attrib.get("href", "") or el.attrib.get("src", "") or "")
                    for el in elements[:50]
                ]
            except Exception:
                results[sel] = []

        dur = int((time.time() - start) * 1000)
        return ExtractResponse(
            success=True, url=req.url, results=results,
            fetcher_used=req.fetcher, duration_ms=dur,
        )
    except Exception as e:
        dur = int((time.time() - start) * 1000)
        return ExtractResponse(
            success=False, url=req.url, results={},
            fetcher_used=req.fetcher, duration_ms=dur, error=str(e),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8099)
