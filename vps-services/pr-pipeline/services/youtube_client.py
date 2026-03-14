from __future__ import annotations
import logging
from typing import Any, Optional
from googleapiclient.discovery import build
from config import get_settings

logger = logging.getLogger(__name__)


class YouTubeService:
    def __init__(self):
        settings = get_settings()
        self.youtube = build(
            "youtube", "v3", developerKey=settings.youtube_data_api_key
        )

    async def search_channels(
        self, query: str, max_results: int = 10
    ) -> list[dict[str, Any]]:
        """Search for YouTube channels matching query."""
        try:
            request = self.youtube.search().list(
                q=query,
                type="channel",
                part="snippet",
                maxResults=max_results,
            )
            response = request.execute()

            channels = []
            for item in response.get("items", []):
                channel_id = item["snippet"]["channelId"]
                channels.append(
                    {
                        "channel_id": channel_id,
                        "title": item["snippet"]["title"],
                        "description": item["snippet"]["description"],
                        "url": f"https://www.youtube.com/channel/{channel_id}",
                    }
                )
            return channels
        except Exception as e:
            logger.error(f"YouTube search error: {e}")
            return []

    async def get_channel_details(
        self, channel_id: str
    ) -> Optional[dict[str, Any]]:
        """Get detailed info about a YouTube channel."""
        try:
            request = self.youtube.channels().list(
                id=channel_id,
                part="snippet,statistics,brandingSettings",
            )
            response = request.execute()

            items = response.get("items", [])
            if not items:
                return None

            ch = items[0]
            stats = ch.get("statistics", {})
            snippet = ch.get("snippet", {})

            return {
                "channel_id": channel_id,
                "title": snippet.get("title", ""),
                "description": snippet.get("description", ""),
                "subscriber_count": int(stats.get("subscriberCount", 0)),
                "video_count": int(stats.get("videoCount", 0)),
                "view_count": int(stats.get("viewCount", 0)),
                "country": snippet.get("country", ""),
                "url": f"https://www.youtube.com/channel/{channel_id}",
            }
        except Exception as e:
            logger.error(f"YouTube channel details error: {e}")
            return None
