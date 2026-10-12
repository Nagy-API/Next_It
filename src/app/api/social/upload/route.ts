import { getCurrentUser } from "@/server/auth";
import { UserError } from "@/server/errors";
import { UPLOAD_CHUNK_BYTES } from "@/domain/social";
import { appendUpload, startUpload } from "@/server/social";

/**
 * Uploads for the Social media library. A file travels in pieces so a large video survives a slow connection
 * and any size limit in front of the server:
 *   POST  { name, size, brandId?, width?, height? }  → { id }            (starts the upload)
 *   PUT   ?id=…&offset=…  with the next piece as the body → { received, done }
 * Same-origin only; the person must be signed in. The bytes are written exactly as they arrive (no resizing).
 */
async function who(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return { error: Response.json({ error: "Sign in again." }, { status: 401 }) };
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return { error: Response.json({ error: "Not allowed." }, { status: 403 }) };
  return { actor: { id: user.id, name: user.name, isAdmin: user.isAdmin, isManager: user.isManager, teams: user.teams, perms: user.perms } };
}

function failed(e: unknown) {
  if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
  console.error(e);
  return Response.json({ error: "The upload didn't work. Please try again." }, { status: 500 });
}

export async function POST(request: Request) {
  const { actor, error } = await who(request);
  if (!actor) return error;
  try {
    const body = (await request.json()) as { name?: string; size?: number; brandId?: string | null; width?: number | null; height?: number | null };
    const r = await startUpload(actor, { name: String(body.name ?? ""), size: Number(body.size), brandId: body.brandId, width: body.width, height: body.height });
    return Response.json({ id: r.id, chunk: UPLOAD_CHUNK_BYTES });
  } catch (e) {
    return failed(e);
  }
}

export async function PUT(request: Request) {
  const { actor, error } = await who(request);
  if (!actor) return error;
  try {
    const url = new URL(request.url);
    const len = Number(request.headers.get("content-length") ?? 0);
    if (len > UPLOAD_CHUNK_BYTES + 1024) return Response.json({ error: "That piece is too big." }, { status: 413 });
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > UPLOAD_CHUNK_BYTES + 1024) return Response.json({ error: "That piece is too big." }, { status: 413 });
    return Response.json(await appendUpload(actor, url.searchParams.get("id") ?? "", Number(url.searchParams.get("offset") ?? -1), bytes));
  } catch (e) {
    return failed(e);
  }
}
