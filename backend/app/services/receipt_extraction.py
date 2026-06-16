from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings
from app.models import AIModel
from app.services.image_enhancement import analyze_image_quality, enhance_receipt_image


GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


@dataclass(frozen=True)
class ExtractionResult:
    provider: str
    model_name: str
    fields: list[str]
    enhanced: bool
    extracted: dict[str, Any] | None
    raw_text: str
    usage: dict[str, int]
    cost: dict[str, float | int | None]


async def extract_receipt_with_api(
    *,
    model: AIModel,
    image_bytes: bytes,
    mime_type: str,
    fields: list[str],
    sections: list[str],
    enhance: bool,
    enhancement_mode: str,
    deskew: bool = True,
    remove_shadows: bool = True,
) -> ExtractionResult:
    if model.provider.name == "Google AI" and not settings.gemini_api_key:
        raise ValueError("Falta GEMINI_API_KEY en backend/.env.")
    if model.provider.name == "Groq" and not settings.groq_api_key:
        raise ValueError("Falta GROQ_API_KEY en backend/.env.")
    if model.provider.name == "Cerebras" and not settings.cerebras_api_key:
        raise ValueError("Falta CEREBRAS_API_KEY en backend/.env.")
    if model.provider.name == "DeepSeek" and not settings.deepseek_api_key:
        raise ValueError("Falta DEEPSEEK_API_KEY en backend/.env.")

    payload_bytes = image_bytes
    payload_mime_type = mime_type
    is_pdf = image_bytes.startswith(b"%PDF") or "pdf" in mime_type.lower()
    applied_enhancement = False

    if enhance and not is_pdf:
        should_run = True
        if enhancement_mode == "auto":
            quality = analyze_image_quality(image_bytes, mime_type)
            should_run = quality["requires_enhancement"]
            
        if should_run:
            enhanced = enhance_receipt_image(
                image_bytes,
                mode=enhancement_mode,
                deskew=deskew,
                remove_shadows=remove_shadows,
            )
            payload_bytes = base64.b64decode(enhanced.image_base64)
            payload_mime_type = enhanced.mime_type
            applied_enhancement = True

    prompt = _build_receipt_prompt(fields=fields, sections=sections)
    
    if model.provider.name == "Google AI":
        response_payload = await _call_gemini(
            model_name=_normalize_gemini_model_name(model.name),
            image_bytes=payload_bytes,
            mime_type=payload_mime_type,
            prompt=prompt,
        )
        raw_text = _extract_text(response_payload)
        usage = _extract_usage(response_payload)
    elif model.provider.name == "Groq":
        response_payload = await _call_groq(
            model_name=model.name + "-preview" if "vision" in model.name and "preview" not in model.name else model.name,
            image_bytes=payload_bytes,
            mime_type=payload_mime_type,
            prompt=prompt,
        )
        raw_text = response_payload["choices"][0]["message"].get("content", "")
        usage_data = response_payload.get("usage", {})
        usage = {
            "prompt_tokens": usage_data.get("prompt_tokens", 0),
            "output_tokens": usage_data.get("completion_tokens", 0),
            "total_tokens": usage_data.get("total_tokens", 0),
        }
    elif model.provider.name == "Cerebras":
        response_payload = await _call_cerebras(
            model_name=model.name,
            image_bytes=payload_bytes,
            mime_type=payload_mime_type,
            prompt=prompt,
        )
        raw_text = response_payload["choices"][0]["message"].get("content", "")
        usage_data = response_payload.get("usage", {})
        usage = {
            "prompt_tokens": usage_data.get("prompt_tokens", 0),
            "output_tokens": usage_data.get("completion_tokens", 0),
            "total_tokens": usage_data.get("total_tokens", 0),
        }
    elif model.provider.name == "DeepSeek":
        response_payload = await _call_deepseek(
            model_name=model.name,
            image_bytes=payload_bytes,
            mime_type=payload_mime_type,
            prompt=prompt,
        )
        raw_text = response_payload["choices"][0]["message"].get("content", "")
        usage_data = response_payload.get("usage", {})
        usage = {
            "prompt_tokens": usage_data.get("prompt_tokens", 0),
            "output_tokens": usage_data.get("completion_tokens", 0),
            "total_tokens": usage_data.get("total_tokens", 0),
        }
    else:
        raise ValueError(f"Provider no soportado: {model.provider.name}")

    parsed = parse_json_object(raw_text)

    input_tokens = usage.get("prompt_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    cost_per_receipt = (
        input_tokens * float(model.input_price_per_million) / 1_000_000
        + output_tokens * float(model.output_price_per_million) / 1_000_000
    )

    return ExtractionResult(
        provider=model.provider.name,
        model_name=model.display_name,
        fields=fields,
        enhanced=applied_enhancement,
        extracted=parsed,
        raw_text=raw_text,
        usage=usage,
        cost={
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": usage.get("total_tokens"),
            "cost_per_receipt": round(cost_per_receipt, 8),
        },
    )


def parse_json_object(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    candidates = [cleaned]
    object_match = re.search(r"\{[\s\S]*\}", cleaned)
    if object_match:
        candidates.append(object_match.group(0))

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _normalize_gemini_model_name(model_name: str) -> str:
    if model_name.endswith("-chat"):
        return model_name.removesuffix("-chat")
    return model_name


def _build_receipt_prompt(*, fields: list[str], sections: list[str]) -> str:
    field_lines = "\n".join(f"- {field}" for field in fields)
    section_lines = "\n".join(f"- {section}" for section in sections)
    return f"""
Extrae datos de este comprobante de pago. Responde solo JSON valido, sin markdown.

Campos requeridos:
{field_lines}

Secciones esperadas:
{section_lines}

Formato requerido:
{{
  "campos": {{
    "nombre_campo": {{
      "valor": "texto detectado o null",
      "confianza": 0.0,
      "evidencia": "texto visible que justifica el valor"
    }}
  }},
  "legibilidad": {{
    "estado": "alta|media|baja",
    "motivos": []
  }},
  "requiere_chat": false,
  "preguntas_sugeridas": []
}}
""".strip()


async def _call_gemini(
    *,
    model_name: str,
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
) -> dict[str, Any]:
    url = GEMINI_GENERATE_URL.format(model=model_name)
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(image_bytes).decode("ascii"),
                        }
                    },
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "response_mime_type": "application/json",
        },
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": settings.gemini_api_key or "",
            },
            json=payload,
        )
    if response.status_code >= 400:
        raise ValueError(f"Gemini API {response.status_code}: {response.text}")
    return response.json()

async def _call_groq(
    *,
    model_name: str,
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
) -> dict[str, Any]:
    url = "https://api.groq.com/openai/v1/chat/completions"
    b64_image = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"}
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.groq_api_key or ''}",
            },
            json=payload,
        )
    if response.status_code >= 400:
        raise ValueError(f"Groq API {response.status_code}: {response.text}")
    return response.json()

async def _call_cerebras(
    *,
    model_name: str,
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
) -> dict[str, Any]:
    url = "https://api.cerebras.ai/v1/chat/completions"
    b64_image = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"}
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.cerebras_api_key or ''}",
            },
            json=payload,
        )
    if response.status_code >= 400:
        raise ValueError(f"Cerebras API {response.status_code}: {response.text}")
    return response.json()


async def _call_deepseek(
    *,
    model_name: str,
    image_bytes: bytes,
    mime_type: str,
    prompt: str,
) -> dict[str, Any]:
    url = "https://api.deepseek.com/chat/completions"
    b64_image = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"}
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.deepseek_api_key or ''}",
            },
            json=payload,
        )
    if response.status_code >= 400:
        raise ValueError(f"DeepSeek API {response.status_code}: {response.text}")
    return response.json()

def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = candidates[0].get("content", {}).get("parts", [])
    text_parts = [part.get("text", "") for part in parts if isinstance(part, dict)]
    return "\n".join(part for part in text_parts if part).strip()


def _extract_usage(payload: dict[str, Any]) -> dict[str, int]:
    usage = payload.get("usageMetadata") or {}
    prompt_tokens = int(usage.get("promptTokenCount") or 0)
    output_tokens = int(usage.get("candidatesTokenCount") or 0)
    total_tokens = int(usage.get("totalTokenCount") or prompt_tokens + output_tokens)
    return {
        "prompt_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }
