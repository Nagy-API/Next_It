import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companySettings } from "@/db/schema";
import { DEFAULT_BRAND, HEX, type Branding } from "@/config/brand";

export type CompanyRow = typeof companySettings.$inferSelect;

export async function getCompanyRow(): Promise<CompanyRow | null> {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  return row ?? null;
}

/** The company's name, colours and logos for this request (falls back to the defaults, e.g. during the build). */
export const getBranding = cache(async (): Promise<Branding> => {
  let row: CompanyRow | null = null;
  try {
    row = await getCompanyRow();
  } catch {
    row = null;
  }
  const v = row?.updatedAt?.getTime() ?? 0;
  return {
    name: row?.name || DEFAULT_BRAND.name,
    appName: row?.appName || DEFAULT_BRAND.appName,
    adminContact: row?.adminContact || DEFAULT_BRAND.adminContact,
    primaryColor: row?.primaryColor && HEX.test(row.primaryColor) ? row.primaryColor : DEFAULT_BRAND.primaryColor,
    darkColor: row?.darkColor && HEX.test(row.darkColor) ? row.darkColor : DEFAULT_BRAND.darkColor,
    logoUrl: row?.logo ? `/api/brand/logo?v=${v}` : DEFAULT_BRAND.logo,
    markUrl: row?.mark ? `/api/brand/mark?v=${v}` : DEFAULT_BRAND.mark,
    markDarkUrl: row?.mark ? `/api/brand/mark?v=${v}` : DEFAULT_BRAND.markDark,
    customMark: !!row?.mark,
  };
});

/** CSS that re-colours the whole app from the two brand colours (derived shades are mixed in the browser). */
export function brandCss(b: Pick<Branding, "primaryColor" | "darkColor">) {
  const p = b.primaryColor;
  const d = b.darkColor;
  return `:root:root{--color-electric:${p};--color-electric-bright:color-mix(in srgb,${p} 70%,white);--color-electric-soft:color-mix(in srgb,${p} 11%,white);--color-navy-950:color-mix(in srgb,${d} 72%,black);--color-navy-900:${d};--color-navy-850:color-mix(in srgb,${d} 92%,white);--color-navy-800:color-mix(in srgb,${d} 86%,white);--color-navy-700:color-mix(in srgb,${d} 76%,white);--color-ink:${d};}`;
}
