# Tokenizador y Simulador de Costos de LLMs para RAG y Procesamiento de Comprobantes

Un simulador financiero y técnico integral de nivel profesional diseñado para estimar, comparar y proyectar costos operativos de Modelos de Lenguaje (LLMs) en entornos de producción. Especialmente optimizado para flujos de procesamiento multimodal de comprobantes (OCR/Extracción) y arquitecturas de Generación Aumentada por Recuperación (RAG).

Esta herramienta permite a desarrolladores, arquitectos de software y equipos de FinOps mitigar la imprevisibilidad de las facturas de API, evaluando el impacto financiero de parámetros clave antes del despliegue.

---

## 🎯 Secciones y Funcionalidades Clave

### 1. Dashboard de Costos Operacionales (Simulador de Negocio)
Modelado de flujos transaccionales completos para predecir costos de flujos híbridos (automatización + atención conversacional):
* **Parámetros del Negocio:** Configuración del volumen mensual de transacciones, tasa de incidencia de soporte y turnos de diálogo por chat.
* **Conversión de Imagen a Tokens:** Algoritmo de cálculo automático de tokens visuales consumidos en modelos OCR basados en las dimensiones de píxeles (ancho y alto).
* **Desglose Financiero Detallado:** Proyecciones semanales/mensuales automatizadas que incluyen costos de OCR, costos de chat, infraestructura de telecomunicaciones y costo unitario por comprobante procesado.
* **Gráficos Comparativos Interactivos:** Visualizaciones de barras y líneas para contrastar la rentabilidad del catálogo de modelos activos.

### 2. Simulador de Arquitecturas RAG (Retrieval-Augmented Generation)
Entorno de optimización matemática para sistemas de búsqueda sobre bases de conocimiento:
* **Cálculo de Tokens Local:** Análisis instantáneo de bases documentales y System Prompts masivos sin consumo de API (utilizando Tiktoken).
* **Configuración de Motores Vectoriales:** Simulación del impacto en costos basado en el tamaño del Chunk (fragmento de texto) y el Top-K (cantidad de fragmentos inyectados por consulta).
* **Análisis de Context Caching:** Comparativa del costo por turno tradicional vs. costo optimizado mediante caché de contexto (ej. Gemini, Anthropic), permitiendo estimar ahorros de hasta un 90%.
* **Proyección Unificada:** Consolidación automática de los costos de extracción del negocio con las consultas mensuales estimadas en la base vectorial.

### 3. Laboratorio de Comprobantes (Receipt Lab)
Espacio experimental para interactuar con datos reales y auditar métricas exactas:
* **Pre-procesamiento Avanzado (OpenCV):**
  * **Enderezado (Deskew):** Corrección geométrica automática de rotación en capturas inclinadas.
  * **Remoción de Sombras:** Normalización de iluminación irregular en fotografías de comprobantes arrugados para elevar la tasa de acierto (Accuracy) del LLM.
* **Extracción Estructurada Real:** Conexión vía API con proveedores líderes (Google Gemini, OpenAI, Groq, Cerebras, DeepSeek) para la devolución de esquemas JSON estructurados (monto, fechas, metadatos).
* **Perfilado de Tokens en Tiempo Real:** Visualización del consumo exacto de tokens de entrada y salida reportados por los proveedores, calculando el costo monetario real por transacción única.
* **Procesamiento en Lotes (Batch Processing):** Carga simultánea de múltiples archivos con procesamiento secuencial controlado para respetar los límites de tasa (Rate Limits) de cada API.

### 4. Configuración y Descubrimiento Dinámico de APIs
* **Gestión Segura desde la UI:** Entrada y actualización de API Keys de forma enmascarada con persistencia segura en el archivo `.env` del backend.
* **Proveedores Dinámicos personalizados:** Capacidad de registrar cualquier infraestructura Open Source local o remota (Ollama, vLLM, OpenRouter, Together AI) especificando su Base URL compatible con la especificación de OpenAI.
* **Motor de Sincronización (Discovery):** Descubrimiento automático de capacidades del modelo (Visión o Texto) mediante llamadas al endpoint `/v1/models`.
* **Sincronización de Precios Oficiales:** Mecanismo de scraping web integrado para actualizar las tarifas vigentes por millón de tokens directamente de los canales oficiales.

---

## 📁 Arquitectura del Proyecto

```text
├── backend/
│   ├── app/                # Core de la API en FastAPI
│   │   ├── api.py          # Endpoints y ruteo REST
│   │   ├── config.py       # Gestión de configuraciones y variables locales
│   │   ├── main.py         # Punto de entrada de la aplicación
│   │   ├── models.py       # Modelos relacionales (SQLAlchemy)
│   │   ├── schemas.py      # Esquemas de validación y tipado (Pydantic)
│   │   └── services/       # Capa de servicios (OpenCV, RAG, Sincronización, OCR)
│   ├── alembic/            # Control de versiones de Base de Datos
│   ├── requirements.txt    # Dependencias de Python
│   └── .env.example        # Plantilla del entorno de Backend
│
├── frontend/
│   ├── src/
│   │   ├── app/            # Enrutamiento y Layouts de Next.js 15 (App Router)
│   │   ├── components/     # Componentes de UI modulares y reactivos
│   │   └── lib/            # Clientes HTTP y utilidades globales
│   ├── package.json        # Manifiesto de dependencias de Node.js
│   └── .env.example        # Plantilla del entorno de Frontend
│
├── docs/                   # Fórmulas de referencia y supuestos financieros
└── scripts/                # Automatizaciones y scripts de control de procesos
```

---

## 🛠️ Guía de Instalación y Despliegue Local

Sigue estos pasos detallados para configurar la suite en tu entorno de desarrollo.

### 📋 Requisitos Previos
* **Python** versión 3.10 o superior.
* **Node.js** versión 18 o superior con su respectivo gestor de paquetes (**npm**).
* **Git** para el control de versiones.

---

### 1️⃣ Paso 1: Clonar el Repositorio

```bash
git clone <url-del-repositorio>
cd <nombre-de-la-carpeta-raíz>
```

---

### 2️⃣ Paso 2: Configuración del Backend (FastAPI)

1. Navega al directorio del backend:
   ```bash
   cd backend
   ```

2. Inicializa y activa tu entorno virtual:
   * **En Windows (PowerShell):**
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   * **En Linux / macOS:**
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Instala los paquetes requeridos:
   ```bash
   pip install -r requirements.txt
   ```

4. Configura las variables de entorno del Backend copiando la plantilla base:
   * **En Linux/macOS:**
     ```bash
     cp .env.example .env
     ```
   * **En Windows (PowerShell):**
     ```powershell
     Copy-Item .env.example .env
     ```
   * *Nota: Puedes configurar tus credenciales de API directamente en el archivo `.env` o dejarlas en blanco y cargarlas dinámicamente desde la interfaz web más adelante.*

5. Ejecuta las semillas (Seed) de la Base de Datos para inicializar el catálogo de precios y modelos de referencia:
   ```bash
   python -m app.db.seed
   ```

6. Inicializa el servidor de desarrollo con Uvicorn:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8020 --reload
   ```
   *El servidor backend quedará disponible en `http://127.0.0.1:8020`. Puedes auditar la documentación Swagger de la API en `http://127.0.0.1:8020/docs`.*

---

### 3️⃣ Paso 3: Configuración del Frontend (Next.js)

1. Abre una nueva terminal, posiciónate en la raíz del proyecto y navega al frontend:
   ```bash
   cd frontend
   ```

2. Instala los módulos de Node.js:
   ```bash
   npm install
   ```

3. Configura el entorno local del frontend:
   * **En Linux/macOS:**
     ```bash
     cp .env.example .env.local
     ```
   * **En Windows (PowerShell):**
     ```powershell
     Copy-Item .env.example .env.local
     ```
   * *Verifica que la variable `NEXT_PUBLIC_API_BASE_URL` apunte correctamente al puerto asignado al Backend (`http://127.0.0.1:8020`).*

4. Despliega la interfaz web en modo desarrollo:
   ```bash
   npm run dev
   ```
   *Abre tu navegador e ingresa a `http://localhost:3000` para interactuar con la aplicación.*

---

### ⚙️ Control de Procesos y Limpieza

Si necesitas liberar los puertos (`8020` o `3000`) ocupados por ejecuciones huérfanas en segundo plano, puedes ejecutar el script utilitario automatizado:

* **En Windows (PowerShell):**
  ```powershell
  .\scripts\stop-dev.ps1
  ```

---

## 👤 Autor

Desarrollado y mantenido por **Jonatan Gutierrez**.  
📧 Contacto: [Jonatangr67@gmail.com](mailto:Jonatangr67@gmail.com)

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Siéntete libre de clonarlo, modificarlo y adaptarlo a tus necesidades.
