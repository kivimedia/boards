from __future__ import annotations
import json
import logging
from typing import Any, Optional
import anthropic
from config import get_settings
from models import ClaudeResponse

logger = logging.getLogger(__name__)

# Pricing per 1M tokens (Sonnet)
SONNET_INPUT_COST_PER_1M = 3.0
SONNET_OUTPUT_COST_PER_1M = 15.0


class AnthropicService:
    def __init__(self):
        settings = get_settings()
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.default_model = settings.claude_model
        self.default_max_tokens = settings.claude_max_tokens

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: float = 0,
    ) -> ClaudeResponse:
        """Send a completion request to Claude and return response with cost info."""
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens

        try:
            message = self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

            prompt_tokens = message.usage.input_tokens
            completion_tokens = message.usage.output_tokens

            cost_usd = (
                (prompt_tokens / 1_000_000) * SONNET_INPUT_COST_PER_1M
                + (completion_tokens / 1_000_000) * SONNET_OUTPUT_COST_PER_1M
            )

            content = ""
            for block in message.content:
                if block.type == "text":
                    content += block.text

            return ClaudeResponse(
                content=content,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_usd=round(cost_usd, 6),
            )
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise

    async def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: float = 0,
    ) -> tuple[Any, ClaudeResponse]:
        """Send a completion and parse the response as JSON. Returns (parsed_json, response)."""
        response = await self.complete(
            system_prompt=system_prompt + "\n\nRespond ONLY with valid JSON, no markdown fences.",
            user_prompt=user_prompt,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        content = response.content.strip()
        # Strip markdown fences if model adds them anyway
        if content.startswith("```"):
            lines = content.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            content = "\n".join(lines)
        parsed = json.loads(content)
        return parsed, response
