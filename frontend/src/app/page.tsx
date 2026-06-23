/**
 * Tokenizer & Cost Dashboard Main Page
 * Autor: Jonatan Gutierrez (JG)
 */

"use client";

import {
  Activity,
  Bot,
  Calculator,
  Database,
  Download,
  FileSearch,
  FileText,
  ListChecks,
  MessageCircle,
  RefreshCw,
  Save,
  Server,
  Upload,
  WalletCards,
  Zap,
  Settings
} from "lucide-react";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

const LazyBarChart = dynamic(
  () => import("recharts").then((m) => ({ default: m.BarChart })),
  { ssr: false }
);
const LazyLineChart = dynamic(
  () => import("recharts").then((m) => ({ default: m.LineChart })),
  { ssr: false }
);
const LazyResponsiveContainer = dynamic(
  () => import("recharts").then((m) => ({ default: m.ResponsiveContainer })),
  { ssr: false }
);

import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  analyzeReceipt,
  createEstimate,
  enhanceReceipt,
  extractReceipt,
  generateCostReport,
  getModels,
  getPriceSyncLogs,
  getScenarios,
  runPriceSync
} from "@/lib/api";
import { compactNumber, currency, percent } from "@/lib/format";
import { useReceiptHistory } from "@/lib/receipt-history";
import { SettingsModal } from "../components/SettingsModal";
import { RagSimulator } from "../components/RagSimulator";
import {
  downloadHistoryCSV,
  downloadHistoryPDF,
  downloadReportCSV,
  downloadReportPDF
} from "@/lib/report-generator";
import type {
  AiModel,
  CostComparisonReport,
  EstimateRequest,
  EstimateResponse,
  PriceSyncLog,
  ProcessedReceipt,
  ReceiptAnalysisResponse,
  ReceiptEnhancementResponse,
  ReceiptExtractionResponse,
  Scenario
} from "@/lib/types";

const DEFAULTS: EstimateRequest = {
  monthly_volume: 750,
  incidence_rate: 0.15,
  chat_turns: 2,
  telecom_cost_per_session: 0,
  infrastructure_monthly_cost: 0,
  ocr_model_id: 0,
  chat_model_id: 0,
  safety_margin: 0.0,
  tokens: {
    ocr_image_width: 1080,
    ocr_image_height: 1920
  }
};

const DAYS_PER_MONTH = 30;

const RESOLUTION_PROFILES = [
  { id: "low", label: "Baja (384x384 - 258 tks)", w: 384, h: 384 },
  { id: "medium", label: "Media (768x768 - 258 tks)", w: 768, h: 768 },
  { id: "high", label: "Alta/Celular (1080x1920 - 1548 tks)", w: 1080, h: 1920 },
  { id: "custom", label: "Personalizada...", w: 0, h: 0 }
];
const BAR_COLORS = ["#0f766e", "#d65f45", "#b98900", "#425466", "#7c3aed"];
const RECEIPT_FIELDS = [
  "fecha",
  "monto",
  "moneda",
  "banco",
  "numero_operacion",
  "titular_origen",
  "titular_destino"
].join("\n");
const SECTION_OPTIONS = [
  { id: "encabezado", label: "Encabezado" },
  { id: "operacion", label: "Operacion" },
  { id: "importe", label: "Importe" },
  { id: "contrapartes", label: "Contrapartes" },
  { id: "pie", label: "Pie" }
];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function generateUUID() {
  if (typeof window !== "undefined" && typeof window.crypto !== "undefined" && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "rag">("dashboard");
  const [models, setModels] = useState<AiModel[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [logs, setLogs] = useState<PriceSyncLog[]>([]);
  const [form, setForm] = useState<EstimateRequest>(DEFAULTS);
  
  const [resolutionProfile, setResolutionProfile] = useState<string>("high");
  const [customWidth, setCustomWidth] = useState<number>(1080);
  const [customHeight, setCustomHeight] = useState<number>(1920);
  const [opencvDeskew, setOpencvDeskew] = useState<boolean>(true);
  const [opencvRemoveShadows, setOpencvRemoveShadows] = useState<boolean>(true);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [comparisons, setComparisons] = useState<EstimateResponse[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFields, setReceiptFields] = useState(RECEIPT_FIELDS);
  const [receiptSections, setReceiptSections] = useState(
    SECTION_OPTIONS.map((section) => section.id)
  );
  const [receiptAnalysis, setReceiptAnalysis] =
    useState<ReceiptAnalysisResponse | null>(null);
  const [receiptEnhancement, setReceiptEnhancement] =
    useState<ReceiptEnhancementResponse | null>(null);
  const [receiptExtraction, setReceiptExtraction] =
    useState<ReceiptExtractionResponse | null>(null);
  const [enhancementMode, setEnhancementMode] =
    useState<"auto" | "clarify" | "threshold">("auto");
  const [extractWithEnhancement, setExtractWithEnhancement] = useState(true);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [enhancementError, setEnhancementError] = useState<string | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isAnalyzingReceipt, setIsAnalyzingReceipt] = useState(false);
  const [isEnhancingReceipt, setIsEnhancingReceipt] = useState(false);
  const [isExtractingReceipt, setIsExtractingReceipt] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<
    "idle" | "analyzing" | "enhancing" | "extracting" | "done"
  >("idle");
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [costReport, setCostReport] = useState<CostComparisonReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const { receipts: historyReceipts, addReceipt: addToHistory, removeReceipt: removeFromHistory, clearHistory } = useReceiptHistory();
  const [syncMode, setSyncMode] = useState<"idle" | "auto" | "manual">("idle");
  const [estimateRefreshKey, setEstimateRefreshKey] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const syncScheduled = useRef(false);

  const visionModels = useMemo(
    () => models.filter((model) => model.is_vision),
    [models]
  );
  const chatModels = useMemo(
    () => models.filter((model) => !model.is_vision),
    [models]
  );

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [loadedModels, loadedScenarios, loadedLogs] = await Promise.all([
          getModels(),
          getScenarios(),
          getPriceSyncLogs()
        ]);
        const firstVision = loadedModels.find((model) => model.is_vision);
        const firstChat = loadedModels.find((model) => !model.is_vision);
        if (!firstVision || !firstChat) {
          throw new Error("Catalogo incompleto: faltan modelos OCR o chat.");
        }

        setModels(loadedModels);
        setScenarios(loadedScenarios);
        setLogs(loadedLogs);
        setForm((current) => ({
          ...current,
          ocr_model_id: firstVision.id,
          chat_model_id: firstChat.id
        }));
        setStatus("ready");


      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la API.");
        setStatus("error");
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    if (!form.ocr_model_id || !form.chat_model_id) {
      return;
    }

    async function calculate() {
      try {
        const nextEstimate = await createEstimate(form);
        setEstimate(nextEstimate);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo calcular.");
      }
    }

    calculate();
  }, [form, estimateRefreshKey]);

  // Debounce form changes so comparisons don't fire N parallel API calls per keystroke
  const debouncedForm = useDebounce(form, 350);

  useEffect(() => {
    if (!debouncedForm.chat_model_id || visionModels.length === 0) {
      return;
    }

    let cancelled = false;

    async function calculateComparisons() {
      try {
        const results = await Promise.all(
          visionModels.map((model) =>
            createEstimate({
              ...debouncedForm,
              ocr_model_id: model.id
            })
          )
        );
        if (!cancelled) setComparisons(results);
      } catch {
        if (!cancelled) setComparisons([]);
      }
    }

    calculateComparisons();
    return () => { cancelled = true; };
  }, [debouncedForm, visionModels]);

  function updateNumber(key: keyof EstimateRequest, value: string) {
    const parsed = Number(value);
    setForm((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : current[key]
    }));
  }

  function updateDailyReceipts(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    setForm((current) => ({
      ...current,
      monthly_volume: Math.max(1, Math.round(parsed * DAYS_PER_MONTH))
    }));
  }

  function applyScenario(scenario: Scenario) {
    setForm((current) => ({
      ...current,
      monthly_volume: scenario.monthly_volume,
      incidence_rate: scenario.incidence_rate,
      chat_turns: scenario.chat_turns,
      telecom_cost_per_session: scenario.telecom_cost_per_session,
      infrastructure_monthly_cost: scenario.infrastructure_monthly_cost,
      ocr_model_id: scenario.ocr_model_id ?? current.ocr_model_id,
      chat_model_id: scenario.chat_model_id ?? current.chat_model_id
    }));
  }

  async function runReceiptAnalysis() {
    if (!receiptFile || !form.ocr_model_id) {
      setReceiptError("Selecciona un comprobante y un modelo OCR.");
      return;
    }
    setIsAnalyzingReceipt(true);
    setReceiptError(null);
    try {
      const fields = receiptFields
        .split(/\r?\n|,/)
        .map((field) => field.trim())
        .filter(Boolean);
      const result = await analyzeReceipt({
        file: receiptFile,
        modelId: form.ocr_model_id,
        dailyVolume: dailyReceipts,
        fields,
        sections: receiptSections
      });
      setReceiptAnalysis(result);
      if (result.quality_analysis) {
        if (result.quality_analysis.requires_enhancement) {
          setExtractWithEnhancement(true);
          if (["auto", "clarify", "threshold"].includes(result.quality_analysis.suggested_mode)) {
            setEnhancementMode(result.quality_analysis.suggested_mode as "auto" | "clarify" | "threshold");
          }
        } else {
          setExtractWithEnhancement(false);
        }
      }
    } catch (err) {
      setReceiptError(
        err instanceof Error ? err.message : "No se pudo analizar el comprobante."
      );
    } finally {
      setIsAnalyzingReceipt(false);
    }
  }

  async function runReceiptEnhancement() {
    if (!receiptFile) {
      setEnhancementError("Selecciona una imagen para mejorar.");
      return;
    }
    setIsEnhancingReceipt(true);
    setEnhancementError(null);
    try {
      const result = await enhanceReceipt({
        file: receiptFile,
        mode: enhancementMode,
        deskew: opencvDeskew,
        remove_shadows: opencvRemoveShadows
      });
      setReceiptEnhancement(result);
    } catch (err) {
      setEnhancementError(
        err instanceof Error ? err.message : "No se pudo mejorar la imagen."
      );
    } finally {
      setIsEnhancingReceipt(false);
    }
  }

  async function runReceiptExtraction() {
    if (!receiptFile || !form.ocr_model_id) {
      setExtractionError("Selecciona una imagen y un modelo OCR Gemini.");
      return;
    }
    setIsExtractingReceipt(true);
    setExtractionError(null);
    try {
      const fields = receiptFields
        .split(/\r?\n|,/)
        .map((field) => field.trim())
        .filter(Boolean);
      const result = await extractReceipt({
        file: receiptFile,
        modelId: form.ocr_model_id,
        fields,
        sections: receiptSections,
        enhance: extractWithEnhancement,
        enhancementMode,
        deskew: opencvDeskew,
        remove_shadows: opencvRemoveShadows
      });
      setReceiptExtraction(result);
    } catch (err) {
      setExtractionError(
        err instanceof Error ? err.message : "No se pudo extraer con Gemini."
      );
    } finally {
      setIsExtractingReceipt(false);
    }
  }

  async function runFullPipeline() {
    if (!receiptFile || !form.ocr_model_id) {
      setPipelineError("Selecciona un comprobante y un modelo OCR Gemini.");
      return;
    }
    if (!canExtractWithApi) {
      setPipelineError("Selecciona un modelo OCR de Google AI o Groq para el pipeline completo.");
      return;
    }

    setPipelineError(null);
    setReceiptAnalysis(null);
    setReceiptEnhancement(null);
    setReceiptExtraction(null);

    // --- Step 1: Analyze ---
    setPipelineStep("analyzing");
    let analysisResult: ReceiptAnalysisResponse;
    try {
      const fields = receiptFields
        .split(/\r?\n|,/)
        .map((f) => f.trim())
        .filter(Boolean);
      analysisResult = await analyzeReceipt({
        file: receiptFile,
        modelId: form.ocr_model_id,
        dailyVolume: dailyReceipts,
        fields,
        sections: receiptSections
      });
      setReceiptAnalysis(analysisResult);
    } catch (err) {
      setPipelineError(
        err instanceof Error ? err.message : "Error al analizar el comprobante."
      );
      setPipelineStep("idle");
      return;
    }

    // Decide enhancement settings from quality analysis
    const qa = analysisResult.quality_analysis;
    let shouldEnhance = false;
    let effectiveMode: "auto" | "clarify" | "threshold" = "auto";
    if (qa) {
      shouldEnhance = qa.requires_enhancement;
      if (shouldEnhance && ["auto", "clarify", "threshold"].includes(qa.suggested_mode)) {
        effectiveMode = qa.suggested_mode as "auto" | "clarify" | "threshold";
      }
      setExtractWithEnhancement(shouldEnhance);
      if (shouldEnhance) {
        setEnhancementMode(effectiveMode);
      }
    }

    // --- Step 2: Enhance (visual preview, only if needed) ---
    if (shouldEnhance) {
      setPipelineStep("enhancing");
      try {
        const enhanceResult = await enhanceReceipt({
          file: receiptFile,
          mode: effectiveMode,
          deskew: opencvDeskew,
          remove_shadows: opencvRemoveShadows
        });
        setReceiptEnhancement(enhanceResult);
      } catch {
        // Non-fatal: we still continue with the extraction
        // The backend will also try to enhance internally
      }
    }

    // --- Step 3: Extract with Gemini ---
    setPipelineStep("extracting");
    try {
      const fields = receiptFields
        .split(/\r?\n|,/)
        .map((f) => f.trim())
        .filter(Boolean);
      const extractResult = await extractReceipt({
        file: receiptFile,
        modelId: form.ocr_model_id,
        fields,
        sections: receiptSections,
        enhance: shouldEnhance,
        enhancementMode: effectiveMode,
        deskew: opencvDeskew,
        remove_shadows: opencvRemoveShadows
      });
      setReceiptExtraction(extractResult);
    } catch (err) {
      setPipelineError(
        err instanceof Error ? err.message : "Error al extraer con Gemini."
      );
      setPipelineStep("idle");
      return;
    }

    setPipelineStep("done");
    // Reset to idle after a moment so the button is reusable
    setTimeout(() => setPipelineStep("idle"), 3000);
  }

  async function runBatchPipeline() {
    const filesToProcess = batchFiles.length > 0 ? batchFiles : (receiptFile ? [receiptFile] : []);
    if (filesToProcess.length === 0 || !form.ocr_model_id) {
      setPipelineError("Selecciona comprobantes y un modelo OCR Gemini.");
      return;
    }
    if (!canExtractWithApi) {
      setPipelineError("Selecciona un modelo de Google AI o Groq para el proceso por lote.");
      return;
    }

    setIsBatchProcessing(true);
    setPipelineError(null);

    const fields = receiptFields
      .split(/\r?\n|,/)
      .map((f) => f.trim())
      .filter(Boolean);

    for (let idx = 0; idx < filesToProcess.length; idx++) {
      const file = filesToProcess[idx];
      setBatchProgress({ current: idx + 1, total: filesToProcess.length, filename: file.name });

      try {
        // Step 1: Analyze
        setPipelineStep("analyzing");
        const analysisResult = await analyzeReceipt({
          file,
          modelId: form.ocr_model_id,
          dailyVolume: dailyReceipts,
          fields,
          sections: receiptSections
        });

        // Show last file results in the UI
        setReceiptFile(file);
        setReceiptAnalysis(analysisResult);

        // Decide enhancement
        const qa = analysisResult.quality_analysis;
        let shouldEnhance = false;
        let effectiveMode: "auto" | "clarify" | "threshold" = "auto";
        if (qa) {
          shouldEnhance = qa.requires_enhancement;
          if (shouldEnhance && ["auto", "clarify", "threshold"].includes(qa.suggested_mode)) {
            effectiveMode = qa.suggested_mode as "auto" | "clarify" | "threshold";
          }
        }

        // Step 2: Enhance (if needed)
        if (shouldEnhance) {
          setPipelineStep("enhancing");
          try {
            const enhanceResult = await enhanceReceipt({
              file,
              mode: effectiveMode,
              deskew: opencvDeskew,
              remove_shadows: opencvRemoveShadows
            });
            setReceiptEnhancement(enhanceResult);
          } catch {
            // Non-fatal
          }
        }

        // Step 3: Extract
        setPipelineStep("extracting");
        let extractResult: ReceiptExtractionResponse | null = null;
        let rateLimited = false;
        let errorMsg = undefined;
        try {
          extractResult = await extractReceipt({
            file,
            modelId: form.ocr_model_id,
            fields,
            sections: receiptSections,
            enhance: shouldEnhance,
            enhancementMode: effectiveMode,
            deskew: opencvDeskew,
            remove_shadows: opencvRemoveShadows
          });
          setReceiptExtraction(extractResult);
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes("429") || errorMsg.toLowerCase().includes("quota")) {
            rateLimited = true;
          }
        }

        // Auto-save to history
        const selectedModel = models.find((m) => m.id === form.ocr_model_id);
        const entry: ProcessedReceipt = {
          id: generateUUID(),
          filename: file.name,
          processedAt: new Date().toISOString(),
          modelName: selectedModel?.display_name ?? analysisResult.model_name,
          provider: selectedModel?.provider?.name ?? "—",
          image: analysisResult.image,
          qualityRequiresEnhancement: qa?.requires_enhancement ?? false,
          wasEnhanced: extractResult?.enhanced ?? false,
          estimatedCost: analysisResult.costs.cost_per_receipt,
          estimatedTokens: {
            input: analysisResult.tokens.input_tokens,
            output: analysisResult.tokens.output_tokens,
            total: analysisResult.tokens.total_tokens
          },
          ...(extractResult ? {
            realCost: extractResult.cost.cost_per_receipt,
            realTokens: {
              input: extractResult.usage.prompt_tokens,
              output: extractResult.usage.output_tokens,
              total: extractResult.usage.total_tokens
            },
            extractedData: extractResult.extracted ?? undefined
          } : {}),
          rateLimited,
          error: errorMsg
        };
        addToHistory(entry);

        // Rate limit delay between files (4s) if not the last file
        if (idx < filesToProcess.length - 1) {
          await new Promise(r => setTimeout(r, 4000));
        }

      } catch (err) {
        // Log error but continue with next file
        console.error(`Error processing ${file.name}:`, err);
      }
    }

    setPipelineStep("done");
    setBatchProgress(null);
    setBatchFiles([]);
    setIsBatchProcessing(false);
    setTimeout(() => setPipelineStep("idle"), 3000);
  }

  async function runReportGeneration() {
    if (!receiptFile) {
      setReportError("Primero sube un comprobante para generar el informe.");
      return;
    }
    setIsGeneratingReport(true);
    setReportError(null);
    setCostReport(null);
    try {
      const fields = receiptFields
        .split(/\r?\n|,/)
        .map((f) => f.trim())
        .filter(Boolean);
      const result = await generateCostReport({
        file: receiptFile,
        dailyVolume: dailyReceipts,
        fields,
        sections: receiptSections
      });
      setCostReport(result);
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : "No se pudo generar el informe."
      );
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function syncOfficialPrices(mode: "auto" | "manual" = "manual") {
    setSyncMode(mode);
    if (mode === "manual") {
      setError(null);
    }
    try {
      await runPriceSync();
      const [loadedModels, loadedLogs] = await Promise.all([
        getModels(),
        getPriceSyncLogs()
      ]);
      setModels(loadedModels);
      setLogs(loadedLogs);
      setEstimateRefreshKey((current) => current + 1);
    } catch (err) {
      if (mode === "manual") {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo sincronizar precios oficiales."
        );
      }
    } finally {
      setSyncMode("idle");
    }
  }

  function toggleReceiptSection(sectionId: string) {
    setReceiptSections((current) =>
      current.includes(sectionId)
        ? current.filter((item) => item !== sectionId)
        : [...current, sectionId]
    );
  }

  const breakdownData = estimate
    ? [
        { name: "OCR", value: estimate.costs.ocr_cost },
        { name: "Chat", value: estimate.costs.chat_cost }
      ]
    : [];

  const dailyReceipts = Math.round(form.monthly_volume / DAYS_PER_MONTH);
  const dailyCost = estimate
    ? estimate.costs.total_monthly_cost / DAYS_PER_MONTH
    : 0;
  const weeklyCost = estimate
    ? estimate.costs.weekly_cost
    : 0;
  const selectedOcrModel = models.find((model) => model.id === form.ocr_model_id);
  const canExtractWithApi = ["Google AI", "Groq", "OpenAI", "Cerebras", "DeepSeek"].includes(
    selectedOcrModel?.provider.name ?? ""
  );

  const comparisonData = comparisons.map((item) => ({
    name: item.ocr_model.display_name,
    total: item.costs.total_monthly_cost,
    unit: item.costs.cost_per_receipt
  }));

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Tokenizador
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              calcula el costo de uso de LLM's
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-700">
              <Activity className="h-4 w-4 text-teal" />
              {status === "ready" ? "API conectada" : status === "loading" ? "Cargando" : "Sin conexion"}
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Settings className="h-4 w-4 text-indigo-500" />
            </button>
          </div>
        </div>
      </header>
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        onModelsSynced={() => window.location.reload()} 
      />

      <div className="mx-auto max-w-7xl px-5 py-5">
        <div className="mb-5 flex gap-2 border-b border-line">
          <button
            className={`focus-ring flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === "dashboard"
                ? "border-teal text-ink"
                : "border-transparent text-slate-600 hover:text-ink"
            }`}
            type="button"
            onClick={() => setActiveTab("dashboard")}
          >
            <Calculator className="h-4 w-4" />
            Dashboard
          </button>
          <button
            className={`focus-ring flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === "rag"
                ? "border-teal text-ink"
                : "border-transparent text-slate-600 hover:text-ink"
            }`}
            type="button"
            onClick={() => setActiveTab("rag")}
          >
            <Database className="h-4 w-4" />
            Simulador RAG
          </button>
        </div>
        {activeTab === "rag" ? (
          <RagSimulator 
            models={models} 
            monthlyVolume={form.monthly_volume}
            incidenceRate={form.incidence_rate}
            chatTurns={form.chat_turns}
            ocrCost={estimate?.costs.ocr_cost ?? 0}
            ocrModelName={models.find((m) => m.id === form.ocr_model_id)?.display_name ?? ""}
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-teal" />
              <h2 className="text-base font-semibold">Parametros</h2>
            </div>

            <div className="space-y-4">
              <NumberField
                label="Comprobantes por dia"
                value={dailyReceipts}
                min={1}
                step={1}
                onChange={updateDailyReceipts}
              />
              <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-700">
                Equivale a {compactNumber(form.monthly_volume)} comprobantes por mes.
              </div>
              <RangeField
                label="Incidencias"
                value={form.incidence_rate}
                min={0}
                max={0.6}
                step={0.01}
                display={percent(form.incidence_rate)}
                onChange={(value) => updateNumber("incidence_rate", value)}
              />
              <NumberField
                label="Respuestas chat por incidencia"
                value={form.chat_turns}
                min={0}
                step={0.5}
                onChange={(value) => updateNumber("chat_turns", value)}
              />
              <RangeField
                label="Margen de seguridad"
                value={form.safety_margin ?? 0}
                min={0}
                max={1.0}
                step={0.05}
                display={percent(form.safety_margin ?? 0)}
                onChange={(value) => updateNumber("safety_margin", value)}
              />
              <div className="space-y-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Resolucion OCR Promedio</span>
                  <select
                    className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                    value={resolutionProfile}
                    onChange={(event) => {
                      const profileId = event.target.value;
                      setResolutionProfile(profileId);
                      const profile = RESOLUTION_PROFILES.find((p) => p.id === profileId);
                      if (profile && profile.id !== "custom") {
                        setCustomWidth(profile.w);
                        setCustomHeight(profile.h);
                        setForm((current) => ({
                          ...current,
                          tokens: {
                            ocr_image_width: profile.w,
                            ocr_image_height: profile.h
                          }
                        }));
                      }
                    }}
                  >
                    {RESOLUTION_PROFILES.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </label>
                {resolutionProfile === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-slate-600">Ancho (px)</span>
                      <input
                        className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                        type="number"
                        min={0}
                        value={customWidth}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          setCustomWidth(w);
                          setForm((current) => ({
                            ...current,
                            tokens: {
                              ...current.tokens,
                              ocr_image_width: w
                            }
                          }));
                        }}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs text-slate-600">Alto (px)</span>
                      <input
                        className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                        type="number"
                        min={0}
                        value={customHeight}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          setCustomHeight(h);
                          setForm((current) => ({
                            ...current,
                            tokens: {
                              ...current.tokens,
                              ocr_image_height: h
                            }
                          }));
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Bot className="h-5 w-5 text-coral" />
              <h2 className="text-base font-semibold">Modelos</h2>
            </div>
            <SelectField
              label="OCR"
              value={form.ocr_model_id}
              options={visionModels}
              onChange={(value) => updateNumber("ocr_model_id", value)}
            />
            <div className="mt-4">
              <SelectField
                label="Chat"
                value={form.chat_model_id}
                options={chatModels}
                onChange={(value) => updateNumber("chat_model_id", value)}
              />
            </div>
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Save className="h-5 w-5 text-gold" />
              <h2 className="text-base font-semibold">Escenarios</h2>
            </div>
            <div className="grid gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  className="focus-ring rounded-md border border-line px-3 py-2 text-left text-sm transition hover:border-teal hover:bg-panel"
                  type="button"
                  onClick={() => applyScenario(scenario)}
                >
                  <span className="block font-medium text-ink">{scenario.name}</span>
                  <span className="text-slate-600">
                    {compactNumber(scenario.monthly_volume / DAYS_PER_MONTH)}/dia |{" "}
                    {percent(scenario.incidence_rate)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="space-y-5">
          {error ? (
            <div className="rounded-md border border-coral bg-white p-4 text-sm text-coral">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-5">
            <Metric
              icon={<WalletCards className="h-5 w-5" />}
              label="Costo diario"
              value={estimate ? currency(dailyCost, 4) : "--"}
            />
            <Metric
              icon={<Activity className="h-5 w-5" />}
              label="Costo semanal"
              value={estimate ? currency(weeklyCost, 4) : "--"}
            />
            <Metric
              icon={<MessageCircle className="h-5 w-5" />}
              label="Costo mensual"
              value={estimate ? currency(estimate.costs.total_monthly_cost, 4) : "--"}
            />
            <Metric
              icon={<Calculator className="h-5 w-5" />}
              label="Por comprobante"
              value={estimate ? currency(estimate.costs.cost_per_receipt, 4) : "--"}
            />
            <Metric
              icon={<Database className="h-5 w-5" />}
              label="Comprobantes/mes"
              value={compactNumber(form.monthly_volume)}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
            <ChartPanel title="Desglose LLM mensual">
              <Suspense fallback={<div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Cargando grafico...</div>}>
                <LazyResponsiveContainer width="100%" height={280}>
                  <LazyBarChart data={breakdownData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9e2df" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(value) => currency(Number(value), 0)} />
                    <Tooltip formatter={(value) => currency(Number(value))} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {breakdownData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={BAR_COLORS[index % BAR_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </LazyBarChart>
                </LazyResponsiveContainer>
              </Suspense>
            </ChartPanel>

            <ChartPanel title="Tokens por transaccion">
              <div className="grid h-[280px] content-center gap-3">
                <TokenRow
                  label="OCR input"
                  value={estimate?.tokens.ocr_input_tokens ?? 0}
                  max={1800}
                />
                <TokenRow
                  label="OCR output"
                  value={estimate?.tokens.ocr_output_tokens ?? 0}
                  max={1800}
                />
                <TokenRow
                  label="Chat input"
                  value={estimate?.tokens.chat_input_tokens ?? 0}
                  max={1800}
                />
                <TokenRow
                  label="Chat output"
                  value={estimate?.tokens.chat_output_tokens ?? 0}
                  max={1800}
                />
              </div>
            </ChartPanel>
          </div>

          <ChartPanel title="Comparativa OCR por modelo">
            <Suspense fallback={<div className="flex h-[320px] items-center justify-center text-sm text-slate-400">Cargando grafico...</div>}>
              <LazyResponsiveContainer width="100%" height={320}>
                <LazyLineChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d9e2df" />
                  <XAxis dataKey="name" height={64} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tickFormatter={(value) => currency(Number(value), 0)} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => currency(Number(value), 3)}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "unit"
                        ? currency(Number(value), 4)
                        : currency(Number(value))
                    }
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="total"
                    name="Total"
                    stroke="#0f766e"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="unit"
                    name="Unitario"
                    stroke="#d65f45"
                    strokeWidth={2}
                  />
                </LazyLineChart>
              </LazyResponsiveContainer>
            </Suspense>
          </ChartPanel>

          <section className="rounded-md border border-line bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-teal" />
              <h2 className="text-base font-semibold">Laboratorio comprobante</h2>
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    Imagen comprobante
                  </span>
                  <input
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    className="focus-ring w-full rounded-md border border-line bg-white px-3 py-2"
                    multiple
                    type="file"
                    onChange={(event) => {
                      const files = event.target.files;
                      if (!files || files.length === 0) return;
                      if (files.length === 1) {
                        setReceiptFile(files[0]);
                        setBatchFiles([]);
                      } else {
                        setReceiptFile(files[0]);
                        setBatchFiles(Array.from(files));
                      }
                    }}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    Campos a extraer
                  </span>
                  <textarea
                    className="focus-ring min-h-40 w-full rounded-md border border-line bg-white px-3 py-2"
                    value={receiptFields}
                    onChange={(event) => setReceiptFields(event.target.value)}
                  />
                </label>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <ListChecks className="h-4 w-4" />
                    Secciones
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SECTION_OPTIONS.map((section) => (
                      <label
                        key={section.id}
                        className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"
                      >
                        <input
                          checked={receiptSections.includes(section.id)}
                          type="checkbox"
                          onChange={() => toggleReceiptSection(section.id)}
                        />
                        {section.label}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  className="focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={isAnalyzingReceipt}
                  type="button"
                  onClick={runReceiptAnalysis}
                >
                  <Upload className="h-4 w-4" />
                  {isAnalyzingReceipt ? "Calculando" : "Calcular comprobante"}
                </button>

                <button
                  className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
                  disabled={pipelineStep !== "idle" && pipelineStep !== "done"}
                  type="button"
                  onClick={runFullPipeline}
                >
                  <Zap className="h-4 w-4" />
                  {pipelineStep === "idle" || pipelineStep === "done"
                    ? "Procesar completo"
                    : pipelineStep === "analyzing"
                      ? "Paso 1/3 — Analizando calidad..."
                      : pipelineStep === "enhancing"
                        ? "Paso 2/3 — Mejorando con OpenCV..."
                        : "Paso 3/3 — Extrayendo con Gemini..."}
                </button>

                {/* Batch processing button */}
                {batchFiles.length > 1 && (
                  <button
                    className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                    disabled={isBatchProcessing}
                    type="button"
                    onClick={runBatchPipeline}
                  >
                    <Zap className="h-4 w-4" />
                    {isBatchProcessing
                      ? `Procesando ${batchProgress?.current ?? 0}/${batchProgress?.total ?? 0} — ${batchProgress?.filename ?? ""}`
                      : `Procesar lote (${batchFiles.length} comprobantes)`}
                  </button>
                )}

                {/* Batch progress bar */}
                {isBatchProcessing && batchProgress && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{batchProgress.filename}</span>
                      <span>{batchProgress.current}/{batchProgress.total}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {pipelineStep !== "idle" && pipelineStep !== "done" && (
                  <div className="flex items-center gap-2">
                    {["analyzing", "enhancing", "extracting"].map((step, i) => (
                      <div key={step} className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full transition-colors ${
                          step === pipelineStep
                            ? "bg-violet-500 animate-pulse"
                            : ["analyzing", "enhancing", "extracting"].indexOf(pipelineStep) > i
                              ? "bg-emerald-500"
                              : "bg-slate-300"
                        }`} />
                        <span className="text-xs text-slate-500">
                          {step === "analyzing" ? "Calidad" : step === "enhancing" ? "OpenCV" : "Gemini"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {pipelineStep === "done" && (
                  <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold">✓</span>
                    Pipeline completo — revisa los resultados abajo.
                  </div>
                )}
                {pipelineError && (
                  <div className="rounded-md border border-coral px-3 py-2 text-sm text-coral">
                    {pipelineError}
                  </div>
                )}

                <div className="rounded-md border border-line bg-panel p-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">
                      Mejora OpenCV
                    </span>
                    <select
                      className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
                      value={enhancementMode}
                      onChange={(event) =>
                        setEnhancementMode(
                          event.target.value as "auto" | "clarify" | "threshold"
                        )
                      }
                    >
                      <option value="auto">Auto</option>
                      <option value="clarify">Clarificar</option>
                      <option value="threshold">Alto contraste</option>
                    </select>
                  </label>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        checked={opencvDeskew}
                        type="checkbox"
                        onChange={(event) => setOpencvDeskew(event.target.checked)}
                      />
                      Corregir rotacion (Deskew)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        checked={opencvRemoveShadows}
                        type="checkbox"
                        onChange={(event) => setOpencvRemoveShadows(event.target.checked)}
                      />
                      Eliminar sombras / fondo uniforme
                    </label>
                  </div>
                  <button
                    className="focus-ring mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink disabled:opacity-50"
                    disabled={isEnhancingReceipt}
                    type="button"
                    onClick={runReceiptEnhancement}
                  >
                    <FileSearch className="h-4 w-4" />
                    {isEnhancingReceipt ? "Mejorando" : "Mejorar imagen"}
                  </button>
                </div>

                <div className="rounded-md border border-line bg-panel p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={extractWithEnhancement}
                      type="checkbox"
                      onChange={(event) =>
                        setExtractWithEnhancement(event.target.checked)
                      }
                    />
                    Usar mejora OpenCV antes del OCR real
                  </label>
                  <button
                    className="focus-ring mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-coral px-4 text-sm font-medium text-white disabled:opacity-50"
                    disabled={isExtractingReceipt || !canExtractWithApi}
                    type="button"
                    onClick={runReceiptExtraction}
                  >
                    <Bot className="h-4 w-4" />
                    {!canExtractWithApi ? (
                    "Este modelo no soporta OCR real (sólo estimación)"
                  ) : (
                    isExtractingReceipt ? "Extrayendo datos..." : "Extraer con Gemini"
                  )}
                  </button>
                  {!canExtractWithApi ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Selecciona un modelo OCR de Google AI o Groq para la prueba real.
                    </p>
                  ) : null}
                </div>

                {receiptError ? (
                  <div className="rounded-md border border-coral px-3 py-2 text-sm text-coral">
                    {receiptError}
                  </div>
                ) : null}
                {enhancementError ? (
                  <div className="rounded-md border border-coral px-3 py-2 text-sm text-coral">
                    {enhancementError}
                  </div>
                ) : null}
                {extractionError ? (
                  <div className="rounded-md border border-coral px-3 py-2 text-sm text-coral">
                    {extractionError}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <MiniMetric
                    label="Por comprobante"
                    value={
                      receiptAnalysis
                        ? currency(receiptAnalysis.costs.cost_per_receipt, 6)
                        : "--"
                    }
                  />
                  <MiniMetric
                    label="Por dia"
                    value={
                      receiptAnalysis
                        ? currency(receiptAnalysis.costs.daily_cost, 6)
                        : "--"
                    }
                  />
                  <MiniMetric
                    label="Por semana"
                    value={
                      receiptAnalysis
                        ? currency(receiptAnalysis.costs.weekly_cost, 6)
                        : "--"
                    }
                  />
                  <MiniMetric
                    label="Por mes"
                    value={
                      receiptAnalysis
                        ? currency(receiptAnalysis.costs.monthly_cost, 6)
                        : "--"
                    }
                  />
                </div>

                {receiptAnalysis?.quality_analysis && (
                  <div className={`rounded-md border p-4 text-sm ${
                    receiptAnalysis.quality_analysis.requires_enhancement
                      ? "border-amber-300 bg-amber-50/70"
                      : "border-emerald-300 bg-emerald-50/70"
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {receiptAnalysis.quality_analysis.requires_enhancement ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-xs">!</span>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">✓</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-semibold ${
                          receiptAnalysis.quality_analysis.requires_enhancement ? "text-amber-950" : "text-emerald-950"
                        }`}>
                          {receiptAnalysis.quality_analysis.requires_enhancement 
                            ? "Mejora OpenCV Recomendada" 
                            : "Legibilidad Original Excelente"}
                        </h4>
                        
                        {receiptAnalysis.quality_analysis.reasons.length > 0 && (
                          <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-xs text-slate-700">
                            {receiptAnalysis.quality_analysis.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4 bg-white/60 p-2 rounded border border-black/5">
                          <div>
                            <span className="text-slate-500 block">Contraste:</span>
                            <strong className="text-slate-800">{receiptAnalysis.quality_analysis.contrast}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Nitidez:</span>
                            <strong className="text-slate-800">{receiptAnalysis.quality_analysis.sharpness}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Inclinación:</span>
                            <strong className="text-slate-800">{receiptAnalysis.quality_analysis.rotation_angle}°</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Var. fondo:</span>
                            <strong className="text-slate-800">{receiptAnalysis.quality_analysis.shadow_variance}</strong>
                          </div>
                        </div>

                        {receiptAnalysis.quality_analysis.requires_enhancement && (
                          <p className="mt-2 text-xs text-slate-600">
                            Se pre-seleccionó la mejora OpenCV tipo <strong>{receiptAnalysis.quality_analysis.suggested_mode === "threshold" ? "Alto contraste" : "Clarificar"}</strong> para mejorar los resultados de OCR.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-line bg-panel p-3 text-sm">
                  <div className="grid gap-2 md:grid-cols-2">
                    <span>
                      Modelo:{" "}
                      <strong>{receiptAnalysis?.model_name ?? "--"}</strong>
                    </span>
                    <span>
                      Imagen:{" "}
                      <strong>
                        {receiptAnalysis
                          ? `${receiptAnalysis.image.width}x${receiptAnalysis.image.height} ${receiptAnalysis.image.format}`
                          : "--"}
                      </strong>
                    </span>
                    <span>
                      Input tokens:{" "}
                      <strong>
                        {receiptAnalysis?.tokens.input_tokens ?? "--"}
                      </strong>
                    </span>
                    <span>
                      Output tokens:{" "}
                      <strong>
                        {receiptAnalysis?.tokens.output_tokens ?? "--"}
                      </strong>
                    </span>
                  </div>
                </div>

                {receiptEnhancement ? (
                  <div className="rounded-md border border-line p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink">
                        Imagen clarificada
                      </h3>
                      <span className="rounded-sm bg-panel px-2 py-1 text-xs text-slate-600">
                        {receiptEnhancement.operations.join(" + ")}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                      <img
                        alt="Comprobante mejorado"
                        className="max-h-80 w-full rounded-md border border-line object-contain"
                        src={`data:${receiptEnhancement.mime_type};base64,${receiptEnhancement.image_base64}`}
                      />
                      <div className="grid content-start gap-2 text-sm">
                        <MiniMetric
                          label="Contraste original"
                          value={String(receiptEnhancement.original.contrast)}
                        />
                        <MiniMetric
                          label="Contraste mejorado"
                          value={String(receiptEnhancement.enhanced.contrast)}
                        />
                        <MiniMetric
                          label="Nitidez original"
                          value={String(receiptEnhancement.original.sharpness)}
                        />
                        <MiniMetric
                          label="Nitidez mejorada"
                          value={String(receiptEnhancement.enhanced.sharpness)}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {receiptExtraction ? (
                  <div className="rounded-md border border-line p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink">
                        Extraccion real
                      </h3>
                      <span className="rounded-sm bg-panel px-2 py-1 text-xs text-slate-600">
                        {receiptExtraction.provider} | {receiptExtraction.model_name}
                      </span>
                    </div>
                    <div className="mb-3 grid gap-3 md:grid-cols-4">
                      <MiniMetric
                        label="Input tokens"
                        value={String(receiptExtraction.usage.prompt_tokens)}
                      />
                      <MiniMetric
                        label="Output tokens"
                        value={String(receiptExtraction.usage.output_tokens)}
                      />
                      <MiniMetric
                        label="Total tokens"
                        value={String(receiptExtraction.usage.total_tokens)}
                      />
                      <MiniMetric
                        label="Costo real"
                        value={currency(receiptExtraction.cost.cost_per_receipt, 6)}
                      />
                    </div>
                    <pre className="max-h-80 overflow-auto rounded-md bg-panel p-3 text-xs text-slate-800">
                      {JSON.stringify(
                        receiptExtraction.extracted ?? receiptExtraction.raw_text,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                ) : null}

                {receiptAnalysis && receiptExtraction && (
                  <div className="rounded-md border border-teal bg-panel p-3 text-sm">
                    <h3 className="font-semibold text-teal-800 mb-1">
                      Calibracion de Presupuesto (Simulacion vs. Extraccion Real)
                    </h3>
                    <p className="text-xs text-slate-600 mb-2">
                      Compara el costo estimado basado en resolucion frente al costo devuelto por la API real de Gemini.
                    </p>
                    <div className="grid gap-2 md:grid-cols-3 text-center">
                      <div className="bg-white p-2 rounded border border-line">
                        <div className="text-xs text-slate-500">Costo Simulado</div>
                        <div className="font-semibold">{currency(receiptAnalysis.costs.cost_per_receipt, 6)}</div>
                      </div>
                      <div className="bg-white p-2 rounded border border-line">
                        <div className="text-xs text-slate-500">Costo Real API</div>
                        <div className="font-semibold text-coral">{currency(receiptExtraction.cost.cost_per_receipt, 6)}</div>
                      </div>
                      <div className="bg-white p-2 rounded border border-line">
                        <div className="text-xs text-slate-500">Desviacion</div>
                        <div className={`font-semibold ${
                          receiptExtraction.cost.cost_per_receipt > receiptAnalysis.costs.cost_per_receipt ? "text-coral" : "text-teal"
                        }`}>
                          {(() => {
                            const diff = receiptExtraction.cost.cost_per_receipt - receiptAnalysis.costs.cost_per_receipt;
                            const pct = (diff / receiptAnalysis.costs.cost_per_receipt) * 100;
                            return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save to history button */}
                {(receiptAnalysis || receiptExtraction) && receiptFile && (
                  <button
                    className="focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700"
                    type="button"
                    onClick={() => {
                      if (!receiptAnalysis) return;
                      const selectedModel = models.find((m) => m.id === form.ocr_model_id);
                      const entry: ProcessedReceipt = {
                        id: generateUUID(),
                        filename: receiptFile.name,
                        processedAt: new Date().toISOString(),
                        modelName: selectedModel?.display_name ?? receiptAnalysis.model_name,
                        provider: selectedModel?.provider?.name ?? "—",
                        image: receiptAnalysis.image,
                        qualityRequiresEnhancement: receiptAnalysis.quality_analysis?.requires_enhancement ?? false,
                        wasEnhanced: receiptExtraction?.enhanced ?? false,
                        estimatedCost: receiptAnalysis.costs.cost_per_receipt,
                        estimatedTokens: {
                          input: receiptAnalysis.tokens.input_tokens,
                          output: receiptAnalysis.tokens.output_tokens,
                          total: receiptAnalysis.tokens.total_tokens
                        },
                        ...(receiptExtraction ? {
                          realCost: receiptExtraction.cost.cost_per_receipt,
                          realTokens: {
                            input: receiptExtraction.usage.prompt_tokens,
                            output: receiptExtraction.usage.output_tokens,
                            total: receiptExtraction.usage.total_tokens
                          },
                          extractedData: receiptExtraction.extracted ?? undefined
                        } : {})
                      };
                      addToHistory(entry);
                    }}
                  >
                    <Save className="h-4 w-4" />
                    Guardar en informe ({historyReceipts.length} acumulados)
                  </button>
                )}

                {/* ---- Report generation section ---- */}
                <div className="rounded-md border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-indigo-600" />
                      <div>
                        <h3 className="text-sm font-semibold text-indigo-900">
                          Informe Comparativo
                        </h3>
                        <p className="text-xs text-slate-500">
                          Compara costos de este comprobante en todos los modelos de visión.
                        </p>
                      </div>
                    </div>
                    <button
                      className="focus-ring flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-xs font-medium text-white shadow-sm transition-all hover:bg-indigo-700 disabled:opacity-50"
                      disabled={isGeneratingReport || !receiptFile}
                      type="button"
                      onClick={runReportGeneration}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {isGeneratingReport ? "Generando..." : "Generar informe"}
                    </button>
                  </div>

                  {reportError && (
                    <div className="rounded-md border border-coral px-3 py-2 text-sm text-coral mb-3">
                      {reportError}
                    </div>
                  )}

                  {costReport && (
                    <div className="space-y-3">
                      {/* Download buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          className="focus-ring flex h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                          type="button"
                          onClick={() => downloadReportCSV(costReport)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar CSV
                        </button>
                        <button
                          className="focus-ring flex h-8 items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-3 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                          type="button"
                          onClick={() => downloadReportPDF(costReport)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar PDF
                        </button>
                        <span className="text-xs text-slate-400 ml-2">
                          {costReport.summary.total_models} modelos comparados
                        </span>
                      </div>

                      {/* Summary badges */}
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                          ✦ Más económico: {costReport.summary.cheapest}
                          <span className="font-mono">
                            {" "}${costReport.summary.cheapest_cost.toFixed(8)}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                          ▲ Más costoso: {costReport.summary.most_expensive}
                          <span className="font-mono">
                            {" "}${costReport.summary.most_expensive_cost.toFixed(8)}
                          </span>
                        </span>
                      </div>

                      {/* Comparison table */}
                      <div className="max-h-64 overflow-auto rounded-md border border-line">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-indigo-600 text-white sticky top-0">
                              <th className="px-2 py-1.5 text-left font-medium">Modelo</th>
                              <th className="px-2 py-1.5 text-left font-medium">Proveedor</th>
                              <th className="px-2 py-1.5 text-right font-medium">Tok. Img</th>
                              <th className="px-2 py-1.5 text-right font-medium">Tok. Total</th>
                              <th className="px-2 py-1.5 text-right font-medium">$/Comp.</th>
                              <th className="px-2 py-1.5 text-right font-medium">$/Día</th>
                              <th className="px-2 py-1.5 text-right font-medium">$/Mes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costReport.comparisons.map((c, i) => (
                              <tr
                                key={c.model_id}
                                className={`border-t border-line ${
                                  i === 0
                                    ? "bg-emerald-50/50 font-medium"
                                    : i % 2 === 0
                                      ? "bg-white"
                                      : "bg-slate-50/50"
                                }`}
                              >
                                <td className="px-2 py-1.5">
                                  {i === 0 && <span className="mr-1">✦</span>}
                                  {c.model_name}
                                </td>
                                <td className="px-2 py-1.5 text-slate-500">{c.provider}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{c.tokens.image_tokens}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{c.tokens.total_tokens}</td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  ${c.costs.cost_per_receipt.toFixed(8)}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  ${c.costs.daily_cost.toFixed(6)}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">
                                  ${c.costs.monthly_cost.toFixed(4)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-line p-3">
                  <h3 className="mb-3 text-sm font-semibold text-ink">
                    Secciones estimadas
                  </h3>
                  <div className="grid gap-2">
                    {receiptAnalysis?.sections.map((section) => (
                      <div
                        key={section.id}
                        className="flex items-center justify-between rounded-md bg-panel px-3 py-2 text-sm"
                      >
                        <span>{section.label}</span>
                        <span className="text-slate-600">
                          y:{section.y} h:{section.height}
                        </span>
                      </div>
                    )) ?? (
                      <div className="text-sm text-slate-600">
                        Sin comprobante analizado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ========== INFORMES CONSOLIDADOS ========== */}
          {historyReceipts.length > 0 && (
            <section className="rounded-md border border-line bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h2 className="text-base font-semibold">Informe consolidado</h2>
                    <p className="text-xs text-slate-600">
                      {historyReceipts.length} comprobante{historyReceipts.length !== 1 ? "s" : ""} acumulado{historyReceipts.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="focus-ring flex h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                    type="button"
                    onClick={() => {
                      const chatCostPerSession = estimate
                        ? (estimate.costs.chat_cost / (estimate.costs.monthly_chat_sessions || 1))
                        : 0;
                      downloadHistoryCSV(historyReceipts, {
                        incidenceRate: form.incidence_rate,
                        chatTurns: form.chat_turns,
                        chatCostPerSession
                      });
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                  <button
                    className="focus-ring flex h-8 items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-3 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                    type="button"
                    onClick={() => {
                      const chatCostPerSession = estimate
                        ? (estimate.costs.chat_cost / (estimate.costs.monthly_chat_sessions || 1))
                        : 0;
                      downloadHistoryPDF(historyReceipts, {
                        incidenceRate: form.incidence_rate,
                        chatTurns: form.chat_turns,
                        chatCostPerSession
                      });
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                  <button
                    className="focus-ring flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100"
                    type="button"
                    onClick={clearHistory}
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Summary metrics */}
              {(() => {
                const totalEstimated = historyReceipts.reduce((s, r) => s + r.estimatedCost, 0);
                const realReceipts = historyReceipts.filter((r) => r.realCost != null);
                const totalReal = realReceipts.reduce((s, r) => s + (r.realCost ?? 0), 0);
                const chatIncidences = Math.ceil(historyReceipts.length * form.incidence_rate);
                const chatCostPerSession = estimate
                  ? (estimate.costs.chat_cost / (estimate.costs.monthly_chat_sessions || 1))
                  : 0;
                const totalChatCost = chatIncidences * chatCostPerSession * form.chat_turns;
                const grandTotalEstimated = totalEstimated + totalChatCost;

                return (
                  <>
                    <div className="grid gap-3 md:grid-cols-4 mb-2">
                      <MiniMetric
                        label="Comprobantes"
                        value={String(historyReceipts.length)}
                      />
                      <MiniMetric
                        label="Costo OCR estimado"
                        value={currency(totalEstimated, 6)}
                      />
                      <MiniMetric
                        label="Costo OCR real"
                        value={realReceipts.length > 0 ? currency(totalReal, 6) : "—"}
                      />
                      <MiniMetric
                        label="Costo promedio"
                        value={currency(totalEstimated / historyReceipts.length, 8)}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-4 mb-4">
                      <MiniMetric
                        label={`Incidencias chat (${percent(form.incidence_rate)})`}
                        value={`${chatIncidences} de ${historyReceipts.length}`}
                      />
                      <MiniMetric
                        label={`Costo chat (${form.chat_turns} turnos)`}
                        value={chatCostPerSession > 0 ? currency(totalChatCost, 6) : "—"}
                      />
                      <MiniMetric
                        label="TOTAL (OCR + Chat)"
                        value={chatCostPerSession > 0 ? currency(grandTotalEstimated, 6) : currency(totalEstimated, 6)}
                      />
                      <MiniMetric
                        label="Con extracción real"
                        value={`${realReceipts.length} / ${historyReceipts.length}`}
                      />
                    </div>
                  </>
                );
              })()}

              {/* Chart: Estimated vs Real cost per receipt */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-ink mb-2">Costo por comprobante (Estimado vs Real)</h3>
                <Suspense fallback={<div className="flex h-[200px] items-center justify-center text-sm text-slate-400">Cargando grafico...</div>}>
                  <LazyResponsiveContainer width="100%" height={Math.min(historyReceipts.length * 50 + 40, 300)}>
                    <LazyBarChart
                      data={historyReceipts.map((r) => ({
                        name: r.filename.length > 20 ? r.filename.substring(0, 18) + "…" : r.filename,
                        estimado: r.estimatedCost,
                        real: r.realCost ?? 0
                      }))}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(6)}`} style={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={130} style={{ fontSize: 10 }} />
                      <Tooltip formatter={(value) => `$${Number(value).toFixed(8)}`} />
                      <Legend />
                      <Bar dataKey="estimado" name="Estimado" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="real" name="Real (Gemini)" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </LazyBarChart>
                  </LazyResponsiveContainer>
                </Suspense>
              </div>

              {/* History table */}
              <div className="max-h-64 overflow-auto rounded-md border border-line">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 sticky top-0">
                      <th className="px-2 py-1.5 text-left font-medium">Archivo</th>
                      <th className="px-2 py-1.5 text-left font-medium">Modelo</th>
                      <th className="px-2 py-1.5 text-center font-medium">Mejora</th>
                      <th className="px-2 py-1.5 text-right font-medium">$/Est.</th>
                      <th className="px-2 py-1.5 text-right font-medium">$/Real</th>
                      <th className="px-2 py-1.5 text-right font-medium">Desv.</th>
                      <th className="px-2 py-1.5 text-center font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyReceipts.map((r, i) => {
                      const dev = r.realCost != null && r.estimatedCost > 0
                        ? (((r.realCost - r.estimatedCost) / r.estimatedCost) * 100).toFixed(1)
                        : null;
                      return (
                        <tr key={r.id} className={`border-t border-line ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                          <td className="px-2 py-1.5 max-w-[140px] truncate" title={r.filename}>{r.filename}</td>
                          <td className="px-2 py-1.5 text-slate-500 max-w-[120px] truncate" title={r.modelName}>{r.modelName}</td>
                          <td className="px-2 py-1.5 text-center">
                            {r.wasEnhanced ? (
                              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" title="Mejorado con OpenCV" />
                            ) : (
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" title="Sin mejora" />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">${r.estimatedCost.toFixed(8)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {r.realCost != null ? `$${r.realCost.toFixed(8)}` : "—"}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono ${dev !== null ? (Number(dev) > 0 ? "text-coral" : "text-teal") : "text-slate-400"}`}>
                            {dev !== null ? `${Number(dev) > 0 ? "+" : ""}${dev}%` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              className="text-slate-400 hover:text-red-500 transition-colors"
                              type="button"
                              onClick={() => removeFromHistory(r.id)}
                              title="Eliminar"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-md border border-line bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Server className="h-5 w-5 text-teal" />
                <div>
                  <h2 className="text-base font-semibold">Catalogo activo</h2>
                  <p className="text-xs text-slate-600">
                    Tarifas en USD por millon de tokens.
                  </p>
                </div>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-slate-600">
                      <th className="py-2 pr-3 font-medium">Modelo</th>
                      <th className="py-2 pr-3 font-medium">Input USD/1M</th>
                      <th className="py-2 pr-3 font-medium">Output USD/1M</th>
                      <th className="py-2 font-medium">Imagen</th>
                      <th className="py-2 font-medium">Uso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((model) => (
                      <tr key={model.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-3">
                          <span className="block font-medium">{model.display_name}</span>
                          <span className="text-xs text-slate-500">
                            {model.provider.name}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {currency(model.input_price_per_million, 3)}
                        </td>
                        <td className="py-2 pr-3">
                          {currency(model.output_price_per_million, 3)}
                        </td>
                        <td className="py-2">{model.image_token_cost}</td>
                        <td className="py-2">{model.recommended_task}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-md border border-line bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-coral" />
                <h2 className="text-base font-semibold">Bitacora</h2>
              </div>
              <button
                className="focus-ring mb-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-medium text-ink disabled:opacity-50"
                disabled={syncMode !== "idle"}
                type="button"
                onClick={() => syncOfficialPrices("manual")}
              >
                <RefreshCw className="h-4 w-4" />
                {syncMode === "auto"
                  ? "Actualizando al ingresar"
                  : syncMode === "manual"
                    ? "Sincronizando"
                    : "Sincronizar precios"}
              </button>
              <div className="space-y-3">
                {logs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{log.source}</span>
                      <span className="rounded-sm bg-white px-2 py-1 text-xs text-slate-600">
                        {log.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{log.message}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
          </div>
        )}
      </div>
    </main>
  );
}

function AgentFirstPanel() {
  return (
    <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-teal" />
            <h2 className="text-base font-semibold">Agente opcional</h2>
          </div>
          <div className="space-y-3 text-sm text-slate-700">
            <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <input checked readOnly type="checkbox" />
              Analizar calidad del comprobante
            </label>
            <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <input checked readOnly type="checkbox" />
              Sugerir mejora OpenCV
            </label>
            <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <input readOnly type="checkbox" />
              Consultar LLM ante baja legibilidad
            </label>
          </div>
        </section>
      </aside>

      <section className="rounded-md border border-line bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-coral" />
          <h2 className="text-base font-semibold">Chat Agent First</h2>
        </div>
        <div className="grid min-h-[360px] content-between rounded-md border border-line bg-panel p-4">
          <div className="space-y-3 text-sm">
            <div className="max-w-xl rounded-md bg-white p-3 text-slate-700">
              El agente va a poder ejecutar herramientas del laboratorio:
              mejorar imagen, revisar campos esperados, estimar tokens y explicar
              el impacto del costo conversacional.
            </div>
            <div className="max-w-xl rounded-md bg-white p-3 text-slate-700">
              Todavia no envia mensajes a un LLM. Lo dejamos separado para activar
              Gemini, Groq u OpenAI cuando definamos proveedor y politica de uso.
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <input
              className="focus-ring h-10 flex-1 rounded-md border border-line bg-white px-3 text-sm"
              disabled
              placeholder="Chat del agente pendiente de conexion LLM"
            />
            <button
              className="h-10 rounded-md bg-teal px-4 text-sm font-medium text-white opacity-50"
              disabled
              type="button"
            >
              Enviar
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-panel text-teal">
        {icon}
      </div>
      <div className="text-sm text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center justify-between font-medium text-slate-700">
        {label}
        <span>{display}</span>
      </span>
      <input
        className="focus-ring h-10 w-full accent-teal"
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: number;
  options: AiModel[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <select
        className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.display_name} | {model.provider.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChartPanel({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-white p-4">
      <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function TokenRow({
  label,
  value,
  max
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = Math.max(3, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-600">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-sm bg-panel">
        <div className="h-full bg-teal" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
