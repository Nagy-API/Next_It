import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { refreshSocialNumbersAction } from "@/app/social-actions";
import { MonthColumns } from "@/components/charts";
import { ActionForm, Submit } from "@/components/client";
import { PostsTable, type AnalyticsRow } from "@/components/social/analytics";
import { ConnectGate } from "@/components/social/connect-gate";
import { SectionTitle, Stat } from "@/components/ui";
import { can } from "@/domain/permissions";
import { HEADLINE_METRICS, METRIC_META, PLATFORM_LABEL, SOCIAL_PLATFORMS, engagementRate, formatMetric, sumMetrics, type SocialPlatform } from "@/domain/social";
import { addDays, formatDay, startOfCairoDay, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getPublished } from "@/server/social";
import { socialBrands } from "../brand";

export const metadata = { title: "Analytics · Social media schedule" };

const RANGES = [7, 30, 90] as const;

export default async function SocialAnalyticsPage({ searchParams }: PageProps<"/social/analytics">) {
  const me = await requireUser();
  if (!can.scheduleSocial(me)) redirect("/social/config");
  const sp = await searchParams;
  const range = RANGES.find((r) => String(r) === sp.range) ?? 30;
  const platform = SOCIAL_PLATFORMS.find((p) => p === sp.platform) ?? null;
  const { current: brand, connected, channels } = await socialBrands();
  const locked = brand ? !connected.has(brand.id) : channels === 0;
  const today = todayISO();
  const from = addDays(today, -(range - 1));
  const posts = await getPublished({ from: startOfCairoDay(from), to: startOfCairoDay(addDays(today, 1)), brandId: brand?.id });

  const rows: AnalyticsRow[] = posts.flatMap((p) =>
    p.targets
      .filter((t) => t.status === "published" && (!platform || t.platform === platform))
      .map((t) => ({
        id: t.id,
        postId: p.id,
        caption: p.caption,
        kind: p.kind,
        platform: t.platform,
        account: t.accountName,
        brand: p.brand?.name ?? null,
        day: p.day ? formatDay(p.day) : "",
        when: (t.publishedAt ?? new Date(p.scheduledAt ?? 0)).toISOString(),
        permalink: t.permalink,
        media: p.media[0] ?? null,
        metrics: t.metrics ?? {},
      })),
  );
  const total = sumMetrics(rows.map((r) => r.metrics));
  const er = engagementRate(total);
  const byPlatform = SOCIAL_PLATFORMS.map((pl) => ({ pl, rows: rows.filter((r) => r.platform === pl) })).filter((x) => x.rows.length);
  // Views by the day each post went out: one column per day (a week), or per week (longer periods).
  const bucket = range <= 7 ? 1 : 7;
  const columns = Array.from({ length: Math.ceil(range / bucket) }, (_, i) => {
    const start = addDays(from, i * bucket);
    const end = addDays(start, bucket - 1);
    const inside = posts.filter((p) => p.day && p.day >= start && p.day <= end);
    const ids = new Set(inside.map((p) => p.id));
    return { label: formatDay(start, { weekday: false }), value: sumMetrics(rows.filter((r) => ids.has(r.postId)).map((r) => r.metrics)).views ?? 0 };
  });
  const href = (patch: { range?: number; platform?: SocialPlatform | "" }) => {
    const q = new URLSearchParams();
    const r = patch.range ?? range;
    const pl = patch.platform ?? platform ?? "";
    if (r !== 30) q.set("range", String(r));
    if (pl) q.set("platform", pl);
    const s = q.toString();
    return `/social/analytics${s ? `?${s}` : ""}`;
  };
  const chip = (on: boolean) => clsx("rounded-md px-2.5 py-1", on ? "bg-strong text-white" : "text-ink-2 hover:bg-hover");

  return (
    <ConnectGate locked={locked} brand={brand?.name ?? null} canConfigure={can.configureSocial(me)} what="the numbers">
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {RANGES.map((r) => (
            <Link key={r} href={href({ range: r })} className={chip(r === range)}>
              Last {r} days
            </Link>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          <Link href={href({ platform: "" })} className={chip(!platform)}>
            All
          </Link>
          {SOCIAL_PLATFORMS.map((p) => (
            <Link key={p} href={href({ platform: p })} className={chip(platform === p)}>
              {PLATFORM_LABEL[p]}
            </Link>
          ))}
        </div>
        <span className="ml-auto" />
        <ActionForm action={refreshSocialNumbersAction} inlineError={false}>
          <Submit variant="secondary" size="sm" title="Ask Facebook and Instagram for the latest numbers">
            Update numbers now
          </Submit>
        </ActionForm>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Posts published" value={rows.length} hint={`${posts.length} post${posts.length === 1 ? "" : "s"}, counted per channel`} />
        {HEADLINE_METRICS.map((k) => (
          <Stat key={k} label={METRIC_META[k].label} value={formatMetric(k, total[k])} hint={METRIC_META[k].hint || undefined} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card p-4">
          <SectionTitle>Views by {bucket === 1 ? "day" : "week"} posted</SectionTitle>
          <MonthColumns points={columns} unit="views" />
        </div>
        <div className="card p-4">
          <SectionTitle>By platform</SectionTitle>
          {byPlatform.length ? (
            <table className="w-full text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr>
                  <th className="pb-1.5 font-medium">Platform</th>
                  <th className="pb-1.5 text-right font-medium">Posts</th>
                  <th className="pb-1.5 text-right font-medium">Reach</th>
                  <th className="pb-1.5 text-right font-medium">Views</th>
                  <th className="pb-1.5 text-right font-medium">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byPlatform.map(({ pl, rows: list }) => {
                  const s = sumMetrics(list.map((r) => r.metrics));
                  const e = engagementRate(s);
                  return (
                    <tr key={pl}>
                      <td className="py-2 font-medium">{PLATFORM_LABEL[pl]}</td>
                      <td className="py-2 text-right tabular-nums">{list.length}</td>
                      <td className="py-2 text-right tabular-nums">{formatMetric("reach", s.reach)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMetric("views", s.views)}</td>
                      <td className="py-2 text-right tabular-nums">{e === null ? "—" : `${e.toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-muted">Nothing published in this period.</p>
          )}
          <p className="mt-3 text-[12px] text-muted">
            Engagement = interactions ÷ reach{er !== null ? ` · ${er.toFixed(1)}% overall` : ""}. Skip rate exists for Instagram Reels only. Meta&rsquo;s numbers can be up to 48 hours behind.
          </p>
        </div>
      </div>
      <div>
        <SectionTitle>Posts</SectionTitle>
        <PostsTable rows={rows} />
      </div>
    </div>
    </ConnectGate>
  );
}
