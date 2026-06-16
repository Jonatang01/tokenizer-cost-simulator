from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.seed_data import INITIAL_PROVIDERS, INITIAL_SCENARIOS
from app.db.session import Base, SessionLocal, engine
from app.models import AIModel, AIProvider, PriceSyncLog, Scenario


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def seed_db(db: Session) -> None:
    for provider_data in INITIAL_PROVIDERS:
        provider = db.scalar(
            select(AIProvider).where(AIProvider.name == provider_data["name"])
        )
        if provider is None:
            provider = AIProvider(
                name=provider_data["name"],
                official_pricing_url=provider_data["official_pricing_url"],
            )
            db.add(provider)
            db.flush()

        for model_data in provider_data["models"]:
            model = db.scalar(
                select(AIModel).where(
                    AIModel.provider_id == provider.id,
                    AIModel.name == model_data["name"],
                )
            )
            if model is None:
                db.add(AIModel(provider_id=provider.id, **model_data))
            else:
                for key, value in model_data.items():
                    setattr(model, key, value)

    db.flush()
    default_ocr = db.scalar(select(AIModel).where(AIModel.name == "gemini-2.5-flash-lite"))
    default_chat = db.scalar(select(AIModel).where(AIModel.name == "llama-3.1-8b-instant"))

    for scenario_data in INITIAL_SCENARIOS:
        scenario = db.scalar(
            select(Scenario).where(Scenario.name == scenario_data["name"])
        )
        if scenario is None:
            db.add(
                Scenario(
                    **scenario_data,
                    ocr_model_id=default_ocr.id if default_ocr else None,
                    chat_model_id=default_chat.id if default_chat else None,
                )
            )
        else:
            for key, value in scenario_data.items():
                setattr(scenario, key, value)
            scenario.ocr_model_id = default_ocr.id if default_ocr else scenario.ocr_model_id
            scenario.chat_model_id = (
                default_chat.id if default_chat else scenario.chat_model_id
            )

    has_log = db.scalar(select(PriceSyncLog).limit(1))
    if has_log is None:
        db.add(
            PriceSyncLog(
                provider_id=None,
                source="seed",
                status="ok",
                message="Catalogo inicial cargado con precios editables del plan base.",
            )
        )

    db.commit()


def bootstrap() -> None:
    init_db()
    with SessionLocal() as db:
        seed_db(db)


if __name__ == "__main__":
    bootstrap()
    print("Database initialized and seeded.")
