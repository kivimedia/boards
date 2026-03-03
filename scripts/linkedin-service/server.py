"""
LinkedIn Browser Automation Service
FastAPI service using Camoufox (anti-detection Firefox) for LinkedIn automation.
Runs on VPS port 8098, managed by PM2.
"""

import asyncio
import json
import logging
import os
import random
import time
from contextlib import asynccontextmanager
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROFILES_DIR = Path(os.getenv("LINKEDIN_PROFILES_DIR", "/home/ziv/linkedin-profiles"))
IDLE_TIMEOUT_S = int(os.getenv("BROWSER_IDLE_TIMEOUT", "1800"))  # 30 min
MAX_DAILY_CONNECTS = int(os.getenv("MAX_DAILY_CONNECTS", "25"))
MAX_DAILY_MESSAGES = int(os.getenv("MAX_DAILY_MESSAGES", "50"))
MIN_ACTION_DELAY_MS = int(os.getenv("MIN_ACTION_DELAY_MS", "45000"))
MAX_ACTION_DELAY_MS = int(os.getenv("MAX_ACTION_DELAY_MS", "120000"))
SESSION_BREAK_EVERY = 5   # pause every N actions
SESSION_BREAK_MIN_S = 180  # 3 min
SESSION_BREAK_MAX_S = 420  # 7 min

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("linkedin-service")

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

browser_ctx = None   # persistent Playwright BrowserContext
browser_page = None  # reusable page
last_action_at = 0.0
daily_counts = {"connect": 0, "message": 0, "date": date.today().isoformat()}
action_counter = 0   # for session breaks
emergency_stopped = False


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    linkedin_url: str
    note_text: str
    session_id: str = "default"

class MessageRequest(BaseModel):
    linkedin_url: str
    message_text: str
    session_id: str = "default"

class BatchMessage(BaseModel):
    lead_id: str
    message_id: str
    linkedin_url: str
    message_text: str
    action_type: str  # connect_with_note or send_message
    pipeline_stage: str

class BatchSendRequest(BaseModel):
    batch_id: str
    messages: list[BatchMessage]
    session_id: str = "default"
    min_delay_ms: int = MIN_ACTION_DELAY_MS
    max_delay_ms: int = MAX_ACTION_DELAY_MS

class SessionInitRequest(BaseModel):
    session_id: str = "default"
    headless: bool = True

class ActionResult(BaseModel):
    success: bool
    action_type: str
    duration_ms: int = 0
    error: Optional[str] = None
    data: dict = {}


# ---------------------------------------------------------------------------
# Human-like behavior helpers
# ---------------------------------------------------------------------------

async def human_delay(min_s: float = 0.5, max_s: float = 2.0):
    """Random delay to simulate human pause."""
    await asyncio.sleep(random.uniform(min_s, max_s))


async def human_type(page, selector: str, text: str):
    """Type text character by character with human-like delays."""
    element = page.locator(selector)
    await element.click()
    await human_delay(0.3, 0.8)
    for char in text:
        await element.type(char, delay=random.randint(50, 120))
        # Occasional longer pause (thinking)
        if random.random() < 0.05:
            await asyncio.sleep(random.uniform(0.3, 1.0))


async def random_scroll(page):
    """Scroll randomly to simulate human browsing."""
    scroll_amount = random.randint(100, 400)
    direction = random.choice([1, -1])
    await page.mouse.wheel(0, scroll_amount * direction)
    await human_delay(0.5, 1.5)


async def page_dwell(min_s: float = 3.0, max_s: float = 8.0):
    """Wait on a page like a human would browse it."""
    await asyncio.sleep(random.uniform(min_s, max_s))


def reset_daily_counts():
    """Reset daily counters if the date changed."""
    global daily_counts
    today = date.today().isoformat()
    if daily_counts["date"] != today:
        daily_counts = {"connect": 0, "message": 0, "date": today}


def check_daily_limit(action_type: str) -> bool:
    """Check if daily limit allows this action."""
    reset_daily_counts()
    if action_type == "connect_with_note":
        return daily_counts["connect"] < MAX_DAILY_CONNECTS
    if action_type == "send_message":
        return daily_counts["message"] < MAX_DAILY_MESSAGES
    return True


def increment_daily_count(action_type: str):
    """Increment daily action counter."""
    reset_daily_counts()
    if action_type == "connect_with_note":
        daily_counts["connect"] += 1
    elif action_type == "send_message":
        daily_counts["message"] += 1


async def maybe_session_break():
    """Take a break every N actions to appear natural."""
    global action_counter
    action_counter += 1
    if action_counter % SESSION_BREAK_EVERY == 0:
        pause = random.randint(SESSION_BREAK_MIN_S, SESSION_BREAK_MAX_S)
        log.info(f"Session break: pausing {pause}s after {action_counter} actions")
        await asyncio.sleep(pause)


# ---------------------------------------------------------------------------
# Browser management
# ---------------------------------------------------------------------------

async def ensure_browser(session_id: str = "default", headless: bool = True):
    """Launch or reuse a persistent Camoufox browser context."""
    global browser_ctx, browser_page, last_action_at

    if browser_ctx is not None:
        last_action_at = time.time()
        return browser_ctx, browser_page

    profile_dir = PROFILES_DIR / session_id
    profile_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"Launching Camoufox with profile: {profile_dir}")

    try:
        from camoufox.sync_api import NewBrowser
        # Use camoufox async API
        from camoufox.async_api import AsyncNewBrowser
    except ImportError:
        # Fallback: use playwright directly with firefox
        log.warning("camoufox not available, falling back to playwright firefox")
        from playwright.async_api import async_playwright
        pw = await async_playwright().start()
        browser_ctx = await pw.firefox.launch_persistent_context(
            str(profile_dir),
            headless=headless,
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            timezone_id="America/New_York",
        )
        browser_page = browser_ctx.pages[0] if browser_ctx.pages else await browser_ctx.new_page()
        last_action_at = time.time()
        return browser_ctx, browser_page

    # Use Camoufox async persistent context
    browser_ctx = await AsyncNewBrowser(
        persistent_context=str(profile_dir),
        headless=headless,
        geoip=True,
        locale="en-US",
        screen={"width": 1366, "height": 768},
    )
    browser_page = browser_ctx.pages[0] if browser_ctx.pages else await browser_ctx.new_page()
    last_action_at = time.time()
    log.info("Browser launched successfully")
    return browser_ctx, browser_page


async def close_browser():
    """Close the browser context."""
    global browser_ctx, browser_page
    if browser_ctx:
        try:
            await browser_ctx.close()
        except Exception:
            pass
        browser_ctx = None
        browser_page = None
        log.info("Browser closed")


async def idle_watcher():
    """Background task to close idle browser."""
    while True:
        await asyncio.sleep(60)
        if browser_ctx and (time.time() - last_action_at) > IDLE_TIMEOUT_S:
            log.info("Browser idle timeout - closing")
            await close_browser()


# ---------------------------------------------------------------------------
# LinkedIn action implementations
# ---------------------------------------------------------------------------

async def do_connect_with_note(page, linkedin_url: str, note_text: str) -> ActionResult:
    """Send a connection request with a note."""
    start = time.time()
    try:
        await page.goto(linkedin_url, wait_until="domcontentloaded", timeout=30000)
        await page_dwell(3.0, 8.0)
        await random_scroll(page)

        # Try main Connect button first
        connect_btn = page.locator('button:has-text("Connect")').first
        more_btn = page.locator('button:has-text("More")').first

        if await connect_btn.is_visible(timeout=3000):
            await connect_btn.click()
        elif await more_btn.is_visible(timeout=3000):
            await more_btn.click()
            await human_delay(0.5, 1.0)
            connect_menu = page.locator('div[role="menu"] span:has-text("Connect")').first
            if await connect_menu.is_visible(timeout=3000):
                await connect_menu.click()
            else:
                return ActionResult(
                    success=False, action_type="connect_with_note",
                    duration_ms=int((time.time() - start) * 1000),
                    error="Connect option not found in More menu"
                )
        else:
            # Try the aside/sidebar connect button
            aside_btn = page.locator('section button:has-text("Connect")').first
            if await aside_btn.is_visible(timeout=3000):
                await aside_btn.click()
            else:
                return ActionResult(
                    success=False, action_type="connect_with_note",
                    duration_ms=int((time.time() - start) * 1000),
                    error="No Connect button found on profile"
                )

        await human_delay(1.0, 2.0)

        # Click "Add a note" if the modal appears
        add_note_btn = page.locator('button:has-text("Add a note")')
        if await add_note_btn.is_visible(timeout=5000):
            await add_note_btn.click()
            await human_delay(0.5, 1.0)

        # Type the note
        note_field = page.locator('textarea[name="message"], textarea#custom-message, textarea[placeholder*="Add a note"]').first
        if await note_field.is_visible(timeout=3000):
            await note_field.click()
            await human_delay(0.3, 0.6)
            for char in note_text:
                await note_field.type(char, delay=random.randint(50, 120))
                if random.random() < 0.05:
                    await asyncio.sleep(random.uniform(0.3, 1.0))
        else:
            # Some profiles go straight to send without note field
            log.warning("No note field found - sending without note")

        await human_delay(0.5, 1.5)

        # Click Send
        send_btn = page.locator('button:has-text("Send")').first
        if await send_btn.is_visible(timeout=3000):
            await send_btn.click()
        else:
            # Try "Send now" variant
            send_now = page.locator('button:has-text("Send now")').first
            if await send_now.is_visible(timeout=3000):
                await send_now.click()
            else:
                return ActionResult(
                    success=False, action_type="connect_with_note",
                    duration_ms=int((time.time() - start) * 1000),
                    error="Send button not found"
                )

        await human_delay(2.0, 4.0)

        # Check for success indicators
        duration = int((time.time() - start) * 1000)
        return ActionResult(
            success=True, action_type="connect_with_note",
            duration_ms=duration,
            data={"linkedin_url": linkedin_url, "note_length": len(note_text)}
        )

    except Exception as e:
        return ActionResult(
            success=False, action_type="connect_with_note",
            duration_ms=int((time.time() - start) * 1000),
            error=str(e)
        )


async def do_send_message(page, linkedin_url: str, message_text: str) -> ActionResult:
    """Send a message to an existing connection."""
    start = time.time()
    try:
        await page.goto(linkedin_url, wait_until="domcontentloaded", timeout=30000)
        await page_dwell(3.0, 5.0)

        # Click Message button
        msg_btn = page.locator('button:has-text("Message")').first
        if not await msg_btn.is_visible(timeout=5000):
            return ActionResult(
                success=False, action_type="send_message",
                duration_ms=int((time.time() - start) * 1000),
                error="Message button not found - may not be connected"
            )

        await msg_btn.click()
        await human_delay(1.5, 3.0)

        # Find the message input in the messaging panel
        msg_input = page.locator('div[role="textbox"][contenteditable="true"]').last
        if not await msg_input.is_visible(timeout=5000):
            # Try alternative selector
            msg_input = page.locator('.msg-form__contenteditable, div[data-placeholder*="Write a message"]').first

        if not await msg_input.is_visible(timeout=5000):
            return ActionResult(
                success=False, action_type="send_message",
                duration_ms=int((time.time() - start) * 1000),
                error="Message input field not found"
            )

        await msg_input.click()
        await human_delay(0.3, 0.8)

        # Type message character by character
        for char in message_text:
            await msg_input.type(char, delay=random.randint(50, 120))
            if random.random() < 0.05:
                await asyncio.sleep(random.uniform(0.3, 1.0))

        await human_delay(0.5, 1.5)

        # Click Send
        send_btn = page.locator('button[type="submit"]:has-text("Send"), button.msg-form__send-button').first
        if await send_btn.is_visible(timeout=3000):
            await send_btn.click()
        else:
            # Fallback: press Enter
            await msg_input.press("Enter")

        await human_delay(2.0, 4.0)

        duration = int((time.time() - start) * 1000)
        return ActionResult(
            success=True, action_type="send_message",
            duration_ms=duration,
            data={"linkedin_url": linkedin_url, "message_length": len(message_text)}
        )

    except Exception as e:
        return ActionResult(
            success=False, action_type="send_message",
            duration_ms=int((time.time() - start) * 1000),
            error=str(e)
        )


async def do_check_inbox(page) -> ActionResult:
    """Check LinkedIn messaging inbox for new messages."""
    start = time.time()
    try:
        await page.goto("https://www.linkedin.com/messaging/", wait_until="domcontentloaded", timeout=30000)
        await page_dwell(3.0, 5.0)

        conversations = []
        items = page.locator('.msg-conversation-listitem, li.msg-conversation-card')
        count = await items.count()

        for i in range(min(count, 20)):  # check top 20
            item = items.nth(i)
            try:
                name_el = item.locator('.msg-conversation-card__participant-names, .msg-conversation-listitem__participant-names').first
                snippet_el = item.locator('.msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet').first
                unread = await item.locator('.notification-badge, .msg-conversation-card__unread-count').count() > 0

                name = await name_el.text_content() if await name_el.is_visible(timeout=1000) else ""
                snippet = await snippet_el.text_content() if await snippet_el.is_visible(timeout=1000) else ""

                conversations.append({
                    "name": (name or "").strip(),
                    "snippet": (snippet or "").strip(),
                    "unread": unread,
                })
            except Exception:
                continue

        duration = int((time.time() - start) * 1000)
        return ActionResult(
            success=True, action_type="check_inbox",
            duration_ms=duration,
            data={"conversations": conversations, "total_checked": len(conversations)}
        )

    except Exception as e:
        return ActionResult(
            success=False, action_type="check_inbox",
            duration_ms=int((time.time() - start) * 1000),
            error=str(e)
        )


async def do_check_pending_connections(page) -> ActionResult:
    """Check pending sent connection requests."""
    start = time.time()
    try:
        await page.goto(
            "https://www.linkedin.com/mynetwork/invitation-manager/sent/",
            wait_until="domcontentloaded", timeout=30000
        )
        await page_dwell(3.0, 5.0)

        pending = []
        items = page.locator('.invitation-card, li.mn-invitation-list__invitation-card')
        count = await items.count()

        for i in range(min(count, 30)):
            item = items.nth(i)
            try:
                name_el = item.locator('.invitation-card__title, .mn-invitation-list__inviter-name').first
                name = await name_el.text_content() if await name_el.is_visible(timeout=1000) else ""

                # Check for profile link
                link_el = item.locator('a[href*="/in/"]').first
                profile_url = ""
                if await link_el.is_visible(timeout=1000):
                    profile_url = await link_el.get_attribute("href") or ""

                pending.append({
                    "name": (name or "").strip(),
                    "linkedin_url": profile_url,
                    "status": "pending",
                })
            except Exception:
                continue

        duration = int((time.time() - start) * 1000)
        return ActionResult(
            success=True, action_type="check_connections",
            duration_ms=duration,
            data={"pending": pending, "total_pending": len(pending)}
        )

    except Exception as e:
        return ActionResult(
            success=False, action_type="check_connections",
            duration_ms=int((time.time() - start) * 1000),
            error=str(e)
        )


async def do_session_health_check(page) -> ActionResult:
    """Check if the browser session is still logged into LinkedIn."""
    start = time.time()
    try:
        await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=30000)
        await human_delay(2.0, 4.0)

        # Check for logged-in indicators
        feed = page.locator('.feed-shared-update-v2, .scaffold-layout__main, .global-nav__me').first
        logged_in = await feed.is_visible(timeout=5000)

        # Check for login page redirect
        url = page.url
        if "/login" in url or "/authwall" in url or "/checkpoint" in url:
            logged_in = False

        duration = int((time.time() - start) * 1000)
        health = "healthy" if logged_in else "logged_out"

        if "checkpoint" in url:
            health = "blocked"

        return ActionResult(
            success=True, action_type="session_health_check",
            duration_ms=duration,
            data={"logged_in": logged_in, "health": health, "url": url}
        )

    except Exception as e:
        return ActionResult(
            success=False, action_type="session_health_check",
            duration_ms=int((time.time() - start) * 1000),
            error=str(e),
            data={"health": "unknown"}
        )


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start idle watcher on startup, close browser on shutdown."""
    task = asyncio.create_task(idle_watcher())
    log.info("LinkedIn automation service started on port 8098")
    yield
    task.cancel()
    await close_browser()
    log.info("LinkedIn automation service stopped")

app = FastAPI(title="LinkedIn Browser Automation", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "browser_active": browser_ctx is not None,
        "daily_counts": daily_counts,
        "action_counter": action_counter,
        "emergency_stopped": emergency_stopped,
    }


@app.get("/status")
async def status():
    return {
        "browser_active": browser_ctx is not None,
        "daily_counts": daily_counts,
        "action_counter": action_counter,
        "last_action_at": datetime.fromtimestamp(last_action_at).isoformat() if last_action_at else None,
        "emergency_stopped": emergency_stopped,
        "idle_timeout_s": IDLE_TIMEOUT_S,
    }


@app.post("/session/init")
async def session_init(req: SessionInitRequest):
    global emergency_stopped
    emergency_stopped = False
    try:
        await ensure_browser(req.session_id, req.headless)
        return {"status": "ok", "session_id": req.session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/session/health")
async def session_health():
    if browser_ctx is None:
        return ActionResult(
            success=True, action_type="session_health_check",
            data={"health": "inactive", "logged_in": False}
        )
    try:
        _, page = await ensure_browser()
        result = await do_session_health_check(page)
        return result
    except Exception as e:
        return ActionResult(
            success=False, action_type="session_health_check",
            error=str(e), data={"health": "unknown"}
        )


@app.post("/session/cookies")
async def session_cookies():
    if browser_ctx is None:
        raise HTTPException(status_code=400, detail="No active browser session")
    cookies = await browser_ctx.cookies()
    return {"cookies": cookies}


@app.post("/action/connect", response_model=ActionResult)
async def action_connect(req: ConnectRequest):
    global last_action_at
    if emergency_stopped:
        raise HTTPException(status_code=503, detail="Emergency stop active")
    if not check_daily_limit("connect_with_note"):
        raise HTTPException(status_code=429, detail=f"Daily connect limit reached ({MAX_DAILY_CONNECTS})")

    _, page = await ensure_browser(req.session_id)
    result = await do_connect_with_note(page, req.linkedin_url, req.note_text)

    if result.success:
        increment_daily_count("connect_with_note")
        await maybe_session_break()

    last_action_at = time.time()
    return result


@app.post("/action/message", response_model=ActionResult)
async def action_message(req: MessageRequest):
    global last_action_at
    if emergency_stopped:
        raise HTTPException(status_code=503, detail="Emergency stop active")
    if not check_daily_limit("send_message"):
        raise HTTPException(status_code=429, detail=f"Daily message limit reached ({MAX_DAILY_MESSAGES})")

    _, page = await ensure_browser(req.session_id)
    result = await do_send_message(page, req.linkedin_url, req.message_text)

    if result.success:
        increment_daily_count("send_message")
        await maybe_session_break()

    last_action_at = time.time()
    return result


@app.post("/action/check-inbox", response_model=ActionResult)
async def action_check_inbox():
    if emergency_stopped:
        raise HTTPException(status_code=503, detail="Emergency stop active")

    _, page = await ensure_browser()
    result = await do_check_inbox(page)
    return result


@app.post("/action/check-pending", response_model=ActionResult)
async def action_check_pending():
    if emergency_stopped:
        raise HTTPException(status_code=503, detail="Emergency stop active")

    _, page = await ensure_browser()
    result = await do_check_pending_connections(page)
    return result


@app.post("/action/view-profile", response_model=ActionResult)
async def action_view_profile(req: ConnectRequest):
    """View a LinkedIn profile (for enrichment/research)."""
    global last_action_at
    if emergency_stopped:
        raise HTTPException(status_code=503, detail="Emergency stop active")

    _, page = await ensure_browser(req.session_id)
    start = time.time()
    try:
        await page.goto(req.linkedin_url, wait_until="domcontentloaded", timeout=30000)
        await page_dwell(3.0, 8.0)
        await random_scroll(page)

        # Extract basic info
        name_el = page.locator('h1').first
        name = await name_el.text_content() if await name_el.is_visible(timeout=3000) else ""
        headline_el = page.locator('.text-body-medium').first
        headline = await headline_el.text_content() if await headline_el.is_visible(timeout=3000) else ""

        last_action_at = time.time()
        return ActionResult(
            success=True, action_type="view_profile",
            duration_ms=int((time.time() - start) * 1000),
            data={"name": (name or "").strip(), "headline": (headline or "").strip()}
        )
    except Exception as e:
        return ActionResult(
            success=False, action_type="view_profile",
            duration_ms=int((time.time() - start) * 1000),
            error=str(e)
        )


@app.post("/batch/send")
async def batch_send(req: BatchSendRequest):
    """Process an approved batch - send messages sequentially with delays."""
    global last_action_at
    if emergency_stopped:
        raise HTTPException(status_code=503, detail="Emergency stop active")

    _, page = await ensure_browser(req.session_id)
    results = []
    sent = 0
    failed = 0

    for i, msg in enumerate(req.messages):
        if emergency_stopped:
            log.warning("Emergency stop - aborting batch")
            for remaining in req.messages[i:]:
                results.append({
                    "lead_id": remaining.lead_id,
                    "message_id": remaining.message_id,
                    "success": False,
                    "error": "Emergency stop",
                    "duration_ms": 0,
                })
                failed += 1
            break

        # Check daily limits
        if not check_daily_limit(msg.action_type):
            results.append({
                "lead_id": msg.lead_id,
                "message_id": msg.message_id,
                "success": False,
                "error": f"Daily limit reached for {msg.action_type}",
                "duration_ms": 0,
            })
            failed += 1
            continue

        # Execute action
        if msg.action_type == "connect_with_note":
            result = await do_connect_with_note(page, msg.linkedin_url, msg.message_text)
        elif msg.action_type == "send_message":
            result = await do_send_message(page, msg.linkedin_url, msg.message_text)
        else:
            results.append({
                "lead_id": msg.lead_id,
                "message_id": msg.message_id,
                "success": False,
                "error": f"Unknown action type: {msg.action_type}",
                "duration_ms": 0,
            })
            failed += 1
            continue

        if result.success:
            increment_daily_count(msg.action_type)
            sent += 1
        else:
            failed += 1

        results.append({
            "lead_id": msg.lead_id,
            "message_id": msg.message_id,
            "success": result.success,
            "error": result.error,
            "duration_ms": result.duration_ms,
            "data": result.data,
        })

        last_action_at = time.time()

        # Session break check
        await maybe_session_break()

        # Random delay before next action (skip for last message)
        if i < len(req.messages) - 1:
            delay_s = random.randint(req.min_delay_ms, req.max_delay_ms) / 1000.0
            log.info(f"Waiting {delay_s:.0f}s before next action ({i+1}/{len(req.messages)})")
            await asyncio.sleep(delay_s)

    return {
        "batch_id": req.batch_id,
        "total": len(req.messages),
        "sent": sent,
        "failed": failed,
        "results": results,
    }


@app.post("/emergency-stop")
async def do_emergency_stop():
    global emergency_stopped
    emergency_stopped = True
    log.warning("EMERGENCY STOP activated")
    await close_browser()
    return {"status": "stopped", "message": "Browser killed, all actions halted"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8098)
