import type {
  AiModel,
  CostComparisonReport,
  EstimateRequest,
  EstimateResponse,
  PriceSyncLog,
  Provider,
  ReceiptAnalysisResponse,
  ReceiptEnhancementResponse,
  ReceiptExtractionResponse,
  Scenario
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8020";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export function getProviders() {
  return request<Provider[]>("/api/providers?active_only=true");
}

export function getModels() {
  return request<AiModel[]>("/api/models?active_only=true");
}

export function getScenarios() {
  return request<Scenario[]>("/api/scenarios");
}

export function getPriceSyncLogs() {
  return request<PriceSyncLog[]>("/api/price-sync-logs");
}

export function runPriceSync() {
  return request<{ status: string; results: unknown[] }>("/api/price-sync/run", {
    method: "POST"
  });
}

export function tokenizeText(payload: { text: string; model: string }) {
  return request<{ tokens: number; model: string }>("/api/tokenize", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createEstimate(payload: EstimateRequest) {
  return request<EstimateResponse>("/api/cost-estimates", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function analyzeReceipt(payload: {
  file: File;
  modelId: number;
  dailyVolume: number;
  fields: string[];
  sections: string[];
}) {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("model_id", String(payload.modelId));
  formData.append("daily_volume", String(payload.dailyVolume));
  formData.append("fields_json", JSON.stringify(payload.fields));
  formData.append("sections_json", JSON.stringify(payload.sections));

  const response = await fetch(`${API_BASE_URL}/api/receipt-lab/analyze`, {
    method: "POST",
    body: formData,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<ReceiptAnalysisResponse>;
}

export async function enhanceReceipt(payload: {
  file: File;
  mode: "auto" | "clarify" | "threshold";
  deskew?: boolean;
  remove_shadows?: boolean;
}) {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("mode", payload.mode);
  if (payload.deskew !== undefined) {
    formData.append("deskew", String(payload.deskew));
  }
  if (payload.remove_shadows !== undefined) {
    formData.append("remove_shadows", String(payload.remove_shadows));
  }

  const response = await fetch(`${API_BASE_URL}/api/receipt-lab/enhance`, {
    method: "POST",
    body: formData,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<ReceiptEnhancementResponse>;
}

export async function extractReceipt(payload: {
  file: File;
  modelId: number;
  fields: string[];
  sections: string[];
  enhance: boolean;
  enhancementMode: "auto" | "clarify" | "threshold";
  deskew?: boolean;
  remove_shadows?: boolean;
}) {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("model_id", String(payload.modelId));
  formData.append("fields_json", JSON.stringify(payload.fields));
  formData.append("sections_json", JSON.stringify(payload.sections));
  formData.append("enhance", String(payload.enhance));
  formData.append("enhancement_mode", payload.enhancementMode);
  if (payload.deskew !== undefined) {
    formData.append("deskew", String(payload.deskew));
  }
  if (payload.remove_shadows !== undefined) {
    formData.append("remove_shadows", String(payload.remove_shadows));
  }

  const response = await fetch(`${API_BASE_URL}/api/receipt-lab/extract`, {
    method: "POST",
    body: formData,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<ReceiptExtractionResponse>;
}

export async function generateCostReport(payload: {
  file: File;
  dailyVolume: number;
  fields: string[];
  sections: string[];
}): Promise<CostComparisonReport> {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("daily_volume", String(payload.dailyVolume));
  formData.append("fields_json", JSON.stringify(payload.fields));
  formData.append("sections_json", JSON.stringify(payload.sections));

  const response = await fetch(`${API_BASE_URL}/api/reports/cost-comparison`, {
    method: "POST",
    body: formData,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<CostComparisonReport>;
}
