import fs from "node:fs";
import { Readable } from "node:stream";
import { can } from "@/domain/permissions";
import { getCurrentUser } from "@/server/auth";
import { keyMatches, readMedia, readThumb } from "@/server/social";

/**
 * A photo or video from the Social media library, exactly as it was uploaded.
 *  - Signed-in people who use the schedule see it in the app.
 *  - Facebook / Instagram download it with the file's own long random key (`?k=`) when a post goes out —
 *    that link is only ever given to Meta.
 * Supports ranges, so videos can be scrubbed and Meta can fetch large files in parts.
 * `?thumb=1` returns the small preview instead — it still works after the file itself was removed from the server.
 */
async function serve(request: Request, id: string, head: boolean) {
  if (new URL(request.url).searchParams.get("thumb")) {
    const user = await getCurrentUser();
    if (!user) return new Response(null, { status: 401 });
    if (!can.scheduleSocial(user) && !can.configureSocial(user)) return new Response(null, { status: 403 });
    const thumb = await readThumb(id);
    if (!thumb) return new Response(null, { status: 404 });
    return new Response(head ? null : new Uint8Array(thumb), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(thumb.length), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  }
  const found = await readMedia(id);
  if (!found) return new Response("This file is no longer available.", { status: 404 });
  const { m, file } = found;
  const key = new URL(request.url).searchParams.get("k");
  if (!keyMatches(m, key)) {
    const user = await getCurrentUser();
    if (!user) return new Response(null, { status: 401 });
    if (!can.scheduleSocial(user) && !can.configureSocial(user)) return new Response(null, { status: 403 });
  }
  const size = fs.statSync(file).size;
  const headers: Record<string, string> = {
    "Content-Type": m.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(m.name)}`,
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
    } else {
      start = Math.max(0, size - Number(range[2]));
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  if (head) return new Response(null, { status, headers });
  const stream = fs.createReadStream(file, { start, end });
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, { status, headers });
}

export async function GET(request: Request, ctx: RouteContext<"/api/social/file/[id]">) {
  return serve(request, (await ctx.params).id, false);
}

export async function HEAD(request: Request, ctx: RouteContext<"/api/social/file/[id]">) {
  return serve(request, (await ctx.params).id, true);
}
