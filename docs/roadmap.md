# Roadmap Posterior al MVP

## Sincronizacion de precios

- Implementar adaptadores por proveedor con fuente oficial y parseo estructurado.
- Agregar fallback semantico con grounding cuando el parseo falle.
- Marcar cambios como `pending_review` antes de activar una tarifa en produccion.
- Mostrar diff de tarifas en el dashboard antes de confirmar.

## Tokenizacion real

- Cargar comprobantes anonimizados en ambiente experimental.
- Medir uso real reportado por proveedor cuando exista.
- Guardar diferencia entre estimado y real por proveedor/modelo.
- Ajustar defaults por percentiles, no por un unico promedio.

## WhatsApp y operacion

- Agregar webhook Twilio/WhatsApp separado del simulador financiero.
- Persistir sesiones, incidencias y costos reales por comprobante.
- Incorporar limites de gasto mensual y alertas.
