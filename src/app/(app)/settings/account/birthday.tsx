"use client";

import { Cake } from "lucide-react";
import { birthdayAction } from "@/app/people-actions";
import { ActionForm, Submit } from "@/components/client";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Day and month only (never the year): the Overview wishes a happy birthday on the day. */
export function BirthdayForm({ value }: { value: string | null }) {
  const [m, d] = value ? value.split("-").map(Number) : [0, 0];
  return (
    <section className="card max-w-md p-5">
      <div className="flex items-center gap-2 font-display text-[15px] font-bold">
        <Cake className="size-4 text-[#e0569b]" /> My birthday
      </div>
      <p className="mt-1 text-[13px] text-muted">Only the day and month. The team sees it on the Overview so nobody forgets 🎂</p>
      <ActionForm action={birthdayAction} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[13px] font-medium text-ink-2">
          Day
          <select name="day" defaultValue={d || ""} className="field mt-1 block w-20">
            <option value="">—</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] font-medium text-ink-2">
          Month
          <select name="month" defaultValue={m || ""} className="field mt-1 block w-40">
            <option value="">—</option>
            {MONTHS.map((x, i) => (
              <option key={x} value={i + 1}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <Submit variant="secondary">Save</Submit>
      </ActionForm>
    </section>
  );
}
