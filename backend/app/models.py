from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    official_pricing_url: Mapped[str | None] = mapped_column(Text)
    last_sync: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    models: Mapped[list[AIModel]] = relationship(
        back_populates="provider", cascade="all, delete-orphan"
    )


class AIModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("ai_providers.id"))
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    recommended_task: Mapped[str] = mapped_column(String(80), default="general")
    is_vision: Mapped[bool] = mapped_column(Boolean, default=False)
    input_price_per_million: Mapped[float] = mapped_column(Float, nullable=False)
    output_price_per_million: Mapped[float] = mapped_column(Float, nullable=False)
    cached_input_price_per_million: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_token_cost: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    provider: Mapped[AIProvider] = relationship(back_populates="models")


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    monthly_volume: Mapped[int] = mapped_column(Integer, nullable=False)
    incidence_rate: Mapped[float] = mapped_column(Float, nullable=False)
    chat_turns: Mapped[float] = mapped_column(Float, nullable=False)
    telecom_cost_per_session: Mapped[float] = mapped_column(Float, nullable=False)
    infrastructure_monthly_cost: Mapped[float] = mapped_column(Float, nullable=False)
    ocr_model_id: Mapped[int | None] = mapped_column(ForeignKey("ai_models.id"))
    chat_model_id: Mapped[int | None] = mapped_column(ForeignKey("ai_models.id"))
    rag_system_prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    rag_chunk_size: Mapped[int] = mapped_column(Integer, default=0)
    rag_top_k: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PriceSyncLog(Base):
    __tablename__ = "price_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("ai_providers.id"))
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PriceChangeLog(Base):
    __tablename__ = "price_change_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("ai_models.id"))
    field_name: Mapped[str] = mapped_column(String(80), nullable=False)
    old_value: Mapped[float] = mapped_column(Float, nullable=False)
    new_value: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
