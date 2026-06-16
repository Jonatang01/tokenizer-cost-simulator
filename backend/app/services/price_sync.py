from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import AIModel, AIProvider, PriceChangeLog, PriceSyncLog


OFFICIAL_PRICING_URLS = {
    "Google AI": "https://ai.google.dev/gemini-api/docs/pricing",
    "Groq": "https://groq.com/pricing",
    "OpenAI": "https://developers.openai.com/api/docs/pricing",
}

MODEL_ALIASES = {
    "gemini-2.5-flash-lite": ["gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite"],
    "gemini-2.5-flash-lite-chat": [
        "gemini-2.5-flash-lite",
        "Gemini 2.5 Flash-Lite",
    ],
    "gemini-2.5-flash": ["gemini-2.5-flash", "Gemini 2.5 Flash"],
    "gemini-2.5-flash-chat": ["gemini-2.5-flash", "Gemini 2.5 Flash"],
    "gemini-2.5-pro": ["gemini-2.5-pro", "Gemini 2.5 Pro"],
    "gemini-2.5-pro-chat": ["gemini-2.5-pro", "Gemini 2.5 Pro"],
    "gemini-3.5-flash": ["gemini-3.5-flash", "Gemini 3.5 Flash"],
    "gemini-3.5-flash-chat": ["gemini-3.5-flash", "Gemini 3.5 Flash"],
    "gemini-3.1-flash-lite": ["gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite"],
    "gemini-3.1-flash-lite-chat": [
        "gemini-3.1-flash-lite",
        "Gemini 3.1 Flash-Lite",
    ],
    "gemini-3.1-pro-preview": ["gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview"],
    "gemini-3.1-pro-preview-chat": [
        "gemini-3.1-pro-preview",
        "Gemini 3.1 Pro Preview",
    ],
    "gemini-1.5-flash": ["gemini-1.5-flash", "Gemini 1.5 Flash"],
    "gemini-1.5-flash-chat": ["gemini-1.5-flash", "Gemini 1.5 Flash"],
    "gemini-1.5-pro": ["gemini-1.5-pro", "Gemini 1.5 Pro"],
    "gemini-1.5-pro-chat": ["gemini-1.5-pro", "Gemini 1.5 Pro"],
    "gemini-1.5-pro-user-reference": ["gemini-1.5-pro", "Gemini 1.5 Pro"],
    "llama-3.2-11b-vision": [
        "llama-3.2-11b-vision",
        "Llama 3.2 11B Vision",
        "Llama 3.2 11B",
    ],
    "llama-3.1-8b-instant": [
        "llama-3.1-8b-instant",
        "Llama 3.1 8B Instant",
        "Llama 3.1 8B",
    ],
    "llama-3.3-70b": ["llama-3.3-70b", "Llama 3.3 70B"],
    "gpt-5.4-mini": ["gpt-5.4-mini", "GPT-5.4 mini"],
    "gpt-5.4-mini-chat": ["gpt-5.4-mini", "GPT-5.4 mini"],
    "gpt-5.4-nano": ["gpt-5.4-nano", "GPT-5.4 nano"],
    "gpt-5.4-nano-chat": ["gpt-5.4-nano", "GPT-5.4 nano"],
    "gpt-5-mini": ["gpt-5-mini", "GPT-5 mini"],
    "gpt-5-mini-chat": ["gpt-5-mini", "GPT-5 mini"],
    "gpt-4.1-mini": ["gpt-4.1-mini", "GPT-4.1 mini"],
    "gpt-4.1-mini-chat": ["gpt-4.1-mini", "GPT-4.1 mini"],
    "gpt-4o-mini": ["gpt-4o-mini", "GPT-4o mini"],
    "gpt-4o-mini-chat": ["gpt-4o-mini", "GPT-4o mini"],
}

MODEL_SPECIFIC_PRICING_URLS = {
    "gpt-5-mini": "https://developers.openai.com/api/docs/models/gpt-5-mini",
    "gpt-5-mini-chat": "https://developers.openai.com/api/docs/models/gpt-5-mini",
    "gpt-4.1-mini": "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
    "gpt-4.1-mini-chat": "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
}


@dataclass(frozen=True)
class ParsedPrice:
    input_price_per_million: float
    output_price_per_million: float


def normalize_pricing_page(raw_html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_model_price(page_text: str, aliases: list[str]) -> ParsedPrice | None:
    window = _find_model_window(page_text, aliases)
    if not window:
        return None

    table_price = _parse_compact_openai_price_row(window, aliases)
    if table_price is not None:
        return table_price

    input_price = _extract_price(
        window,
        [
            r"Input price[^$]{0,240}\$([0-9]+(?:\.[0-9]+)?)",
            r"Input Token Price[^$]{0,240}\$([0-9]+(?:\.[0-9]+)?)",
            r"Input[^$]{0,120}\$([0-9]+(?:\.[0-9]+)?)",
        ],
    )
    output_price = _extract_price(
        window,
        [
            r"Output price[^$]{0,240}\$([0-9]+(?:\.[0-9]+)?)",
            r"Output Token Price[^$]{0,240}\$([0-9]+(?:\.[0-9]+)?)",
            r"Output[^$]{0,120}\$([0-9]+(?:\.[0-9]+)?)",
        ],
    )
    if input_price is None or output_price is None:
        return None
    return ParsedPrice(
        input_price_per_million=input_price,
        output_price_per_million=output_price,
    )


def _parse_compact_openai_price_row(
    window: str, aliases: list[str]
) -> ParsedPrice | None:
    for alias in aliases:
        compact_alias = re.escape(alias)
        pattern = (
            compact_alias
            + r"\s*\$([0-9]+(?:\.[0-9]+)?)"
            + r"\s*\$[0-9]+(?:\.[0-9]+)?"
            + r"\s*\$([0-9]+(?:\.[0-9]+)?)"
        )
        match = re.search(pattern, window, flags=re.IGNORECASE)
        if match:
            return ParsedPrice(
                input_price_per_million=float(match.group(1)),
                output_price_per_million=float(match.group(2)),
            )
    return None


def _find_model_window(page_text: str, aliases: list[str]) -> str | None:
    lower = page_text.lower()
    positions = [
        lower.find(alias.lower())
        for alias in aliases
        if alias and lower.find(alias.lower()) >= 0
    ]
    if not positions:
        return None
    start = min(positions)
    return page_text[start : start + 12_000]


def _extract_price(text: str, patterns: list[str]) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return float(match.group(1).replace(",", ""))
    return None


def _log_price_change(
    db: Session,
    model: AIModel,
    field_name: str,
    old_value: float,
    new_value: float,
    source: str,
) -> None:
    if old_value == new_value:
        return
    db.add(
        PriceChangeLog(
            model_id=model.id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            source=source,
        )
    )
    setattr(model, field_name, new_value)


def sync_provider_prices(db: Session, provider: AIProvider) -> dict[str, object]:
    url = OFFICIAL_PRICING_URLS.get(provider.name, provider.official_pricing_url)
    if not url:
        return {"provider": provider.name, "status": "skipped", "message": "No URL"}

    try:
        response = httpx.get(
            url,
            follow_redirects=True,
            timeout=20,
            headers={"User-Agent": "TokenizerCostSimulator/0.1"},
        )
        response.raise_for_status()
        page_text = normalize_pricing_page(response.text)
    except Exception as exc:
        db.add(
            PriceSyncLog(
                provider_id=provider.id,
                source=url,
                status="error",
                message=f"No se pudo descargar la pagina oficial: {exc}",
            )
        )
        db.commit()
        return {"provider": provider.name, "status": "error", "message": str(exc)}

    updated = 0
    unchanged = 0
    not_found: list[str] = []
    for model in [item for item in provider.models if item.is_active]:
        aliases = MODEL_ALIASES.get(model.name, [model.name, model.display_name])
        parsed = parse_model_price(page_text, aliases)
        if parsed is None and model.name in MODEL_SPECIFIC_PRICING_URLS:
            parsed = _parse_model_specific_price(
                MODEL_SPECIFIC_PRICING_URLS[model.name], aliases
            )
        if parsed is None:
            not_found.append(model.name)
            continue

        old_input = float(model.input_price_per_million)
        old_output = float(model.output_price_per_million)
        _log_price_change(
            db,
            model,
            "input_price_per_million",
            old_input,
            parsed.input_price_per_million,
            "official_page_sync",
        )
        _log_price_change(
            db,
            model,
            "output_price_per_million",
            old_output,
            parsed.output_price_per_million,
            "official_page_sync",
        )
        if (
            old_input != parsed.input_price_per_million
            or old_output != parsed.output_price_per_million
        ):
            updated += 1
        else:
            unchanged += 1

    provider.official_pricing_url = url
    provider.last_sync = datetime.now(timezone.utc)
    status = "ok" if not not_found else "partial"
    message = (
        f"Actualizados: {updated}. Sin cambios: {unchanged}. "
        f"No encontrados: {len(not_found)}."
    )
    if not_found:
        message += " Modelos: " + ", ".join(not_found[:8])
    db.add(
        PriceSyncLog(
            provider_id=provider.id,
            source=url,
            status=status,
            message=message,
        )
    )
    db.commit()
    return {
        "provider": provider.name,
        "status": status,
        "updated": updated,
        "unchanged": unchanged,
        "not_found": not_found,
    }


def _parse_model_specific_price(
    url: str,
    aliases: list[str],
) -> ParsedPrice | None:
    try:
        response = httpx.get(
            url,
            follow_redirects=True,
            timeout=20,
            headers={"User-Agent": "TokenizerCostSimulator/0.1"},
        )
        response.raise_for_status()
    except Exception:
        return None
    page_text = normalize_pricing_page(response.text)
    parsed = parse_model_price(page_text, aliases)
    if parsed is not None:
        return parsed
    return _parse_openai_model_doc_price(page_text)


def _parse_openai_model_doc_price(page_text: str) -> ParsedPrice | None:
    pricing_index = page_text.lower().find("pricing")
    if pricing_index < 0:
        return None

    window = page_text[pricing_index : pricing_index + 2_000]
    input_price = _extract_price(
        window,
        [
            r"Input\s*\$([0-9]+(?:\.[0-9]+)?)",
            r"Input[^$]{0,160}\$([0-9]+(?:\.[0-9]+)?)",
        ],
    )
    output_price = _extract_price(
        window,
        [
            r"Output\s*\$([0-9]+(?:\.[0-9]+)?)",
            r"Output[^$]{0,160}\$([0-9]+(?:\.[0-9]+)?)",
        ],
    )
    if input_price is None or output_price is None:
        return None
    return ParsedPrice(
        input_price_per_million=input_price,
        output_price_per_million=output_price,
    )


def sync_all_prices(db: Session) -> dict[str, object]:
    providers = list(
        db.scalars(
            select(AIProvider)
            .options(selectinload(AIProvider.models))
            .where(AIProvider.name.in_(OFFICIAL_PRICING_URLS))
            .order_by(AIProvider.name)
        )
    )
    results = [sync_provider_prices(db, provider) for provider in providers]
    return {"status": "done", "results": results}
