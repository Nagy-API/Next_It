/**
 * ============================================================================
 *  BRANDING — the ONE place to change the company name, colours and logos.
 * ============================================================================
 *
 *  These are the DEFAULTS. Owners can change the name, colours, logos and watermark without code in
 *  Settings → Workspace (src/server/settings.ts); anything they don't change comes from here.
 *
 *  To use this system for another company (or to refresh NEXORA's look):
 *   1. Change the values below.
 *   2. Replace the image files in /public/brand/ (keep the same file names, or change the paths below).
 *   3. Replace src/app/icon.png and src/app/apple-icon.png (browser tab icons).
 *  Nothing else needs to change: every screen, the sign-in page, emails-free notifications,
 *  Excel reports and file names read from here. The full colour palette lives in
 *  src/app/globals.css (@theme) — PRIMARY and DARK below override the two brand colours there.
 *
 *  NEXORA identity: deep navy #0B1639 + electric blue #3B82F6.
 */
export const BRAND = {
  /** Company name shown on the sign-in page, chat, reports and Excel files. */
  name: "NEXORA",
  /** Name of the system (browser tab title). */
  appName: "NEXORA Ops",
  /** Short tagline under the logo on the sign-in page. */
  tagline: "Internal Operations",
  /** Who people ask for an account or a permission. */
  adminContact: "Shahenda or King (IT)",

  colors: {
    /** Buttons, links, highlights. */
    primary: "#3b82f6",
    /** Sidebar, headers, text. */
    dark: "#0b1639",
  },

  /** Images in /public (paths are URLs). */
  logos: {
    /** Wide logo for dark backgrounds (sidebar, sign-in page). */
    wordmarkOnDark: "/brand/nexora-wordmark-white.png",
    /** Square symbol for dark backgrounds. */
    markOnDark: "/brand/nexora-mark-white.png",
    /** Square symbol for light backgrounds (faint watermark). */
    markOnLight: "/brand/nexora-mark-navy.png",
  },
} as const;

/**
 * CSS custom properties generated from BRAND.colors. Injected in src/app/layout.tsx so Tailwind
 * classes like bg-electric / bg-strong / text-ink follow the brand. Lighter/darker shades are mixed
 * from the two colours, so changing two hex values re-colours the whole app.
 */
export function brandCss(colors: { primary: string; dark: string } = BRAND.colors) {
  // Settings → Workspace can change the two colours; anything that isn't a plain hex value is ignored.
  const hex = (v: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
  const p = hex(colors.primary, BRAND.colors.primary);
  const d = hex(colors.dark, BRAND.colors.dark);
  return `:root:root{--color-electric:${p};--color-electric-bright:color-mix(in srgb,${p} 70%,white);--color-electric-soft:color-mix(in srgb,${p} 12%,var(--color-surface));--color-navy-950:color-mix(in srgb,${d} 72%,black);--color-navy-900:${d};--color-navy-850:color-mix(in srgb,${d} 92%,white);--color-navy-800:color-mix(in srgb,${d} 86%,white);--color-navy-700:color-mix(in srgb,${d} 76%,white);--color-ink:${d};--color-strong:${d};}`;
}
