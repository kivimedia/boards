from __future__ import annotations
import re
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    PENDING = "PENDING"
    RESEARCH = "RESEARCH"
    GATE_A = "GATE_A"
    VERIFICATION = "VERIFICATION"
    GATE_B = "GATE_B"
    QA_LOOP = "QA_LOOP"
    GATE_C = "GATE_C"
    EMAIL_GEN = "EMAIL_GEN"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class PipelineStage(str, Enum):
    DISCOVERED = "DISCOVERED"
    VERIFIED = "VERIFIED"
    QA_PASSED = "QA_PASSED"
    EMAIL_DRAFTED = "EMAIL_DRAFTED"
    EMAIL_APPROVED = "EMAIL_APPROVED"
    SENT = "SENT"
    REPLIED = "REPLIED"
    EXCLUDED = "EXCLUDED"


class VerificationStatus(str, Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    FAILED = "FAILED"


class QAStatus(str, Enum):
    PENDING = "PENDING"
    PASSED = "PASSED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    FAILED = "FAILED"


class EmailDraftStatus(str, Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SENT = "SENT"
    REVISED = "REVISED"


class OutletType(str, Enum):
    TV = "tv"
    MAGAZINE = "mag"
    PODCAST = "pod"
    YOUTUBE = "yt"
    BLOG = "blog"
    TRADE = "trade"
    NEWS = "news"
    RADIO = "radio"
    WIRE = "wire"
    ONLINE = "online"
    OTHER = "other"


class PRClient(BaseModel):
    id: str
    name: str
    company: Optional[str] = None
    industry: Optional[str] = None
    brand_voice: Optional[dict[str, Any]] = None
    pitch_angles: Optional[list[dict[str, Any]]] = None
    tone_rules: Optional[dict[str, Any]] = None
    bio: Optional[str] = None
    exclusion_list: Optional[list[str]] = None
    target_markets: Optional[list[str]] = None


class PRTerritory(BaseModel):
    id: str
    name: str
    country_code: str
    language: Optional[str] = None
    market_data: Optional[dict[str, Any]] = None
    signal_keywords: Optional[list[str]] = None
    seed_outlets: Optional[list[dict[str, Any]]] = None
    seasonal_calendar: Optional[str] = None
    pitch_norms: Optional[str] = None


class PRRun(BaseModel):
    id: str
    status: RunStatus = RunStatus.PENDING
    current_stage: int = 0
    client_id: str
    territory_id: str
    outlets_discovered: int = 0
    outlets_verified: int = 0
    outlets_qa_passed: int = 0
    emails_generated: int = 0
    total_cost_usd: float = 0.0
    error_log: Optional[str] = None
    stage_results: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PROutlet(BaseModel):
    id: Optional[str] = None
    run_id: str
    client_id: str
    outlet_code: str
    name: str
    outlet_type: Optional[str] = None
    url: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    audience_size: Optional[int] = None
    topics: Optional[list[str]] = None
    relevance_score: Optional[int] = None
    research_data: Optional[dict[str, Any]] = None
    verification_status: Optional[str] = None
    verification_criteria: Optional[dict[str, Any]] = None
    verification_score: Optional[int] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_role: Optional[str] = None
    contact_confidence: Optional[float] = None
    contact_source: Optional[str] = None
    qa_status: Optional[str] = None
    qa_notes: Optional[str] = None
    qa_score: Optional[int] = None
    pipeline_stage: str = PipelineStage.DISCOVERED
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PREmailDraft(BaseModel):
    id: Optional[str] = None
    run_id: str
    outlet_id: str
    client_id: str
    subject: str
    body_html: str
    body_text: str
    language: Optional[str] = None
    pitch_angle: Optional[str] = None
    personalization_hooks: Optional[list[str]] = None
    status: str = EmailDraftStatus.DRAFT
    model_used: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    generation_cost_usd: Optional[float] = None
    created_at: Optional[str] = None


class PRCostEvent(BaseModel):
    id: Optional[str] = None
    run_id: str
    outlet_id: Optional[str] = None
    service_name: str
    operation: str
    credits_used: float = 0.0
    cost_usd: float = 0.0
    success: bool = True
    error_message: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None


class OutletCode(BaseModel):
    country: str
    type_abbrev: str
    slug: str
    run_number: int

    @classmethod
    def parse(cls, code: str) -> OutletCode:
        pattern = r"^([a-z]{2})-([a-z]+)-(.+)-r(\d+)$"
        match = re.match(pattern, code)
        if not match:
            raise ValueError(f"Invalid outlet code format: {code}")
        return cls(
            country=match.group(1),
            type_abbrev=match.group(2),
            slug=match.group(3),
            run_number=int(match.group(4)),
        )

    def to_string(self) -> str:
        return f"{self.country}-{self.type_abbrev}-{self.slug}-r{self.run_number}"


class ClaudeResponse(BaseModel):
    content: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
