import { redirect } from "next/navigation";
import { MediaLibrary } from "@/components/social/media";
import { can } from "@/domain/permissions";
import { requireUser } from "@/server/auth";
import { KEEP_AFTER_PUBLISH_MS, listMedia } from "@/server/social";
import { socialBrands } from "../brand";

export const metadata = { title: "Media · Social media schedule" };

export default async function SocialMediaPage() {
  const me = await requireUser();
  if (!can.scheduleSocial(me)) redirect("/social/config");
  const { brands, current } = await socialBrands();
  const media = await listMedia({ limit: 600, brandId: current?.id });
  return (
    <MediaLibrary
      media={media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, mime: m.mime, size: m.size, width: m.width, height: m.height, url: m.url, brandId: m.brandId, createdBy: m.createdBy, uses: m.uses, hasThumb: m.hasThumb }))}
      brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
      brandId={current?.id ?? null}
      brandName={current?.name ?? null}
      keepHours={Math.round(KEEP_AFTER_PUBLISH_MS / 3_600_000)}
    />
  );
}
