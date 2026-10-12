import { redirect } from "next/navigation";
import { SocialCalendar, type CalPost } from "@/components/social/calendar";
import { ConnectGate } from "@/components/social/connect-gate";
import { can } from "@/domain/permissions";
import { addDays, formatTime, isValidISODate, startOfCairoDay, todayISO, weekRange } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getPosts, getUndatedDrafts, listAccounts, listMedia, type PostView } from "@/server/social";
import { socialBrands } from "./brand";

export const metadata = { title: "Social media schedule" };

const toCal = (p: PostView): CalPost => ({
  id: p.id,
  brandId: p.brandId,
  brand: p.brand,
  kind: p.kind,
  caption: p.caption,
  options: p.options,
  status: p.status,
  day: p.day,
  time: p.time,
  media: p.media,
  targets: p.targets.map((t) => ({ id: t.id, accountId: t.accountId, platform: t.platform, accountName: t.accountName, status: t.status, error: t.error, permalink: t.permalink, metrics: t.metrics })),
});

export default async function SocialCalendarPage({ searchParams }: PageProps<"/social">) {
  const me = await requireUser();
  if (!can.scheduleSocial(me)) redirect("/social/config");
  const sp = await searchParams;
  const view = sp.view === "month" ? "month" : "week";
  const today = todayISO();
  const anchor = typeof sp.d === "string" && isValidISODate(sp.d) ? sp.d : today;
  // Saturday-first, like the rest of the system. A month shows six full weeks.
  const first = view === "month" ? weekRange(`${anchor.slice(0, 7)}-01`).start : weekRange(anchor).start;
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => addDays(first, i));
  // The brand comes from the switcher at the top of the section (every brand when none is chosen).
  const { brands, current, connected, channels: total } = await socialBrands();
  // Nothing to plan for a brand without an account (or, with every brand on screen, when none is connected at all).
  const locked = current ? !connected.has(current.id) : total === 0;
  const brandId = current?.id ?? null;
  const [posts, drafts, channels, media] = await Promise.all([
    getPosts({ from: startOfCairoDay(days[0]), to: startOfCairoDay(addDays(days[days.length - 1], 1)), brandId }),
    getUndatedDrafts(brandId),
    listAccounts(),
    listMedia({ limit: 240 }),
  ]);
  return (
    <ConnectGate locked={locked} brand={current?.name ?? null} canConfigure={can.configureSocial(me)} what="the calendar">
    <SocialCalendar
      posts={posts.map(toCal)}
      drafts={drafts.map(toCal)}
      channels={channels.map((c) => ({ id: c.id, platform: c.platform, name: c.name, username: c.username, brandId: c.brandId, status: c.status }))}
      brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.color, slug: b.slug, logoUrl: b.logoUrl, connected: connected.has(b.id) }))}
      media={media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, mime: m.mime, size: m.size, width: m.width, height: m.height, url: m.url, brandId: m.brandId, hasThumb: m.hasThumb }))}
      view={view}
      anchor={anchor}
      days={days}
      today={today}
      nowHour={Number(formatTime(new Date()).slice(0, 2))}
      brandId={brandId}
    />
    </ConnectGate>
  );
}
