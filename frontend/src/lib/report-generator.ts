/**
 * Client-side report generators: CSV and PDF with chart.
 */
import type { CostComparisonReport, ProcessedReceipt } from "./types";

// ---------------------------------------------------------------------------
// CSV — Single-model comparison report
// ---------------------------------------------------------------------------

export function downloadReportCSV(report: CostComparisonReport): void {
  const date = new Date(report.generated_at).toLocaleDateString("es-AR");
  const lines: string[] = [];

  lines.push("INFORME COMPARATIVO DE COSTOS - Tokenizer");
  lines.push(`Fecha de generacion,${date}`);
  lines.push(`Comprobante,${report.receipt.filename}`);
  lines.push(
    `Dimensiones,"${report.receipt.width}x${report.receipt.height} (${report.receipt.format})"`
  );
  lines.push(`Requiere mejora,${report.receipt.quality_analysis.requires_enhancement ? "Si" : "No"}`);
  lines.push(`Volumen diario,${report.parameters.daily_volume}`);
  lines.push(`Volumen mensual,${report.parameters.monthly_volume}`);
  lines.push("");

  lines.push(
    [
      "Modelo",
      "Proveedor",
      "Precio Input/1M (USD)",
      "Precio Output/1M (USD)",
      "Tokens Imagen",
      "Tokens Input",
      "Tokens Output",
      "Tokens Total",
      "Costo/Comprobante (USD)",
      "Costo Diario (USD)",
      "Costo Semanal (USD)",
      "Costo Mensual (USD)"
    ].join(",")
  );

  for (const c of report.comparisons) {
    lines.push(
      [
        `"${c.model_name}"`,
        `"${c.provider}"`,
        c.input_price_per_million.toFixed(4),
        c.output_price_per_million.toFixed(4),
        c.tokens.image_tokens,
        c.tokens.input_tokens,
        c.tokens.output_tokens,
        c.tokens.total_tokens,
        c.costs.cost_per_receipt.toFixed(8),
        c.costs.daily_cost.toFixed(6),
        c.costs.weekly_cost.toFixed(6),
        c.costs.monthly_cost.toFixed(6)
      ].join(",")
    );
  }

  lines.push("");
  lines.push("RESUMEN");
  lines.push(`Modelos comparados,${report.summary.total_models}`);
  lines.push(
    `Mas economico,"${report.summary.cheapest}",${report.summary.cheapest_cost.toFixed(8)}`
  );
  lines.push(
    `Mas costoso,"${report.summary.most_expensive}",${report.summary.most_expensive_cost.toFixed(8)}`
  );

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;"
  });
  triggerDownload(blob, `informe_costos_${dateStamp()}.csv`);
}

// ---------------------------------------------------------------------------
// PDF — Single-model comparison report
// ---------------------------------------------------------------------------

export async function downloadReportPDF(
  report: CostComparisonReport
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const date = new Date(report.generated_at).toLocaleDateString("es-AR");

  // ---- Header ----
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Informe Comparativo de Costos", margin, 13);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${date}`, margin, 21);
  doc.text(`Comprobante: ${report.receipt.filename}`, pageW / 2, 21);

  let y = 36;
  doc.setTextColor(51, 51, 51);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, 18, 2, 2, "F");
  doc.setFontSize(9);
  const infoItems = [
    `Imagen: ${report.receipt.width}×${report.receipt.height} (${report.receipt.format})`,
    `Requiere mejora: ${report.receipt.quality_analysis.requires_enhancement ? "Sí" : "No"}`,
    `Contraste: ${report.receipt.quality_analysis.contrast.toFixed(1)}`,
    `Nitidez: ${report.receipt.quality_analysis.sharpness.toFixed(1)}`,
    `Vol. diario: ${report.parameters.daily_volume}`,
    `Vol. mensual: ${report.parameters.monthly_volume}`
  ];
  const colW = contentW / infoItems.length;
  for (let i = 0; i < infoItems.length; i++) {
    doc.text(infoItems[i], margin + 4 + i * colW, y + 7);
  }
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Campos: ${report.parameters.fields.join(", ")}`, margin + 4, y + 7);

  // ---- Bar chart ----
  y += 18;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("Costo por comprobante (USD)", margin, y);
  y += 4;

  const chartH = Math.min(report.comparisons.length * 10 + 4, 70);
  const barMaxW = contentW * 0.55;
  const maxCost = Math.max(...report.comparisons.map((c) => c.costs.cost_per_receipt), 0.000001);
  const pdfBarColors: [number, number, number][] = [
    [16, 185, 129], [34, 197, 94], [132, 204, 22], [234, 179, 8],
    [249, 115, 22], [239, 68, 68], [168, 85, 247], [99, 102, 241],
    [14, 165, 233], [20, 184, 166],
  ];

  for (let i = 0; i < report.comparisons.length; i++) {
    const c = report.comparisons[i];
    const barW = Math.max(2, (c.costs.cost_per_receipt / maxCost) * barMaxW);
    const barY = y + i * 9;
    const color = pdfBarColors[i % pdfBarColors.length];
    const labelW = contentW * 0.25;
    const label = c.model_name.length > 30 ? c.model_name.substring(0, 28) + "…" : c.model_name;

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 51, 51);
    doc.text(label, margin, barY + 5);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(margin + labelW, barY + 1, barW, 6, 1, 1, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`$${c.costs.cost_per_receipt.toFixed(8)}`, margin + labelW + barW + 3, barY + 5.5);
  }

  y += chartH + 8;
  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("Detalle por modelo", margin, y);
  y += 7;

  autoTable(doc, {
    startY: y,
    head: [["Modelo", "Proveedor", "$/1M In", "$/1M Out", "Tok. Img", "Tok. In", "Tok. Out", "$/Comp.", "$/Día", "$/Sem.", "$/Mes"]],
    body: report.comparisons.map((c) => [
      c.model_name, c.provider,
      `$${c.input_price_per_million.toFixed(2)}`, `$${c.output_price_per_million.toFixed(2)}`,
      String(c.tokens.image_tokens), String(c.tokens.input_tokens), String(c.tokens.output_tokens),
      `$${c.costs.cost_per_receipt.toFixed(8)}`, `$${c.costs.daily_cost.toFixed(6)}`,
      `$${c.costs.weekly_cost.toFixed(6)}`, `$${c.costs.monthly_cost.toFixed(4)}`
    ]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 42 }, 7: { fontStyle: "bold" } }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY: number = (doc as any).lastAutoTable?.finalY ?? (doc as any).previousAutoTable?.finalY ?? y + 40;
  const summaryY = finalY + 8;
  if (summaryY < doc.internal.pageSize.getHeight() - 30) {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, summaryY, contentW, 16, 2, 2, "F");
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(margin, summaryY, contentW, 16, 2, 2, "S");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 101, 52);
    doc.text("Resumen", margin + 4, summaryY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Más económico: ${report.summary.cheapest} — $${report.summary.cheapest_cost.toFixed(8)}/comprobante`, margin + 4, summaryY + 12);
    doc.text(`Más costoso: ${report.summary.most_expensive} — $${report.summary.most_expensive_cost.toFixed(8)}/comprobante`, pageW / 2, summaryY + 12);
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Los costos son estimaciones basadas en precios oficiales sincronizados. Variación estimada: ±10-20% en tokens de texto.", margin, pageH - 6);
  doc.text(`Tokenizer — ${date}`, pageW - margin - 30, pageH - 6);

  doc.save(`informe_costos_${dateStamp()}.pdf`);
}

// ---------------------------------------------------------------------------
// CSV — History / consolidated report
// ---------------------------------------------------------------------------

type ChatParams = {
  incidenceRate: number;
  chatTurns: number;
  chatCostPerSession: number;
};

export function downloadHistoryCSV(receipts: ProcessedReceipt[], chat?: ChatParams): void {
  const lines: string[] = [];

  lines.push("INFORME CONSOLIDADO DE COMPROBANTES PROCESADOS - Tokenizer");
  lines.push(`Fecha de generacion,${new Date().toLocaleDateString("es-AR")}`);
  lines.push(`Total comprobantes,${receipts.length}`);
  lines.push("");

  lines.push(
    [
      "Archivo", "Fecha procesado", "Modelo", "Proveedor", "Dimensiones", "Formato",
      "Requirio mejora", "Se mejoro", "Tokens Input (est.)", "Tokens Output (est.)",
      "Costo estimado (USD)", "Tokens Input (real)", "Tokens Output (real)", "Costo real (USD)"
    ].join(",")
  );

  for (const r of receipts) {
    lines.push(
      [
        `"${r.filename}"`, new Date(r.processedAt).toLocaleDateString("es-AR"),
        `"${r.modelName}"`, `"${r.provider}"`,
        `${r.image.width}x${r.image.height}`, r.image.format,
        r.qualityRequiresEnhancement ? "Si" : "No", r.wasEnhanced ? "Si" : "No",
        r.estimatedTokens.input, r.estimatedTokens.output,
        r.estimatedCost.toFixed(8),
        r.realTokens?.input ?? "", r.realTokens?.output ?? "",
        r.realCost != null ? r.realCost.toFixed(8) : ""
      ].join(",")
    );
  }

  const totalEstimated = receipts.reduce((s, r) => s + r.estimatedCost, 0);
  const realReceipts = receipts.filter((r) => r.realCost != null);
  const totalReal = realReceipts.reduce((s, r) => s + (r.realCost ?? 0), 0);

  lines.push("");
  lines.push("RESUMEN");
  lines.push(`Total comprobantes,${receipts.length}`);
  lines.push(`Costo total estimado,${totalEstimated.toFixed(8)}`);
  lines.push(`Costo promedio estimado,${receipts.length > 0 ? (totalEstimated / receipts.length).toFixed(8) : "0"}`);
  if (realReceipts.length > 0) {
    lines.push(`Comprobantes con costo real,${realReceipts.length}`);
    lines.push(`Costo total real,${totalReal.toFixed(8)}`);
    lines.push(`Costo promedio real,${(totalReal / realReceipts.length).toFixed(8)}`);
  }
  if (chat && chat.chatCostPerSession > 0) {
    const chatIncidences = Math.ceil(receipts.length * chat.incidenceRate);
    const totalChatCost = chatIncidences * chat.chatCostPerSession * chat.chatTurns;
    lines.push("");
    lines.push("COSTOS DE CHAT");
    lines.push(`Tasa de incidencia,${(chat.incidenceRate * 100).toFixed(1)}%`);
    lines.push(`Incidencias estimadas,${chatIncidences}`);
    lines.push(`Turnos por incidencia,${chat.chatTurns}`);
    lines.push(`Costo por sesion chat,${chat.chatCostPerSession.toFixed(8)}`);
    lines.push(`Costo total chat,${totalChatCost.toFixed(8)}`);
    lines.push(`TOTAL (OCR + Chat),${(totalEstimated + totalChatCost).toFixed(8)}`);
  }

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `informe_consolidado_${dateStamp()}.csv`);
}

// ---------------------------------------------------------------------------
// PDF — History / consolidated report with chart
// ---------------------------------------------------------------------------

export async function downloadHistoryPDF(receipts: ProcessedReceipt[], chat?: ChatParams): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const now = new Date().toLocaleDateString("es-AR");

  // Aggregate calculations
  const totalEstimated = receipts.reduce((s, r) => s + r.estimatedCost, 0);
  const realReceipts = receipts.filter((r) => r.realCost != null);
  const totalReal = realReceipts.reduce((s, r) => s + (r.realCost ?? 0), 0);
  const avgEstimated = receipts.length > 0 ? totalEstimated / receipts.length : 0;
  const enhancedCount = receipts.filter((r) => r.wasEnhanced).length;
  const neededEnhancement = receipts.filter((r) => r.qualityRequiresEnhancement).length;
  const rateLimitedCount = receipts.filter((r) => r.rateLimited).length;
  const modelsUsed = [...new Set(receipts.map((r) => r.modelName))];

  // ---- Header banner ----
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Informe Consolidado de Comprobantes", margin, 11);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${now}`, margin, 18);
  doc.text(`Modelos: ${modelsUsed.join(", ")}`, pageW / 3, 18);

  // ---- Metric cards (2 rows x 4 cols) using autoTable ----
  let y = 30;

  const chatIncidences = chat ? Math.ceil(receipts.length * chat.incidenceRate) : 0;
  const totalChatCost = chat ? chatIncidences * chat.chatCostPerSession * chat.chatTurns : 0;
  const grandTotal = totalEstimated + totalChatCost;

  autoTable(doc, {
    startY: y,
    head: [["Comprobantes", "Fotos con mejora OpenCV", "Con extracción real", "Bloqueos por Límite de Cuota"]],
    body: [[
      String(receipts.length),
      `${enhancedCount} mejorados / ${neededEnhancement} detectados`,
      `${realReceipts.length} de ${receipts.length}`,
      rateLimitedCount > 0 ? `${rateLimitedCount} comprobantes (HTTP 429)` : "Ninguno"
    ]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4, halign: "center", lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontStyle: "bold", fontSize: 11 },
    theme: "grid"
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? (doc as any).previousAutoTable?.finalY ?? y + 20;
  y += 2;

  // Cost metrics row
  const costRow = [
    [`Costo OCR estimado`, `Costo OCR real`, `Costo promedio/comp.`, `TOTAL estimado`],
    [
      `$${totalEstimated.toFixed(6)}`,
      realReceipts.length > 0 ? `$${totalReal.toFixed(6)}` : "—",
      `$${avgEstimated.toFixed(8)}`,
      `$${grandTotal.toFixed(6)}`
    ]
  ];

  if (chat && chat.chatCostPerSession > 0) {
    costRow[0].splice(3, 0, `Chat (${chatIncidences} incidencias)`);
    costRow[1].splice(3, 0, `$${totalChatCost.toFixed(6)}`);
  }

  autoTable(doc, {
    startY: y,
    head: [costRow[0]],
    body: [costRow[1]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4, halign: "center", lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: [238, 242, 255], textColor: [67, 56, 202], fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontStyle: "bold", fontSize: 11, textColor: [30, 41, 59] },
    theme: "grid"
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? (doc as any).previousAutoTable?.finalY ?? y + 20;

  // ---- Bar chart: estimated vs real cost per receipt ----
  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("Costo por comprobante (Estimado vs Real)", margin, y);
  y += 4;

  const maxCostVal = Math.max(...receipts.map((r) => Math.max(r.estimatedCost, r.realCost ?? 0)), 0.000001);
  const barAreaW = contentW * 0.45;
  const labelAreaW = contentW * 0.28;
  const barH = 4;
  const rowHeight = barH * 2 + 4;
  const maxBars = Math.min(receipts.length, Math.floor((pageH - y - 20) / rowHeight));

  for (let i = 0; i < maxBars; i++) {
    const r = receipts[i];
    const rowY = y + i * rowHeight;

    // Filename label
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 51, 51);
    const shortName = r.filename.length > 30 ? r.filename.substring(0, 28) + "…" : r.filename;
    doc.text(shortName, margin, rowY + 3);

    // Enhancement indicator
    if (r.wasEnhanced) {
      doc.setFontSize(5);
      doc.setTextColor(180, 83, 9);
      doc.text("OpenCV", margin, rowY + 6.5);
    }

    // Estimated bar (indigo)
    const estW = Math.max(1, (r.estimatedCost / maxCostVal) * barAreaW);
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(margin + labelAreaW, rowY, estW, barH, 0.8, 0.8, "F");
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(`$${r.estimatedCost.toFixed(8)}`, margin + labelAreaW + estW + 2, rowY + 3);

    // Real bar (emerald)
    if (r.realCost != null) {
      const realW = Math.max(1, (r.realCost / maxCostVal) * barAreaW);
      doc.setFillColor(16, 185, 129);
      doc.roundedRect(margin + labelAreaW, rowY + barH + 1, realW, barH, 0.8, 0.8, "F");
      doc.text(`$${r.realCost.toFixed(8)}`, margin + labelAreaW + realW + 2, rowY + barH + 4);
    }
  }

  // Legend
  const legendY = y + maxBars * rowHeight + 3;
  doc.setFillColor(79, 70, 229);
  doc.rect(margin, legendY, 5, 2.5, "F");
  doc.setFontSize(7);
  doc.setTextColor(51, 51, 51);
  doc.text("Estimado", margin + 7, legendY + 2);
  doc.setFillColor(16, 185, 129);
  doc.rect(margin + 28, legendY, 5, 2.5, "F");
  doc.text("Real (Gemini)", margin + 35, legendY + 2);
  doc.setFillColor(180, 83, 9);
  doc.rect(margin + 64, legendY, 5, 2.5, "F");
  doc.text("= Mejorado con OpenCV", margin + 71, legendY + 2);

  // ---- Data table (page 2) ----
  doc.addPage();
  y = 16;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("Detalle de comprobantes procesados", margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["#", "Archivo", "Modelo", "Dim.", "Mejora", "Tok. Est.", "$/Estimado", "Tok. Real", "$/Real", "Estado"]],
    body: receipts.map((r, i) => {
      let estado = "—";
      if (r.realCost != null && r.estimatedCost > 0) {
        estado = (((r.realCost - r.estimatedCost) / r.estimatedCost) * 100).toFixed(1) + "%";
      } else if (r.rateLimited) {
        estado = "Error 429 (Cuota)";
      } else if (r.error) {
        estado = "Error API";
      }

      return [
        String(i + 1),
        r.filename.length > 28 ? r.filename.substring(0, 26) + "…" : r.filename,
        r.modelName.length > 22 ? r.modelName.substring(0, 20) + "…" : r.modelName,
        `${r.image.width}x${r.image.height}`,
        r.wasEnhanced ? "Sí" : "No",
        String(r.estimatedTokens.total),
        `$${r.estimatedCost.toFixed(8)}`,
        r.realTokens ? String(r.realTokens.total) : "—",
        r.realCost != null ? `$${r.realCost.toFixed(8)}` : "—",
        estado
      ];
    }),
    margin: { left: margin, right: margin },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      6: { fontStyle: "bold" },
      8: { fontStyle: "bold" }
    }
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "Los costos estimados tienen variación ±10-20%. Los costos reales provienen de la API de Gemini.",
      margin, pageH - 6
    );
    doc.text(`Tokenizer — ${now} — Pág. ${p}/${totalPages}`, pageW - margin - 40, pageH - 6);
  }

  doc.save(`informe_consolidado_${dateStamp()}.pdf`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
