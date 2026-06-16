from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.cost_engine import (
    EstimateInputs,
    ModelPricing,
    TokenAssumptions,
    calculate_estimate,
)
from app.models import AIModel
from app.schemas import CostEstimateRead, CostEstimateRequest, ModelRead


def _pricing_from_model(model: AIModel) -> ModelPricing:
    return ModelPricing(
        id=model.id,
        provider=model.provider.name,
        name=model.name,
        input_price_per_million=model.input_price_per_million,
        output_price_per_million=model.output_price_per_million,
        image_token_cost=model.image_token_cost,
        is_vision=model.is_vision,
    )


def build_cost_estimate(
    db: Session,
    payload: CostEstimateRequest,
) -> CostEstimateRead:
    ocr_model = db.get(AIModel, payload.ocr_model_id)
    chat_model = db.get(AIModel, payload.chat_model_id)
    if ocr_model is None:
        raise ValueError("OCR model not found")
    if chat_model is None:
        raise ValueError("Chat model not found")

    estimate = calculate_estimate(
        EstimateInputs(
            monthly_volume=payload.monthly_volume,
            incidence_rate=payload.incidence_rate,
            chat_turns=payload.chat_turns,
            telecom_cost_per_session=payload.telecom_cost_per_session,
            infrastructure_monthly_cost=payload.infrastructure_monthly_cost,
            ocr_model=_pricing_from_model(ocr_model),
            chat_model=_pricing_from_model(chat_model),
            tokens=TokenAssumptions(**payload.tokens.model_dump()),
            safety_margin=payload.safety_margin,
        )
    )

    return CostEstimateRead(
        request=payload,
        ocr_model=ModelRead.model_validate(ocr_model),
        chat_model=ModelRead.model_validate(chat_model),
        tokens=estimate.tokens.__dict__,
        costs=estimate.costs.__dict__,
    )
