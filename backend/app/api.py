from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.session import get_db
from app.models import AIModel, AIProvider, PriceChangeLog, PriceSyncLog, Scenario
from app.schemas import (
    CostEstimateRead,
    CostEstimateRequest,
    ModelCreate,
    ModelRead,
    ModelUpdate,
    PriceChangeLogRead,
    PriceSyncLogRead,
    ProviderCreate,
    ProviderRead,
    ProviderUpdate,
    ReceiptAnalysisRead,
    ReceiptEnhancementRead,
    ReceiptExtractionRead,
    ScenarioCreate,
    ScenarioRead,
    ScenarioUpdate,
)
from app.services.estimates import build_cost_estimate
from app.services.image_enhancement import analyze_image_quality, enhance_receipt_image
from app.services.receipt_extraction import extract_receipt_with_api
from app.services.receipt_analysis import (
    analyze_receipt_cost,
    parse_json_list,
    read_image_info,
)
from app.services.price_sync import sync_all_prices
from app.services.report_generator import generate_cost_comparison
from app.config import settings
import dotenv
from pydantic import BaseModel
from app.schemas import ApiKeysSchema, TokenizeRequest, TokenizeResponse
from app.services.models_discovery import sync_models_from_providers
import tiktoken


router = APIRouter(prefix="/api")

DEFAULT_RECEIPT_FIELDS = [
    "fecha",
    "monto",
    "moneda",
    "banco",
    "numero_operacion",
    "titular_origen",
    "titular_destino",
]

DEFAULT_RECEIPT_SECTIONS = [
    "encabezado",
    "operacion",
    "importe",
    "contrapartes",
    "pie",
]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/providers", response_model=list[ProviderRead])
def list_providers(
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[AIProvider]:
    stmt = select(AIProvider).order_by(AIProvider.name)
    if active_only:
        stmt = stmt.where(AIProvider.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/providers", response_model=ProviderRead, status_code=status.HTTP_201_CREATED)
def create_provider(payload: ProviderCreate, db: Session = Depends(get_db)) -> AIProvider:
    provider = AIProvider(**payload.model_dump())
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.patch("/providers/{provider_id}", response_model=ProviderRead)
def update_provider(
    provider_id: int,
    payload: ProviderUpdate,
    db: Session = Depends(get_db),
) -> AIProvider:
    provider = db.get(AIProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(provider, key, value)
    db.commit()
    db.refresh(provider)
    return provider


@router.get("/models", response_model=list[ModelRead])
def list_models(
    active_only: bool = Query(default=True),
    vision_only: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[AIModel]:
    stmt = select(AIModel).options(selectinload(AIModel.provider)).order_by(AIModel.id)
    if active_only:
        stmt = stmt.where(AIModel.is_active.is_(True))
    if vision_only:
        stmt = stmt.where(AIModel.is_vision.is_(True))
    return list(db.scalars(stmt))


@router.post("/models", response_model=ModelRead, status_code=status.HTTP_201_CREATED)
def create_model(payload: ModelCreate, db: Session = Depends(get_db)) -> AIModel:
    provider = db.get(AIProvider, payload.provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    model = AIModel(**payload.model_dump())
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.patch("/models/{model_id}", response_model=ModelRead)
def update_model(
    model_id: int,
    payload: ModelUpdate,
    db: Session = Depends(get_db),
) -> AIModel:
    model = db.get(AIModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    updates = payload.model_dump(exclude_unset=True)
    if "provider_id" in updates and db.get(AIProvider, updates["provider_id"]) is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    tracked_price_fields = {
        "input_price_per_million",
        "output_price_per_million",
        "image_token_cost",
    }
    for field in tracked_price_fields.intersection(updates):
        old_value = float(getattr(model, field))
        new_value = float(updates[field])
        if old_value != new_value:
            db.add(
                PriceChangeLog(
                    model_id=model.id,
                    field_name=field,
                    old_value=old_value,
                    new_value=new_value,
                    source="manual",
                )
            )
    for key, value in updates.items():
        setattr(model, key, value)
    db.commit()
    db.refresh(model)
    return model


@router.post("/cost-estimates", response_model=CostEstimateRead)
def create_cost_estimate(
    payload: CostEstimateRequest,
    db: Session = Depends(get_db),
) -> CostEstimateRead:
    try:
        return build_cost_estimate(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/receipt-lab/analyze", response_model=ReceiptAnalysisRead)
async def analyze_receipt_image(
    model_id: int = Form(...),
    daily_volume: int = Form(25),
    fields_json: str = Form(default=""),
    sections_json: str = Form(default=""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    model = db.get(AIModel, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if not model.is_vision:
        raise HTTPException(status_code=400, detail="Model must support vision")
    if daily_volume <= 0:
        raise HTTPException(status_code=400, detail="daily_volume must be positive")

    try:
        fields = parse_json_list(fields_json, DEFAULT_RECEIPT_FIELDS)
        sections = parse_json_list(sections_json, DEFAULT_RECEIPT_SECTIONS)
        file_bytes = await file.read()
        image = read_image_info(file_bytes)
        analysis_result = analyze_receipt_cost(
            model=model,
            image=image,
            fields=fields,
            selected_sections=sections,
            daily_volume=daily_volume,
        )
        analysis_result["quality_analysis"] = analyze_image_quality(file_bytes, file.content_type or "")
        return analysis_result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/receipt-lab/enhance", response_model=ReceiptEnhancementRead)
async def enhance_receipt_upload(
    mode: str = Form(default="auto"),
    deskew: bool = Form(default=True),
    remove_shadows: bool = Form(default=True),
    file: UploadFile = File(...),
) -> ReceiptEnhancementRead:
    try:
        enhanced = enhance_receipt_image(
            await file.read(),
            mode=mode,
            deskew=deskew,
            remove_shadows=remove_shadows,
        )
        return ReceiptEnhancementRead(
            image_base64=enhanced.image_base64,
            mime_type=enhanced.mime_type,
            original=enhanced.original.__dict__,
            enhanced=enhanced.enhanced.__dict__,
            operations=enhanced.operations,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/receipt-lab/extract", response_model=ReceiptExtractionRead)
async def extract_receipt_upload(
    model_id: int = Form(...),
    fields_json: str = Form(default=""),
    sections_json: str = Form(default=""),
    enhance: bool = Form(default=False),
    enhancement_mode: str = Form(default="auto"),
    deskew: bool = Form(default=True),
    remove_shadows: bool = Form(default=True),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ReceiptExtractionRead:
    model = db.scalar(
        select(AIModel)
        .options(selectinload(AIModel.provider))
        .where(AIModel.id == model_id)
    )
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if not model.is_vision:
        raise HTTPException(status_code=400, detail="Model must support vision")
    if model.provider.name not in ["Google AI", "Groq", "Cerebras", "DeepSeek"]:
        raise HTTPException(
            status_code=400,
            detail=f"OCR real no implementado para {model.provider.name}.",
        )

    try:
        fields = parse_json_list(fields_json, DEFAULT_RECEIPT_FIELDS)
        sections = parse_json_list(sections_json, DEFAULT_RECEIPT_SECTIONS)
        content_type = file.content_type or "image/jpeg"
        image_bytes = await file.read()
        result = await extract_receipt_with_api(
            model=model,
            image_bytes=image_bytes,
            mime_type=content_type,
            fields=fields,
            sections=sections,
            enhance=enhance,
            enhancement_mode=enhancement_mode,
            deskew=deskew,
            remove_shadows=remove_shadows,
        )
        return ReceiptExtractionRead(
            provider=result.provider,
            model_name=result.model_name,
            fields=result.fields,
            enhanced=result.enhanced,
            extracted=result.extracted,
            raw_text=result.raw_text,
            usage=result.usage,
            cost=result.cost,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/scenarios", response_model=list[ScenarioRead])
def list_scenarios(db: Session = Depends(get_db)) -> list[Scenario]:
    return list(db.scalars(select(Scenario).order_by(Scenario.id)))


@router.post("/scenarios", response_model=ScenarioRead, status_code=status.HTTP_201_CREATED)
def create_scenario(payload: ScenarioCreate, db: Session = Depends(get_db)) -> Scenario:
    scenario = Scenario(**payload.model_dump())
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioRead)
def update_scenario(
    scenario_id: int,
    payload: ScenarioUpdate,
    db: Session = Depends(get_db),
) -> Scenario:
    scenario = db.get(Scenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(scenario, key, value)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.get("/price-sync-logs", response_model=list[PriceSyncLogRead])
def list_price_sync_logs(db: Session = Depends(get_db)) -> list[PriceSyncLog]:
    return list(db.scalars(select(PriceSyncLog).order_by(PriceSyncLog.created_at.desc())))


@router.get("/price-change-logs", response_model=list[PriceChangeLogRead])
def list_price_change_logs(db: Session = Depends(get_db)) -> list[PriceChangeLog]:
    return list(
        db.scalars(select(PriceChangeLog).order_by(PriceChangeLog.created_at.desc()))
    )


@router.post("/price-sync/run")
def run_price_sync(db: Session = Depends(get_db)) -> dict[str, object]:
    return sync_all_prices(db)


@router.post("/reports/cost-comparison")
async def cost_comparison_report(
    daily_volume: int = Form(25),
    fields_json: str = Form(default=""),
    sections_json: str = Form(default=""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Generate a cost-comparison report for a receipt across all vision models."""
    if daily_volume <= 0:
        raise HTTPException(status_code=400, detail="daily_volume must be positive")
    try:
        fields = parse_json_list(fields_json, DEFAULT_RECEIPT_FIELDS)
        sections = parse_json_list(sections_json, DEFAULT_RECEIPT_SECTIONS)
        file_bytes = await file.read()
        return generate_cost_comparison(
            db=db,
            file_bytes=file_bytes,
            filename=file.filename or "comprobante",
            content_type=file.content_type or "image/jpeg",
            fields=fields,
            sections=sections,
            daily_volume=daily_volume,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
import json

@router.get("/settings/keys", response_model=ApiKeysSchema)
def get_api_keys():
    def mask_key(k: str | None) -> str | None:
        if not k: return None
        if len(k) <= 8: return "********"
        return k[:4] + "*" * 8 + k[-4:]
    custom_provs = []
    try:
        if settings.custom_providers:
            parsed = json.loads(settings.custom_providers)
            # Mask API keys in custom providers
            for p in parsed:
                p_copy = dict(p)
                p_copy["api_key"] = mask_key(p.get("api_key"))
                custom_provs.append(p_copy)
    except Exception:
        pass

    return ApiKeysSchema(
        google_ai=mask_key(settings.gemini_api_key),
        groq=mask_key(settings.groq_api_key),
        cerebras=mask_key(settings.cerebras_api_key),
        openai=mask_key(settings.openai_api_key),
        deepseek=mask_key(settings.deepseek_api_key),
        custom_providers=custom_provs
    )

@router.post("/settings/keys", response_model=dict)
def update_api_keys(keys: ApiKeysSchema):
    import os
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(base_dir, ".env")
    updated = False
    
    def update_key(key_name: str, new_val: str | None, attr_name: str):
        nonlocal updated
        if new_val is not None:
            if "***" not in new_val:
                dotenv.set_key(env_path, key_name, new_val)
                setattr(settings, attr_name, new_val)
                updated = True
            
    update_key("GEMINI_API_KEY", keys.google_ai, "gemini_api_key")
    update_key("GROQ_API_KEY", keys.groq, "groq_api_key")
    update_key("CEREBRAS_API_KEY", keys.cerebras, "cerebras_api_key")
    update_key("OPENAI_API_KEY", keys.openai, "openai_api_key")
    update_key("DEEPSEEK_API_KEY", keys.deepseek, "deepseek_api_key")

    if keys.custom_providers is not None:
        # Load existing from settings to not overwrite masked keys with "***"
        existing_provs = []
        try:
            if settings.custom_providers:
                existing_provs = json.loads(settings.custom_providers)
        except Exception:
            pass
            
        new_provs_to_save = []
        for i, cp in enumerate(keys.custom_providers):
            cp_dict = cp.model_dump()
            if "***" in cp_dict["api_key"]:
                # user didn't change it, find existing
                if i < len(existing_provs):
                    cp_dict["api_key"] = existing_provs[i].get("api_key", "")
            new_provs_to_save.append(cp_dict)
            
        new_val = json.dumps(new_provs_to_save)
        dotenv.set_key(env_path, "CUSTOM_PROVIDERS", new_val)
        setattr(settings, "custom_providers", new_val)
        updated = True
        
    return {"status": "success", "updated": updated}

class DiscoveryResult(BaseModel):
    new_models_inserted: int

@router.post("/models/sync-discovery", response_model=DiscoveryResult)
async def sync_discovery(db: Session = Depends(get_db)):
    inserted = await sync_models_from_providers(db)
    return DiscoveryResult(new_models_inserted=inserted)

@router.post("/tokenize", response_model=TokenizeResponse)
async def tokenize_text(req: TokenizeRequest):
    try:
        # Fallback to cl100k_base or o200k_base which are the most common standard
        encoding = tiktoken.encoding_for_model(req.model)
    except KeyError:
        encoding = tiktoken.get_encoding("o200k_base")
    
    tokens = len(encoding.encode(req.text))
    return TokenizeResponse(tokens=tokens, model=req.model)
