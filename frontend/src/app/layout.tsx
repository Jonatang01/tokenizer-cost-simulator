/**
 * Tokenizer & Cost Dashboard Layout
 * Autor: Jonatan Gutierrez (JG)
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tokenizador | Costos",
  description: "Simulador interno de costos de automatizacion de comprobantes"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
