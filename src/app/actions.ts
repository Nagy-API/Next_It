"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CONTENT_TYPES, PLATFORM_STATUSES, RECURRENCES, TASK_STATUSES, type TaskStatus, STAGE_KINDS, STAGE_PROGRESS, type Recurrence, type StageProgress, type ContentType, type PlatformStatus, type StageKind } from "@/db/schema";
import { STAGE_META } from "@/domain/workflow";
import type { Actor } from "@/server/activity";
import {
  createBrand,
  createPlatform,
  createProject,
  createUser,
  findOrCreateClient,
  setAvatar,
  setBrandActive,
  setProjectDeleted,
  setUserActive,
  setUserPassword,
  updateBrand,
  updatePlatform,
  updateProject,
  updateUser,
} from "@/server/admin";
import { endSession, requireActor, requireAdmin, startSession } from "@/server/auth";
import { UserError } from "@/server/errors";
import { createTasks, deleteTask, setTaskDone, setTaskStatus, TASK_STATUS_LABEL } from "@/server/tasks";
import { deleteChatMessage, markChatRead, postChatMessage } from "@/server/chat";
import { addComment, bulkStageAction, createExtraTasks, createItems, deleteComment, resolveComment, setItemCancelled, setItemExtra, setPlanLinks, updateItem, type BulkAction, type NewItemRow } from "@/server/items";
import { addLink, attachLinks, linkPending, removeAttachment } from "@/server/attachments";
import { postNote, removeNote } from "@/server/notes";
import { quickUpdate, type QuickRow } from "@/server/quick";
import { checkCredentials, deleteAllSessions } from "@/server/sessions";
import { LOCK, clientIp, isLockedOut, recordAttempt, safeNext } from "@/server/security";
import { dismissAlerts, markNotificationsRead } from "@/server/stats";
import { isItemFinished } from "@/server/queries";
import { reviewVersion, setShootDetails, submitVersion } from "@/server/workflow";
import { addWorkSession, deleteWorkSession, editWorkSession } from "@/server/time";
import { resetAccess, setPermission } from "@/server/access";
import { MODULE_KEYS, setWorkspaceImage, updateWorkspace, type ImageKey, type ModuleKey } from "@/server/settings";
import { fromCairoLocal } from "@/lib/dates";
import { assignStage, completeStage, handOff, setStageProgress, returnToStage, setLateException, setPlatformState, setStageDeadline } from "@/server/workflow";

/** `celebrate`: the person just finished something — the page shows a short emoji shower (small, or big for a finished item). */
export type ActionResult = { ok: true; message?: string; celebrate?: "small" | "big"; at: number } | { ok: false; error: string; at: number } | null;
type Done = { message: string; celebrate?: "small" | "big" };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const opt = (fd: FormData, k: string) => (fd.has(k) ? str(fd, k).trim() || null : undefined);

async function run(fn: (actor: Actor) => Promise<string | Done | void>, admin = false): Promise<ActionResult> {
  const actor = admin ? await requireAdmin().catch(() => null) : await requireActor();
  if (!actor) return { ok: false, error: "Only account administrators can do that.", at: Date.now() };
  // Someone on a temporary password can't do anything until they choose their own.
  if (actor.user.mustChangePassword) return { ok: false, error: "Choose your own password first (My account).", at: Date.now() };
  try {
    const out = await fn(actor);
    revalidatePath("/", "layout");
    if (out && typeof out === "object") return { ok: true, message: out.message, celebrate: out.celebrate, at: Date.now() };
    return { ok: true, message: out || undefined, at: Date.now() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, at: Date.now() };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again.", at: Date.now() };
  }
}

/* ------------------------------ Auth ------------------------------ */

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const username = str(fd, "username").trim().toLowerCase().slice(0, 64);
  const password = str(fd, "password");
  if (!username || !password) return { ok: false, error: "Enter your username and password.", at: Date.now() };
  const ip = await clientIp();
  if (await isLockedOut(username, ip)) {
    return { ok: false, error: `Too many wrong attempts. Wait ${LOCK.windowMinutes} minutes and try again, or ask an admin.`, at: Date.now() };
  }
  const user = await checkCredentials(username, password);
  await recordAttempt(username, ip, !!user);
  if (!user) return { ok: false, error: "Wrong username or password.", at: Date.now() };
  await startSession(user.id);
  redirect(user.mustChangePassword ? "/settings/account?first=1" : safeNext(str(fd, "next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function changeOwnPasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const current = str(fd, "current");
  const next = str(fd, "password");
  const ok = await checkCredentials(actor.user.username, current);
  if (!ok) return { ok: false, error: "Your current password is not correct.", at: Date.now() };
  if (next !== str(fd, "confirm")) return { ok: false, error: "The new passwords don't match.", at: Date.now() };
  if (next === current) return { ok: false, error: "Choose a password different from the current one.", at: Date.now() };
  try {
    await setUserPassword(actor, actor.id, next);
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, at: Date.now() };
    throw e;
  }
  await startSession(actor.id); // other devices are signed out; keep this one signed in
  revalidatePath("/", "layout");
  if (actor.user.mustChangePassword) redirect("/my-work");
  return { ok: true, message: "Password changed. You were signed out on your other devices.", at: Date.now() };
}

/** Sign out on every device (lost phone, shared computer…). */
export async function signOutEverywhereAction() {
  const actor = await requireActor();
  await deleteAllSessions(actor.id);
  await endSession();
  redirect("/login");
}

/* ---------------------------- Workflow ---------------------------- */

export async function completeStageAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const r = await completeStage(actor, str(fd, "stageId"), { driveUrl: opt(fd, "driveUrl") ?? undefined });
    return r.next ? { message: `Sent to ${STAGE_META[r.next].label}.`, celebrate: "small" } : { message: "Done — nice work! 🎉", celebrate: "big" };
  });
}

export async function handOffAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const target = (str(fd, "target") || undefined) as StageKind | undefined;
    if (target && !STAGE_KINDS.includes(target)) throw new UserError("Choose where to send it.");
    const r = await handOff(actor, str(fd, "stageId"), {
      target,
      assigneeId: str(fd, "assigneeId") || null,
      deadline: str(fd, "deadline") || null,
      driveUrl: opt(fd, "driveUrl") ?? undefined,
      canvaUrl: opt(fd, "canvaUrl") ?? undefined,
    });
    if (!r.next) return { message: "Done — nice work! 🎉", celebrate: "big" };
    const who = r.nextAssignee ?? (str(fd, "assigneeName") || null);
    return { message: who ? `Sent to ${who} (${STAGE_META[r.next].label}).` : `Sent to the ${STAGE_META[r.next].label} team.`, celebrate: "small" };
  });
}

export async function progressAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const p = str(fd, "progress") as StageProgress;
    if (!STAGE_PROGRESS.includes(p)) throw new UserError("Unknown status.");
    await setStageProgress(actor, str(fd, "stageId"), p, { scheduledFor: opt(fd, "scheduledFor") });
    if (p === "adjusting" && str(fd, "ack") === "1") return "On it — the clock is running.";
    if (p === "scheduled") return "Scheduled.";
    if (p === "waiting_approval") return { message: "Sent for approval.", celebrate: "small" };
    if (p === "paused") return "Paused. The clock stopped; press In progress to continue.";
  });
}

export async function planLinksAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const changed = await setPlanLinks(
      actor,
      { brandId: str(fd, "brandId"), year: Number(str(fd, "year")), month: Number(str(fd, "month")) },
      { canvaUrl: opt(fd, "canvaUrl"), driveFolderUrl: opt(fd, "driveFolderUrl") },
    );
    return changed ? "Month links saved." : "Nothing changed.";
  });
}

export async function markReadAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const ids = fd.getAll("id").map(String).filter(Boolean);
  const alerts = fd.getAll("alert").map(String).filter(Boolean);
  if (alerts.length) await dismissAlerts(actor.id, alerts);
  if (ids.length || !alerts.length) await markNotificationsRead(actor.id, ids.length ? ids : undefined);
  return { ok: true, at: Date.now() };
}

export async function returnAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const target = str(fd, "target") as StageKind;
    if (!STAGE_KINDS.includes(target)) throw new UserError("Choose where to send it back to.");
    const who = str(fd, "assigneeId");
    await returnToStage(actor, str(fd, "itemId"), target, opt(fd, "note"), { assigneeId: who === "me" ? actor.id : who || null });
    return `Sent back to ${STAGE_META[target].label}.`;
  });
}

export async function assignAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await assignStage(actor, str(fd, "stageId"), str(fd, "userId") || null);
    return "Assignment saved.";
  });
}

export async function deadlineAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await setStageDeadline(actor, str(fd, "stageId"), str(fd, "deadline") || null);
    return "Deadline saved.";
  });
}

export async function exceptionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const excused = str(fd, "excused") === "1";
    await setLateException(actor, str(fd, "stageId"), excused);
    return excused ? "Marked as an exception — it won't count as late." : "Exception removed.";
  });
}

export async function platformAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const status = opt(fd, "status") as PlatformStatus | null | undefined;
    if (status && !PLATFORM_STATUSES.includes(status)) throw new UserError("Unknown status.");
    const itemId = str(fd, "itemId");
    const liveUrl = opt(fd, "liveUrl");
    await setPlatformState(actor, itemId, str(fd, "platformId"), {
      status: status ?? undefined,
      date: opt(fd, "date"),
      time: opt(fd, "time"),
      liveUrl,
    });
    // Live on every planned platform → the item is finished: a big celebration. One platform live → a small one.
    if ((liveUrl || status === "published") && (await isItemFinished(itemId))) return { message: "Published everywhere — done! 🎉", celebrate: "big" };
    if (liveUrl || status === "published") return { message: "Published! ✨", celebrate: "small" };
    return "Saved.";
  });
}

/* ------------------------------ Items ----------------------------- */

export async function updateItemAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const type = opt(fd, "type") as ContentType | null | undefined;
    if (type && !CONTENT_TYPES.includes(type)) throw new UserError("Unknown type.");
    const n = await updateItem(actor, str(fd, "itemId"), {
      title: fd.has("title") ? str(fd, "title") : undefined,
      type: type ?? undefined,
      canvaUrl: opt(fd, "canvaUrl"),
      driveUrl: opt(fd, "driveUrl"),
      postingDate: opt(fd, "postingDate"),
      postingTime: opt(fd, "postingTime"),
      slideNumber: fd.has("slideNumber") ? (str(fd, "slideNumber") ? Number(str(fd, "slideNumber")) : null) : undefined,
    });
    return n ? "Saved." : "Nothing changed.";
  });
}

export async function cancelItemAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const cancelled = str(fd, "cancelled") === "1";
    await setItemCancelled(actor, str(fd, "itemId"), cancelled);
    return cancelled ? "Deleted. You can restore it any time from “Show deleted items”." : "Item restored.";
  });
}

export async function commentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const itemId = str(fd, "itemId");
    const commentId = await addComment(actor, itemId, str(fd, "body"), {
      parentId: str(fd, "parentId") || null,
      mentionUserId: str(fd, "mentionUserId") || null,
    });
    // Files and links written with the comment (a brief, a reference, a revised script…).
    await linkPending(actor, fd.getAll("attachmentId").map(String), [{ itemId, commentId }]);
    await attachLinks(actor, fd.getAll("attachLink").map(String), [{ itemId, commentId }]);
  });
}

export async function deleteCommentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteComment(actor, str(fd, "commentId"));
    return "Comment deleted.";
  });
}

export async function resolveCommentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const resolved = str(fd, "resolved") !== "0";
    await resolveComment(actor, str(fd, "commentId"), resolved);
    return resolved ? "Marked as done." : "Reopened.";
  });
}

export async function createItemsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let dest = "";
  const res = await run(async (actor) => {
    const target = JSON.parse(str(fd, "target") || "{}");
    const rows = JSON.parse(str(fd, "rows") || "[]") as NewItemRow[];
    const platformIds = JSON.parse(str(fd, "platformIds") || "[]") as string[];
    const ids = await createItems(actor, target, rows, {
      // Empty = the default person (brand creator, or the person the project is assigned to).
      contentAssigneeId: str(fd, "contentAssigneeId") || undefined,
      platformIds,
      contentReady: str(fd, "contentReady") === "1",
      sendWithCanva: str(fd, "sendWithCanva") === "1",
    });
    await linkPending(actor, fd.getAll("attachmentId").map(String), ids.map((itemId) => ({ itemId })));
    await attachLinks(actor, fd.getAll("attachLink").map(String), ids.map((itemId) => ({ itemId })));
    dest = str(fd, "returnTo");
    return `${ids.length} item${ids.length === 1 ? "" : "s"} added.`;
  });
  if (res?.ok && dest.startsWith("/")) redirect(dest);
  return res;
}

export async function bulkAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const ids = JSON.parse(str(fd, "itemIds") || "[]") as string[];
    const kind = str(fd, "kind") as StageKind;
    if (!STAGE_KINDS.includes(kind)) throw new UserError("Choose a stage.");
    const t = str(fd, "action");
    const action: BulkAction =
      t === "assign" ? { type: "assign", userId: str(fd, "userId") || null } : t === "deadline" ? { type: "deadline", date: str(fd, "date") || null } : { type: "complete" };
    const r = await bulkStageAction(actor, ids, kind, action);
    return r.message;
  });
}

/* ------------------------- Brands & projects ----------------------- */

export async function createBrandAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const b = await createBrand(actor, { name: str(fd, "name"), defaultCreatorId: str(fd, "defaultCreatorId") || null });
    return `${b.name} created.`;
  });
}

export async function updateBrandAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await updateBrand(actor, str(fd, "brandId"), {
      name: fd.has("name") ? str(fd, "name") : undefined,
      defaultCreatorId: fd.has("defaultCreatorId") ? str(fd, "defaultCreatorId") || null : undefined,
      defaultShootId: fd.has("defaultShootId") ? str(fd, "defaultShootId") || null : undefined,
      defaultMediaId: fd.has("defaultMediaId") ? str(fd, "defaultMediaId") || null : undefined,
      defaultDesignId: fd.has("defaultDesignId") ? str(fd, "defaultDesignId") || null : undefined,
      defaultSocialId: fd.has("defaultSocialId") ? str(fd, "defaultSocialId") || null : undefined,
      color: opt(fd, "color") ?? undefined,
      logoUrl: opt(fd, "logoUrl"),
    });
    return "Brand saved.";
  });
}

export async function setBrandActiveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const active = str(fd, "active") === "1";
    await setBrandActive(actor, str(fd, "brandId"), active);
    return active ? "Brand reactivated." : "Brand moved to the archive.";
  });
}

export async function createProjectAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await run(async (actor) => {
    const { client } = await findOrCreateClient(actor, str(fd, "clientName"));
    const p = await createProject(actor, { clientId: client.id, name: str(fd, "name"), notes: opt(fd, "notes"), ownerId: opt(fd, "ownerId") });
    id = p.id;
  });
  if (res?.ok && id) redirect(`/projects/${id}`);
  return res;
}

export async function updateProjectAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await updateProject(actor, str(fd, "projectId"), {
      name: fd.has("name") ? str(fd, "name") : undefined,
      notes: opt(fd, "notes"),
      ownerId: fd.has("ownerId") ? str(fd, "ownerId") || null : undefined,
    });
    return "Project saved.";
  });
}

export async function deleteProjectAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const deleted = str(fd, "deleted") !== "0";
  const res = await run(async (actor) => {
    await setProjectDeleted(actor, str(fd, "projectId"), deleted);
    return deleted ? "Project deleted." : "Project restored.";
  });
  if (res?.ok && deleted) redirect("/projects");
  return res;
}

/* ------------------------ Versions & shooting ------------------------ */

export async function submitVersionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const alt = fd.getAll("altUrl").map(String).filter((u) => u.trim());
    const v = await submitVersion(actor, str(fd, "stageId"), { url: str(fd, "url"), altUrls: alt, note: opt(fd, "note") });
    return { message: alt.length ? `v${v.number} sent with ${alt.length + 1} options.` : `v${v.number} sent for approval.`, celebrate: "small" };
  });
}

export async function reviewVersionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const approve = str(fd, "decision") === "approve";
    const r = await reviewVersion(actor, str(fd, "versionId"), { approve, note: opt(fd, "note"), chosenUrl: opt(fd, "chosenUrl") });
    if (!r.approved) return "Sent back for changes — they'll upload the next version.";
    return r.next ? { message: `Approved and sent to ${r.nextAssignee ?? STAGE_META[r.next].label}.`, celebrate: "small" } : { message: "Approved — done! 🎉", celebrate: "big" };
  });
}

export async function shootAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    // The "what the shoot needs" form sends `needs` (unticked boxes aren't sent at all).
    const needs = fd.has("needs");
    const people = opt(fd, "shootPeople");
    await setShootDetails(actor, str(fd, "itemId"), {
      shootDate: opt(fd, "shootDate"),
      shootTime: opt(fd, "shootTime"),
      shootEndTime: opt(fd, "shootEndTime"),
      shootDuration: opt(fd, "shootDuration"),
      shootLocation: opt(fd, "shootLocation"),
      shootNotes: opt(fd, "shootNotes"),
      // The crew picker sends `crew` (unticked people aren't sent).
      shootCrewIds: fd.has("crew") ? fd.getAll("crewIds").map(String) : undefined,
      shootPeople: people === undefined ? undefined : people === null ? null : Number(people),
      shootRentals: opt(fd, "shootRentals"),
      shootRentalsReady: needs || fd.has("shootRentalsReady") ? fd.get("shootRentalsReady") === "on" : undefined,
      shootPurchases: opt(fd, "shootPurchases"),
      shootPurchasesReady: needs || fd.has("shootPurchasesReady") ? fd.get("shootPurchasesReady") === "on" : undefined,
    });
    return needs ? "Saved what the shoot needs." : "Shoot saved.";
  });
}

/* ----------------------------- Workspace ----------------------------- */

export async function updateWorkspaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const has = (k: string) => fd.has(k);
    await updateWorkspace(actor, {
      name: has("name") ? str(fd, "name") : undefined,
      appName: has("appName") ? str(fd, "appName") : undefined,
      tagline: has("tagline") ? str(fd, "tagline") : undefined,
      adminContact: has("adminContact") ? str(fd, "adminContact") : undefined,
      primary: has("primary") ? str(fd, "primary") : undefined,
      dark: has("dark") ? str(fd, "dark") : undefined,
      watermark: has("watermark") ? (str(fd, "watermark") as "logo" | "image" | "none") : undefined,
      watermarkOpacity: has("watermarkOpacity") ? Number(str(fd, "watermarkOpacity")) : undefined,
      autoPauseAt: has("autoPauseAt") ? (fd.get("autoPauseOn") === "on" ? str(fd, "autoPauseAt") : "") : undefined,
      // The modules form sends `modules` (unticked boxes aren't sent).
      modules: has("modules") ? (Object.fromEntries(MODULE_KEYS.map((k) => [k, fd.get(`module_${k}`) === "on"])) as Record<ModuleKey, boolean>) : undefined,
    });
    return "Workspace saved.";
  });
}

export async function setWorkspaceImageAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const data = str(fd, "data");
    await setWorkspaceImage(actor, str(fd, "key") as ImageKey, data || null);
    return data ? "Image saved." : "Back to the built-in image.";
  });
}

/* ------------------------------- Access ------------------------------ */

export async function setPermissionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const value = str(fd, "value") as "allow" | "deny" | "default";
    const changed = await setPermission(actor, str(fd, "userId"), str(fd, "key"), value);
    return changed === false ? "Saved." : "Access updated.";
  });
}

export async function resetAccessAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await resetAccess(actor, str(fd, "userId"));
    return "Back to the defaults.";
  });
}

/* ---------------------------- Worked time ---------------------------- */

export async function editTimeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const startedAt = fromCairoLocal(str(fd, "startedAt"));
    if (!startedAt) throw new UserError("Pick when it started.");
    const end = str(fd, "endedAt");
    const endedAt = end ? fromCairoLocal(end) : null;
    if (end && !endedAt) throw new UserError("Pick when it ended.");
    const changed = await editWorkSession(actor, str(fd, "sessionId"), { startedAt, endedAt });
    return changed ? "Time corrected." : "Nothing changed.";
  });
}

export async function addTimeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const startedAt = fromCairoLocal(str(fd, "startedAt"));
    const endedAt = fromCairoLocal(str(fd, "endedAt"));
    if (!startedAt || !endedAt) throw new UserError("Pick when it started and ended.");
    await addWorkSession(actor, str(fd, "stageId"), { userId: str(fd, "userId"), startedAt, endedAt });
    return "Time added.";
  });
}

export async function deleteTimeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteWorkSession(actor, str(fd, "sessionId"));
    return "Time removed.";
  });
}

/* ------------------------------- Tasks ------------------------------- */

export async function createTaskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const brandId = opt(fd, "brandId");
    const stepRaw = opt(fd, "step");
    const step = stepRaw && (STAGE_KINDS as readonly string[]).includes(stepRaw) ? (stepRaw as StageKind) : null;
    const typeRaw = opt(fd, "type") ?? "reel";
    if (brandId && stepRaw && !step) throw new UserError("Pick the step the work starts at.");
    // A task for a brand becomes Extra work in that brand's plan, at the chosen step.
    if (brandId && step) {
      const ids = await createExtraTasks(actor, {
        title: str(fd, "title"),
        notes: opt(fd, "notes"),
        assigneeIds: fd.getAll("assigneeId").map(String),
        brandId,
        step,
        type: ((CONTENT_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "reel") as ContentType,
        dueDate: opt(fd, "dueDate"),
        priority: opt(fd, "priority"),
      });
      await linkPending(actor, fd.getAll("attachmentId").map(String), ids.map((itemId) => ({ itemId })));
      await attachLinks(actor, fd.getAll("attachLink").map(String), ids.map((itemId) => ({ itemId })));
      return ids.length > 1 ? `Sent to ${ids.length} people — added to the brand as extra work.` : "Sent — added to the brand as extra work.";
    }
    const r = str(fd, "recurrence") as Recurrence;
    const created = await createTasks(actor, {
      title: str(fd, "title"),
      notes: opt(fd, "notes"),
      assigneeIds: fd.getAll("assigneeId").map(String),
      brandId: opt(fd, "brandId"),
      dueDate: opt(fd, "dueDate"),
      dueTime: opt(fd, "dueTime"),
      recurrence: RECURRENCES.includes(r) ? r : "none",
      priority: opt(fd, "priority"),
    });
    await linkPending(actor, fd.getAll("attachmentId").map(String), created.map((t) => ({ taskId: t.id })));
    await attachLinks(actor, fd.getAll("attachLink").map(String), created.map((t) => ({ taskId: t.id })));
    return created.length > 1 ? `Task sent to ${created.length} people.` : "Task sent.";
  });
}

export async function taskDoneAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const done = str(fd, "done") !== "0";
    const next = await setTaskDone(actor, str(fd, "taskId"), done);
    if (!done) return "Reopened.";
    return { message: next ? "Done! The next one is already scheduled." : "Done — nice work! 🎉", celebrate: "small" };
  });
}

export async function taskStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const status = str(fd, "status");
    if (!(TASK_STATUSES as readonly string[]).includes(status)) throw new UserError("Unknown status.");
    await setTaskStatus(actor, str(fd, "taskId"), status as TaskStatus, { scheduledDate: opt(fd, "scheduledDate") });
    return `Status: ${TASK_STATUS_LABEL[status as TaskStatus]}.`;
  });
}

export async function deleteTaskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteTask(actor, str(fd, "taskId"), { series: str(fd, "series") === "1" });
    return "Task deleted.";
  });
}

/* ----------------------------- Attachments ----------------------------- */

export async function addLinkAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await addLink(actor, { url: str(fd, "url"), name: opt(fd, "name"), itemId: opt(fd, "itemId"), taskId: opt(fd, "taskId"), workTaskId: opt(fd, "workTaskId") });
    return "Link attached.";
  });
}

export async function removeAttachmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await removeAttachment(actor, str(fd, "attachmentId"));
    return "Removed.";
  });
}

/** A file was uploaded through /api/files: refresh the page that shows it. */
export async function refreshAction(): Promise<void> {
  await requireActor();
  revalidatePath("/", "layout");
}

export async function extraAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const extra = str(fd, "extra") === "1";
    await setItemExtra(actor, str(fd, "itemId"), extra);
    return extra ? "Counted as extra work." : "Counted as part of the plan.";
  });
}

/* ----------------------------- Quick update ----------------------------- */

export async function quickAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const rows = JSON.parse(str(fd, "rows") || "[]") as QuickRow[];
    if (!Array.isArray(rows) || !rows.length) throw new UserError("Nothing to save yet: paste or type at least one link.");
    const r = await quickUpdate(actor, rows);
    if (!r.done && r.skipped.length) throw new UserError(`Nothing saved. ${r.skipped[0].title}: ${r.skipped[0].reason}`);
    const skipped = r.skipped.length ? ` ${r.skipped.length} skipped (${r.skipped.slice(0, 2).map((x) => `${x.title}: ${x.reason}`).join("; ")}).` : "";
    return { message: `${r.done} updated.${skipped}`, celebrate: r.done ? "small" : undefined };
  });
}

/* -------------------------------- Notes -------------------------------- */

export async function noteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await postNote(actor, str(fd, "text"), str(fd, "color"));
    return "Your note is up for 12 hours.";
  });
}

export async function removeNoteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await removeNote(actor, str(fd, "noteId"));
    return "Note removed.";
  });
}

/* -------------------------------- Chat -------------------------------- */

export async function chatPostAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await postChatMessage(actor, { body: str(fd, "body"), itemId: opt(fd, "itemId") });
  });
}

export async function chatDeleteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteChatMessage(actor, str(fd, "messageId"));
  });
}

export async function chatReadAction(): Promise<void> {
  const actor = await requireActor();
  await markChatRead(actor.id);
}

/* ----------------------------- Profile ------------------------------ */

export async function avatarAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const data = str(fd, "avatar");
    await setAvatar(actor, str(fd, "userId") || actor.id, data || null);
    return data ? "Photo updated." : "Photo removed.";
  });
}

/* ----------------------------- Settings ---------------------------- */

export async function createPlatformAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const p = await createPlatform(actor, str(fd, "name"));
    return `${p.name} added.`;
  });
}

export async function updatePlatformAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await updatePlatform(actor, str(fd, "platformId"), {
      name: fd.has("name") ? str(fd, "name") : undefined,
      isActive: fd.has("active") ? str(fd, "active") === "1" : undefined,
    });
    return "Platform saved.";
  });
}

export async function createUserAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const u = await createUser(actor, {
      username: str(fd, "username"),
      name: str(fd, "name"),
      title: opt(fd, "title"),
      teams: fd.getAll("teams").map(String),
      isAdmin: fd.has("roles") && str(fd, "isAdmin") === "1",
      isManager: fd.has("roles") && str(fd, "isManager") === "1",
      password: str(fd, "password"),
    });
    return `Account created for ${u.name}. Username: ${u.username}`;
  }, true);
}

export async function updateUserAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await updateUser(actor, str(fd, "userId"), {
      name: str(fd, "name"),
      title: opt(fd, "title"),
      teams: fd.getAll("teams").map(String),
      // Only sent by people who manage access (Settings → People shows the boxes to them only).
      isAdmin: fd.has("roles") ? str(fd, "isAdmin") === "1" : undefined,
      isManager: fd.has("roles") ? str(fd, "isManager") === "1" : undefined,
      roleLabel: fd.has("roles") ? opt(fd, "roleLabel") : undefined,
    });
    return "Saved.";
  }, true);
}

export async function setUserActiveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const active = str(fd, "active") === "1";
    await setUserActive(actor, str(fd, "userId"), active);
    return active ? "Account reactivated." : "Account deactivated. Their history is kept.";
  }, true);
}

export async function resetPasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await setUserPassword(actor, str(fd, "userId"), str(fd, "password"));
    return "Password reset. Share the new password with them privately.";
  }, true);
}
