"use server";

/** My notebook (private notes). Saving while typing doesn't refresh the app; only the owner is ever touched. */
import { requireActor } from "@/server/auth";
import { UserError } from "@/server/errors";
import { createNote, deleteNote, myNotes, saveNote, type NotebookNote } from "@/server/notebook";
import { addLink, removeAttachment } from "@/server/attachments";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<T>): Promise<R<T>> {
  const actor = await requireActor();
  if (actor.user.mustChangePassword) return { ok: false, error: "Choose your own password first (My account)." };
  try {
    return { ok: true, data: await fn(actor) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't save. Check your connection." };
  }
}

export async function loadNotebookAction(): Promise<R<NotebookNote[]>> {
  return guard((a) => myNotes(a.id));
}

export async function createNoteAction(title?: string, body?: string): Promise<R<string>> {
  return guard(async (a) => (await createNote(a, { title, body })).id);
}

export async function saveNoteAction(id: string, patch: { title?: string; body?: string; color?: string | null; pinned?: boolean }): Promise<R> {
  return guard(async (a) => {
    await saveNote(a, String(id), { title: typeof patch.title === "string" ? patch.title : undefined, body: typeof patch.body === "string" ? patch.body : undefined, color: patch.color === undefined ? undefined : patch.color ? String(patch.color) : null, pinned: typeof patch.pinned === "boolean" ? patch.pinned : undefined });
    return undefined;
  });
}

export async function deleteNoteAction(id: string): Promise<R> {
  return guard(async (a) => {
    await deleteNote(a, String(id));
    return undefined;
  });
}

export async function noteLinkAction(id: string, url: string): Promise<R> {
  return guard(async (a) => {
    await addLink(a, { url: String(url), privateNoteId: String(id) });
    return undefined;
  });
}

export async function noteRemoveFileAction(attachmentId: string): Promise<R> {
  return guard(async (a) => {
    await removeAttachment(a, String(attachmentId));
    return undefined;
  });
}
