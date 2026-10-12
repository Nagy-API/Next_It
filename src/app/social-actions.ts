"use server";

/** Form handlers for the Social media schedule. Thin: read the input → call src/server/social*.ts → message. */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions";
import { requireActor } from "@/server/auth";
import { UserError } from "@/server/errors";
import {
  checkAccount,
  connectAccounts,
  deleteMedia,
  deletePost,
  disconnectAccount,
  discoverAccounts,
  looksPublic,
  movePost,
  publicBase,
  retryPost,
  savePost,
  saveSocialConfig,
  setAccountBrand,
  setMediaBrand,
  setMediaThumb,
  type FoundView,
  type PostInput,
} from "@/server/social";
import { publishDue, refreshMetrics } from "@/server/social-queue";
import { can, NOT_ALLOWED } from "@/domain/permissions";
import { run, str } from "./run";

/* ------------------------------ Configuration ------------------------------ */

export async function saveSocialConfigAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await saveSocialConfig(actor, { appId: str(fd, "appId"), appSecret: str(fd, "appSecret"), publicUrl: str(fd, "publicUrl") });
    return "Saved.";
  });
}

/** Does the saved public address answer? (Meta must be able to open it to download photos and videos.) */
export async function testPublicAddressAction(): Promise<ActionResult> {
  return run(async (actor) => {
    if (!can.configureSocial(actor)) throw new UserError(NOT_ALLOWED);
    const base = await publicBase();
    if (!base) throw new UserError("Save the public address first.");
    if (!looksPublic(base)) throw new UserError(`${base} is a private address (or not https). Facebook and Instagram can only download files from a public https address.`);
    const res = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
    if (!res || res.status >= 400) throw new UserError(`${base} didn't answer${res ? ` (error ${res.status})` : ""}. Check the address — it should be the one you open this system with.`);
    return `${base} answers. Meta will download photos and videos from it.`;
  });
}

export type DiscoverResult = { ok: true; pages: FoundView[] } | { ok: false; error: string };

/** Step 1 of connecting: which pages does this access token give? (Returns names only — tokens stay on the server.) */
export async function discoverSocialAction(token: string): Promise<DiscoverResult> {
  const actor = await requireActor();
  if (actor.user.mustChangePassword) return { ok: false, error: "Choose your own password first (My account)." };
  try {
    return { ok: true, pages: await discoverAccounts(actor, String(token ?? "")) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function connectSocialAction(picks: { pageId: string; brandId: string | null; facebook: boolean; instagram: boolean }[]): Promise<ActionResult> {
  return run(async (actor) => {
    const clean = (Array.isArray(picks) ? picks : []).slice(0, 100).map((p) => ({ pageId: String(p?.pageId ?? ""), brandId: p?.brandId ? String(p.brandId) : null, facebook: !!p?.facebook, instagram: !!p?.instagram }));
    const n = await connectAccounts(actor, clean);
    return { message: `${n} channel${n === 1 ? "" : "s"} connected.`, celebrate: "small" };
  });
}

export async function setAccountBrandAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await setAccountBrand(actor, str(fd, "id"), str(fd, "brandId") || null);
    return "Saved.";
  });
}

export async function checkAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => checkAccount(actor, str(fd, "id")));
}

export async function disconnectAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await disconnectAccount(actor, str(fd, "id"));
    return "Disconnected.";
  });
}

/* ------------------------------ Media ------------------------------ */

export async function deleteSocialMediaAction(id: string): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteMedia(actor, String(id));
    return "Deleted.";
  });
}

export async function setMediaBrandAction(id: string, brandId: string | null): Promise<ActionResult> {
  return run(async (actor) => {
    await setMediaBrand(actor, String(id), brandId ? String(brandId) : null);
  });
}

/** The small preview the browser made right after an upload (kept after the file itself is removed). */
export async function setMediaThumbAction(id: string, dataUrl: string): Promise<ActionResult> {
  return run(async (actor) => {
    await setMediaThumb(actor, String(id), String(dataUrl));
  });
}

/** After an upload finishes (it goes through /api/social/upload), show the new file everywhere. */
export async function mediaUploadedAction(): Promise<void> {
  await requireActor();
  revalidatePath("/social", "layout");
}

/* ------------------------------ Posts ------------------------------ */

export async function saveSocialPostAction(input: PostInput): Promise<ActionResult> {
  return run(async (actor) => {
    const r = await savePost(actor, {
      id: input?.id ? String(input.id) : null,
      brandId: input?.brandId ? String(input.brandId) : null,
      kind: input?.kind,
      caption: String(input?.caption ?? ""),
      mediaIds: Array.isArray(input?.mediaIds) ? input.mediaIds.map(String) : [],
      accountIds: Array.isArray(input?.accountIds) ? input.accountIds.map(String) : [],
      day: input?.day ? String(input.day) : null,
      time: input?.time ? String(input.time) : null,
      options: { shareToFeed: input?.options?.shareToFeed !== false },
      mode: input?.mode,
    });
    // "Post now": start sending without waiting for the next minute (the page refreshes when it's out).
    if (r.kick) void publishDue().catch((e) => console.error("Social queue failed:", e));
    return r.message;
  });
}

export async function moveSocialPostAction(id: string, day: string, time: string | null): Promise<ActionResult> {
  return run(async (actor) => {
    await movePost(actor, String(id), String(day), time ? String(time) : null);
  });
}

export async function deleteSocialPostAction(id: string): Promise<ActionResult> {
  return run(async (actor) => {
    await deletePost(actor, String(id));
    return "Deleted.";
  });
}

export async function retrySocialPostAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await retryPost(actor, str(fd, "id"));
    void publishDue().catch((e) => console.error("Social queue failed:", e));
    return "Trying again now.";
  });
}

/** Ask Meta for fresh numbers: one post (`id`) or every post of the last 90 days. */
export async function refreshSocialNumbersAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    if (!can.scheduleSocial(actor)) throw new UserError(NOT_ALLOWED);
    const id = str(fd, "id");
    const n = await refreshMetrics(id ? { postId: id } : { all: true });
    return n ? `Numbers updated for ${n} post${n === 1 ? "" : "s"}.` : "Nothing to update yet.";
  });
}
