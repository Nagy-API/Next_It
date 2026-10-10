import { ShieldCheck } from "lucide-react";
import { ToastProvider } from "@/components/client";
import { getWorkspace } from "@/server/settings";
import { ChangePasswordForm } from "./settings/forms";
import { logoutAction } from "@/app/actions";

/** Shown instead of the app while someone is on a temporary password. */
export async function FirstPassword({ name }: { name: string }) {
  const BRAND = await getWorkspace();
  return (
    <ToastProvider>
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="rounded-2xl bg-navy-900 p-6 text-white">
            <ShieldCheck className="mb-3 size-8 text-electric-bright" />
            <h1 className="font-display text-[22px] font-bold">Welcome, {name}</h1>
            <p className="mt-1 text-[14px] text-white/70">
              To keep {BRAND.name}&rsquo;s work safe, choose your own password before you start. The one you signed in with was temporary.
            </p>
          </div>
          <ChangePasswordForm />
          <form action={logoutAction} className="text-center">
            <button className="text-[13px] text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </div>
    </ToastProvider>
  );
}
