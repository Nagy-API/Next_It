import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Montserrat } from "next/font/google";
import { BRAND, brandCss } from "@/config/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", weight: ["500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: BRAND.appName, template: `%s · ${BRAND.appName}` },
  description: `${BRAND.name}'s internal content operations system.`,
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page renders per request so Next.js can put the CSP nonce (src/proxy.ts) on its scripts.
  await headers();
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        {/* Brand colours from src/config/brand.ts */}
        <style dangerouslySetInnerHTML={{ __html: brandCss() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
