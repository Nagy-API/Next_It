import { eq } from "drizzle-orm";
import { db } from "@/db";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/server/auth";

/** Brand logos (signed-in people only). URLs carry ?v=<hash>, so they're cached for a long time. */
export async function GET(_: Request, ctx: RouteContext<"/api/brand-logo/[id]">) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const [b] = await db.select({ logo: brands.logoUrl }).from(brands).where(eq(brands.id, id));
  const m = b?.logo?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
