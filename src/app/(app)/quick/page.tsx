import Link from "next/link";
import clsx from "clsx";
import { Zap } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { isManager } from "@/domain/permissions";
import { STAGE_COLOR } from "@/domain/workflow";
import type { StageKind } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getOpenItems } from "@/server/cached";
import { getActivePlatforms } from "@/server/queries";
import { QuickTable, type QuickItem } from "./quick-table";

export const metadata = { title: "Quick update" };

const STEPS: { kind: StageKind; label: string; team: string; what: string }[] = [
  { kind: "content", label: "Content", team: "content", what: "Paste each item's link and send it on" },
  { kind: "shooting", label: "Shooting", team: "media", what: "Tick what was shot: it goes to editing" },
  { kind: "media", label: "Editing", team: "media", what: "Paste each video's Drive link: it goes for approval" },
  { kind: "design", label: "Design", team: "design", what: "Paste each design's Drive link: it goes for approval" },
  { kind: "social", label: "Social", team: "social", what: "Paste each post's live link per app, or schedule them" },
];

/** Many items, one screen, one Save: for every team. */
export default async function QuickPage({ searchParams }: PageProps<"/quick">) {
  const me = await requireUser();
  const sp = await searchParams;
  const manager = isManager(me);
  const [open, platforms] = await Promise.all([getOpenItems(), getActivePlatforms()]);
  const mineAt = (k: StageKind) =>
    open.filter((i) => {
      const c = i.current;
      if (!c || c.kind !== k || c.progress === "waiting_approval") return false;
      if (manager) return true;
      const team = STEPS.find((s) => s.kind === k)!.team;
      return c.assignee?.id === me.id || (!c.assignee && me.teams.includes(team as never));
    });
  const counts = new Map(STEPS.map((s) => [s.kind, mineAt(s.kind).length]));
  const myDefault = STEPS.find((s) => me.teams.includes(s.team as never) && counts.get(s.kind))?.kind ?? STEPS.find((s) => counts.get(s.kind))?.kind ?? "content";
  const step = STEPS.find((s) => s.kind === sp.step)?.kind ?? myDefault;
  const meta = STEPS.find((s) => s.kind === step)!;
  const items: QuickItem[] = mineAt(step)
    .sort((a, b) => (a.brand?.name ?? "~").localeCompare(b.brand?.name ?? "~") || (a.postingDate ?? "9").localeCompare(b.postingDate ?? "9"))
    .map((i) => ({
      id: i.id,
      stageId: i.current!.id,
      title: i.title,
      brand: i.brand ? { name: i.brand.name, color: i.brand.color } : null,
      postingDate: i.postingDate,
      slide: i.slideNumber,
      link: i.canvaUrl,
      platforms: i.platforms.filter((p) => p.status === "pending" || p.status === "scheduled").map((p) => ({ id: p.platformId, name: p.name, status: p.status, date: p.date })),
      live: i.platforms.filter((p) => p.status === "published").map((p) => p.name),
    }));

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Quick update" subtitle="Update many items at once: paste a list of links, then one Save. Each one moves on like it would by hand." />
      <nav className="mb-5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Step">
        {STEPS.map((s) => {
          const on = s.kind === step;
          const c = STAGE_COLOR[s.kind];
          return (
            <Link
              key={s.kind}
              href={`/quick?step=${s.kind}`}
              className={clsx("inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors", on ? "border-transparent text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
              style={on ? { background: c.fg } : undefined}
            >
              {!on && <span className="size-2 rounded-full" style={{ background: c.fg }} />}
              {s.label}
              <span className={clsx("rounded-full px-1.5 text-[11.5px]", on ? "bg-white/25" : "bg-canvas text-muted")}>{counts.get(s.kind)}</span>
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <Empty icon={Zap} title={`Nothing waiting at ${meta.label}`}>
          Items you can update at this step show here.
        </Empty>
      ) : (
        <QuickTable key={step} step={step} hint={meta.what} items={items} platforms={platforms} />
      )}
    </div>
  );
}
