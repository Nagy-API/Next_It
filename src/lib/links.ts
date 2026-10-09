/**
 * Any link can be the content of an item (Canva, a Google Doc, a Drive file, Notion…).
 * This names it from its address so buttons say "Open Google Doc" instead of always "Open in Canva".
 */
export type LinkKind = "canva" | "doc" | "sheet" | "slides" | "drive" | "dropbox" | "notion" | "figma" | "youtube" | "instagram" | "tiktok" | "facebook" | "link";

const KINDS: { kind: LinkKind; label: string; test: RegExp }[] = [
  { kind: "canva", label: "Canva", test: /(^|\.)canva\.(com|link)$/ },
  { kind: "doc", label: "Google Doc", test: /^docs\.google\.com$/ },
  { kind: "drive", label: "Drive", test: /^drive\.google\.com$/ },
  { kind: "dropbox", label: "Dropbox", test: /(^|\.)dropbox\.com$/ },
  { kind: "notion", label: "Notion", test: /(^|\.)notion\.(so|site)$/ },
  { kind: "figma", label: "Figma", test: /(^|\.)figma\.com$/ },
  { kind: "youtube", label: "YouTube", test: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { kind: "instagram", label: "Instagram", test: /(^|\.)instagram\.com$/ },
  { kind: "tiktok", label: "TikTok", test: /(^|\.)tiktok\.com$/ },
  { kind: "facebook", label: "Facebook", test: /(^|\.)(facebook\.com|fb\.watch)$/ },
];

export function linkInfo(url: string | null | undefined): { kind: LinkKind; label: string } {
  if (!url) return { kind: "link", label: "Link" };
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "docs.google.com") {
      if (u.pathname.startsWith("/spreadsheets")) return { kind: "sheet", label: "Google Sheet" };
      if (u.pathname.startsWith("/presentation")) return { kind: "slides", label: "Google Slides" };
      return { kind: "doc", label: "Google Doc" };
    }
    const hit = KINDS.find((k) => k.test.test(host));
    return hit ? { kind: hit.kind, label: hit.label } : { kind: "link", label: host.split(".").slice(-2, -1)[0]?.replace(/^\w/, (c) => c.toUpperCase()) || "Link" };
  } catch {
    return { kind: "link", label: "Link" };
  }
}

/** "Open in Canva", "Open Google Doc", "Open link". */
export function openLabel(url: string | null | undefined) {
  const { kind, label } = linkInfo(url);
  if (kind === "canva") return "Open in Canva";
  if (kind === "drive") return "Open in Drive";
  if (kind === "link") return "Open link";
  return `Open ${label}`;
}
