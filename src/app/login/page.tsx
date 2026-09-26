import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 60% at 30% 35%, rgba(29,78,216,0.55) 0%, rgba(13,27,75,0.4) 45%, rgba(3,10,30,0) 75%), radial-gradient(50% 50% at 85% 90%, rgba(59,130,246,0.25) 0%, rgba(3,10,30,0) 70%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Image src="/brand/nexora-wordmark-white.png" alt="NEXORA" width={777} height={153} className="h-7 w-auto self-start" priority />
          <div className="max-w-md">
            <Image src="/brand/nexora-mark-white.png" alt="" width={566} height={565} className="mb-8 size-16 opacity-95" />
            <h1 className="font-display text-[34px] font-bold leading-[1.15] text-white">Every piece of content. Every hand-off. One place.</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">From the idea in Canva to the live post — see who has it, what&rsquo;s next, and what needs attention.</p>
          </div>
          <p className="text-[12px] uppercase tracking-[0.2em] text-white/35">NEXORA · Internal Operations</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 lg:hidden">
            <div className="inline-flex rounded-xl bg-navy-900 px-4 py-3">
              <Image src="/brand/nexora-wordmark-white.png" alt="NEXORA" width={777} height={153} className="h-5 w-auto" priority />
            </div>
          </div>
          <h2 className="font-display text-[24px] font-bold">Sign in</h2>
          <p className="mt-1 text-[14px] text-muted">Use the username your admin gave you.</p>
          <LoginForm next={typeof next === "string" ? next : ""} />
          <p className="mt-8 text-[12px] text-faint">No account? Ask Shahenda or IT to create one for you.</p>
        </div>
      </div>
    </div>
  );
}
