import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Concepte Blau · Gestión de piscinas", template: "%s · Concepte Blau" },
  description: "Demo local para gestionar mantenimiento de piscinas.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2a4227" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
