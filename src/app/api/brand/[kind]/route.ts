import { getCompanyRow } from "@/server/branding";
import { DEFAULT_BRAND } from "@/config/brand";

/** Uploaded company logo / mark (public: the sign-in page shows them). URLs carry ?v= so they cache well. */
export async function GET(req: Request, ctx: RouteContext<"/api/brand/[kind]">) {
  const { kind } = await ctx.params;
  const row = await getCompanyRow().catch(() => null);
  const data = kind === "logo" ? row?.logo : kind === "mark" ? row?.mark : null;
  const m = data?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return Response.redirect(new URL(kind === "logo" ? DEFAULT_BRAND.logo : DEFAULT_BRAND.mark, req.url), 302);
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
