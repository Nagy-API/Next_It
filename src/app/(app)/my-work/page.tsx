import Link from "next/link";
import clsx from "clsx";
import { Coffee, Hourglass, MessageSquareText } from "lucide-react";
import { TaskCard } from "@/components/handoff";
import { Avatar, Badge, BrandDot, SectionTitle, TypeIcon } from "@/components/ui";
import Image from "next/image";
import { can } from "@/domain/permissions";
import { STAGE_META } from "@/domain/workflow";
import { addDays, formatDateTime, formatRelative, monthName, todayISO } from "@/lib/dates";
import { personPerMonth } from "@/server/stats";
import { requireUser } from "@/server/auth";
import { getActivePeople, getOpenItems } from "@/server/cached";
import { getMyMessages, getPersonCompletions, getPersonWork, tasksFor, type WorkItem } from "@/server/queries";

export const metadata = { title: "My tasks" };

/** Late first, then sent-back, then by deadline / posting date. */
function urgency(i: WorkItem) {
  const c = i.current!;
  if (c.health === "overdue") return 0;
  if (c.round > 1 && c.returnedAt) return 1;
  return 2;
}

export default async function MyTasksPage({ searchParams }: PageProps<"/my-work">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const [{ next }, recent, open, people, messages] = await Promise.all([
    getPersonWork(user.id, today),
    getPersonCompletions(user.id, addDays(today, -13), today),
    getOpenItems(),
    getActivePeople(),
    getMyMessages(user.id),
  ]);
  const pick = people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }));
  const all = tasksFor(open, user).sort(
    (a, b) => urgency(a) - urgency(b) || (a.current?.deadline ?? a.postingDate ?? "9").localeCompare(b.current?.deadline ?? b.postingDate ?? "9"),
  );

  // Brand filter (brands + one-off projects), only for places that actually have tasks.
  const places = new Map<string, { key: string; label: string; color?: string; n: number }>();
  for (const i of all) {
    const key = i.brand ? i.brand.slug : "projects";
    const p = places.get(key) ?? { key, label: i.brand ? i.brand.name : "One-off projects", color: i.brand?.color, n: 0 };
    p.n++;
    places.set(key, p);
  }
  const filter = typeof sp.brand === "string" && places.has(sp.brand) ? sp.brand : "";
  const tasks = filter ? all.filter((i) => (i.brand ? i.brand.slug : "projects") === filter) : all;
  const lateCount = all.filter((i) => i.current?.health === "overdue").length;
  const dueSoon = all.filter((i) => i.current?.health === "due_today" || i.current?.health === "due_soon").length;
  const months = await personPerMonth(user.id, Number(today.slice(0, 4)), Number(today.slice(5, 7)), 2);
  const [lastMonth, thisMonth] = months;

  return (
    <div className="mx-auto max-w-[980px] space-y-8">
      <header className="relative overflow-hidden rounded-2xl bg-navy-900 px-6 py-6 text-white">
        <Image src="/brand/nexora-mark-white.png" alt="" width={566} height={565} aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-56 opacity-[0.08] drop-shadow-[0_10px_25px_rgba(96,165,250,0.6)]" />
        <div className="relative">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.01em]">Hi {user.name}</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-white/65">
            {all.length ? "Here's everything on you, from every brand. Paste the link and press done — the time and your name are saved for you." : "Nothing waiting for you right now. New work shows up here and in the bell."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat label="On you now" value={all.length} />
            <HeroStat label="Late" value={lateCount} tone={lateCount ? "bad" : undefined} />
            <HeroStat label="Due in 2 days" value={dueSoon} tone={dueSoon ? "warn" : undefined} />
            <HeroStat label={`Done in ${monthName(thisMonth.month)}`} value={thisMonth.value} hint={deltaText(thisMonth.value, lastMonth.value, monthName(lastMonth.month, true))} />
          </div>
          <Link href={`/team/${user.username}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-electric-bright hover:underline">
            My stats month by month →
          </Link>
        </div>
      </header>

      {messages.length > 0 && (
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <MessageSquareText className="size-4 text-electric" /> Messages for you
              <span className="rounded-full bg-electric px-2 py-0.5 text-[12px] text-white">{messages.length}</span>
            </span>
          </SectionTitle>
          <div className="card divide-y divide-line">
            {messages.map((m) => (
              <Link key={m.id} href={`/items/${m.itemId}#c-${m.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-[#f8faff]">
                <Avatar name={m.authorName} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-muted">
                    <b className="text-ink">{m.authorName}</b> on{" "}
                    <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                      {m.brandColor && <BrandDot color={m.brandColor} />}
                      {m.itemTitle}
                    </span>{" "}
                    · {formatRelative(m.createdAt)}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[14px]">{m.body}</div>
                </div>
                <span className="shrink-0 self-center text-[13px] font-semibold text-electric">Reply →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle right={<span className="text-[13px] text-muted">{tasks.length}</span>}>To do</SectionTitle>
        {places.size > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Link href="/my-work" className={chip(!filter)}>
              All <span className="opacity-60">{all.length}</span>
            </Link>
            {[...places.values()].map((p) => (
              <Link key={p.key} href={`/my-work?brand=${p.key}`} className={chip(filter === p.key)}>
                {p.color && <BrandDot color={p.color} />} {p.label} <span className="opacity-60">{p.n}</span>
              </Link>
            ))}
          </div>
        )}
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((i) => (
              <TaskCard key={i.id} item={i} meId={user.id} people={pick} canDeadline={can.setDeadline(user)} />
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <Coffee className="mb-3 size-8 text-electric" />
            <div className="font-display text-[16px] font-bold">You&rsquo;re all caught up</div>
            <div className="mt-1 text-[13px] text-muted">New work sent to you or your team shows up here automatically.</div>
          </div>
        )}
      </section>

      {next.length > 0 && (
        <section>
          <SectionTitle right={<span className="text-[13px] text-muted">Not late — it hasn&rsquo;t reached you yet</span>}>Coming to you next</SectionTitle>
          <div className="card divide-y divide-line">
            {next.map((i) => (
              <Link key={i.id} href={`/items/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8faff]">
                <TypeIcon type={i.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.title}</div>
                  <div className="flex items-center gap-1.5 text-[12.5px] text-muted">
                    {i.brand && <BrandDot color={i.brand.color} />}
                    {i.brand?.name ?? i.project?.clientName}
                  </div>
                </div>
                <Badge tone="wait" icon={Hourglass}>
                  Now with {i.current?.assignee?.name ?? `the ${i.current ? STAGE_META[i.current.kind].label : ""} team`}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

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
          <p className="text-[13px] text-muted">Nothing finished in the last two weeks.</p>
        )}
      </section>
    </div>
  );
}

function chip(on: boolean) {
  return clsx(
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
    on ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink-2 hover:border-line-strong",
  );
}

function deltaText(now: number, before: number, beforeLabel: string) {
  if (!before && !now) return `0 in ${beforeLabel}`;
  const d = now - before;
  return `${d > 0 ? "+" : ""}${d} vs ${beforeLabel} (${before})`;
}

function HeroStat({ label, value, tone, hint }: { label: string; value: number; tone?: "bad" | "warn"; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10">
      <div className="text-[12px] font-medium text-white/60">{label}</div>
      <div className={clsx("mt-1 font-display text-[30px] font-bold leading-none", tone === "bad" && "text-[#ff8a8a]", tone === "warn" && "text-[#ffc56b]")}>{value}</div>
      {hint && <div className="mt-1.5 text-[11.5px] text-white/55">{hint}</div>}
    </div>
  );
}
