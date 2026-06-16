/**
 * RAG Simulator Component
 * Autor: Jonatan Gutierrez (JG)
 */

"use client";

import { useState, useEffect } from "react";
import { AiModel } from "../lib/types";
import { tokenizeText } from "../lib/api";
import { Calculator, Database, Zap, Upload } from "lucide-react";

export function RagSimulator({
  models,
  monthlyVolume = 750,
  incidenceRate = 0.15,
  chatTurns = 2,
  ocrCost = 0,
  ocrModelName = ""
}: {
  models: AiModel[];
  monthlyVolume?: number;
  incidenceRate?: number;
  chatTurns?: number;
  ocrCost?: number;
  ocrModelName?: string;
}) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tokens, setTokens] = useState(0);
  const [chunkSize, setChunkSize] = useState(500);
  const [topK, setTopK] = useState(5);
  const [chatModelId, setChatModelId] = useState<number | "">("");

  const chatModels = models.filter(m => !m.is_vision || m.recommended_task === 'chat');

  // Set a default chat model when models list is loaded
  useEffect(() => {
    if (!chatModelId && chatModels.length > 0) {
      setChatModelId(chatModels[0].id);
    }
  }, [models, chatModelId, chatModels]);

  const selectedModel = models.find(m => m.id === chatModelId);

  async function handleTokenize() {
    if (!systemPrompt.trim() || !selectedModel) return;
    try {
      const res = await tokenizeText({ text: systemPrompt, model: selectedModel.name });
      setTokens(res.tokens);
    } catch (e) {
      console.error(e);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setSystemPrompt(text);
      if (selectedModel) {
        tokenizeText({ text, model: selectedModel.name })
          .then(res => setTokens(res.tokens))
          .catch(err => console.error(err));
      }
    };
    reader.readAsText(file);
  }

  const contextTokens = tokens + (chunkSize * topK);
  
  let costNormal = 0;
  let costCached = 0;
  
  if (selectedModel) {
    costNormal = (contextTokens / 1_000_000) * selectedModel.input_price_per_million;
    const cachePrice = selectedModel.cached_input_price_per_million ?? selectedModel.input_price_per_million;
    const cachedSysCost = (tokens / 1_000_000) * cachePrice;
    const chunkCost = ((chunkSize * topK) / 1_000_000) * selectedModel.input_price_per_million;
    costCached = cachedSysCost + chunkCost;
  }

  // General operations calculations
  const monthlyChats = monthlyVolume * incidenceRate;
  const monthlyTurns = monthlyChats * chatTurns;

  const monthlyRAGCostNormal = monthlyTurns * costNormal;
  const monthlyRAGCostCached = monthlyTurns * costCached;

  const totalOperationCostNormal = ocrCost + monthlyRAGCostNormal;
  const totalOperationCostCached = ocrCost + monthlyRAGCostCached;

  return (
    <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
      <aside className="space-y-4">
        <section className="rounded-md border border-line bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold">Parámetros RAG</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Modelo Chat</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                value={chatModelId}
                onChange={(e) => setChatModelId(Number(e.target.value) || "")}
              >
                <option value="">Selecciona un modelo...</option>
                {chatModels.map(m => (
                  <option key={m.id} value={m.id}>{m.display_name} ({m.provider.name})</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tamaño del Chunk (Tokens)</label>
              <input
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Chunks Recuperados (Top-K)</label>
              <input
                type="number"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {selectedModel && (
          <section className="rounded-md border border-line bg-indigo-50 p-4 shadow-sm">
            <h3 className="font-semibold text-indigo-900 flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4" /> Costo por Turno
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Tokens de Contexto:</span>
                <span className="font-medium">{contextTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Costo Normal:</span>
                <span className="font-medium text-red-600">${costNormal.toFixed(6)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-indigo-200 pt-2">
                <span className="text-indigo-800">Costo con Caché:</span>
                <span className="text-emerald-600">${costCached.toFixed(6)}</span>
              </div>
              <p className="text-xs text-indigo-500 mt-2">
                * Asume que el System Prompt está en caché.
              </p>
            </div>
          </section>
        )}

        {selectedModel && (
          <section className="rounded-md border border-line bg-emerald-50/50 p-4 shadow-sm">
            <h3 className="font-semibold text-emerald-900 flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4 text-emerald-600" /> Proyección Mensual General
            </h3>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Comprobantes (OCR):</span>
                <span className="font-medium text-slate-900">${ocrCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sesiones RAG ({monthlyChats.toFixed(0)} chats):</span>
                <span className="font-medium text-slate-900">${monthlyRAGCostNormal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium border-t border-emerald-200/60 pt-2 text-emerald-800">
                <span>Costo RAG (con Caché):</span>
                <span className="font-semibold">${monthlyRAGCostCached.toFixed(2)}</span>
              </div>
              <div className="border-t border-emerald-200 pt-2 space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-500 uppercase">
                  <span>Total Operación</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Sin Caché:</span>
                  <span className="font-semibold text-slate-900">${totalOperationCostNormal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>Con Caché:</span>
                  <span>${totalOperationCostCached.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic mt-2">
                * Calculado para {monthlyVolume} comprobantes/mes ({ocrModelName || "modelo ocr"}), {incidenceRate * 100}% de incidencia de soporte, y {chatTurns} turnos por chat.
              </p>
            </div>
          </section>
        )}
      </aside>

      <main className="space-y-4">
        <section className="rounded-md border border-line bg-white p-4 shadow-sm h-full flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-semibold">System Prompt (Base Documental)</h2>
            </div>
            <div className="flex items-center gap-3">
              {tokens > 0 && (
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-md">
                  {tokens.toLocaleString()} Tokens
                </span>
              )}
              <label className="flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-300 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Cargar .txt
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          
          <textarea
            className="flex-1 w-full rounded-md border border-slate-300 p-4 text-sm focus:border-amber-500 focus:outline-none resize-none font-mono min-h-[300px]"
            placeholder="Pega aquí tu system prompt gigante, bases de conocimiento o manuales..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          
          <div className="mt-4 flex justify-between items-center">
            <p className="text-xs text-slate-500 max-w-[70%]">
              💡 <strong>Tip para PDFs:</strong> Puedes copiar el texto completo de tu PDF y pegarlo directamente en este cuadro, o cargar un archivo de texto (.txt).
            </p>
            <button
              onClick={handleTokenize}
              disabled={!selectedModel || !systemPrompt.trim()}
              className="bg-amber-500 text-white px-4 py-2 rounded-md font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              Calcular Tokens Locales
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
