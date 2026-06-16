/**
 * Receipt history management with localStorage persistence.
 */
import { useCallback, useEffect, useState } from "react";
import type { ProcessedReceipt } from "./types";

const STORAGE_KEY = "tokenizer_receipt_history";

function loadFromStorage(): ProcessedReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(receipts: ProcessedReceipt[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useReceiptHistory() {
  const [receipts, setReceipts] = useState<ProcessedReceipt[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount (client only)
  useEffect(() => {
    setReceipts(loadFromStorage());
    setIsLoaded(true);
  }, []);

  // Persist whenever receipts change (after initial load)
  useEffect(() => {
    if (isLoaded) {
      saveToStorage(receipts);
    }
  }, [receipts, isLoaded]);

  const addReceipt = useCallback((receipt: ProcessedReceipt) => {
    setReceipts((prev) => [...prev, receipt]);
  }, []);

  const removeReceipt = useCallback((id: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setReceipts([]);
  }, []);

  return {
    receipts,
    isLoaded,
    addReceipt,
    removeReceipt,
    clearHistory
  } as const;
}
