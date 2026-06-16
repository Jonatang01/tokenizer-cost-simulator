from __future__ import annotations

import json
import math
from dataclasses import dataclass

from app.models import AIModel


@dataclass(frozen=True)
class ImageInfo:
    width: int
    height: int
    format: str


def read_image_info(data: bytes) -> ImageInfo:
    if len(data) >= 24 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ImageInfo(
            width=int.from_bytes(data[16:20], "big"),
            height=int.from_bytes(data[20:24], "big"),
            format="png",
        )

    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return _read_webp_info(data)

    if len(data) >= 4 and data[:2] == b"\xff\xd8":
        return _read_jpeg_info(data)

    if data.startswith(b"%PDF"):
        import re
        matches = re.findall(b"/Count\s+(\d+)", data)
        pages = 1
        if matches:
            try:
                pages = int(matches[-1])
            except ValueError:
                pass
        else:
            pages = max(1, len(re.findall(b"/Type\s*/Page\b", data)))
        return ImageInfo(
            width=768,
            height=768 * pages,
            format="pdf",
        )

    raise ValueError("Formato no soportado. Usa PNG, JPG, WebP o PDF.")


def _read_jpeg_info(data: bytes) -> ImageInfo:
    index = 2
    while index < len(data) - 9:
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        block_length = int.from_bytes(data[index : index + 2], "big")
        if marker in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            height = int.from_bytes(data[index + 3 : index + 5], "big")
            width = int.from_bytes(data[index + 5 : index + 7], "big")
            return ImageInfo(width=width, height=height, format="jpeg")
        index += block_length
    raise ValueError("No se pudieron leer las dimensiones del JPG.")


def _read_webp_info(data: bytes) -> ImageInfo:
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return ImageInfo(width=width, height=height, format="webp")
    if chunk == b"VP8 " and len(data) >= 30:
        width = int.from_bytes(data[26:28], "little") & 0x3FFF
        height = int.from_bytes(data[28:30], "little") & 0x3FFF
        return ImageInfo(width=width, height=height, format="webp")
    raise ValueError("No se pudieron leer las dimensiones del WebP.")


def parse_json_list(value: str | None, fallback: list[str]) -> list[str]:
    if not value:
        return fallback
    parsed = json.loads(value)
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise ValueError("El valor debe ser una lista JSON de strings.")
    cleaned = [item.strip() for item in parsed if item.strip()]
    return cleaned or fallback


def estimate_image_tokens(model: AIModel, image: ImageInfo) -> int:
    model_name = getattr(model, "name", "")
    model_provider = getattr(model, "provider", None)
    provider_name = getattr(model_provider, "name", "") if model_provider else ""

    if model_name.startswith("gemini") or provider_name == "Google AI":
        if image.width <= 384 and image.height <= 384:
            return 258
        else:
            return math.ceil(image.width / 768) * math.ceil(image.height / 768) * 258

    image_token_cost = getattr(model, "image_token_cost", 0)
    if image_token_cost > 0:
        return image_token_cost

    longest_side = max(image.width, image.height)
    shortest_side = min(image.width, image.height)
    tiles = max(1, math.ceil(longest_side / 768) * math.ceil(shortest_side / 768))
    return tiles * 85


def estimate_sections(image: ImageInfo, selected_sections: list[str]) -> list[dict[str, object]]:
    catalog = [
        ("encabezado", "Encabezado / comercio", 0.00, 0.18),
        ("operacion", "Datos de operacion", 0.18, 0.42),
        ("importe", "Importe y moneda", 0.42, 0.62),
        ("contrapartes", "Origen / destino", 0.62, 0.82),
        ("pie", "Pie / metadata", 0.82, 1.00),
    ]
    wanted = set(selected_sections)
    sections = []
    for section_id, label, start, end in catalog:
        if section_id not in wanted:
            continue
        sections.append(
            {
                "id": section_id,
                "label": label,
                "x": 0,
                "y": round(image.height * start),
                "width": image.width,
                "height": max(1, round(image.height * (end - start))),
                "confidence": 0.72,
            }
        )
    return sections


def analyze_receipt_cost(
    *,
    model: AIModel,
    image: ImageInfo,
    fields: list[str],
    selected_sections: list[str],
    daily_volume: int,
) -> dict[str, object]:
    sections = estimate_sections(image, selected_sections)
    image_tokens = estimate_image_tokens(model, image)
    prompt_tokens = 220 + (len(fields) * 12) + (len(sections) * 35)
    output_tokens = max(80, len(fields) * 18 + len(sections) * 8)
    input_tokens = prompt_tokens + image_tokens
    cost_per_receipt = (
        input_tokens * model.input_price_per_million / 1_000_000
        + output_tokens * model.output_price_per_million / 1_000_000
    )
    monthly_volume = daily_volume * 30
    daily_cost = cost_per_receipt * daily_volume
    weekly_cost = daily_cost * 7
    monthly_cost = cost_per_receipt * monthly_volume

    return {
        "image": image.__dict__,
        "model_id": model.id,
        "model_name": model.display_name,
        "fields": fields,
        "sections": sections,
        "tokens": {
            "image_tokens": image_tokens,
            "prompt_tokens": prompt_tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        },
        "costs": {
            "cost_per_receipt": round(cost_per_receipt, 8),
            "daily_cost": round(daily_cost, 8),
            "weekly_cost": round(weekly_cost, 8),
            "monthly_cost": round(monthly_cost, 8),
            "daily_volume": daily_volume,
            "monthly_volume": monthly_volume,
        },
    }
