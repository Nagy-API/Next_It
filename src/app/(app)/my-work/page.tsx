import Link from "next/link";
import { Coffee, Hourglass } from "lucide-react";
import { ItemList } from "@/components/item-row";
import { Badge, BrandDot, Empty, PageHeader, SectionTitle, TypeIcon } from "@/components/ui";
import { STAGE_META } from "@/domain/workflow";
import { addDays, formatDateTime, todayISO } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getPersonCompletions, getPersonWork } from "@/server/queries";

export const metadata = { title: "My work" };

export default async function MyWorkPage() {
  const user = await requireUser();
  const today = todayISO();
  const [{ now, next }, recent] = await Promise.all([getPersonWork(user.id, today), getPersonCompletions(user.id, addDays(today, -13), today)]);
  const sorted = [...now].sort((a, b) => (a.current?.deadline ?? a.postingDate ?? "9").localeCompare(b.current?.deadline ?? b.postingDate ?? "9"));

  return (
    <div className="space-y-8">
      <PageHeader title="My work" subtitle="What's with you now, what's coming to you next, and what you finished lately." />

      <section>
        <SectionTitle right={<span className="text-[13px] text-muted">{now.length} items</span>}>With me now</SectionTitle>
        <ItemList items={sorted} showContext empty={<Empty icon={Coffee} title="Nothing is with you right now">When work reaches a stage you own, it appears here.</Empty>} />
      </section>

      <section>
        <SectionTitle right={<span className="text-[13px] text-muted">Not late — it hasn&rsquo;t reached you yet</span>}>Coming to me next</SectionTitle>
        {next.length ? (
          <div className="card divide-y divide-line">
            {next.map((i) => {
              const mine = i.stages.find((s) => s.assignee?.id === user.id && s.status === "waiting");
              return (
                <Link key={i.id} href={`/items/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8faff]">
                  <TypeIcon type={i.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.title}</div>
                    <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                      {i.brand && <BrandDot color={i.brand.color} />}
                      {i.brand?.name ?? i.project?.clientName}
                      {mine && ` · your part: ${STAGE_META[mine.kind].label}`}
                    </div>
                  </div>
                  <Badge tone="wait" icon={Hourglass}>
                    Now with {i.current?.assignee?.name ?? "—"} ({i.current ? STAGE_META[i.current.kind].short : ""})
                  </Badge>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted">Nothing lined up for you yet.</p>
        )}
      </section>

      <section>
        <SectionTitle>Finished in the last 2 weeks</SectionTitle>
        {recent.length ? (
          <div className="card divide-y divide-line">
            {recent.map((r) => (
              <Link key={r.id} href={`/items/${r.itemId}`} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-[#f8faff]">
                <TypeIcon type={r.type} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-muted"> · {STAGE_META[r.kind].label}</span>
                </span>
                {r.brandColor && <BrandDot color={r.brandColor} />}
                <span className="text-[12.5px] text-muted">{formatDateTime(r.completedAt)}</span>
                {r.lateDays > 0 && r.round === 1 ? <Badge tone={r.excused ? "neutral" : "bad"}>{r.excused ? "Late · exception" : `${r.lateDays}d late`}</Badge> : r.deadline ? <Badge tone="ok">On time</Badge> : null}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No completed stages in the last two weeks.</p>
        )}
      </section>
    </div>
  );
}
