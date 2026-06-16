from __future__ import annotations

import base64
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class ImageQuality:
    contrast: float
    sharpness: float


@dataclass(frozen=True)
class EnhancedReceipt:
    image_base64: str
    mime_type: str
    original: ImageQuality
    enhanced: ImageQuality
    operations: list[str]


def enhance_receipt_image(
    data: bytes,
    mode: str = "auto",
    deskew: bool = True,
    remove_shadows: bool = True,
) -> EnhancedReceipt:
    image_array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("No se pudo leer la imagen para mejorarla.")

    normalized_mode = mode if mode in {"auto", "clarify", "threshold"} else "auto"
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    original_quality = _quality(gray)
    operations = ["grayscale"]

    current = gray

    # 1. Deskew (Corrección de Rotación)
    if deskew:
        deskewed, angle = _deskew(current)
        if abs(angle) > 0.0:
            current = deskewed
            operations.append(f"deskew({angle:.1f}deg)")

    # 2. Shadow Removal (Remoción de Sombras)
    if remove_shadows:
        current = _remove_shadows(current)
        operations.append("remove_shadows")

    # 3. Denoising
    denoised = cv2.fastNlMeansDenoising(current, None, h=8, templateWindowSize=7, searchWindowSize=21)
    operations.append("denoise")

    # 4. Contrast Enhancement
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    contrasted = clahe.apply(denoised)
    operations.append("adaptive_contrast")

    # 5. Sharpening (Unsharp Mask)
    sharpened = _unsharp_mask(contrasted)
    operations.append("sharpen")

    # 6. Thresholding (Binarization) if forced or auto-detected low contrast
    if normalized_mode == "threshold" or (
        normalized_mode == "auto" and original_quality.contrast < 35
    ):
        enhanced = cv2.adaptiveThreshold(
            sharpened,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            9,
        )
        operations.append("adaptive_threshold")
    else:
        enhanced = sharpened

    ok, encoded = cv2.imencode(".png", enhanced)
    if not ok:
        raise ValueError("No se pudo codificar la imagen mejorada.")

    return EnhancedReceipt(
        image_base64=base64.b64encode(encoded.tobytes()).decode("ascii"),
        mime_type="image/png",
        original=original_quality,
        enhanced=_quality(enhanced),
        operations=operations,
    )


def _quality(gray: np.ndarray) -> ImageQuality:
    return ImageQuality(
        contrast=round(float(gray.std()), 2),
        sharpness=round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2),
    )


def _unsharp_mask(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=1.2)
    return cv2.addWeighted(gray, 1.55, blurred, -0.55, 0)


def _deskew(gray: np.ndarray) -> tuple[np.ndarray, float]:
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 10:
        return gray, 0.0

    rect = cv2.minAreaRect(coords)
    angle = rect[-1]

    if angle < -45:
        angle = -(90 + angle)
    elif angle > 45:
        angle = 90 - angle

    if abs(angle) < 0.5 or abs(angle) > 25:
        return gray, 0.0

    (h, w) = gray.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated, angle


def _remove_shadows(gray: np.ndarray) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (19, 19))
    dilated = cv2.dilate(gray, kernel)
    bg = cv2.medianBlur(dilated, 21)
    diff = cv2.divide(gray, bg, scale=255)
    return diff


def analyze_image_quality(data: bytes, mime_type: str = "") -> dict[str, Any]:
    from typing import Any
    # Check if PDF
    if data.startswith(b"%PDF") or "pdf" in mime_type.lower():
        return {
            "contrast": 0.0,
            "sharpness": 0.0,
            "rotation_angle": 0.0,
            "shadow_variance": 0.0,
            "requires_enhancement": False,
            "reasons": ["El archivo es un documento PDF digital y no requiere mejora OpenCV."],
            "suggested_mode": "none",
        }

    image_array = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        return {
            "contrast": 0.0,
            "sharpness": 0.0,
            "rotation_angle": 0.0,
            "shadow_variance": 0.0,
            "requires_enhancement": False,
            "reasons": ["No se pudo decodificar la imagen para análisis."],
            "suggested_mode": "none",
        }

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    q = _quality(gray)
    
    # Check rotation
    _, angle = _deskew(gray)
    
    # Check shadows (background illumination variance)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (19, 19))
    dilated = cv2.dilate(gray, kernel)
    bg = cv2.medianBlur(dilated, 21)
    bg_std = float(bg.std())
    
    reasons = []
    if q.contrast < 45:
        reasons.append(f"Bajo contraste ({q.contrast:.1f} < 45)")
    if q.sharpness < 100:
        reasons.append(f"Baja nitidez / borroso ({q.sharpness:.1f} < 100)")
    if abs(angle) > 1.0:
        reasons.append(f"Inclinación detectada ({angle:.1f}°)")
    if bg_std > 15.0:
        reasons.append(f"Iluminación no uniforme o sombras (var fondo {bg_std:.1f} > 15)")
        
    requires_enhancement = len(reasons) > 0
    
    suggested_mode = "none"
    if requires_enhancement:
        if q.contrast < 35:
            suggested_mode = "threshold"
        else:
            suggested_mode = "clarify"
            
    return {
        "contrast": q.contrast,
        "sharpness": q.sharpness,
        "rotation_angle": round(float(angle), 2),
        "shadow_variance": round(bg_std, 2),
        "requires_enhancement": requires_enhancement,
        "reasons": reasons,
        "suggested_mode": suggested_mode,
    }
