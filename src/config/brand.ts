/**
 * Default branding. Everything here can be changed without code in Settings → Company
 * (admins), or per install with environment variables. To set this system up for another
 * company, see WHITE-LABEL.md.
 */
export const DEFAULT_BRAND = {
  name: process.env.COMPANY_NAME || "NEXORA",
  appName: process.env.APP_NAME || `${process.env.COMPANY_NAME || "NEXORA"} Ops`,
  /** Who people ask for an account or a permission. */
  adminContact: process.env.ADMIN_CONTACT || "Shahenda or IT",
  /** Buttons, links, highlights. */
  primaryColor: process.env.BRAND_PRIMARY || "#3b82f6",
  /** Sidebar, headers, text. */
  darkColor: process.env.BRAND_DARK || "#0b1639",
  /** Files in /public/brand — replace them to change the default logo. */
  logo: "/brand/nexora-wordmark-white.png",
  mark: "/brand/nexora-mark-white.png",
  markDark: "/brand/nexora-mark-navy.png",
};

export type Branding = {
  name: string;
  appName: string;
  adminContact: string;
  primaryColor: string;
  darkColor: string;
  logoUrl: string;
  markUrl: string;
  /** A version of the mark that shows on light backgrounds. */
  markDarkUrl: string;
  /** The mark is an uploaded file (shown darkened on light backgrounds). */
  customMark: boolean;
};

export const HEX = /^#[0-9a-fA-F]{6}$/;
