# API del MVP

Base local: `http://127.0.0.1:8020`.

## Catalogo

- `GET /api/providers`: lista proveedores.
- `POST /api/providers`: crea proveedor.
- `PATCH /api/providers/{provider_id}`: actualiza proveedor o estado activo.
- `GET /api/models`: lista modelos activos.
- `POST /api/models`: crea modelo.
- `PATCH /api/models/{model_id}`: actualiza tarifas, tokens de imagen o estado activo.

Los cambios manuales en `input_price_per_million`, `output_price_per_million` e `image_token_cost` generan registros en `GET /api/price-change-logs`.

## Estimacion

`POST /api/cost-estimates`

```json
{
  "monthly_volume": 750,
  "incidence_rate": 0.15,
  "chat_turns": 2,
  "telecom_cost_per_session": 0,
  "infrastructure_monthly_cost": 0,
  "ocr_model_id": 1,
  "chat_model_id": 4
}
```

Devuelve:

- modelos usados para OCR y chat;
- tokens estimados por transaccion;
- costos de OCR, chat e IA total;
- total mensual y costo por comprobante.

## Escenarios

- `GET /api/scenarios`: lista escenarios guardados.
- `POST /api/scenarios`: crea escenario.
- `PATCH /api/scenarios/{scenario_id}`: actualiza escenario.

## Sincronizacion

- `GET /api/price-sync-logs`: bitacora de sincronizacion.
- `POST /api/price-sync/run`: descarga paginas oficiales de Google AI, Groq y OpenAI, intenta extraer precios por modelo y registra resultado.

La sincronizacion actual nunca inventa precios: si un modelo no aparece en la pagina oficial, queda marcado como `partial` en la bitacora. Cada cambio de precio genera un registro en `GET /api/price-change-logs`.

Las tarifas se guardan en USD por millon de tokens. El dashboard ejecuta esta sincronizacion en segundo plano al ingresar y refresca catalogo, bitacora y estimacion al terminar, sin bloquear la carga inicial.

## Laboratorio de comprobantes

`POST /api/receipt-lab/analyze`

Recibe `multipart/form-data`:

- `file`: imagen PNG, JPG o WebP del comprobante.
- `model_id`: modelo OCR/vision.
- `daily_volume`: comprobantes por dia.
- `fields_json`: lista JSON opcional de campos esperados.
- `sections_json`: lista JSON opcional de secciones a considerar.

Devuelve dimensiones de imagen, secciones estimadas por layout, tokens de imagen/prompt/salida y costo por comprobante, dia y mes.

`POST /api/receipt-lab/enhance`

Recibe `multipart/form-data`:

- `file`: imagen PNG, JPG o WebP del comprobante.
- `mode`: `auto`, `clarify` o `threshold`.

Devuelve una imagen PNG mejorada en base64, contraste/nitidez antes y despues, y operaciones OpenCV aplicadas. Este paso sirve para evaluar legibilidad y preparar comprobantes borrosos antes de sumar OCR real o consultas conversacionales.

`POST /api/receipt-lab/extract`

Recibe `multipart/form-data`:

- `file`: imagen PNG, JPG o WebP del comprobante.
- `model_id`: modelo OCR/vision Gemini.
- `fields_json`: lista JSON opcional de campos esperados.
- `sections_json`: lista JSON opcional de secciones a considerar.
- `enhance`: `true` o `false` para aplicar OpenCV antes de enviar al LLM.
- `enhancement_mode`: `auto`, `clarify` o `threshold`.

Requiere `GEMINI_API_KEY` en `backend/.env`. Devuelve JSON extraido por Gemini, texto crudo, tokens reales reportados por el proveedor y costo real de esa ejecucion segun la tarifa del modelo seleccionado. Por ahora el OCR real esta habilitado solo para modelos Google AI/Gemini.
