/** The sidebar's width and whether it's hidden — remembered on this device (a cookie, so the page never jumps). */
export type SidebarPref = { width: number; collapsed: boolean };

export const SIDEBAR_MIN = 216;
export const SIDEBAR_MAX = 380;
export const SIDEBAR_DEFAULT = 256;

/** Cookie "sb" = "<width>.<0|1>". */
export function parseSidebar(raw: string | undefined | null): SidebarPref {
  const [w, c] = (raw ?? "").split(".");
  const n = Number(w);
  return { width: Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX ? Math.round(n) : SIDEBAR_DEFAULT, collapsed: c === "1" };
}
