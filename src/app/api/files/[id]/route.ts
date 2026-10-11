import fs from "node:fs";
import { getCurrentUser } from "@/server/auth";
import { opensInline, readAttachment } from "@/server/attachments";

/** Open or download an attached file (signed-in people only). Served as the type we stored, never sniffed. */
export async function GET(_: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const found = await readAttachment((await ctx.params).id, user.id);
  if (!found) return new Response("This file is no longer available.", { status: 404 });
  const { a, file } = found;
  const name = encodeURIComponent(a.name);
  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": a.mime ?? "application/octet-stream",
      "Content-Disposition": `${opensInline(a.mime) ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Cache-Control": a.privateNoteId ? "private, no-store" : "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // A file can never run code in the app's name (PDFs keep the browser's own viewer, which needs no sandbox flag).
      "Content-Security-Policy": `default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'${a.mime === "application/pdf" ? "" : "; sandbox"}`,
    },
  });
}
