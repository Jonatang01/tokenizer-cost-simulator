/**
 * Settings Modal Component
 * Autor: Jonatan Gutierrez (JG)
 */

"use client";

import { useState, useEffect } from "react";
import { X, Save, RefreshCw, Key, Plus, Trash2 } from "lucide-react";
import { ApiKeys, CustomProvider } from "../lib/types";

export function SettingsModal({
  isOpen,
  onClose,
  onModelsSynced
}: {
  isOpen: boolean;
  onClose: () => void;
  onModelsSynced: () => void;
}) {
  const [keys, setKeys] = useState<ApiKeys>({
    google_ai: "",
    groq: "",
    cerebras: "",
    openai: "",
    deepseek: "",
    custom_providers: []
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setMessage(null);
      fetch("http://127.0.0.1:8020/api/settings/keys")
        .then(res => {
          if (!res.ok) throw new Error("Failed to load settings");
          return res.json();
        })
        .then(data => {
          setKeys({
            google_ai: data.google_ai || "",
            groq: data.groq || "",
            cerebras: data.cerebras || "",
            openai: data.openai || "",
            deepseek: data.deepseek || "",
            custom_providers: data.custom_providers || []
          });
        })
        .catch(err => {
          setMessage({ text: "No se pudo conectar con el servidor backend o cargar las API keys.", type: "error" });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSave() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("http://127.0.0.1:8020/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys)
      });
      if (!res.ok) throw new Error("Error al guardar keys");
      setMessage({ text: "API Keys guardadas con éxito.", type: "success" });
    } catch (err) {
      setMessage({ text: "Error al guardar API Keys.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("http://127.0.0.1:8020/api/models/sync-discovery", {
        method: "POST"
      });
      if (!res.ok) throw new Error("Error al sincronizar");
      const data = await res.json();
      setMessage({ text: `Se descubrieron y agregaron ${data.new_models_inserted} modelos nuevos.`, type: "success" });
      onModelsSynced();
    } catch (err) {
      setMessage({ text: "Error al sincronizar modelos.", type: "error" });
    } finally {
      setSyncing(false);
    }
  }

  function addCustomProvider() {
    setKeys(prev => ({
      ...prev,
      custom_providers: [
        ...(prev.custom_providers || []),
        { name: "", base_url: "", api_key: "" }
      ]
    }));
  }

  function updateCustomProvider(index: number, field: keyof CustomProvider, value: string) {
    setKeys(prev => {
      const providers = [...(prev.custom_providers || [])];
      providers[index] = { ...providers[index], [field]: value };
      return { ...prev, custom_providers: providers };
    });
  }

  function removeCustomProvider(index: number) {
    setKeys(prev => {
      const providers = [...(prev.custom_providers || [])];
      providers.splice(index, 1);
      return { ...prev, custom_providers: providers };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">Configuración de APIs</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {message && (
            <div className={`rounded-md p-3 text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              {message.text}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-medium text-slate-800 border-b pb-2">Proveedores Oficiales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Google AI (Gemini)</label>
                <input
                  type="text"
                  placeholder="AIzaSy..."
                  value={keys.google_ai || ""}
                  onChange={(e) => setKeys({ ...keys, google_ai: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Groq</label>
                <input
                  type="text"
                  placeholder="gsk_..."
                  value={keys.groq || ""}
                  onChange={(e) => setKeys({ ...keys, groq: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Cerebras</label>
                <input
                  type="text"
                  value={keys.cerebras || ""}
                  onChange={(e) => setKeys({ ...keys, cerebras: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">OpenAI</label>
                <input
                  type="text"
                  placeholder="sk-..."
                  value={keys.openai || ""}
                  onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">DeepSeek</label>
                <input
                  type="text"
                  placeholder="sk-..."
                  value={keys.deepseek || ""}
                  onChange={(e) => setKeys({ ...keys, deepseek: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-medium text-slate-800">Proveedores Dinámicos (API Compatible con OpenAI)</h3>
              <button
                onClick={addCustomProvider}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="w-4 h-4" /> Agregar API
              </button>
            </div>
            
            {(!keys.custom_providers || keys.custom_providers.length === 0) && (
              <p className="text-sm text-slate-500 italic">No hay proveedores adicionales. Presiona "Agregar API" para añadir uno (ej. Mistral, Together, etc).</p>
            )}

            {keys.custom_providers?.map((provider, idx) => (
              <div key={idx} className="relative rounded-md border border-slate-200 bg-slate-50 p-4 pt-6 mt-2">
                <button
                  onClick={() => removeCustomProvider(idx)}
                  className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                  title="Eliminar API"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Nombre del Proveedor</label>
                    <input
                      type="text"
                      placeholder="Ej: Mistral AI"
                      value={provider.name}
                      onChange={(e) => updateCustomProvider(idx, "name", e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Base URL (hasta /v1)</label>
                    <input
                      type="text"
                      placeholder="Ej: https://api.mistral.ai/v1"
                      value={provider.base_url}
                      onChange={(e) => updateCustomProvider(idx, "base_url", e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600">API Key</label>
                    <input
                      type="text"
                      placeholder="sk-..."
                      value={provider.api_key}
                      onChange={(e) => updateCustomProvider(idx, "api_key", e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex flex-col gap-3 sm:flex-row sm:justify-between">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center justify-center gap-2 rounded-md border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar Modelos
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
}
