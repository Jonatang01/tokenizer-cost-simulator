import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import AIModel, AIProvider
from app.config import settings
import json

async def fetch_custom_models(base_url: str, api_key: str):
    if not base_url or not api_key:
        return []
    url = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            models = []
            for m in data:
                name = m["id"]
                # A heuristic: if it says vision or vl it's vision, else false
                is_vision = "vision" in name.lower() or "vl" in name.lower()
                models.append({
                    "name": name,
                    "display_name": name,
                    "is_vision": is_vision
                })
            return models
        except Exception:
            return []

async def fetch_google_models():
    if not settings.gemini_api_key:
        return []
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={settings.gemini_api_key}"
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json().get("models", [])
            models = []
            for m in data:
                name = m["name"].replace("models/", "")
                methods = ",".join(m.get("supportedGenerationMethods", []))
                if "generateContent" in methods:
                    is_vision = True if ("vision" in name or "flash" in name or "pro" in name) and "tts" not in name and "embedding" not in name else False
                    models.append({
                        "name": name,
                        "display_name": m.get("displayName", name),
                        "is_vision": is_vision
                    })
            return models
        except Exception:
            return []

async def fetch_groq_models():
    if not settings.groq_api_key:
        return []
    url = "https://api.groq.com/openai/v1/models"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            models = []
            for m in data:
                name = m["id"]
                is_vision = "vision" in name.lower()
                models.append({
                    "name": name,
                    "display_name": name,
                    "is_vision": is_vision
                })
            return models
        except Exception:
            return []

async def fetch_cerebras_models():
    if not settings.cerebras_api_key:
        return []
    url = "https://api.cerebras.ai/v1/models"
    headers = {"Authorization": f"Bearer {settings.cerebras_api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            models = []
            for m in data:
                name = m["id"]
                is_vision = "vision" in name.lower()
                models.append({
                    "name": name,
                    "display_name": name,
                    "is_vision": is_vision
                })
            return models
        except Exception:
            return []

async def fetch_openai_models():
    if not settings.openai_api_key:
        return []
    url = "https://api.openai.com/v1/models"
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            models = []
            for m in data:
                name = m["id"]
                is_vision = "vision" in name.lower() or "gpt-4o" in name.lower()
                models.append({
                    "name": name,
                    "display_name": name,
                    "is_vision": is_vision
                })
            return models
        except Exception:
            return []

async def fetch_deepseek_models():
    if not settings.deepseek_api_key:
        return []
    url = "https://api.deepseek.com/models"
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            models = []
            for m in data:
                name = m["id"]
                # DeepSeek currently doesn't have a vision API via this endpoint natively or we can assume false unless "vl" is in name
                is_vision = "vl" in name.lower() or "vision" in name.lower()
                models.append({
                    "name": name,
                    "display_name": name,
                    "is_vision": is_vision
                })
            return models
        except Exception:
            return []

async def sync_models_from_providers(db: Session) -> int:
    providers_map = {
        "Google AI": await fetch_google_models(),
        "Groq": await fetch_groq_models(),
        "Cerebras": await fetch_cerebras_models(),
        "OpenAI": await fetch_openai_models(),
        "DeepSeek": await fetch_deepseek_models()
    }

    try:
        if settings.custom_providers:
            custom_provs = json.loads(settings.custom_providers)
            for p in custom_provs:
                if p.get("name") and p.get("base_url") and p.get("api_key"):
                    models = await fetch_custom_models(p["base_url"], p["api_key"])
                    providers_map[p["name"]] = models
    except Exception:
        pass
    
    new_models_inserted = 0
    
    for provider_name, fetched_models in providers_map.items():
        if not fetched_models:
            continue
            
        provider = db.scalar(select(AIProvider).where(AIProvider.name == provider_name))
        if not provider:
            provider = AIProvider(name=provider_name)
            db.add(provider)
            db.commit()
            db.refresh(provider)
            
        existing_models = db.scalars(select(AIModel).where(AIModel.provider_id == provider.id)).all()
        existing_names = {m.name for m in existing_models}
        
        for m_data in fetched_models:
            if m_data["name"] not in existing_names:
                new_model = AIModel(
                    provider_id=provider.id,
                    name=m_data["name"],
                    display_name=m_data["display_name"].replace("models/", ""),
                    is_vision=m_data["is_vision"],
                    input_price_per_million=0.0,
                    output_price_per_million=0.0,
                    image_token_cost=0
                )
                db.add(new_model)
                new_models_inserted += 1

    db.commit()
    return new_models_inserted
