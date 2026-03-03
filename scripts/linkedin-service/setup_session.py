"""
First-time LinkedIn session setup.
Launches a visible browser so you can log in manually.
The persistent profile is saved to disk for reuse by the server.

Usage:
  python3 setup_session.py [session_id]

Default session_id is 'default'.
After login, press Enter in the terminal to save and exit.
"""

import asyncio
import os
import sys
from pathlib import Path

PROFILES_DIR = Path(os.getenv("LINKEDIN_PROFILES_DIR", "/home/ziv/linkedin-profiles"))


async def main():
    session_id = sys.argv[1] if len(sys.argv) > 1 else "default"
    profile_dir = PROFILES_DIR / session_id
    profile_dir.mkdir(parents=True, exist_ok=True)

    print(f"Profile directory: {profile_dir}")
    print("Launching browser (visible mode)...")
    print("Please log into LinkedIn manually.")
    print("After logging in, come back here and press Enter to save the session.")
    print()

    try:
        from camoufox.async_api import AsyncNewBrowser
        ctx = await AsyncNewBrowser(
            persistent_context=str(profile_dir),
            headless=False,
            geoip=True,
            locale="en-US",
            screen={"width": 1366, "height": 768},
        )
    except ImportError:
        print("camoufox not available, using playwright firefox")
        from playwright.async_api import async_playwright
        pw = await async_playwright().start()
        ctx = await pw.firefox.launch_persistent_context(
            str(profile_dir),
            headless=False,
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            timezone_id="America/New_York",
        )

    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    await page.goto("https://www.linkedin.com/login")

    # Wait for user to log in
    input("\nPress Enter after you have logged in successfully...")

    # Verify logged in
    await page.goto("https://www.linkedin.com/feed/")
    await asyncio.sleep(3)
    url = page.url
    if "/feed" in url:
        print("Login verified! Session saved.")
    else:
        print(f"Warning: Current URL is {url} - may not be logged in")

    # Export cookies for DB storage
    cookies = await ctx.cookies()
    import json
    cookies_path = profile_dir / "cookies.json"
    with open(cookies_path, "w") as f:
        json.dump(cookies, f, indent=2)
    print(f"Cookies saved to {cookies_path}")

    await ctx.close()
    print("Done! The server can now use this session.")


if __name__ == "__main__":
    asyncio.run(main())
