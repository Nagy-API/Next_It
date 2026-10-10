import { IMAGE_KEYS, getWorkspaceImage, type ImageKey } from "@/server/settings";

/** The workspace's own logos (public: the sign-in page shows them). URLs carry ?v=<hash>, so they're cached for long. */
export async function GET(_: Request, ctx: RouteContext<"/api/workspace-asset/[key]">) {
  const { key } = await ctx.params;
  if (!(key in IMAGE_KEYS)) return new Response(null, { status: 404 });
  const img = await getWorkspaceImage(key as ImageKey);
  const m = img?.data.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
