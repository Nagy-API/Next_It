"use client";

import { useState } from "react";
import { dailyMessagesAction } from "@/app/people-actions";
import { ActionForm, Submit } from "@/components/client";

export function DailyMessagesForm({ lines }: { lines: string[] }) {
  const [text, setText] = useState(lines.join("\n"));
  const count = text.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <ActionForm action={dailyMessagesAction} className="mt-4">
      <label className="block text-[13px] font-medium text-ink-2">
        Messages <span className="font-normal text-muted">(one per line, up to 200 characters each)</span>
        <textarea
          name="lines"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="field mt-1 w-full resize-y py-2 leading-relaxed"
          placeholder={"Let's make something people stop scrolling for.\nMeeting every Sunday at 11 — bring your ideas\nDone is a beautiful word."}
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-muted">{count ? `${count} message${count === 1 ? "" : "s"} · a new one every day` : "Empty: the built-in friendly lines are used"}</span>
        <Submit>Save messages</Submit>
      </div>
    </ActionForm>
  );
}
