import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getWorkspace } from "@/server/settings";

export const metadata = { title: "Privacy & security" };

/** Public: what the system stores, who sees it, and how it's protected. Plain language on purpose. */
export default async function PrivacyPage() {
  const BRAND = await getWorkspace();
  return (
    <div className="min-h-dvh bg-canvas px-4 py-10">
      <article className="mx-auto max-w-[760px] space-y-8 text-[15px] leading-relaxed text-ink-2">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-electric">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <header>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-electric-soft px-3 py-1 text-[12px] font-semibold text-electric">
            <Lock className="size-3.5" /> Privacy & security policy
          </div>
          <h1 className="font-display text-[30px] font-bold text-ink">{BRAND.appName}: privacy & security</h1>
          <p className="mt-2">
            {BRAND.appName} is {BRAND.name}&rsquo;s private work system. It is only for {BRAND.name}&rsquo;s team. This page explains, in plain words, what it keeps,
            who can see it and how it is protected.
          </p>
        </header>

        <Section title="1. What we keep">
          <ul className="list-disc space-y-1 pl-5">
            <li>Your account: name, username, job title, team, and an optional profile photo you upload.</li>
            <li>Your password is never stored — only a one-way scrambled version (Argon2id) that can&rsquo;t be turned back into the password.</li>
            <li>The work: content items, dates, links to Canva/Google Drive files (not the files themselves), versions, comments, tasks and Team chat messages.</li>
            <li>A history (activity log) of who did what and when — this is what makes deadlines and hand-offs fair.</li>
            <li>Sign-in attempts (username, time, network address) to stop password guessing.</li>
          </ul>
        </Section>

        <Section title="2. What we don't do">
          <ul className="list-disc space-y-1 pl-5">
            <li>No advertising, no tracking, no analytics, no third-party scripts. Fonts are served from our own server.</li>
            <li>Nothing is sold or shared outside {BRAND.name}. The system doesn&rsquo;t send emails or messages to outside services.</li>
            <li>Only one cookie is used: the sign-in cookie. It can&rsquo;t be read by page scripts and is only sent to this site.</li>
          </ul>
        </Section>

        <Section title="3. Who can see what">
          <ul className="list-disc space-y-1 pl-5">
            <li>Everyone signed in sees the work, comments and Team chat — it&rsquo;s a shared workspace.</li>
            <li>Personal numbers (finished work, lateness) are visible to the person themselves and to managers only.</li>
            <li>The activity log, dashboard and Excel reports are for managers only. Settings and accounts are for admins only.</li>
            <li>Each team can only do its own step; permissions are checked on the server for every action, not just hidden in the screen.</li>
          </ul>
        </Section>

        <Section title="4. How it's protected">
          <ul className="list-disc space-y-1 pl-5">
            <li>Encrypted connection (HTTPS) when hosted online; browsers are told to never use an unencrypted connection.</li>
            <li>After 5 wrong passwords, that account is locked for 15 minutes. Passwords need 10+ characters with letters and numbers or symbols.</li>
            <li>New accounts and password resets use a temporary password that must be changed at the first sign-in.</li>
            <li>Sign-in sessions expire after 14 days of not being used; &ldquo;Sign out on all devices&rdquo; is in My account.</li>
            <li>A strict Content-Security-Policy and other browser protections block injected scripts, clickjacking and content sniffing.</li>
            <li>The history can&rsquo;t be edited or deleted — the database itself refuses it.</li>
            <li>Uploaded photos are checked (image types only, size limits) and only shown to signed-in people.</li>
          </ul>
        </Section>

        <Section title="5. How long we keep it">
          <p>
            Work and its history are kept for as long as {BRAND.name} uses the system, because they are the company&rsquo;s record. When someone leaves, their account is
            deactivated: they can no longer sign in, and their past work stays in the history. Sign-in attempts are kept for 30 days.
          </p>
        </Section>

        <Section title="6. Your choices">
          <ul className="list-disc space-y-1 pl-5">
            <li>You can change your password and photo, and sign out everywhere, in My account.</li>
            <li>You can delete your own comments and chat messages.</li>
            <li>To correct your details or ask what&rsquo;s stored about you, ask {BRAND.adminContact}.</li>
          </ul>
        </Section>

        <Section title="7. Reporting a problem">
          <p>If you think something isn&rsquo;t safe (a wrong permission, a suspicious sign-in, a lost device), tell {BRAND.adminContact} right away.</p>
        </Section>

        <p className="text-[13px] text-muted">Last updated: September 2026.</p>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="mb-2 font-display text-[18px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
