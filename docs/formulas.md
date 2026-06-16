# Formulas y Supuestos del Simulador

## Objetivo

Estimar el costo LLM diario, mensual y por comprobante para un flujo de automatizacion con OCR de comprobantes y validacion conversacional opcional.

## Variables principales

- `daily_volume`: comprobantes procesados por dia.
- `monthly_volume`: `daily_volume * 30`.
- `incidence_rate`: porcentaje de comprobantes que requieren chat de validacion.
- `chat_turns`: turnos promedio de chat por incidencia.

## Tokens OCR

```text
input_ocr_tokens = system_prompt_tokens + user_instruction_tokens + image_tokens
output_ocr_tokens = extracted_json_tokens
```

Costo OCR:

```text
ocr_cost =
  monthly_volume *
  ((input_ocr_tokens * input_price_per_million) / 1_000_000 +
   (output_ocr_tokens * output_price_per_million) / 1_000_000)
```

## Tokens Chat

```text
input_chat_tokens = system_prompt_tokens + memory_tokens + user_message_tokens
output_chat_tokens = assistant_response_tokens
effective_chat_sessions = monthly_volume * incidence_rate
```

Costo chat:

```text
chat_cost =
  effective_chat_sessions *
  chat_turns *
  ((input_chat_tokens * input_price_per_million) / 1_000_000 +
   (output_chat_tokens * output_price_per_million) / 1_000_000)
```

## Costo total

```text
total_monthly_cost = ocr_cost + chat_cost
daily_cost = total_monthly_cost / 30
cost_per_receipt = total_monthly_cost / monthly_volume
```

## Defaults del MVP

- OCR prompt sistema: 350 tokens.
- OCR instruccion usuario: 50 tokens.
- OCR salida JSON: 150 tokens.
- Chat prompt sistema: 250 tokens.
- Chat memoria historica: 150 tokens.
- Chat mensaje usuario: 30 tokens.
- Chat respuesta agente: 45 tokens.
- Incidencias: 15%.
- Turnos de chat: 2.
- Telecom e infraestructura: USD 0 en el calculo principal.
- Caso base de UI: 25 comprobantes por dia, equivalente a 750 por mes.
