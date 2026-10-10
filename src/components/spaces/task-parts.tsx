"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Pause, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { archiveWorkTaskAction, commentOnTaskAction, deleteTaskCommentAction, toggleTaskClockAction, updateWorkTaskAction } from "@/app/space-actions";
import { ActionForm, Submit } from "@/components/client";
import { formatDuration } from "@/lib/dates";

export function TitleEdit({ taskId, title, done, disabled }: { taskId: string; title: string; done: boolean; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!editing || disabled)
    return (
      <h1 className={clsx("group font-display text-[26px] font-bold leading-tight tracking-[-0.01em]", done && "text-muted line-through")}>
        {title}
        {!disabled && (
          <button type="button" onClick={() => setEditing(true)} className="ml-2 inline-grid cursor-pointer place-items-center rounded-md p-1 align-middle text-faint opacity-0 transition-opacity hover:bg-canvas hover:text-ink group-hover:opacity-100 focus:opacity-100" aria-label="Rename">
            <Pencil className="size-4" />
          </button>
        )}
      </h1>
    );
  return (
    <ActionForm action={updateWorkTaskAction} onSuccess={() => setEditing(false)} toast={false} className="flex gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input name="title" defaultValue={title} required autoFocus className="field h-11 flex-1 font-display text-[20px] font-bold" />
      <Submit>Save</Submit>
    </ActionForm>
  );
}

export function DescriptionEdit({ taskId, value, disabled }: { taskId: string; value: string | null; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!editing || disabled)
    return value ? (
      <div className="group relative">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{value}</p>
        {!disabled && (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-electric">
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </div>
    ) : disabled ? (
      <p className="text-[13.5px] text-faint">No description.</p>
    ) : (
      <button type="button" onClick={() => setEditing(true)} className="w-full cursor-pointer rounded-xl border border-dashed border-line px-3 py-3 text-left text-[13.5px] text-faint hover:border-electric hover:text-electric">
        Add a description: what, why, links, notes…
      </button>
    );
  return (
    <ActionForm action={updateWorkTaskAction} onSuccess={() => setEditing(false)} toast={false} className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <textarea name="description" defaultValue={value ?? ""} rows={6} autoFocus className="field w-full text-[14px]" />
      <div className="flex gap-2">
        <Submit size="sm">Save</Submit>
        <button type="button" onClick={() => setEditing(false)} className="cursor-pointer px-2 text-[13px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </ActionForm>
  );
}

export function ClockButton({ taskId, running, ms }: { taskId: string; running: boolean; ms: number }) {
  return (
    <ActionForm action={toggleTaskClockAction} inlineError={false}>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        className={clsx("inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13.5px] font-semibold tabular-nums transition-[background,transform] active:scale-[0.97]", running ? "border-electric bg-electric text-white" : "border-line bg-surface text-ink hover:border-line-strong")}
        title={running ? "Pause my clock" : "Start my clock"}
      >
        {running ? <Pause className="size-4" /> : <Play className="size-4" />}
        {ms > 0 || running ? formatDuration(ms) : "Start clock"}
      </button>
    </ActionForm>
  );
}

export function MarkStatus({ taskId, statusId, label, primary }: { taskId: string; statusId: string; label: string; primary?: boolean }) {
  return (
    <ActionForm action={updateWorkTaskAction} inlineError={false}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="statusId" value={statusId} />
      <Submit variant={primary ? "success" : "secondary"}>
        {primary && <Check className="size-4" strokeWidth={3} />} {label}
      </Submit>
    </ActionForm>
  );
}

export function CommentBox({ taskId }: { taskId: string }) {
  return (
    <ActionForm action={commentOnTaskAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <textarea
        name="body"
        required
        rows={2}
        placeholder="Write a comment… use @name to ping someone"
        aria-label="Comment"
        className="field w-full"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex justify-end">
        <Submit size="sm">Comment</Submit>
      </div>
    </ActionForm>
  );
}

export function DeleteComment({ id }: { id: string }) {
  return (
    <ActionForm action={deleteTaskCommentAction} inlineError={false}>
      <input type="hidden" name="commentId" value={id} />
      <button type="submit" className="cursor-pointer rounded p-1 text-faint hover:bg-bad-soft hover:text-bad" aria-label="Delete comment" onClick={(e) => !confirm("Delete this comment?") && e.preventDefault()}>
        <Trash2 className="size-3.5" />
      </button>
    </ActionForm>
  );
}

export function DeleteTask({ taskId, archived }: { taskId: string; archived: boolean }) {
  return (
    <ActionForm action={archiveWorkTaskAction} inlineError={false}>
      <input type="hidden" name="taskId" value={taskId} />
      {archived && <input type="hidden" name="restore" value="1" />}
      <button
        type="submit"
        onClick={(e) => !archived && !confirm("Delete this task (and its subtasks)? You can restore it from this page.") && e.preventDefault()}
        className={clsx("inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium", archived ? "bg-electric text-white" : "text-muted hover:bg-bad-soft hover:text-bad")}
      >
        {archived ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />} {archived ? "Restore task" : "Delete"}
      </button>
    </ActionForm>
  );
}

export function MoveList({ taskId, listId, lists }: { taskId: string; listId: string; lists: { id: string; name: string }[] }) {
  return (
    <ActionForm action={updateWorkTaskAction} toast={false}>
      <input type="hidden" name="taskId" value={taskId} />
      <select name="listId" defaultValue={listId} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="List" className="field field-sm h-8 w-full max-w-[220px]">
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </ActionForm>
  );
}
