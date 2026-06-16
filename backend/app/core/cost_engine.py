from __future__ import annotations

from dataclasses import dataclass


MILLION = 1_000_000


@dataclass(frozen=True)
class ModelPricing:
    id: int
    provider: str
    name: str
    input_price_per_million: float
    output_price_per_million: float
    image_token_cost: int
    is_vision: bool


@dataclass(frozen=True)
class TokenAssumptions:
    ocr_system_prompt_tokens: int = 350
    ocr_user_instruction_tokens: int = 50
    ocr_output_json_tokens: int = 150
    chat_system_prompt_tokens: int = 250
    chat_memory_tokens: int = 150
    chat_user_message_tokens: int = 30
    chat_output_tokens: int = 45
    ocr_image_width: int = 1080
    ocr_image_height: int = 1920


@dataclass(frozen=True)
class EstimateInputs:
    monthly_volume: int
    incidence_rate: float
    chat_turns: float
    telecom_cost_per_session: float
    infrastructure_monthly_cost: float
    ocr_model: ModelPricing
    chat_model: ModelPricing
    tokens: TokenAssumptions = TokenAssumptions()
    safety_margin: float = 0.0


@dataclass(frozen=True)
class TokenBreakdown:
    ocr_input_tokens: int
    ocr_output_tokens: int
    chat_input_tokens: int
    chat_output_tokens: int


@dataclass(frozen=True)
class CostBreakdown:
    ocr_cost: float
    chat_cost: float
    ai_cost: float
    telecom_cost: float
    infrastructure_cost: float
    total_monthly_cost: float
    cost_per_receipt: float
    monthly_chat_sessions: float
    weekly_cost: float


@dataclass(frozen=True)
class CostEstimate:
    tokens: TokenBreakdown
    costs: CostBreakdown


def _validate_inputs(inputs: EstimateInputs) -> None:
    if inputs.monthly_volume <= 0:
        raise ValueError("monthly_volume must be greater than zero")
    if not 0 <= inputs.incidence_rate <= 1:
        raise ValueError("incidence_rate must be between 0 and 1")
    if inputs.chat_turns < 0:
        raise ValueError("chat_turns cannot be negative")
    if inputs.telecom_cost_per_session < 0:
        raise ValueError("telecom_cost_per_session cannot be negative")
    if inputs.infrastructure_monthly_cost < 0:
        raise ValueError("infrastructure_monthly_cost cannot be negative")
    if inputs.safety_margin < 0:
        raise ValueError("safety_margin cannot be negative")


def calculate_estimate(inputs: EstimateInputs) -> CostEstimate:
    _validate_inputs(inputs)

    # Dynamic image token estimation for Gemini
    ocr_model = inputs.ocr_model
    if ocr_model.is_vision:
        if ocr_model.provider == "Google AI" or ocr_model.name.startswith("gemini"):
            import math
            w = inputs.tokens.ocr_image_width
            h = inputs.tokens.ocr_image_height
            if w <= 384 and h <= 384:
                image_tokens = 258
            else:
                image_tokens = math.ceil(w / 768) * math.ceil(h / 768) * 258
        else:
            image_tokens = ocr_model.image_token_cost
    else:
        image_tokens = 0

    token_breakdown = TokenBreakdown(
        ocr_input_tokens=(
            inputs.tokens.ocr_system_prompt_tokens
            + inputs.tokens.ocr_user_instruction_tokens
            + image_tokens
        ),
        ocr_output_tokens=inputs.tokens.ocr_output_json_tokens,
        chat_input_tokens=(
            inputs.tokens.chat_system_prompt_tokens
            + inputs.tokens.chat_memory_tokens
            + inputs.tokens.chat_user_message_tokens
        ),
        chat_output_tokens=inputs.tokens.chat_output_tokens,
    )

    ocr_unit_cost = (
        token_breakdown.ocr_input_tokens
        * inputs.ocr_model.input_price_per_million
        / MILLION
    ) + (
        token_breakdown.ocr_output_tokens
        * inputs.ocr_model.output_price_per_million
        / MILLION
    )
    ocr_cost = inputs.monthly_volume * ocr_unit_cost

    monthly_chat_sessions = inputs.monthly_volume * inputs.incidence_rate
    chat_turn_cost = (
        token_breakdown.chat_input_tokens
        * inputs.chat_model.input_price_per_million
        / MILLION
    ) + (
        token_breakdown.chat_output_tokens
        * inputs.chat_model.output_price_per_million
        / MILLION
    )
    chat_cost = monthly_chat_sessions * inputs.chat_turns * chat_turn_cost

    # Apply safety margin to AI components
    ai_cost_with_margin = (ocr_cost + chat_cost) * (1.0 + inputs.safety_margin)
    ocr_cost_with_margin = ocr_cost * (1.0 + inputs.safety_margin)
    chat_cost_with_margin = chat_cost * (1.0 + inputs.safety_margin)

    telecom_cost = inputs.monthly_volume * inputs.telecom_cost_per_session
    total_monthly_cost = (
        ai_cost_with_margin + telecom_cost + inputs.infrastructure_monthly_cost
    )

    weekly_cost = (total_monthly_cost / 30.0) * 7.0

    return CostEstimate(
        tokens=token_breakdown,
        costs=CostBreakdown(
            ocr_cost=round(ocr_cost_with_margin, 6),
            chat_cost=round(chat_cost_with_margin, 6),
            ai_cost=round(ai_cost_with_margin, 6),
            telecom_cost=round(telecom_cost, 6),
            infrastructure_cost=round(inputs.infrastructure_monthly_cost, 6),
            total_monthly_cost=round(total_monthly_cost, 6),
            cost_per_receipt=round(total_monthly_cost / inputs.monthly_volume, 8),
            monthly_chat_sessions=round(monthly_chat_sessions, 4),
            weekly_cost=round(weekly_cost, 6),
        ),
    )
