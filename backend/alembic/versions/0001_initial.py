"""Initial schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_providers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("official_pricing_url", sa.Text(), nullable=True),
        sa.Column("last_sync", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_ai_providers_id"), "ai_providers", ["id"], unique=False)

    op.create_table(
        "ai_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("recommended_task", sa.String(length=80), nullable=False),
        sa.Column("is_vision", sa.Boolean(), nullable=False),
        sa.Column("input_price_per_million", sa.Float(), nullable=False),
        sa.Column("output_price_per_million", sa.Float(), nullable=False),
        sa.Column("image_token_cost", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["provider_id"], ["ai_providers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_models_id"), "ai_models", ["id"], unique=False)

    op.create_table(
        "price_sync_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["provider_id"], ["ai_providers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_price_sync_logs_id"), "price_sync_logs", ["id"], unique=False)

    op.create_table(
        "price_change_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("field_name", sa.String(length=80), nullable=False),
        sa.Column("old_value", sa.Float(), nullable=False),
        sa.Column("new_value", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["ai_models.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_price_change_logs_id"), "price_change_logs", ["id"], unique=False
    )

    op.create_table(
        "scenarios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("monthly_volume", sa.Integer(), nullable=False),
        sa.Column("incidence_rate", sa.Float(), nullable=False),
        sa.Column("chat_turns", sa.Float(), nullable=False),
        sa.Column("telecom_cost_per_session", sa.Float(), nullable=False),
        sa.Column("infrastructure_monthly_cost", sa.Float(), nullable=False),
        sa.Column("ocr_model_id", sa.Integer(), nullable=True),
        sa.Column("chat_model_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chat_model_id"], ["ai_models.id"]),
        sa.ForeignKeyConstraint(["ocr_model_id"], ["ai_models.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scenarios_id"), "scenarios", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scenarios_id"), table_name="scenarios")
    op.drop_table("scenarios")
    op.drop_index(op.f("ix_price_change_logs_id"), table_name="price_change_logs")
    op.drop_table("price_change_logs")
    op.drop_index(op.f("ix_price_sync_logs_id"), table_name="price_sync_logs")
    op.drop_table("price_sync_logs")
    op.drop_index(op.f("ix_ai_models_id"), table_name="ai_models")
    op.drop_table("ai_models")
    op.drop_index(op.f("ix_ai_providers_id"), table_name="ai_providers")
    op.drop_table("ai_providers")
