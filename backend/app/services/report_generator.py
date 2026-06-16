"""Generate cost-comparison reports for a receipt across all vision models."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import AIModel
from app.services.image_enhancement import analyze_image_quality
from app.services.receipt_analysis import (
    ImageInfo,
    analyze_receipt_cost,
    read_image_info,
)


def generate_cost_comparison(
    *,
    db: Session,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    fields: list[str],
    sections: list[str],
    daily_volume: int,
) -> dict[str, Any]:
    """Analyze a single receipt against every active vision model.

    Returns a structured dict ready for JSON serialization, CSV export,
    or PDF rendering.
    """
    image: ImageInfo = read_image_info(file_bytes)
    quality = analyze_image_quality(file_bytes, content_type)

    # Fetch all active vision models
    stmt = (
        select(AIModel)
        .options(selectinload(AIModel.provider))
        .where(AIModel.is_active.is_(True), AIModel.is_vision.is_(True))
        .order_by(AIModel.id)
    )
    vision_models: list[AIModel] = list(db.scalars(stmt))

    comparisons: list[dict[str, Any]] = []
    for model in vision_models:
        analysis = analyze_receipt_cost(
            model=model,
            image=image,
            fields=fields,
            selected_sections=sections,
            daily_volume=daily_volume,
        )
        comparisons.append(
            {
                "model_id": model.id,
                "model_name": model.display_name,
                "provider": model.provider.name,
                "input_price_per_million": float(model.input_price_per_million),
                "output_price_per_million": float(model.output_price_per_million),
                "tokens": analysis["tokens"],
                "costs": analysis["costs"],
            }
        )

    # Sort by cost_per_receipt ascending (cheapest first)
    comparisons.sort(key=lambda c: c["costs"]["cost_per_receipt"])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "receipt": {
            "filename": filename,
            "width": image.width,
            "height": image.height,
            "format": image.format,
            "quality_analysis": quality,
        },
        "parameters": {
            "daily_volume": daily_volume,
            "monthly_volume": daily_volume * 30,
            "fields": fields,
            "sections": sections,
        },
        "comparisons": comparisons,
        "summary": {
            "total_models": len(comparisons),
            "cheapest": comparisons[0]["model_name"] if comparisons else None,
            "most_expensive": comparisons[-1]["model_name"] if comparisons else None,
            "cheapest_cost": comparisons[0]["costs"]["cost_per_receipt"] if comparisons else 0,
            "most_expensive_cost": comparisons[-1]["costs"]["cost_per_receipt"] if comparisons else 0,
        },
    }
