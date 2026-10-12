import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppForm, ChannelList, ConnectPanel } from "@/components/social/config";
import { SectionTitle } from "@/components/ui";
import { can } from "@/domain/permissions";
import { formatRelative } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getAllBrands } from "@/server/cached";
import { getSocialConfig, listAccounts, looksPublic } from "@/server/social";
import { GRAPH_VERSION, META_SCOPES } from "@/server/social-meta";

export const metadata = { title: "Configuration · Social media schedule" };

const STEPS: { title: string; body: string }[] = [
  { title: "Make the Instagram accounts professional", body: "In the Instagram app: Settings → Account type → switch to Business (or Creator). Then link each one to its Facebook Page (Page → Settings → Linked accounts → Instagram). Instagram only lets apps post to professional accounts that are linked to a Page." },
  { title: "Create a Meta app", body: "On developers.facebook.com → My Apps → Create App. When asked what the app is for, choose “Other”, then the type “Business”. Any name works (for example “NEXORA Ops”). The person who creates it must be an admin of the Pages." },
  { title: "Copy the App ID and App secret", body: "In the app: App settings → Basic. Paste both in the form on this page and press Save. In the same screen, fill “Privacy Policy URL” with the address shown under the form." },
  { title: "Switch the app to Live", body: "The switch at the top of the app’s page (App Mode: Development → Live). While it is in Development, posts made through it are visible only to you, not to followers." },
  { title: "Get an access token", body: "Tools → Graph API Explorer. Choose your app, “User Token”, add every permission listed under the token box here, press Generate Access Token, and in the window that opens tick all the Pages and Instagram accounts. Copy the token." },
  { title: "Paste it here and connect", body: "Paste the token below, press Find my pages, tick the channels, choose each one’s brand, and press Connect selected. The connection does not expire; it only stops if the password of the Facebook account changes or the app’s access is removed — then repeat steps 5 and 6." },
];

export default async function SocialConfigPage() {
  const me = await requireUser();
  if (!can.configureSocial(me)) redirect("/social");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  const detected = host ? `${proto}://${host}` : "";
  const [cfg, channels, brands] = await Promise.all([getSocialConfig(), listAccounts(), getAllBrands()]);
  const base = cfg.publicUrl || detected;
  const brandList = brands.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <section className="card p-5">
          <SectionTitle>1 · Your Meta app</SectionTitle>
          <AppForm appId={cfg.appId} hasSecret={cfg.hasSecret} publicUrl={cfg.publicUrl} detected={detected} privacyUrl={`${base || "https://your-address"}/privacy`} />
          {!!cfg.publicUrl && !looksPublic(cfg.publicUrl) && (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-ink">
              <b className="text-warn">{cfg.publicUrl}</b> is a private or non-https address. Text posts to Facebook will work, but photos and videos can&rsquo;t be sent until this system is opened through a public https address.
            </p>
          )}
        </section>
        <section className="card p-5">
          <SectionTitle>2 · Connect Facebook Pages and Instagram accounts</SectionTitle>
          <ConnectPanel brands={brandList} ready={!!cfg.appId && cfg.hasSecret} scopes={[...META_SCOPES]} />
        </section>
        <section className="card p-5">
          <SectionTitle>Connected channels</SectionTitle>
          <ChannelList channels={channels.map((c) => ({ id: c.id, platform: c.platform, name: c.name, username: c.username, brandId: c.brandId, status: c.status, lastError: c.lastError, checked: c.checkedAt ? formatRelative(c.checkedAt) : null }))} brands={brandList} />
          <p className="mt-3 text-[12px] text-muted">The brand decides which channels are offered when someone writes a post for that brand. Disconnecting only removes the channel from this system — nothing changes on Facebook or Instagram.</p>
        </section>
      </div>
      <aside className="card h-fit p-5">
        <SectionTitle>What Facebook and Instagram need</SectionTitle>
        <ol className="space-y-3.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-electric-soft text-[12px] font-bold text-electric">{i + 1}</span>
              <div>
                <div className="text-[13.5px] font-semibold text-ink">{s.title}</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
          <p>Limits set by Meta: Instagram photos must be JPG (up to 8 MB); Reels up to 300 MB; Story videos up to 100 MB and 60 seconds; about 100 Instagram posts and 30 Facebook Reels per account per day.</p>
          <p>Uses Meta&rsquo;s Graph API {GRAPH_VERSION}. Tokens and the app secret are stored encrypted and are never shown in the browser.</p>
        </div>
      </aside>
    </div>
  );
}
