# ¿Qué hace esta herramienta?
## Guía de Funcionalidades y Casos de Uso

Este proyecto es un **Tokenizador y Simulador de Costos de Modelos de Lenguaje (LLMs)**. Es una herramienta técnica y financiera diseñada para calcular, simular y optimizar los costos de operar aplicaciones de Inteligencia Artificial en producción.

---

## 🎯 ¿Para qué sirve?

Lanzar una aplicación basada en LLMs (como un bot de soporte, un lector de facturas o un buscador RAG) a miles de usuarios puede generar facturas de API impredecibles. Esta herramienta resuelve ese problema al permitirte:
1. **Predecir la factura mensual de IA** antes de escribir código de producción.
2. **Comparar proveedores y modelos** (Google Gemini, OpenAI, Groq, Cerebras, DeepSeek, Anthropic) para ver cuál ofrece la mejor relación costo-beneficio.
3. **Simular arquitecturas RAG** evaluando el impacto financiero de cambiar el tamaño de tus fragmentos de texto (chunks) y el número de documentos recuperados (Top-K).
4. **Evaluar el ahorro por Context Caching (Caché de Contexto)**, identificando si conviene implementar modelos con caché para prompts largos.
5. **Probar la extracción real (OCR)** sobre comprobantes físicos midiendo los tokens exactos consumidos por llamada a la API.

---

## 🛠️ Módulos y Funcionalidades Detalladas

La herramienta está dividida en tres secciones principales:

### 1. Dashboard (Simulador de Costos Operacionales)
Permite modelar un flujo de negocio completo (por ejemplo, procesamiento de comprobantes con un bot de aclaración opcional).
* **Parámetros del Negocio:** Configura el volumen mensual de transacciones, la tasa de incidencia de clientes que abren un chat de soporte (soporte conversacional) y los turnos de diálogo promedio por chat.
* **Conversión de Imagen a Tokens:** Define las dimensiones en píxeles (ancho y alto) de las imágenes promedio para calcular automáticamente cuántos tokens visuales consumirá el modelo OCR.
* **Desglose Financiero Detallado:** Calcula costos mensuales de OCR, costos de chat, costos de telecomunicaciones e infraestructura, costo unitario por comprobante y proyección semanal.
* **Gráficos Comparativos Interactivos:** Visualiza mediante gráficos de barras y líneas el costo total y unitario comparando todos los modelos activos del catálogo.

### 2. Simulador RAG (Retrieval-Augmented Generation)
Diseñado específicamente para optimizar sistemas de búsqueda sobre bases de conocimientos o manuales.
* **Cálculo de Tokens Local (Tiktoken):** Pega tu base documental o System Prompt gigante y calcula al instante cuántos tokens representa para el modelo seleccionado de forma local (sin consumir saldo de API).
* **Carga de Archivos de Texto (.txt):** Sube tus archivos de texto directamente a la interfaz para cargarlos en el simulador.
* **Configuración del Motor Vectorial:** Simula cómo impacta el tamaño del Chunk (en tokens) y el Top-K (cantidad de fragmentos inyectados al prompt por turno) en el costo de cada pregunta.
* **Costo por Turno Comparativo (Normal vs Caché):** Muestra cuánto cuesta procesar una pregunta si el prompt completo se envía desde cero en cada turno, versus el costo optimizado si el prompt se almacena en el caché de contexto del LLM.
* **Proyección Mensual Unificada:** Consolida los costos de extracción del Dashboard con los turnos mensuales de RAG proyectados según el flujo de tu negocio.

### 3. Laboratorio de Comprobantes (Receipt Lab)
Un espacio experimental para interactuar con archivos reales y analizar su costo real de API.
* **Pre-procesamiento OpenCV:**
  * **Enderezado (Deskew):** Detecta la rotación de un ticket escaneado de forma inclinada y lo alinea horizontalmente.
  * **Remoción de Sombras:** Normaliza la iluminación en fotografías de comprobantes arrugados o tomadas con luz irregular para maximizar la tasa de acierto de extracción.
* **Extracción de Datos Real:** Sube un ticket (imagen o PDF) y ejecuta una extracción de campos estructurados (fecha, monto, banco, número de operación, etc.) usando APIs reales de Gemini, Groq, Cerebras, OpenAI o DeepSeek.
* **Perfilado de Tokens Real:** Muestra el JSON devuelto por la IA junto con los tokens exactos de entrada y salida reportados por el proveedor, y el costo monetario real de esa única transacción.
* **Procesamiento en Lote (Batch):** Sube múltiples archivos simultáneamente. La herramienta los procesará secuencialmente, respetando límites de tasa, y calculará los costos promedio reales de la operación completa.

### 4. Configuración y Descubrimiento Dinámico de APIs
* **Gestión de Llaves desde la UI:** Permite ingresar las claves oficiales de API desde la interfaz gráfica, guardándolas de forma enmascarada y persistente en el archivo `.env` del backend.
* **Integración de APIs Compatibles con OpenAI:** Si deseas probar un modelo open-source alojado en servicios como OpenRouter, Together AI, Anyscale, o tu propio servidor local de vLLM/Ollama, puedes agregar un proveedor dinámico definiendo su nombre, Base URL y API Key.
* **Motor de Sincronización (Discovery):** Al hacer clic en "Sincronizar", el backend consulta el endpoint `/v1/models` del proveedor dinámico, detecta qué modelos soportan visión o texto, y los registra automáticamente en tu catálogo local para usarlos en las simulaciones.

---

## 🎯 Casos de Uso Comunes

* **Evaluación de Viabilidad Financiera:** Decidir si un proyecto que lee tickets es rentable comparando el costo de Gemini 2.5 Flash contra Llama 3.2 11B Vision en Groq.
* **Elección de Arquitectura RAG:** Determinar si conviene pagar más por un modelo grande con caché de contexto o usar un modelo mediano sin caché dividiendo el documento en chunks más pequeños.
* **Optimización de Calidad:** Validar si aplicar los filtros OpenCV en imágenes de baja calidad reduce las tasas de reintento de la API (lo cual disminuye costos operativos).
