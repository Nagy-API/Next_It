import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, Montserrat } from "next/font/google";
import { brandCss } from "@/config/brand";
import { getWorkspace } from "@/server/settings";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", weight: ["500", "600", "700", "800"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const ws = await getWorkspace();
  return {
    title: { default: ws.appName, template: `%s · ${ws.appName}` },
    description: `${ws.name}'s internal operations system.`,
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page renders per request so Next.js can put the CSP nonce (src/proxy.ts) on its scripts.
  await headers();
  const ws = await getWorkspace();
  // Light by default; each device remembers its own choice (cookie set by the theme toggle), so there's no flash.
  const dark = (await cookies()).get("theme")?.value === "dark";
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}${dark ? " dark" : ""}`}>
      <head>
        {/* Brand colours: Settings → Workspace, else src/config/brand.ts */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(ws) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
