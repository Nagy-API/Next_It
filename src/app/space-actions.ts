"use server";

/** Form handlers for Spaces and their dashboards. Thin: parse FormData → call src/server/spaces.ts → message. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/app/actions";
import type { Action, FieldConfig, FieldType, StatusKind, Trigger, TriggerType } from "@/domain/spaces";
import type { Actor } from "@/server/activity";
import { requireActor } from "@/server/auth";
import { UserError } from "@/server/errors";
import { archiveDashboard, saveDashboard } from "@/server/dashboards";
import {
  archiveField,
  archiveFolder,
  archiveList,
  archiveSpace,
  archiveWorkTask,
  commentOnTask,
  createSpace,
  createWorkTask,
  deleteTaskComment,
  moveStatus,
  moveWorkTask,
  removeStatus,
  restoreSpace,
  saveAutomation,
  saveField,
  saveFolder,
  saveList,
  saveStatus,
  setAutomationEnabled,
  setFieldValue,
  setSpaceMember,
  toggleTaskClock,
  updateSpace,
  updateWorkTask,
  type SpaceRole,
  type TaskPatch,
} from "@/server/spaces";

type Done = { message: string; celebrate?: "small" | "big" };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const has = (fd: FormData, k: string) => fd.has(k);

async function run(fn: (actor: Actor) => Promise<string | Done | void>): Promise<ActionResult> {
  const actor = await requireActor();
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

/* ------------------------------ Spaces ------------------------------ */

export async function createSpaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await run(async (actor) => {
    const s = await createSpace(actor, {
      name: str(fd, "name"),
      template: str(fd, "template"),
      color: str(fd, "color") || null,
      icon: str(fd, "icon") || null,
      description: str(fd, "description") || null,
      isPrivate: str(fd, "private") === "1",
      memberIds: fd.getAll("memberIds").map(String),
      brandId: str(fd, "brandId") || null,
    });
    id = s.id;
    return { message: `${s.name} is ready.`, celebrate: "small" };
  });
  if (r?.ok && id) redirect(`/spaces/${id}?new=1`);
  return r;
}

export async function updateSpaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await updateSpace(actor, str(fd, "spaceId"), {
      name: has(fd, "name") ? str(fd, "name") : undefined,
      color: has(fd, "color") ? str(fd, "color") : undefined,
      icon: has(fd, "icon") ? str(fd, "icon") : undefined,
      description: has(fd, "description") ? str(fd, "description") : undefined,
      isPrivate: has(fd, "privacy") ? str(fd, "privacy") === "private" : undefined,
      brandId: has(fd, "brandId") ? str(fd, "brandId") || null : undefined,
    });
    return "Space saved.";
  });
}

export async function archiveSpaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await run(async (actor) => {
    await archiveSpace(actor, str(fd, "spaceId"), has(fd, "confirm") ? str(fd, "confirm") : undefined);
    return "Space deleted. You can bring it back from Spaces.";
  });
  if (r?.ok && str(fd, "stay") !== "1") redirect("/spaces");
  return r;
}

export async function restoreSpaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await restoreSpace(actor, str(fd, "spaceId"));
    return { message: "Space restored.", celebrate: "small" };
  });
}

export async function setSpaceMemberAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const role = str(fd, "role");
    await setSpaceMember(actor, str(fd, "spaceId"), str(fd, "userId"), role === "remove" ? null : (role as SpaceRole));
    return role === "remove" ? "Removed from the space." : "Saved.";
  });
}

/* ------------------------- Statuses, lists, fields ------------------------- */

export async function saveStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await saveStatus(actor, str(fd, "spaceId"), { id: str(fd, "statusId") || null, name: str(fd, "name"), color: str(fd, "color"), kind: str(fd, "kind") as StatusKind });
    return "Status saved.";
  });
}

export async function moveStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await moveStatus(actor, str(fd, "statusId"), str(fd, "dir") === "up" ? -1 : 1);
  });
}

export async function removeStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await removeStatus(actor, str(fd, "statusId"), str(fd, "moveTo"));
    return "Status removed.";
  });
}

export async function saveFolderAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await saveFolder(actor, str(fd, "spaceId"), { id: str(fd, "folderId") || null, name: str(fd, "name") });
    return "Folder saved.";
  });
}

export async function archiveFolderAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await archiveFolder(actor, str(fd, "folderId"));
    return "Folder removed. Its lists are kept.";
  });
}

export async function saveListAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await saveList(actor, str(fd, "spaceId"), { id: str(fd, "listId") || null, name: str(fd, "name"), folderId: str(fd, "folderId") || null, color: str(fd, "color") || null, description: has(fd, "description") ? str(fd, "description") : undefined });
    return "List saved.";
  });
}

export async function archiveListAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await archiveList(actor, str(fd, "listId"));
    return "List archived.";
  });
}

export async function saveFieldAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await saveField(actor, str(fd, "spaceId"), {
      id: str(fd, "fieldId") || null,
      name: str(fd, "name"),
      type: str(fd, "type") as FieldType,
      options: str(fd, "options")
        .split(/\r?\n|,/)
        .map((x) => x.trim())
        .filter(Boolean),
      config: has(fd, "config") ? parseConfig(str(fd, "config")) : undefined,
    });
    return "Column saved.";
  });
}

function parseConfig(raw: string): FieldConfig | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as FieldConfig) : null;
  } catch {
    return null;
  }
}

export async function archiveFieldAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await archiveField(actor, str(fd, "fieldId"));
    return "Column removed.";
  });
}

/* ------------------------------- Tasks ------------------------------- */

export async function createWorkTaskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    // "Paste a list": one task per line.
    const titles = str(fd, "title")
      .split(/\r?\n/)
      .map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 100);
    if (!titles.length) throw new UserError("Write the task.");
    for (const title of titles)
      await createWorkTask(actor, {
        listId: str(fd, "listId"),
        title,
        parentId: str(fd, "parentId") || null,
        statusId: str(fd, "statusId") || null,
        assigneeIds: fd.getAll("assigneeIds").map(String).filter(Boolean),
        priority: str(fd, "priority") || null,
        dueDate: str(fd, "dueDate") || null,
      });
    return titles.length > 1 ? `${titles.length} tasks added.` : str(fd, "parentId") ? "Subtask added." : "Task added.";
  });
}

export async function updateWorkTaskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const patch: TaskPatch = {};
    if (has(fd, "title")) patch.title = str(fd, "title");
    if (has(fd, "description")) patch.description = str(fd, "description");
    if (has(fd, "statusId")) patch.statusId = str(fd, "statusId");
    if (has(fd, "priority")) patch.priority = str(fd, "priority") || null;
    if (has(fd, "dueDate")) patch.dueDate = str(fd, "dueDate") || null;
    if (has(fd, "startDate")) patch.startDate = str(fd, "startDate") || null;
    if (has(fd, "listId")) patch.listId = str(fd, "listId");
    if (has(fd, "assignees")) patch.assigneeIds = fd.getAll("assigneeIds").map(String).filter(Boolean);
    const t = await updateWorkTask(actor, str(fd, "taskId"), patch);
    if (t.statusChanged && t.statusKind === "done") return { message: "Done! 🎉", celebrate: "small" };
    if (t.statusChanged && t.statusKind === "review") return { message: "Sent for review 👀", celebrate: "small" };
    return patch.statusId ? "Status updated." : "Saved.";
  });
}

export async function moveWorkTaskAction(taskId: string, statusId: string, beforeId: string | null): Promise<ActionResult> {
  return run(async (actor) => {
    await moveWorkTask(actor, taskId, { statusId, beforeId });
  });
}

export async function setFieldValueAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const multi = fd.getAll("value").map(String);
    await setFieldValue(actor, str(fd, "taskId"), str(fd, "fieldId"), has(fd, "multi") ? multi : str(fd, "value"));
  });
}

export async function archiveWorkTaskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const restore = str(fd, "restore") === "1";
    await archiveWorkTask(actor, str(fd, "taskId"), !restore);
    return restore ? "Task restored." : "Task deleted. You can restore it from its page.";
  });
}

export async function commentOnTaskAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await commentOnTask(actor, str(fd, "taskId"), str(fd, "body"));
    return "Comment posted.";
  });
}

export async function deleteTaskCommentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteTaskComment(actor, str(fd, "commentId"));
    return "Comment deleted.";
  });
}

export async function toggleTaskClockAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const started = await toggleTaskClock(actor, str(fd, "taskId"));
    return started ? "Clock started." : "Clock paused.";
  });
}

/* ---------------------------- Automations ---------------------------- */

export async function saveAutomationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const trigger: Trigger = {
      type: str(fd, "trigger") as TriggerType,
      statusId: str(fd, "triggerStatusId") || null,
      listId: str(fd, "triggerListId") || null,
      priority: (str(fd, "triggerPriority") || null) as Trigger["priority"],
    };
    let actions: Action[];
    try {
      actions = JSON.parse(str(fd, "actions") || "[]") as Action[];
    } catch {
      throw new UserError("Add at least one thing to do.");
    }
    if (!Array.isArray(actions)) throw new UserError("Add at least one thing to do.");
    await saveAutomation(actor, str(fd, "spaceId"), { id: str(fd, "automationId") || null, name: str(fd, "name"), trigger, actions });
    return "Automation saved. It runs from now on.";
  });
}

export async function setAutomationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const v = str(fd, "state");
    await setAutomationEnabled(actor, str(fd, "automationId"), v === "remove" ? null : v === "on");
    return v === "remove" ? "Automation removed." : v === "on" ? "Automation on." : "Automation paused.";
  });
}

/* ---------------------------- Dashboards ---------------------------- */

export async function saveDashboardAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await run(async (actor) => {
    const [spaceId, folderOrList] = str(fd, "scope").split(":");
    id = await saveDashboard(actor, {
      id: str(fd, "dashboardId") || null,
      name: str(fd, "name"),
      scope: { spaceId: spaceId || null, listId: folderOrList?.startsWith("l") ? folderOrList.slice(1) : null, folderId: folderOrList?.startsWith("f") ? folderOrList.slice(1) : null },
      widgets: fd.getAll("widgets").map(String),
      shared: str(fd, "shared") === "1",
    });
    return "Dashboard saved.";
  });
  if (r?.ok && id && !str(fd, "dashboardId")) redirect(`/dashboards/${id}`);
  return r;
}

export async function archiveDashboardAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await run(async (actor) => {
    await archiveDashboard(actor, str(fd, "dashboardId"));
    return "Dashboard deleted.";
  });
  if (r?.ok) redirect("/dashboards");
  return r;
}
