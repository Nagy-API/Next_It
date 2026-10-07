import Link from "next/link";
import clsx from "clsx";
import { AlarmClock, ClipboardCheck, Coffee, Flame, Hourglass, Inbox, MessageSquareText, ThumbsUp, Trophy, type LucideIcon } from "lucide-react";
import { TaskCard } from "@/components/handoff";
import { TaskRow } from "@/components/tasks";
import { Avatar, Badge, BrandDot, SectionTitle, TypeIcon } from "@/components/ui";
import { can, isManager } from "@/domain/permissions";
import { STAGE_META, isNewTask, isNewWork } from "@/domain/workflow";
import { addDays, formatDateTime, formatRelative, monthName, monthRange, todayISO, weekRange } from "@/lib/dates";
import { personPerMonth } from "@/server/stats";
import { requireUser } from "@/server/auth";
import { getActivePeople, getOpenItems } from "@/server/cached";
import { getMyMessages, getPersonCompletions, getPersonWork, reviewsFor, tasksFor, type WorkItem } from "@/server/queries";
import { getTasksFor, getTasksGivenBy } from "@/server/tasks";
import { BRAND } from "@/config/brand";
import { dailyLine, teamEmoji } from "@/lib/cheer";

export const metadata = { title: "My tasks" };

/** New work first, then late, then posting within 48h, then sent-back, then by deadline / posting date. */
function urgency(i: WorkItem) {
  const c = i.current!;
  if (isNewWork(i)) return 0;
  if (c.health === "overdue") return 1;
  if (i.hot) return 2;
  if (c.round > 1 && c.returnedAt) return 3;
  return 4;
}

const PERIODS = [
  { key: "", label: "Everything" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
] as const;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function MyTasksPage({ searchParams }: PageProps<"/my-work">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayISO();
  const manager = isManager(user);
  const [{ next }, recent, open, people, messages, myTasks, given] = await Promise.all([
    getPersonWork(user.id, today),
    getPersonCompletions(user.id, addDays(today, -13), today),
    getOpenItems(),
    getActivePeople(),
    getMyMessages(user.id),
    getTasksFor(user.id, today),
    manager ? getTasksGivenBy(user.id, today) : Promise.resolve([]),
  ]);
  const pick = people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }));
  const rights = { deadline: can.setDeadline(user), assign: can.assign(user), review: can.review(user) };

  // Period filter: Today / This week / This month (by the step's deadline, else the posting date).
  const period = PERIODS.find((p) => p.key === sp.when)?.key ?? "";
  const until =
    period === "today" ? today : period === "week" ? weekRange(today).end : period === "month" ? monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7))).end : null;
  const inPeriod = (d: string | null | undefined) => !until || (!!d && d <= until);

  const allItems = tasksFor(open, user).sort(
    (a, b) =>
      urgency(a) - urgency(b) ||
      (urgency(a) === 0 ? (b.current?.activatedAt?.getTime() ?? 0) - (a.current?.activatedAt?.getTime() ?? 0) : 0) ||
      (a.current?.deadline ?? a.postingDate ?? "9").localeCompare(b.current?.deadline ?? b.postingDate ?? "9"),
  );
  const reviews = reviewsFor(open, user).filter((i) => !allItems.includes(i));
  const openTasks = myTasks.filter((t) => !t.doneAt);
  // Manager to-dos: new ones first (newest on top), then by deadline; finished ones last.
  const taskOrder = (t: (typeof myTasks)[number]) => (t.doneAt ? 2 : isNewTask(t) ? 0 : 1);
  myTasks.sort(
    (a, b) =>
      taskOrder(a) - taskOrder(b) ||
      (taskOrder(a) === 0 ? b.createdAt.getTime() - a.createdAt.getTime() : (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")),
  );

  // Brand filter (brands + one-off projects), only for places that actually have tasks.
  const places = new Map<string, { key: string; label: string; color?: string; n: number }>();
  for (const i of allItems) {
    const key = i.brand ? i.brand.slug : "projects";
    const p = places.get(key) ?? { key, label: i.brand ? i.brand.name : "One-off projects", color: i.brand?.color, n: 0 };
    p.n++;
    places.set(key, p);
  }
  const filter = typeof sp.brand === "string" && places.has(sp.brand) ? sp.brand : "";
  const items = allItems
    .filter((i) => !filter || (i.brand ? i.brand.slug : "projects") === filter)
    .filter((i) => inPeriod(i.current?.deadline ?? i.postingDate));
  const tasksShown = myTasks.filter((t) => t.doneAt || inPeriod(t.dueDate));
  const lateCount = allItems.filter((i) => i.current?.health === "overdue").length + openTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const hotCount = allItems.filter((i) => i.hot).length;
  const months = await personPerMonth(user.id, Number(today.slice(0, 4)), Number(today.slice(5, 7)), 2);
  const [lastMonth, thisMonth] = months;
  // Everything on this person right now: their steps, versions waiting for their approval, and managers' to-dos.
  const total = allItems.length + reviews.length + openTasks.length;
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { when: period, brand: filter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/my-work${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[980px] space-y-8">
      <header className="relative overflow-hidden rounded-2xl bg-navy-900 px-4 py-4 text-white sm:px-6 sm:py-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_200px_at_85%_0%,rgba(59,130,246,0.35),transparent_70%)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logos.markOnDark} alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-56 object-contain opacity-[0.08] drop-shadow-[0_10px_25px_rgba(96,165,250,0.6)]" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={46} ring />
            <div>
              <h1 className="font-display text-[21px] font-bold leading-tight tracking-[-0.01em] sm:text-[26px]">
                {greeting()}, {user.name} <span className="inline-block origin-bottom-right animate-wave">{teamEmoji(user.teams)}</span>
              </h1>
              <p className="text-[14px] text-white/65">
                {total ? (hotCount ? `${hotCount} thing${hotCount > 1 ? "s" : ""} must move in the next 48 hours — they're at the top.` : "Here's everything on you, from every brand.") : "Nothing waiting for you right now — enjoy it ☕"}
              </p>
              <p className="mt-1 hidden text-[13px] italic text-electric-bright/90 sm:block">{dailyLine(user.name, today)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:mt-5 sm:gap-3">
            <HeroStat icon={Inbox} label="On you now" value={total} />
            <HeroStat icon={AlarmClock} label="Late" value={lateCount} tone={lateCount ? "bad" : undefined} />
            <HeroStat icon={Flame} label="Within 48 hours" value={hotCount} tone={hotCount ? "warn" : undefined} />
            <HeroStat icon={Trophy} label={`Done in ${monthName(thisMonth.month)}`} value={thisMonth.value} hint={deltaText(thisMonth.value, lastMonth.value, monthName(lastMonth.month, true))} />
          </div>
          <Link href={`/team/${user.username}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-electric-bright hover:underline">
            My stats month by month →
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-2" aria-label="When">
        {PERIODS.map((p) => (
          <Link key={p.key} href={q({ when: p.key })} className={chip(period === p.key)}>
            {p.label}
          </Link>
        ))}
        <span className="ml-auto text-[12.5px] text-muted">{until ? `Due or posting by ${until === today ? "today" : until}` : "All open work"}</span>
      </nav>

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

      {reviews.length > 0 && (
        <section>
          <SectionTitle right={<span className="text-[13px] text-muted">Approve it and it moves on by itself</span>}>
            <span className="inline-flex items-center gap-2">
              <ThumbsUp className="size-4 text-ok" /> Waiting for your approval
              <span className="rounded-full bg-ok px-2 py-0.5 text-[12px] text-white">{reviews.length}</span>
            </span>
          </SectionTitle>
          <div className="space-y-3">
            {reviews.map((i) => (
              <TaskCard key={i.id} item={i} meId={user.id} people={pick} rights={rights} today={today} mode="review" />
            ))}
          </div>
        </section>
      )}

      {tasksShown.length > 0 && (
        <section id="tasks" className="scroll-mt-24">
          <SectionTitle right={<span className="text-[13px] text-muted">{openTasks.length} open</span>}>
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck className="size-4 text-electric" /> Tasks from managers
            </span>
          </SectionTitle>
          <div className="card divide-y divide-line">
            {tasksShown.map((t) => (
              <TaskRow key={t.id} t={t} today={today} mode="mine" canDelete={manager} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle right={<span className="text-[13px] text-muted">{items.length}</span>}>
          <span className="inline-flex items-center gap-2">
            {hotCount > 0 && <Flame className="size-4 text-[#ff8a1f]" />} Content to do
          </span>
        </SectionTitle>
        {places.size > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Link href={q({ brand: "" })} className={chip(!filter)}>
              All <span className="opacity-60">{allItems.length}</span>
            </Link>
            {[...places.values()].map((p) => (
              <Link key={p.key} href={q({ brand: p.key })} className={chip(filter === p.key)}>
                {p.color && <BrandDot color={p.color} />} {p.label} <span className="opacity-60">{p.n}</span>
              </Link>
            ))}
          </div>
        )}
        {items.length ? (
          <div className="space-y-3">
            {items.map((i) => (
              <TaskCard key={i.id} item={i} meId={user.id} people={pick} rights={rights} today={today} />
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <Coffee className="mb-3 size-8 text-electric" />
            <div className="font-display text-[16px] font-bold">{period ? "Nothing due in this period" : "You’re all caught up"}</div>
            <div className="mt-1 text-[13px] text-muted">New work sent to you or your team shows up here automatically — and in the bell.</div>
          </div>
        )}
      </section>

      {manager && given.length > 0 && (
        <section id="given" className="scroll-mt-24">
          <SectionTitle right={<span className="text-[13px] text-muted">{given.filter((t) => !t.doneAt).length} still open</span>}>Tasks I gave</SectionTitle>
          <div className="card divide-y divide-line">
            {given.map((t) => (
              <TaskRow key={t.id} t={t} today={today} mode="given" canDelete />
            ))}
          </div>
        </section>
      )}

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
        <SectionTitle right={recent.length > 8 ? <Link href={`/team/${user.username}`} className="text-[13px] font-medium text-electric hover:underline">All {recent.length} →</Link> : null}>
          Finished in the last 2 weeks <span className="ml-1 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">{recent.length}</span>
        </SectionTitle>
        {recent.length ? (
          <div className="card divide-y divide-line">
            {recent.slice(0, 8).map((r) => (
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

function HeroStat({ icon: Icon, label, value, tone, hint }: { icon: LucideIcon; label: string; value: number; tone?: "bad" | "warn"; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.07] px-2.5 py-2.5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.11] sm:px-4 sm:py-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium leading-tight text-white/60 sm:text-[12px]">
        <Icon className="hidden size-3.5 shrink-0 sm:block" strokeWidth={2.2} /> {label}
      </div>
      <div className={clsx("mt-1 font-display text-[22px] font-bold leading-none sm:text-[30px]", tone === "bad" && "text-[#ff8a8a]", tone === "warn" && "text-[#ffc56b]")}>{value}</div>
      {hint && <div className="mt-1.5 hidden text-[11.5px] text-white/55 sm:block">{hint}</div>}
    </div>
  );
}
