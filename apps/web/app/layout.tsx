// en-GB: Defines the root document and metadata so every rendered page has a consistent accessible shell.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "ShiftFlow",
  title: {
    default: "ShiftFlow | Gestão operacional de turnos e atividades",
    template: "%s | ShiftFlow"
  },
  description:
    "Plataforma corporativa para gerir turnos, equipas, atividades, indicadores e operações em tempo real.",
  category: "business",
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
