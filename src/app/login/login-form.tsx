"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { loginAction } from "@/app/actions";
import { btn } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn("primary", "lg", "mt-2 w-full")}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      Sign in
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus className="field h-11" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field h-11" />
      </div>
      {state && !state.ok && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] font-medium text-bad">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
