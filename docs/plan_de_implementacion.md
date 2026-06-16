# Plan de Desarrollo por Fases: Actualización del Tokenizador y Mejora de OpenCV (Actualizado)

Este documento presenta el plan de desarrollo para actualizar la herramienta del Tokenizador según los hallazgos de la auditoría y mejorar el procesamiento de imágenes con OpenCV, incluyendo la detección automática de calidad y soporte para archivos PDF.

---

## 1. Objetivos del MVP

1. **Cálculo de Costo Semanal**: Integrar la estimación semanal (`costo_diario × 7`) en todo el ciclo de estimaciones (backend y frontend) para cumplir con el requerimiento del negocio.
2. **Cálculo Dinámico de Tokens de Imagen (Tiling)**: Reemplazar el costo fijo de 258 tokens por un cálculo dinámico basado en resolución de imagen para modelos de Google AI/Gemini, evitando subestimaciones en el presupuesto.
3. **Margen de Seguridad (Buffer)**: Permitir configurar un margen de seguridad ajustable (0% a 100%) para cubrir thinking tokens de Gemini 2.5+, reintentos y variabilidad de respuestas.
4. **Mejora de Imagen con OpenCV**: Optimizar la calidad de los comprobantes aplicando rotación/deskewing, remoción de sombras, normalización de iluminación y binarización adaptativa mejorada.
5. **Detección Automática de Mejora OpenCV**: Incorporar un módulo de análisis de calidad que calcula contraste, nitidez, inclinación y presencia de sombras, recomendando automáticamente si el archivo requiere preprocesamiento OpenCV.
6. **Soporte para Documentos PDF**: Permitir la carga directa de archivos PDF, estimando sus tokens de manera proporcional a su cantidad de páginas (258 tokens por página) y omitiendo la mejora OpenCV para documentos digitales limpios.
7. **Calibración y Pruebas**: Proveer en la UI una comparación directa entre los tokens simulados y los tokens reales devuelvos en el laboratorio para calibrar con comprobantes reales.

---

## 2. Plan por Fases

### Fase 1: Backend - Motor de Costos y Base de Datos
Actualización del motor matemático, esquemas de la API y lógica de estimación.
* **Soporte PDF y Mapeo**: Permitir la detección de archivos PDF, estimando sus páginas mediante expresiones regulares estándar y mapeándolas a una dimensión virtual de `768x768` por página para el motor de estimación.
* **Cálculo de Costo Semanal y Margen**: Añadir el margen de seguridad y el cálculo de costo semanal.

### Fase 2: Backend - Procesamiento OpenCV y Análisis de Calidad
* **Módulo de Análisis de Calidad (`analyze_image_quality`)**:
  * Detectar bajo contraste (desviación estándar del gris < 45).
  * Detectar baja nitidez (varianza laplaciana < 100).
  * Detectar inclinación usando el algoritmo de deskew.
  * Detectar variaciones de iluminación/sombras de fondo (varianza del fondo > 15.0).
  * Determinar si se requiere mejora y sugerir el modo más apto (`threshold` o `clarify`).
* **Integración en Endpoints**: Modificar `/receipt-lab/analyze` para retornar este análisis y `/receipt-lab/extract` para omitir OpenCV si es un archivo PDF.

### Fase 3: Frontend - Integración del Dashboard y Laboratorio
* **Soporte de Entrada**: Modificar el input de archivo para aceptar `application/pdf`.
* **Tarjeta de Calidad Automática**: Mostrar dinámicamente un banner informativo amber/emerald con los detalles del análisis de calidad (contraste, nitidez, inclinación, variabilidad de fondo) y los motivos de la recomendación de OpenCV.
* **Auto-Configuración**: Al analizar el archivo, si se recomienda mejora, auto-habilitar la casilla "Usar mejora OpenCV antes del OCR real" y seleccionar el modo sugerido.

---

## Verification Plan

### Automated Tests
Ejecutar la suite de pruebas del backend asegurando que tanto las validaciones anteriores como las nuevas pasen correctamente:
```powershell
python -m pytest tests/ -v
```

### Manual Verification
1. Analizar los comprobantes de prueba almacenados en `c:\Tokenizer\comprobantes`:
   - `Comprobante.pdf` (Digital, 1 página -> Sin mejora sugerida).
   - `WhatsApp Image 2026-06-02...jpeg` (Bajo contraste -> Mejora sugerida: clarify).
   - `WhatsApp Image 2026-06-05...jpeg` (Bajo contraste -> Mejora sugerida: clarify).
   - `WhatsApp Image 2026-06-05 (sombras)...jpeg` (Sombras de fondo -> Mejora sugerida: clarify).
