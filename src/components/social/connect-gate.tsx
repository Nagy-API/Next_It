import Link from "next/link";
import { Lock } from "lucide-react";
import { btn } from "../ui";

/**
 * Shows a screen blurred, with a card on top, while the brand on screen has no Facebook Page or Instagram
 * account connected — there is nothing real to plan or measure yet. `locked` false = the screen as it is.
 */
export function ConnectGate({ locked, brand, canConfigure, what, children }: { locked: boolean; brand: string | null; canConfigure: boolean; what: string; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div aria-hidden inert className="pointer-events-none max-h-[70vh] min-h-[420px] select-none overflow-hidden opacity-70 blur-[7px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-[12vh]">
        <div className="card w-full max-w-[440px] p-6 text-center shadow-pop">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-sunken text-ink-2">
            <Lock className="size-5" />
          </div>
          <h2 className="font-display text-[17px] font-bold">{brand ? `${brand} isn't connected yet` : "No account is connected yet"}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            Connect {brand ? `${brand}'s` : "a brand's"} Facebook Page first (and its Instagram account) to open {what}.
          </p>
          <div className="mt-4">
            {canConfigure ? (
              <Link href="/social/config" className={btn("primary", "md")}>
                Connect with Facebook
              </Link>
            ) : (
              <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink-2">Ask an admin to connect it in Social media schedule → Configuration.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
