/** Optional priority on a given task (Give a task): nothing = normal. Shown as a small chip; urgent work sorts first. */
export const TASK_PRIORITIES = {
  urgent: { label: "Urgent", emoji: "🔴", color: "#ef4444", rank: 0 },
  important: { label: "Important", emoji: "🟠", color: "#f59e0b", rank: 1 },
} as const;
export type TaskPriority = keyof typeof TASK_PRIORITIES;

export function cleanPriority(v: unknown): TaskPriority | null {
  return typeof v === "string" && v in TASK_PRIORITIES ? (v as TaskPriority) : null;
}

/** 0 urgent, 1 important, 2 normal. */
export function priorityRank(v: string | null | undefined) {
  return v && v in TASK_PRIORITIES ? TASK_PRIORITIES[v as TaskPriority].rank : 2;
}
