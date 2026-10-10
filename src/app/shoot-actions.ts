"use server";

/** Form handlers for the Shoot schedule. */
import type { ActionResult } from "@/app/actions";
import { createShoot, deleteShoot, setShootStatus, updateShoot } from "@/server/shoots";
import { opt, run, str } from "./run";

function slot(fd: FormData) {
  const people = opt(fd, "people");
  return {
    title: str(fd, "title"),
    brandId: str(fd, "brandId") || null,
    day: str(fd, "day"),
    startTime: str(fd, "startTime"),
    endTime: str(fd, "endTime"),
    location: opt(fd, "location") ?? null,
    people: people ? Number(people) : null,
    rentals: opt(fd, "rentals") ?? null,
    rentalsReady: fd.get("rentalsReady") === "on",
    purchases: opt(fd, "purchases") ?? null,
    purchasesReady: fd.get("purchasesReady") === "on",
    notes: opt(fd, "notes") ?? null,
    crewIds: fd.getAll("crewIds").map(String),
    after: (str(fd, "after") === "edit" ? "edit" : "none") as "edit" | "none",
    editorId: str(fd, "editorId") || null,
  };
}

export async function saveShootAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const id = str(fd, "shootId");
    if (id) {
      await updateShoot(actor, id, slot(fd));
      return "Shoot updated.";
    }
    await createShoot(actor, slot(fd));
    return { message: "Shoot added to the schedule. 🎬", celebrate: "small" };
  });
}

export async function shootStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const status = str(fd, "status") as "planned" | "shot" | "cancelled";
    if (!["planned", "shot", "cancelled"].includes(status)) throw new Error("Unknown status");
    const r = await setShootStatus(actor, str(fd, "shootId"), status);
    if (status === "shot") return { message: r.itemId || r.taskId ? "Shot ✓ and sent for editing." : "Shot ✓", celebrate: "small" };
    return status === "cancelled" ? "Shoot cancelled." : "Back to planned.";
  });
}

export async function deleteShootAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    await deleteShoot(actor, str(fd, "shootId"));
    return "Shoot deleted.";
  });
}
