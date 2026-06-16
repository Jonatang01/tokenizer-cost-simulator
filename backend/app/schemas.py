from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProviderBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    official_pricing_url: str | None = None
    is_active: bool = True


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    official_pricing_url: str | None = None
    is_active: bool | None = None


class ProviderRead(ProviderBase):
    id: int
    last_sync: datetime

    model_config = ConfigDict(from_attributes=True)


class DiscoveryResult(BaseModel):
    new_models_inserted: int


class TokenizeRequest(BaseModel):
    text: str
    model: str = "gpt-4o"


class TokenizeResponse(BaseModel):
    tokens: int
    model: str


class ModelBase(BaseModel):
    provider_id: int
    name: str = Field(min_length=2, max_length=120)
    display_name: str = Field(min_length=2, max_length=160)
    recommended_task: str = "general"
    is_vision: bool = False
    input_price_per_million: float = Field(ge=0)
    output_price_per_million: float = Field(ge=0)
    cached_input_price_per_million: float | None = Field(default=None, ge=0)
    image_token_cost: int = Field(default=0, ge=0)
    is_active: bool = True


class ModelCreate(ModelBase):
    pass


class ModelUpdate(BaseModel):
    provider_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    display_name: str | None = Field(default=None, min_length=2, max_length=160)
    recommended_task: str | None = None
    is_vision: bool | None = None
    input_price_per_million: float | None = Field(default=None, ge=0)
    output_price_per_million: float | None = Field(default=None, ge=0)
    cached_input_price_per_million: float | None = Field(default=None, ge=0)
    image_token_cost: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ModelRead(ModelBase):
    id: int
    provider: ProviderRead

    model_config = ConfigDict(from_attributes=True)


class TokenAssumptionsIn(BaseModel):
    ocr_system_prompt_tokens: int = Field(default=350, ge=0)
    ocr_user_instruction_tokens: int = Field(default=50, ge=0)
    ocr_output_json_tokens: int = Field(default=150, ge=0)
    chat_system_prompt_tokens: int = Field(default=250, ge=0)
    chat_memory_tokens: int = Field(default=150, ge=0)
    chat_user_message_tokens: int = Field(default=30, ge=0)
    chat_output_tokens: int = Field(default=45, ge=0)
    ocr_image_width: int = Field(default=1080, ge=0)
    ocr_image_height: int = Field(default=1920, ge=0)


class CostEstimateRequest(BaseModel):
    monthly_volume: int = Field(default=750, gt=0)
    incidence_rate: float = Field(default=0.15, ge=0, le=1)
    chat_turns: float = Field(default=2, ge=0)
    telecom_cost_per_session: float = Field(default=0, ge=0)
    infrastructure_monthly_cost: float = Field(default=0, ge=0)
    ocr_model_id: int
    chat_model_id: int
    tokens: TokenAssumptionsIn = Field(default_factory=TokenAssumptionsIn)
    safety_margin: float = Field(default=0.0, ge=0)


class TokenBreakdownRead(BaseModel):
    ocr_input_tokens: int
    ocr_output_tokens: int
    chat_input_tokens: int
    chat_output_tokens: int


class CostBreakdownRead(BaseModel):
    ocr_cost: float
    chat_cost: float
    ai_cost: float
    telecom_cost: float
    infrastructure_cost: float
    total_monthly_cost: float
    cost_per_receipt: float
    monthly_chat_sessions: float
    weekly_cost: float


class CostEstimateRead(BaseModel):
    request: CostEstimateRequest
    ocr_model: ModelRead
    chat_model: ModelRead
    tokens: TokenBreakdownRead
    costs: CostBreakdownRead


class ScenarioBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    monthly_volume: int = Field(gt=0)
    incidence_rate: float = Field(ge=0, le=1)
    chat_turns: float = Field(ge=0)
    telecom_cost_per_session: float = Field(ge=0)
    infrastructure_monthly_cost: float = Field(ge=0)
    ocr_model_id: int | None = None
    chat_model_id: int | None = None
    rag_system_prompt_tokens: int = Field(default=0, ge=0)
    rag_chunk_size: int = Field(default=0, ge=0)
    rag_top_k: int = Field(default=0, ge=0)


class ScenarioCreate(ScenarioBase):
    pass


class ScenarioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    monthly_volume: int | None = Field(default=None, gt=0)
    incidence_rate: float | None = Field(default=None, ge=0, le=1)
    chat_turns: float | None = Field(default=None, ge=0)
    telecom_cost_per_session: float | None = Field(default=None, ge=0)
    infrastructure_monthly_cost: float | None = Field(default=None, ge=0)
    ocr_model_id: int | None = None
    chat_model_id: int | None = None
    rag_system_prompt_tokens: int | None = Field(default=None, ge=0)
    rag_chunk_size: int | None = Field(default=None, ge=0)
    rag_top_k: int | None = Field(default=None, ge=0)


class ScenarioRead(ScenarioBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PriceSyncLogRead(BaseModel):
    id: int
    provider_id: int | None
    source: str
    status: str
    message: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PriceChangeLogRead(BaseModel):
    id: int
    model_id: int
    field_name: str
    old_value: float
    new_value: float
    source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReceiptImageRead(BaseModel):
    width: int
    height: int
    format: str


class ReceiptSectionRead(BaseModel):
    id: str
    label: str
    x: int
    y: int
    width: int
    height: int
    confidence: float


class ReceiptTokensRead(BaseModel):
    image_tokens: int
    prompt_tokens: int
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ReceiptCostsRead(BaseModel):
    cost_per_receipt: float
    daily_cost: float
    weekly_cost: float
    monthly_cost: float
    daily_volume: int
    monthly_volume: int


class ImageQualityAnalysisRead(BaseModel):
    contrast: float
    sharpness: float
    rotation_angle: float
    shadow_variance: float
    requires_enhancement: bool
    reasons: list[str]
    suggested_mode: str


class ReceiptAnalysisRead(BaseModel):
    image: ReceiptImageRead
    model_id: int
    model_name: str
    fields: list[str]
    sections: list[ReceiptSectionRead]
    tokens: ReceiptTokensRead
    costs: ReceiptCostsRead
    quality_analysis: ImageQualityAnalysisRead | None = None


class ImageQualityRead(BaseModel):
    contrast: float
    sharpness: float


class ReceiptEnhancementRead(BaseModel):
    image_base64: str
    mime_type: str
    original: ImageQualityRead
    enhanced: ImageQualityRead
    operations: list[str]


class ReceiptExtractionUsageRead(BaseModel):
    prompt_tokens: int
    output_tokens: int
    total_tokens: int


class ReceiptExtractionCostRead(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int | None
    cost_per_receipt: float


class ReceiptExtractionRead(BaseModel):
    provider: str
    model_name: str
    fields: list[str]
    enhanced: bool
    extracted: dict[str, Any] | None
    raw_text: str
    usage: ReceiptExtractionUsageRead
    cost: ReceiptExtractionCostRead


class CustomProviderSchema(BaseModel):
    name: str
    base_url: str
    api_key: str

class ApiKeysSchema(BaseModel):
    google_ai: str | None = None
    groq: str | None = None
    cerebras: str | None = None
    openai: str | None = None
    deepseek: str | None = None
    custom_providers: list[CustomProviderSchema] = []
