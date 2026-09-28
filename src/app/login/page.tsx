import { redirect } from "next/navigation";
import { getBranding } from "@/server/branding";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const b = await getBranding();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 60% at 30% 35%, color-mix(in srgb, var(--color-electric) 55%, transparent) 0%, color-mix(in srgb, var(--color-navy-850) 40%, transparent) 45%, transparent 75%), radial-gradient(50% 50% at 85% 90%, color-mix(in srgb, var(--color-electric) 25%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.logoUrl} alt={b.name} className="h-7 w-auto max-w-[260px] self-start object-contain" />
          <div className="max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.markUrl} alt="" className="mb-8 size-16 object-contain opacity-95" />
            <h1 className="font-display text-[34px] font-bold leading-[1.15] text-white">Every piece of content. Every hand-off. One place.</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">From the idea in Canva to the live post — see who has it, what&rsquo;s next, and what needs attention.</p>
          </div>
          <p className="text-[12px] uppercase tracking-[0.2em] text-white/35">{b.name} · Internal Operations</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 lg:hidden">
            <div className="inline-flex rounded-xl bg-navy-900 px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.logoUrl} alt={b.name} className="h-5 w-auto max-w-[220px] object-contain" />
            </div>
          </div>
          <h2 className="font-display text-[24px] font-bold">Sign in</h2>
          <p className="mt-1 text-[14px] text-muted">Use the username your admin gave you.</p>
          <LoginForm next={typeof next === "string" ? next : ""} />
          <p className="mt-8 text-[12px] text-faint">No account? Ask {b.adminContact} to create one for you.</p>
        </div>
      </div>
    </div>
  );
}
