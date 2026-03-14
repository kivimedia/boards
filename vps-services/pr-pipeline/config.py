import os
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")
    youtube_data_api_key: str = Field(default="", alias="YOUTUBE_DATA_API_KEY")
    hunter_api_key: str = Field(default="", alias="HUNTER_API_KEY")
    exa_api_key: str = Field(default="", alias="EXA_API_KEY")

    # Pipeline defaults
    verification_threshold: int = 60
    qa_pass_threshold: int = 70
    qa_review_threshold: int = 40
    email_max_words: int = 300
    poll_interval_seconds: int = 30

    # Claude model config
    claude_model: str = "claude-sonnet-4-20250514"
    claude_max_tokens: int = 4096

    class Config:
        env_file = ".env"
        populate_by_name = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
