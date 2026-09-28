import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { brandCss, getBranding } from "@/server/branding";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", weight: ["500", "600", "700", "800"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: { default: b.appName, template: `%s · ${b.appName}` },
    description: `${b.name}'s internal content operations system.`,
    robots: { index: false, follow: false },
    ...(b.customMark ? { icons: { icon: b.markUrl, apple: b.markUrl } } : {}),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const b = await getBranding();
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        {/* The company's colours (Settings → Company & branding). */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(b) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
