/**
 * Workspace settings: the company's name, colours, logos, watermark, which modules are on, and the auto pause time.
 * Changed in Settings → Workspace (people with "Customize the workspace"); no code needed. Anything not set falls
 * back to src/config/brand.ts, so a fresh install looks exactly as before.
 *
 * Read on every page (root layout, sidebar, sign-in), so it's cached in memory and refreshed on every change
 * (and at most every 30 s, in case another process changed it).
 */
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workspaceSettings } from "@/db/schema";
import { BRAND } from "@/config/brand";
import { can } from "@/domain/permissions";
import { logActivity, type Actor } from "./activity";
import { assert } from "./errors";

export const MODULES = {
  content: { label: "Content Studio", hint: "Brands, monthly plans, the content steps (content → shooting → editing / design → social)" },
  projects: { label: "One-off projects", hint: "Client jobs that end in Delivered" },
  spaces: { label: "Spaces", hint: "Your own workflows: departments, lists, tasks, statuses, automations, dashboards" },
  quick: { label: "Quick update", hint: "Update a whole step at once" },
  chat: { label: "Team chat", hint: "One room for the whole team, with @mentions" },
  notes: { label: "Notes", hint: "Short team notes that disappear after 12 hours" },
  fun: { label: "Team fun", hint: "Kudos, today's mood, birthdays and the stars of the week on the Overview" },
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export const IMAGE_KEYS = {
  wordmark: "Wide logo (on dark)",
  mark: "Square symbol (on dark)",
  markLight: "Square symbol (on light)",
  watermark: "Watermark image",
  watermarkDark: "Watermark image (dark mode)",
} as const;
export type ImageKey = keyof typeof IMAGE_KEYS;
export const IMAGE_KEY_LIST = Object.keys(IMAGE_KEYS) as ImageKey[];

export type Workspace = {
  name: string;
  appName: string;
  tagline: string;
  adminContact: string;
  primary: string;
  dark: string;
  /** logo = the square symbol, image = its own picture, none = no watermark. */
  watermark: "logo" | "image" | "none";
  /** 0–30 (%). */
  watermarkOpacity: number;
  /** Dark mode has its own watermark: logo = the symbol for dark backgrounds, image = its own picture. */
  watermarkDark: "logo" | "image" | "none";
  watermarkDarkOpacity: number;
  modules: Record<ModuleKey, boolean>;
  /** "HH:MM" (Cairo): running clocks pause themselves at this time. "" = off. */
  autoPauseAt: string;
  /** The daily message at the top of every page: one line per day, in turn (Settings → Messages). Empty = friendly defaults. */
  dailyMessages: string[];
};

export type WorkspaceView = Workspace & {
  /** URLs to show (uploaded image, or the built-in file). */
  logos: { wordmark: string; mark: string; markLight: string; watermark: string; watermarkDark: string };
  /** Which images were uploaded (vs the built-in ones). */
  custom: Record<ImageKey, boolean>;
};

export const DEFAULT_WORKSPACE: Workspace = {
  name: BRAND.name,
  appName: BRAND.appName,
  tagline: BRAND.tagline,
  adminContact: BRAND.adminContact,
  primary: BRAND.colors.primary,
  dark: BRAND.colors.dark,
  watermark: "logo",
  watermarkOpacity: 5,
  watermarkDark: "logo",
  watermarkDarkOpacity: 3,
  modules: { content: true, projects: true, spaces: true, quick: true, chat: true, notes: true, fun: true },
  autoPauseAt: "21:00",
  dailyMessages: [],
};

const BUILT_IN: Record<ImageKey, string> = {
  wordmark: BRAND.logos.wordmarkOnDark,
  mark: BRAND.logos.markOnDark,
  markLight: BRAND.logos.markOnLight,
  watermark: BRAND.logos.markOnLight,
  watermarkDark: BRAND.logos.markOnDark,
};

type Img = { data: string; hash: string };
const imgKey = (k: ImageKey) => `image.${k}`;

let cache: { at: number; view: WorkspaceView } | null = null;
const TTL = 30_000;

function merge(raw: unknown): Workspace {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Workspace>;
  return {
    ...DEFAULT_WORKSPACE,
    ...Object.fromEntries(Object.entries(r).filter(([k, v]) => k in DEFAULT_WORKSPACE && v !== null && v !== undefined)),
    modules: { ...DEFAULT_WORKSPACE.modules, ...(r.modules ?? {}) },
  } as Workspace;
}

/** The workspace as every page sees it. Never throws (a broken read falls back to the built-in brand). */
export async function getWorkspace(): Promise<WorkspaceView> {
  if (cache && Date.now() - cache.at < TTL) return cache.view;
  try {
    const rows = await db.select().from(workspaceSettings).where(inArray(workspaceSettings.key, ["workspace", ...IMAGE_KEY_LIST.map(imgKey)]));
    const ws = merge(rows.find((r) => r.key === "workspace")?.value);
    const img = (k: ImageKey) => rows.find((r) => r.key === imgKey(k))?.value as Img | undefined;
    const custom = Object.fromEntries(IMAGE_KEY_LIST.map((k) => [k, !!img(k)])) as Record<ImageKey, boolean>;
    const url = (k: ImageKey) => (img(k) ? `/api/workspace-asset/${k}?v=${img(k)!.hash}` : BUILT_IN[k]);
    const view: WorkspaceView = { ...ws, custom, logos: { wordmark: url("wordmark"), mark: url("mark"), markLight: url("markLight"), watermark: img("watermark") ? url("watermark") : url("markLight"), watermarkDark: img("watermarkDark") ? url("watermarkDark") : url("mark") } };
    cache = { at: Date.now(), view };
    return view;
  } catch {
    return { ...DEFAULT_WORKSPACE, custom: { wordmark: false, mark: false, markLight: false, watermark: false, watermarkDark: false }, logos: { ...BUILT_IN } };
  }
}

export async function isModuleOn(key: ModuleKey) {
  return (await getWorkspace()).modules[key];
}

/** An uploaded image (for /api/workspace-asset). */
export async function getWorkspaceImage(k: ImageKey) {
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.key, imgKey(k)));
  return (row?.value as Img | undefined) ?? null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export async function updateWorkspace(actor: Actor, input: Partial<Workspace>) {
  assert(can.customizeWorkspace(actor), "Only people allowed to customize the workspace can change this.");
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.key, "workspace"));
  const current = merge(row?.value);
  const next: Workspace = { ...current, modules: { ...current.modules } };
  if (input.name !== undefined) next.name = clean(input.name, 40) || DEFAULT_WORKSPACE.name;
  if (input.appName !== undefined) next.appName = clean(input.appName, 40) || DEFAULT_WORKSPACE.appName;
  if (input.tagline !== undefined) next.tagline = clean(input.tagline, 60);
  if (input.adminContact !== undefined) next.adminContact = clean(input.adminContact, 80) || DEFAULT_WORKSPACE.adminContact;
  if (input.primary !== undefined) {
    assert(HEX.test(input.primary), "Colours are hex values like #3B82F6.");
    next.primary = input.primary.toLowerCase();
  }
  if (input.dark !== undefined) {
    assert(HEX.test(input.dark), "Colours are hex values like #0B1639.");
    next.dark = input.dark.toLowerCase();
  }
  if (input.watermark !== undefined) {
    assert(["logo", "image", "none"].includes(input.watermark), "Pick a watermark.");
    next.watermark = input.watermark;
  }
  if (input.watermarkOpacity !== undefined) next.watermarkOpacity = Math.max(0, Math.min(30, Math.round(Number(input.watermarkOpacity) || 0)));
  if (input.watermarkDark !== undefined) {
    assert(["logo", "image", "none"].includes(input.watermarkDark), "Pick a watermark.");
    next.watermarkDark = input.watermarkDark;
  }
  if (input.watermarkDarkOpacity !== undefined) next.watermarkDarkOpacity = Math.max(0, Math.min(30, Math.round(Number(input.watermarkDarkOpacity) || 0)));
  if (input.modules) for (const k of MODULE_KEYS) if (typeof input.modules[k] === "boolean") next.modules[k] = input.modules[k];
  if (input.dailyMessages !== undefined)
    next.dailyMessages = input.dailyMessages
      .map((x) => String(x).trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 100);
  if (input.autoPauseAt !== undefined) {
    assert(input.autoPauseAt === "" || TIME.test(input.autoPauseAt), "The auto pause time looks like 21:00.");
    next.autoPauseAt = input.autoPauseAt;
  }
  const changed = (Object.keys(next) as (keyof Workspace)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]));
  if (!changed.length) return;
  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceSettings)
      .values({ key: "workspace", value: next, updatedById: actor.id })
      .onConflictDoUpdate({ target: workspaceSettings.key, set: { value: next, updatedById: actor.id, updatedAt: new Date() } });
    await logActivity(tx, actor, { action: "workspace_updated", field: changed.join(","), summary: `${actor.name} changed the workspace settings (${changed.join(", ")}).` });
  });
  cache = null;
}

/** Upload (data URL) or remove (null) one of the workspace images. */
export async function setWorkspaceImage(actor: Actor, k: ImageKey, dataUrl: string | null) {
  assert(can.customizeWorkspace(actor), "Only people allowed to customize the workspace can change this.");
  assert(k in IMAGE_KEYS, "Unknown image.");
  if (dataUrl) assert(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) && dataUrl.length < 600_000, "Use a PNG, JPG or WebP image under 400 KB.");
  await db.transaction(async (tx) => {
    if (dataUrl) {
      const value: Img = { data: dataUrl, hash: createHash("sha256").update(dataUrl).digest("hex").slice(0, 12) };
      await tx
        .insert(workspaceSettings)
        .values({ key: imgKey(k), value, updatedById: actor.id })
        .onConflictDoUpdate({ target: workspaceSettings.key, set: { value, updatedById: actor.id, updatedAt: new Date() } });
    } else {
      await tx.delete(workspaceSettings).where(eq(workspaceSettings.key, imgKey(k)));
    }
    await logActivity(tx, actor, { action: "workspace_updated", field: imgKey(k), summary: `${actor.name} ${dataUrl ? "uploaded" : "removed"} the ${IMAGE_KEYS[k].toLowerCase()}.` });
  });
  cache = null;
}

/** Tests and the auto pause job. */
export function forgetWorkspaceCache() {
  cache = null;
}

/** Settings → Messages: the daily message lines (people with "Write the daily message"). */
export async function setDailyMessages(actor: Actor, lines: string[]) {
  assert(can.announce(actor), "Only people allowed to write the daily message can change it (Settings → Access).");
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.key, "workspace"));
  const next = { ...merge(row?.value), dailyMessages: lines.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 100) };
  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceSettings)
      .values({ key: "workspace", value: next, updatedById: actor.id })
      .onConflictDoUpdate({ target: workspaceSettings.key, set: { value: next, updatedById: actor.id, updatedAt: new Date() } });
    await logActivity(tx, actor, { action: "workspace_updated", field: "dailyMessages", summary: `${actor.name} updated the daily messages (${next.dailyMessages.length}).` });
  });
  cache = null;
}
