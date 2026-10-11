import { getCurrentUser } from "@/server/auth";
import { saveFile } from "@/server/attachments";
import { UserError } from "@/server/errors";

/**
 * Upload one file (multipart: file, and itemId or taskId — or neither while a form is still being filled in).
 * Same-origin only; the person must be signed in and not on a temporary password.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return Response.json({ error: "Sign in again." }, { status: 401 });
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ error: "Not allowed." }, { status: 403 });
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 26 * 1024 * 1024) return Response.json({ error: "That file is bigger than 25 MB. Put it on Google Drive and attach the link instead." }, { status: 413 });
  try {
    const fd = await request.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a file." }, { status: 400 });
    const id = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
    };
    const a = await saveFile({ id: user.id, name: user.name, isAdmin: user.isAdmin, isManager: user.isManager, teams: user.teams, perms: user.perms }, file, { itemId: id("itemId"), taskId: id("taskId"), workTaskId: id("workTaskId"), privateNoteId: id("privateNoteId"), planId: id("planId") });
    return Response.json({ id: a.id, name: a.name, size: a.size, mime: a.mime });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "The upload didn't work. Please try again." }, { status: 500 });
  }
}
