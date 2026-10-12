import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BrandSwitcher } from "@/components/social/brand-switcher";
import { SocialTabs } from "@/components/social/tabs";
import { can } from "@/domain/permissions";
import { requireUser } from "@/server/auth";
import { socialBrands } from "./brand";

/** Social media schedule: Calendar · Media · Analytics · Configuration, for the brand chosen at the top right. */
export default async function SocialLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const canWork = can.scheduleSocial(me);
  const canConfigure = can.configureSocial(me);
  if (!canWork && !canConfigure) redirect("/my-work");
  const { brands, current, connected } = await socialBrands();
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Social media schedule"
        subtitle={current ? `${current.name}: plan, publish and measure its Facebook and Instagram posts.` : "Every brand together. Choose a brand at the right to see only its schedule."}
        actions={canWork && <BrandSwitcher brands={brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, color: b.color, logoUrl: b.logoUrl, connected: connected.has(b.id) }))} current={current?.slug ?? ""} />}
      />
      <SocialTabs canWork={canWork} canConfigure={canConfigure} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
