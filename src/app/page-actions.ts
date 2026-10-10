"use server";

/** Docs, whiteboards and sheets inside spaces. Content autosaves often, so saving doesn't refresh the whole app. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import { requireActor } from "@/server/auth";
import { UserError } from "@/server/errors";
import { archivePage, createPage, duplicatePage, renamePage, savePageContent } from "@/server/pages";
import { run, str } from "./run";

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** Autosave from the editors: (pageId, the whole content). Validated and size-checked on the server. */
export async function savePageContentAction(pageId: string, content: unknown): Promise<SaveResult> {
  const actor = await requireActor();
  if (actor.user.mustChangePassword) return { ok: false, error: "Choose your own password first (My account)." };
  try {
    const at = await savePageContent(actor, String(pageId), content);
    return { ok: true, savedAt: at.toISOString() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't save. Check your connection — your changes are kept on this screen." };
  }
}

export async function createPageAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let href = "";
  const r = await run(async (actor) => {
    const p = await createPage(actor, { spaceId: str(fd, "spaceId"), kind: str(fd, "kind"), title: str(fd, "title"), icon: str(fd, "icon") || null, template: str(fd, "template") || null });
    href = `/spaces/${p.spaceId}/p/${p.id}`;
    return { message: `${p.title} is ready.`, celebrate: "small" };
  });
  if (r?.ok && href) redirect(href);
  return r;
}

export async function renamePageAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await renamePage(actor, str(fd, "pageId"), { title: fd.has("title") ? str(fd, "title") : undefined, icon: fd.has("icon") ? str(fd, "icon") : undefined });
  });
}

export async function duplicatePageAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let href = "";
  const r = await run(async (actor) => {
    const p = await duplicatePage(actor, str(fd, "pageId"));
    href = `/spaces/${p.spaceId}/p/${p.id}`;
    return "Copied.";
  });
  if (r?.ok && href) redirect(href);
  return r;
}

export async function archivePageAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let back = "";
  const r = await run(async (actor) => {
    back = `/spaces/${await archivePage(actor, str(fd, "pageId"))}`;
    return "Deleted.";
  });
  if (r?.ok && back) {
    revalidatePath("/", "layout");
    redirect(back);
  }
  return r;
}
