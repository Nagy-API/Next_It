import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink as ExternalIcon } from "lucide-react";
import { refreshSocialNumbersAction, retrySocialPostAction } from "@/app/social-actions";
import { ActionForm, Submit } from "@/components/client";
import { PlatformIcon } from "@/components/platform-icon";
import { TrendChart } from "@/components/social/analytics";
import { MediaThumb } from "@/components/social/media";
import { BrandMark, ExternalLink, SectionTitle, Stat } from "@/components/ui";
import { can } from "@/domain/permissions";
import { HEADLINE_METRICS, KIND_LABEL, METRIC_KEYS, METRIC_META, PLATFORM_LABEL, STATUS_COLOR, STATUS_LABEL, engagementRate, formatMetric, sumMetrics, type MetricKey } from "@/domain/social";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getPost, getSnapshots } from "@/server/social";

export const metadata = { title: "Post · Social media schedule" };

const CHARTS: MetricKey[] = ["views", "reach", "likes", "comments"];

/** One post's own dashboard: where it went, every number Meta gives, and how they grew. */
export default async function SocialPostPage({ params }: PageProps<"/social/posts/[id]">) {
  const me = await requireUser();
  if (!can.scheduleSocial(me)) redirect("/social/config");
  const post = await getPost((await params).id);
  if (!post) notFound();
  const live = post.targets.filter((t) => t.status === "published");
  const snaps = await getSnapshots(live.map((t) => t.id));
  const total = sumMetrics(live.map((t) => t.metrics));
  const er = engagementRate(total);
  const failed = post.targets.filter((t) => t.status === "failed");
  // The whole post over time: at each refresh, the latest known numbers of every channel added together.
  const latest = new Map<string, (typeof snaps)[number]["data"]>();
  const series = snaps.map((s) => {
    latest.set(s.targetId, s.data);
    return { t: s.at.getTime(), label: formatDateTime(s.at), sum: sumMetrics([...latest.values()]) };
  });
  const lastSeen = live.map((t) => t.metricsAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <Link href={post.day ? `/social?d=${post.day}` : "/social"} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Calendar
      </Link>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="card overflow-hidden">
            {post.media[0] ? <MediaThumb m={post.media[0]} controls className={post.kind === "post" ? "aspect-square w-full" : "aspect-[9/16] w-full"} /> : <div className="flex aspect-[4/3] items-center justify-center bg-sunken text-[13px] text-muted">Text only</div>}
            {post.media.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto p-2">
                {post.media.slice(1).map((m) => (
                  <MediaThumb key={m.id} m={m} className="size-14 shrink-0 rounded-md" />
                ))}
              </div>
            )}
            {post.media.some((m) => m.gone) && <p className="border-b border-line bg-subtle px-3.5 py-1.5 text-[12px] text-muted">The file was removed from the server after the post went out. Open the post on its platform to watch it.</p>}
            <p className="whitespace-pre-wrap break-words px-3.5 py-3 text-[13.5px] leading-relaxed [unicode-bidi:plaintext]">
              {post.caption || <span className="text-muted">No caption.</span>}
            </p>
          </div>
          <div className="card space-y-2 p-3.5 text-[13px]">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_COLOR[post.status] }} />
              <span className="font-semibold">{STATUS_LABEL[post.status]}</span>
              <span className="text-muted">· {KIND_LABEL[post.kind]}</span>
            </div>
            {post.brand && (
              <div className="flex items-center gap-2 text-ink-2">
                <BrandMark name={post.brand.name} color={post.brand.color} size={18} /> {post.brand.name}
              </div>
            )}
            {post.scheduledAt && <div className="text-muted">{formatDateTime(new Date(post.scheduledAt))} (Cairo)</div>}
            {post.createdBy && <div className="text-muted">Written by {post.createdBy}</div>}
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          {!!failed.length && (
            <div className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-[13px]">
              <div className="flex items-center gap-1.5 font-semibold text-bad">
                <AlertTriangle className="size-4" /> It didn&rsquo;t go out on {failed.length === 1 ? "one channel" : `${failed.length} channels`}
              </div>
              <ul className="mt-1.5 space-y-1">
                {failed.map((t) => (
                  <li key={t.id}>
                    <b>
                      {PLATFORM_LABEL[t.platform]} · {t.accountName}:
                    </b>{" "}
                    {t.error}
                  </li>
                ))}
              </ul>
              <ActionForm action={retrySocialPostAction} className="mt-3" inlineError={false}>
                <input type="hidden" name="id" value={post.id} />
                <Submit variant="dark" size="sm">
                  Try again
                </Submit>
              </ActionForm>
            </div>
          )}

          <section>
            <SectionTitle
              right={
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-muted">{lastSeen ? `Updated ${formatRelative(lastSeen)}` : live.length ? "Numbers arrive a few minutes after publishing" : ""}</span>
                  {!!live.length && (
                    <ActionForm action={refreshSocialNumbersAction} inlineError={false}>
                      <input type="hidden" name="id" value={post.id} />
                      <Submit variant="secondary" size="sm">
                        Update now
                      </Submit>
                    </ActionForm>
                  )}
                </div>
              }
            >
              This post&rsquo;s numbers
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {HEADLINE_METRICS.map((k) => (
                <Stat key={k} label={METRIC_META[k].label} value={formatMetric(k, total[k])} hint={METRIC_META[k].hint || undefined} />
              ))}
              <Stat label="Engagement" value={er === null ? "—" : `${er.toFixed(1)}%`} hint="Interactions ÷ reach" />
            </div>
          </section>

          {!!live.length && (
            <section>
              <SectionTitle>How it grew</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {CHARTS.map((k) => (
                  <TrendChart key={k} title={METRIC_META[k].label} metric={k} points={series.filter((s) => typeof s.sum[k] === "number").map((s) => ({ t: s.t, v: s.sum[k] as number, label: s.label }))} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>By channel</SectionTitle>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="border-b border-line bg-subtle text-left text-[12px] text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Number</th>
                    {post.targets.map((t) => (
                      <th key={t.id} className="px-3 py-2 font-medium">
                        <span className="flex items-center gap-1.5 text-ink">
                          <PlatformIcon name={t.platform} size={18} /> {t.accountName}
                        </span>
                        {t.permalink ? (
                          <ExternalLink href={t.permalink} className="mt-0.5 inline-flex items-center gap-1 font-normal text-electric hover:underline">
                            Open the post <ExternalIcon className="size-3" />
                          </ExternalLink>
                        ) : (
                          <span className="mt-0.5 block font-normal">{t.status === "published" ? "Published" : t.status === "failed" ? "Didn't publish" : "Not out yet"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {METRIC_KEYS.filter((k) => post.targets.some((t) => typeof t.metrics?.[k] === "number")).map((k) => (
                    <tr key={k}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{METRIC_META[k].label}</div>
                        {METRIC_META[k].hint && <div className="text-[12px] text-muted">{METRIC_META[k].hint}</div>}
                      </td>
                      {post.targets.map((t) => (
                        <td key={t.id} className="px-3 py-2 tabular-nums text-ink-2">
                          {formatMetric(k, t.metrics?.[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!post.targets.some((t) => t.metrics && Object.keys(t.metrics).length) && (
                    <tr>
                      <td colSpan={post.targets.length + 1} className="px-3 py-6 text-center text-muted">
                        {live.length ? "No numbers yet — Meta needs a little time after a post goes out." : "Numbers appear here once the post is published."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {post.targets
              .filter((t) => t.metricsError)
              .map((t) => (
                <p key={t.id} className="mt-2 text-[12.5px] text-muted">
                  {PLATFORM_LABEL[t.platform]} · {t.accountName}: the last update didn&rsquo;t work — {t.metricsError}
                </p>
              ))}
          </section>
        </div>
      </div>
    </div>
  );
}
