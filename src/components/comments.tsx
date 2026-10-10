"use client";

import { useState } from "react";
import clsx from "clsx";
import { AtSign, Check, CornerDownRight, FileText, Link2, Paperclip, RotateCcw, Trash2 } from "lucide-react";
import { PendingAttachments } from "./attachments";
import { commentAction, deleteCommentAction, resolveCommentAction } from "@/app/actions";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { ActionForm, Submit } from "./client";
import { Avatar, Badge } from "./ui";

export type CommentView = {
  id: string;
  body: string;
  tag: string | null;
  createdAt: Date;
  authorName: string;
  authorId: string;
  parentId: string | null;
  mentionUserId: string | null;
  resolvedAt: Date | null;
};

/**
 * Lightweight discussion: a comment can be addressed to one person, anyone can reply under it,
 * and it's marked done when the person answers (or someone closes it). Not a chat.
 */
type FileChip = { id: string; kind: "file" | "link"; name: string; href: string; commentId: string | null };

/** The files and links written with a comment. */
function CommentFiles({ files }: { files: FileChip[] }) {
  if (!files.length) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={f.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border border-line bg-subtle px-2 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-electric hover:text-electric"
          >
            {f.kind === "link" ? <Link2 className="size-3.5 shrink-0 text-electric" /> : <FileText className="size-3.5 shrink-0 text-muted" />}
            <span className="truncate">{f.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Comments({ itemId, comments, people, meId, isAdmin, files = [] }: { itemId: string; comments: CommentView[]; people: { id: string; name: string }[]; meId: string; isAdmin: boolean; files?: FileChip[] }) {
  const filesOf = (id: string) => files.filter((f) => f.commentId === id);
  const threads = comments.filter((c) => !c.parentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const replies = (id: string) => comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;

  return (
    <div>
      <NewComment itemId={itemId} people={people.filter((p) => p.id !== meId)} />
      {threads.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">No comments yet. Write to someone to ask a question or request a change.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {threads.map((t) => {
            const to = nameOf(t.mentionUserId);
            const waiting = !!t.mentionUserId && !t.resolvedAt;
            const canResolve = t.authorId === meId || t.mentionUserId === meId || isAdmin;
            return (
              <li key={t.id} id={`c-${t.id}`} className={clsx("scroll-mt-24 rounded-xl border p-3", waiting && t.mentionUserId === meId ? "border-electric bg-electric-soft/40" : "border-line bg-surface")}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={t.authorName} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]">
                      <span className="font-semibold text-ink">{t.authorName}</span>
                      {to && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-canvas px-1.5 font-medium text-ink-2">
                          <AtSign className="size-3" />
                          {to}
                        </span>
                      )}
                      <span className="text-faint" title={formatDateTime(t.createdAt)}>
                        {formatRelative(t.createdAt)}
                      </span>
                      {(t.authorId === meId || isAdmin) && <DeleteComment id={t.id} />}
                    </div>
                    {t.tag && (
                      <div className="mt-1">
                        <Badge tone="back">{t.tag}</Badge>
                      </div>
                    )}
                    <div className="mt-1 whitespace-pre-wrap text-[14px] text-ink">{t.body}</div>
                    <CommentFiles files={filesOf(t.id)} />
                    <ThreadFooter thread={t} waitingFor={waiting ? to : null} canResolve={canResolve} itemId={itemId} replies={replies(t.id)} filesOf={filesOf} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ThreadFooter({
  thread,
  waitingFor,
  canResolve,
  itemId,
  replies,
  filesOf,
}: {
  thread: CommentView;
  waitingFor: string | null;
  canResolve: boolean;
  itemId: string;
  replies: CommentView[];
  filesOf: (id: string) => FileChip[];
}) {
  const [replying, setReplying] = useState(false);
  return (
    <>
      {replies.length > 0 && (
        <ol className="mt-2.5 space-y-2 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <li key={r.id} className="flex items-start gap-2">
              <Avatar name={r.authorName} size={22} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]">
                  <span className="font-semibold">{r.authorName}</span> <span className="text-faint">{formatRelative(r.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap text-[13.5px]">{r.body}</div>
                <CommentFiles files={filesOf(r.id)} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
        <button type="button" onClick={() => setReplying((r) => !r)} className="inline-flex items-center gap-1 font-semibold text-electric hover:underline">
          <CornerDownRight className="size-3.5" /> Reply
        </button>
        {waitingFor && <span className="font-medium text-warn">Waiting for {waitingFor}</span>}
        {thread.resolvedAt && (
          <span className="inline-flex items-center gap-1 font-medium text-ok">
            <Check className="size-3.5" strokeWidth={3} /> Done
          </span>
        )}
        {canResolve && thread.mentionUserId && (
          <ActionForm action={resolveCommentAction} inlineError={false} toast={false} className="ml-auto">
            <input type="hidden" name="commentId" value={thread.id} />
            <input type="hidden" name="resolved" value={thread.resolvedAt ? "0" : "1"} />
            <button className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink">
              {thread.resolvedAt ? (
                <>
                  <RotateCcw className="size-3.5" /> Reopen
                </>
              ) : (
                <>
                  <Check className="size-3.5" /> Mark done
                </>
              )}
            </button>
          </ActionForm>
        )}
      </div>
      {replying && (
        <ActionForm action={commentAction} toast={false} onSuccess={() => setReplying(false)} className="mt-2 flex items-start gap-2">
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="parentId" value={thread.id} />
          <textarea
            name="body"
            rows={1}
            required
            autoFocus
            placeholder="Write a reply…"
            className="field min-h-[38px] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Submit size="md" variant="dark">
            Reply
          </Submit>
        </ActionForm>
      )}
    </>
  );
}

function DeleteComment({ id }: { id: string }) {
  return (
    <ActionForm action={deleteCommentAction} inlineError={false} className="ml-auto">
      <input type="hidden" name="commentId" value={id} />
      <button type="submit" className="rounded p-0.5 text-faint hover:bg-bad-soft hover:text-bad" aria-label="Delete comment" title="Delete comment">
        <Trash2 className="size-3.5" />
      </button>
    </ActionForm>
  );
}

function NewComment({ itemId, people }: { itemId: string; people: { id: string; name: string }[] }) {
  const [round, setRound] = useState(0);
  const [attach, setAttach] = useState(false);
  return (
    <ActionForm
      action={commentAction}
      resetOnSuccess
      toast={false}
      onSuccess={() => {
        setRound((r) => r + 1);
        setAttach(false);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="itemId" value={itemId} />
      <textarea
        name="body"
        rows={2}
        required
        placeholder="Write a comment… (type @Name to notify someone)"
        className="field resize-y"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      {attach && (
        <div className="rounded-xl border border-dashed border-line-strong bg-subtle p-2.5">
          <PendingAttachments key={round} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAttach((a) => !a)}
          aria-pressed={attach}
          title="Attach files or links (Word, PDF, Excel, images, a Google Doc…)"
          className={clsx("grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border transition-colors", attach ? "border-electric bg-electric-soft text-electric" : "border-line bg-surface text-muted hover:text-ink")}
          aria-label="Attach files or links"
        >
          <Paperclip className="size-4" />
        </button>
        <label className="sr-only" htmlFor={`to-${itemId}`}>
          Send to
        </label>
        <select id={`to-${itemId}`} name="mentionUserId" defaultValue="" className="field field-sm h-9 min-w-0 flex-1">
          <option value="">To: everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              To: {p.name} (waits for their reply)
            </option>
          ))}
        </select>
        <Submit size="md" variant="dark">
          Post
        </Submit>
      </div>
    </ActionForm>
  );
}
