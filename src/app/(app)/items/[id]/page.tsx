import { BackLink } from "@/components/back-link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CalendarClock, CheckCircle2, ExternalLink, FolderOpen, Info, MessageSquare, Paperclip, Timer } from "lucide-react";
import { FlowStepper, healthBadge } from "@/components/flow";
import { Avatar, Badge, BrandDot, ExternalLink as ExtA, ExtraBadge, ProgressChip, TimeSpent, TypeTag, btn } from "@/components/ui";
import { PLATFORM_STATUS_META, STAGE_COLOR, STAGE_META, finalLabel } from "@/domain/workflow";
import { cairoDate, diffDays, formatDateTime, formatDay, formatDuration, formatRelative, formatTime, monthLabel, plural, toCairoLocal, todayISO } from "@/lib/dates";
import { openLabel } from "@/lib/links";
import { requireUser } from "@/server/auth";
import { getActivePeople } from "@/server/cached";
import { getItemDetail, type StageView } from "@/server/queries";
import { attachmentsFor } from "@/server/attachments";
import { Comments } from "@/components/comments";
import { Attachments } from "@/components/attachments";
import { SendBack } from "@/components/send-back";
import { backTargetsOf } from "@/domain/back-targets";
import { can, isManager } from "@/domain/permissions";
import { AssignSelect, CancelToggle, CompleteStage, DeadlineInput, DetailsForm, ExceptionToggle, ExtraToggle, PlatformRow } from "./parts";
import { ChangesBanner, ApproveButton, DeliverButton, DeliveryTimes, HandOffPanel, HotBadge, LinkGlyph, ProgressPicker, ShootSummary, SocialPanel, TakeButton, VersionPanel } from "@/components/handoff";
import { isReviewed } from "@/domain/workflow";
import { AddSession, EditSession } from "./time-edit";

export async function generateMetadata({ params }: PageProps<"/items/[id]">) {
  const d = await getItemDetail((await params).id);
  return { title: d?.item.title ?? "Item" };
}

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const wantsEdit = (await searchParams).edit === "1";
  const [detail, people, files] = await Promise.all([getItemDetail(id), getActivePeople(), attachmentsFor({ itemIds: [id] })]);
  if (!detail) notFound();
  const { item, history, allPlatforms, comments, sessions } = detail;
  const today = todayISO();
  const cur = item.current;
  const pickPeople = people.map((p) => ({ id: p.id, name: p.name, teams: p.teams as string[] }));
  const open = !item.cancelledAt;
  const backTargets = backTargetsOf(item, cur);
  const manager = isManager(me);
  const canEditTime = can.editTime(me);
  const canChangeType = item.stages.every((s) => s.kind === "content" || s.status === "waiting");
  const back = item.brand && item.plan ? { href: `/brands/${item.brand.slug}?m=${item.plan.year}-${String(item.plan.month).padStart(2, "0")}`, label: `${item.brand.name} · ${monthLabel(item.plan.year, item.plan.month)}` } : item.project ? { href: `/projects/${item.project.id}`, label: `${item.project.clientName} · ${item.project.name}` } : { href: "/", label: "Home" };
  const social = item.stages.find((s) => s.kind === "social");
  const canPublish = !!social && social.status !== "waiting";
  const platformRows = allPlatforms.filter((p) => p.isActive || item.platforms.some((ip) => ip.platformId === p.id));
  const targeted = item.platforms.filter((p) => PLATFORM_STATUS_META[p.status].targeted);

  // What this person is allowed to do here.
  const may = {
    doCurrent: !!cur && can.doStage(me, { kind: cur.kind, assigneeId: cur.assignee?.id }),
    review: can.review(me),
    assign: !!cur && can.assign(me, cur),
    deadline: can.setDeadline(me),
    changeDeadline: can.changeDeadline(me),
    excuse: can.excuseLateness(me),
    editContent: can.editContent(me),
    editDate: can.editPostingDate(me),
    publish: can.publish(me),
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <BackLink fallback={back.href} label={back.label}>
        {item.brand && <BrandDot color={item.brand.color} />}
      </BackLink>

      {/* ---------------- Header ---------------- */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <TypeTag type={item.type} />
            {item.postingDate && (
              <span className="inline-flex items-center gap-1 text-[13px] text-muted">
                <CalendarClock className="size-3.5" />
                {item.context === "plan" ? "Posting" : "Due"} {formatDay(item.postingDate)}
                {item.postingTime && ` · ${item.postingTime}`}
              </span>
            )}
            <HotBadge item={item} today={today} />
            <ShootSummary shoot={item.shoot} />
            {item.cancelledAt && <Badge tone="bad">Deleted</Badge>}
            {item.completedAt && <Badge tone="ok" icon={CheckCircle2}>{finalLabel(item.context, item.type)}</Badge>}
          </div>
          <h1 className="mt-1.5 flex flex-wrap items-center gap-2.5 font-display text-[28px] font-bold leading-tight tracking-[-0.01em]">
            {item.title}
            {item.extra && <ExtraBadge by={item.extra.by?.name} className="font-sans" />}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.canvaLink && (
            <ExtA href={item.canvaLink} className={btn("secondary")}>
              <LinkGlyph url={item.canvaLink} /> {openLabel(item.canvaLink)}
              {item.slideNumber && !item.canvaUrl ? ` · slide ${item.slideNumber}` : ""} <ExternalLink className="size-3.5 text-faint" />
            </ExtA>
          )}
          {can.markExtra(me) && item.context === "plan" && open && <ExtraToggle itemId={item.id} extra={!!item.extra} />}
          {item.driveUrl && (
            <ExtA href={item.driveUrl} className={btn("secondary")}>
              <FolderOpen className="size-4 text-[#1a73e8]" /> Drive file <ExternalLink className="size-3.5 text-faint" />
            </ExtA>
          )}
          {(may.editContent || may.editDate) && <DetailsForm item={item} canChangeType={canChangeType && may.editContent} canEditContent={may.editContent} defaultOpen={wantsEdit && open} />}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {/* ---------------- The cycle ---------------- */}
          <section className="card overflow-x-auto p-5">
            <div className="min-w-[520px]">
              <FlowStepper item={item} />
            </div>
            <DeliveryTimes item={item} className="mt-4 border-t border-line pt-3" />
          </section>

          {/* ---------------- Now ---------------- */}
          {open && cur && (
            <section className={clsx("card overflow-hidden", cur.health === "overdue" ? "border-bad/40" : cur.round > 1 && cur.returnedAt ? "border-back/40" : "border-electric/40")}>
              <div className={clsx("flex flex-wrap items-center gap-3 px-5 py-4", cur.health === "overdue" ? "bg-bad-soft/60" : cur.round > 1 && cur.returnedAt ? "bg-back-soft/60" : "bg-electric-soft/60")}>
                <Avatar name={cur.assignee?.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="eyebrow">Right now</div>
                  <div className="font-display text-[18px] font-bold leading-tight">
                    {cur.assignee ? `With ${cur.assignee.name}` : "Waiting for someone to pick it up"} <span className="font-normal text-muted">· {STAGE_META[cur.kind].label}</span>
                  </div>
                  {cur.activatedAt && <div className="mt-0.5 text-[12.5px] text-muted">Arrived {formatRelative(cur.activatedAt)}{prevHandoff(item.stages, cur)}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ProgressChip progress={cur.progress} scheduledFor={cur.scheduledFor} running={cur.time.running} hideNotStarted />
                  <TimeSpent ms={cur.time.ms} running={cur.time.running} />
                  {(() => {
                    const b = healthBadge(cur, today);
                    return b ? <Badge tone={b.tone}>{b.label}</Badge> : null;
                  })()}
                </div>
                {!cur.assignee && <TakeButton stageId={cur.id} userId={me.id} size="sm" />}
              </div>
              {may.doCurrent && cur.progress === "changes_requested" && (
                <div className="border-b border-line px-5 py-3">
                  <ChangesBanner item={item} stage={cur} />
                </div>
              )}
              {cur.round > 1 && cur.returnedAt && !(may.doCurrent && cur.progress === "changes_requested") && (
                <div className="flex gap-2 border-b border-line bg-back-soft/30 px-5 py-3 text-[13.5px]">
                  <Info className="mt-0.5 size-4 shrink-0 text-back" />
                  <div>
                    <b>{cur.returnedBy?.name ?? "Someone"}</b> sent this back {formatRelative(cur.returnedAt)}
                    {cur.returnNote ? <>: &ldquo;{cur.returnNote}&rdquo;</> : "."}
                  </div>
                </div>
              )}
              <div className="space-y-5 p-5">
                {isReviewed(cur.kind) ? (
                  <div className="space-y-5">
                    {may.doCurrent && cur.progress !== "changes_requested" && (
                      <div>
                        <div className="label">Where are you with it?</div>
                        <ProgressPicker stage={cur} showTime={false} />
                      </div>
                    )}
                    <VersionPanel item={item} stage={cur} canDo={may.doCurrent} canReview={may.review} />
                  </div>
                ) : !may.doCurrent ? (
                  <p className="text-[14px] text-ink-2">
                    This step belongs to the <b>{STAGE_META[cur.kind].label}</b> team. You&rsquo;ll see it move here as soon as they finish. Need something from them? Write them a comment.
                  </p>
                ) : cur.kind === "social" ? (
                  <div className="space-y-4">
                    {cur.progress !== "changes_requested" && (
                      <div>
                        <div className="label">Where are you with it?</div>
                        <ProgressPicker stage={cur} showTime={false} />
                      </div>
                    )}
                    <SocialPanel item={item} allPlatforms={allPlatforms.filter((p) => p.isActive)} canPublish={may.publish} />
                    <p className="text-[12.5px] text-muted">Paste each app&rsquo;s link once it&rsquo;s live. When every planned app is live, it finishes by itself.</p>
                    {!targeted.length && <CompleteStage stageId={cur.id} kind={cur.kind} nextLabel={null} nextOwner={null} needsDrive={false} driveUrl={null} finalLabel={finalLabel(item.context, item.type)} />}
                  </div>
                ) : cur.kind === "approval" ? (
                  <div className="flex flex-wrap items-center gap-3 text-[14px] text-ink-2">
                    <ApproveButton stageId={cur.id} />
                    <span>Check the link and files, then approve. Not right yet? Send it back with a note.</span>
                  </div>
                ) : cur.kind === "delivery" ? (
                  <div className="flex flex-wrap items-center gap-3 text-[14px] text-ink-2">
                    <DeliverButton stageId={cur.id} />
                    <span>Once the files are with the client. Time and name are saved automatically.</span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {cur.progress !== "changes_requested" && cur.kind !== "shooting" && (
                      <div>
                        <div className="label">Where are you with it?</div>
                        <ProgressPicker stage={cur} showTime={false} />
                      </div>
                    )}
                    <HandOffPanel item={item} stageId={cur.id} from={cur.kind} people={pickPeople} rights={{ deadline: may.deadline, assign: may.assign, review: may.review }} meId={me.id} />
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-line pt-4">
                  <div className="w-[200px]">
                    <div className="label">Who&rsquo;s working on it</div>
                    {may.assign ? (
                      <AssignSelect stageId={cur.id} kind={cur.kind} value={cur.assignee?.id ?? null} people={pickPeople} />
                    ) : (
                      <div className="h-[30px] text-[14px] font-medium leading-[30px]">{cur.assignee?.name ?? `Anyone in ${STAGE_META[cur.kind].label}`}</div>
                    )}
                  </div>
                  <div>
                    <div className="label">Deadline</div>
                    {may.changeDeadline || (may.deadline && !cur.deadline) ? (
                      <DeadlineInput stageId={cur.id} value={cur.deadline} />
                    ) : (
                      <DeadlineInput stageId={cur.id} value={cur.deadline} locked disabled={!cur.deadline} />
                    )}
                  </div>
                  {may.excuse && (cur.health === "overdue" || cur.health === "overdue_excused") && <ExceptionToggle stageId={cur.id} excused={!!cur.lateExcusedAt} />}
                  <div className="ml-auto">
                    <SendBack itemId={item.id} targets={backTargets} people={pickPeople} meId={me.id} manager={manager} giver={item.extra?.by ?? null} />
                  </div>
                </div>
                {cur.shiftDays > 0 && cur.originalDeadline && <ShiftNote s={cur} />}
              </div>
            </section>
          )}

          {open && item.completedAt && (
            <section className="card flex flex-wrap items-center gap-4 border-ok/30 bg-ok-soft/40 p-5">
              <CheckCircle2 className="size-8 text-ok" />
              <div className="flex-1">
                <div className="font-display text-[17px] font-bold">{finalLabel(item.context, item.type)}</div>
                <div className="text-[13px] text-muted">Finished {formatDateTime(item.completedAt)}</div>
              </div>
              {backTargets.length > 0 && <SendBack itemId={item.id} targets={backTargets} people={pickPeople} meId={me.id} manager={manager} label={item.context === "project" ? "Client wants changes" : "Reopen / send back"} />}
            </section>
          )}

          {/* ---------------- Versions of finished steps ---------------- */}
          {item.versions.some((v) => !cur || v.kind !== cur.kind) && (
            <section className="card p-5">
              <h2 className="mb-1 font-display text-[15px] font-bold">Versions</h2>
              {(["media", "design"] as const)
                .filter((k) => item.versions.some((v) => v.kind === k) && (!cur || cur.kind !== k))
                .map((k) => {
                  const st = item.stages.find((s) => s.kind === k);
                  return st ? (
                    <div key={k} className="mt-2">
                      <div className="text-[12.5px] font-semibold text-muted">{STAGE_META[k].label}</div>
                      <VersionPanel item={item} stage={st} canDo={false} canReview={false} readOnly />
                    </div>
                  ) : null;
                })}
            </section>
          )}

          {/* ---------------- Platforms ---------------- */}
          {item.context === "plan" && !(cur?.kind === "social" && may.publish && open) && (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <div>
                  <h2 className="font-display text-[15px] font-bold">Publishing</h2>
                  <p className="text-[12.5px] text-muted">{canPublish ? "Each platform has its own status and date." : "Choose platforms now — scheduling opens once production delivers."}</p>
                </div>
                <span className="text-[12.5px] text-muted">
                  {item.platforms.filter((p) => p.status === "published").length}/{targeted.length} live
                </span>
              </div>
              <div className="divide-y divide-line">
                {platformRows.map((p) => (
                  <PlatformRow key={p.id} itemId={item.id} platform={p} row={item.platforms.find((ip) => ip.platformId === p.id) ?? null} canPublish={canPublish} readOnly={!may.publish} />
                ))}
              </div>
            </section>
          )}

          {/* ---------------- Files & links ---------------- */}
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold">
              <Paperclip className="size-4 text-electric" /> Files & links
              <span className="text-[12.5px] font-normal text-muted">briefs, scripts, references, any file</span>
            </h2>
            <Attachments items={files.get(item.id) ?? []} itemId={item.id} meId={me.id} manager={manager} canAdd={open} />
          </section>

          {/* ---------------- Time on each step ---------------- */}
          {(sessions.length > 0 || canEditTime) && item.stages.some((s) => s.status !== "waiting") && (
            <section className="card p-5">
              <h2 className="mb-3 flex flex-wrap items-center gap-2 font-display text-[15px] font-bold">
                <Timer className="size-4 text-electric" /> Time on each step
                <span className="text-[12.5px] font-normal text-muted">from In progress until sent{canEditTime ? " · you can correct it" : ""}</span>
              </h2>
              <ul className="space-y-2">
                {item.stages
                  .filter((s) => sessions.some((w) => w.stageId === s.id) || (canEditTime && s.status !== "waiting"))
                  .map((s) => (
                    <li key={s.id} className="rounded-xl border border-line px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[s.kind].fg }} />
                        <span className="text-[13.5px] font-semibold">{STAGE_META[s.kind].label}</span>
                        <TimeSpent ms={s.time.ms} running={s.time.running} prefix="total " />
                      </div>
                      <ul className="mt-1.5 space-y-0.5 pl-4 text-[12.5px] text-muted">
                        {sessions
                          .filter((w) => w.stageId === s.id)
                          .map((w) => (
                            <li key={w.id} className="tabular-nums">
                              <span className="font-medium text-ink-2">{w.userName}</span> · {w.kind === "adjusting" ? "Adjusting" : "In progress"} · {formatDay(cairoDate(w.startedAt))} {formatTime(w.startedAt)} → {w.endedAt ? `${cairoDate(w.endedAt) === cairoDate(w.startedAt) ? "" : `${formatDay(cairoDate(w.endedAt))} `}${formatTime(w.endedAt)}` : "now"} ·{" "}
                              {formatDuration((w.endedAt?.getTime() ?? Date.now()) - w.startedAt.getTime())}
                              {w.endReason === "auto_paused" && <span className="ml-1.5 rounded bg-canvas px-1 text-[11px]">paused automatically</span>}
                              {w.editedAt && <span className="ml-1.5 rounded bg-canvas px-1 text-[11px]">corrected</span>}
                              {canEditTime && <EditSession id={w.id} start={toCairoLocal(w.startedAt)} end={w.endedAt ? toCairoLocal(w.endedAt) : null} running={!w.endedAt} />}
                            </li>
                          ))}
                      </ul>
                      {canEditTime && <AddSession stageId={s.id} people={pickPeople} defaultUserId={s.assignee?.id ?? null} day={today} />}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {/* ---------------- All steps (plan ahead) — tucked away ---------------- */}
          <details className="card group overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 hover:bg-subtle">
              <span>
                <span className="font-display text-[15px] font-bold">More details</span>
                <span className="ml-2 text-[12.5px] text-muted">Every step, who did it, when, and deadlines</span>
              </span>
              <span className="text-[13px] font-medium text-electric group-open:hidden">Show</span>
              <span className="hidden text-[13px] font-medium text-electric group-open:inline">Hide</span>
            </summary>
            <div className="divide-y divide-line border-t border-line">
              {item.stages.map((s) => (
                <StageLine key={s.id} s={s} people={pickPeople} disabled={!open} today={today} isAdmin={may.changeDeadline} canAssign={can.assign(me, s)} canDeadline={may.deadline} canExcuse={may.excuse} />
              ))}
            </div>
          </details>
          {!may.editContent ? null : open ? (
            <div className="flex justify-end">
              <CancelToggle itemId={item.id} cancelled={false} />
            </div>
          ) : (
            <div className="card flex items-center justify-between p-4 text-[14px]">
              <span className="text-muted">This item was deleted. Its history is kept.</span>
              <CancelToggle itemId={item.id} cancelled />
            </div>
          )}
        </div>

        {/* ---------------- Comments & history ---------------- */}
        <aside className="min-w-0 space-y-4">
          <section id="comments" className="card scroll-mt-24 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[15px] font-bold">
              <MessageSquare className="size-4 text-electric" /> Comments
            </h2>
            <Comments
              itemId={item.id}
              comments={comments}
              people={people.map((p) => ({ id: p.id, name: p.name }))}
              meId={me.id}
              isAdmin={isManager(me)}
              files={(files.get(item.id) ?? []).filter((f) => f.commentId).map((f) => ({ id: f.id, kind: f.kind, name: f.name, href: f.href, commentId: f.commentId }))}
            />
          </section>
          <details className="card group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="font-display text-[15px] font-bold">History</span>
              <span className="text-[12.5px] text-muted">
                {history.length} changes · <span className="text-electric group-open:hidden">show</span>
                <span className="hidden text-electric group-open:inline">hide</span>
              </span>
            </summary>
            <ol className="mt-4 space-y-3.5">
              {history.map((h) => (
                <li key={h.id} className="flex gap-2.5 text-[12.5px]">
                  <span className="mt-[5px] flex w-3 shrink-0 justify-center">
                    <span className={clsx("size-2 rounded-full", h.action === "stage_completed" ? "bg-ok" : h.action === "stage_returned" ? "bg-back" : h.action.startsWith("deadline") ? "bg-warn" : "bg-line-strong")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-2">{h.summary}</div>
                    <div className="mt-0.5 text-faint">{formatDateTime(h.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        </aside>
      </div>
    </div>
  );
}

function prevHandoff(stages: StageView[], cur: StageView) {
  const prev = stages.filter((s) => s.position < cur.position && s.status === "done").at(-1);
  if (!prev) return "";
  const by = prev.assignee?.name ?? prev.completedBy?.name;
  return by ? ` from ${by} (${STAGE_META[prev.kind].label})` : "";
}

function ShiftNote({ s }: { s: StageView }) {
  return (
    <div className="flex gap-2 rounded-lg bg-warn-soft/60 px-3 py-2 text-[12.5px] text-ink-2">
      <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-warn" />
      <span>
        Deadline moved from <b>{formatDay(s.originalDeadline)}</b> to <b>{formatDay(s.deadline)}</b>. {s.shiftReason}
      </span>
    </div>
  );
}

function StageLine({
  s,
  people,
  disabled,
  today,
  isAdmin,
  canAssign,
  canDeadline,
  canExcuse,
}: {
  s: StageView;
  people: { id: string; name: string; teams: string[] }[];
  disabled: boolean;
  today: string;
  isAdmin: boolean;
  canAssign: boolean;
  canDeadline: boolean;
  canExcuse: boolean;
}) {
  const b = healthBadge(s, today);
  const late = s.status === "done" && s.completedAt && s.deadline ? Math.max(0, diffDays(cairoDate(s.completedAt), s.deadline)) : 0;
  return (
    <div className="grid items-center gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[170px_190px_1fr]">
      <div>
        <div className="font-medium">{STAGE_META[s.kind].label}</div>
        <div className="text-[12px] text-muted">
          {s.status === "done" ? "Done" : s.status === "active" ? "Current" : "Not reached yet"}
          {s.round > 1 && ` · round ${s.round}`}
        </div>
      </div>
      <div>
        {s.status === "done" ? (
          <div className="flex items-center gap-2 text-[13px]">
            <Avatar name={s.assignee?.name ?? s.completedBy?.name} size={22} />
            <div className="leading-tight">
              <div className="font-medium">{s.assignee?.name ?? s.completedBy?.name}</div>
              {s.completedBy && s.assignee && s.completedBy.id !== s.assignee.id && <div className="text-[11.5px] text-muted">marked by {s.completedBy.name}</div>}
            </div>
          </div>
        ) : disabled || !canAssign ? (
          <span className="text-[13px] text-muted">{s.assignee?.name ?? `Anyone in ${STAGE_META[s.kind].label}`}</span>
        ) : (
          <AssignSelect stageId={s.id} kind={s.kind} value={s.assignee?.id ?? null} people={people} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {s.status === "done" ? (
          <>
            <span className="text-muted">{formatDateTime(s.completedAt)}</span>
            {s.deadline && <span className="text-muted">· deadline {formatDay(s.deadline, { weekday: false })}</span>}
            {b && <Badge tone={b.tone}>{s.health === "done_late" ? `${plural(late, "day")} late` : b.label}</Badge>}
            {(s.health === "done_late" || s.health === "done_excused") && !disabled && canExcuse && <ExceptionToggle stageId={s.id} excused={!!s.lateExcusedAt} />}
          </>
        ) : (
          <>
            <DeadlineInput stageId={s.id} value={s.deadline} disabled={disabled || (!canDeadline && !isAdmin)} locked={(!!s.deadline && !isAdmin) || (!canDeadline && !isAdmin)} />
            {s.shiftDays > 0 && s.originalDeadline && (
              <span className="text-[12px] text-warn" title={s.shiftReason ?? ""}>
                was {formatDay(s.originalDeadline, { weekday: false })} (+{s.shiftDays}d)
              </span>
            )}
            {s.status === "waiting" && s.health === "blocked" && <Badge tone="wait">Waiting on previous stage — not late</Badge>}
          </>
        )}
      </div>
    </div>
  );
}

