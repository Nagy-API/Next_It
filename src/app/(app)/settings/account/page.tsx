import { requireUser } from "@/server/auth";
import { Avatar, ManagerChip } from "@/components/ui";
import { PhotoPicker } from "@/components/photo";
import { can, isManager } from "@/domain/permissions";
import { ChangePasswordForm } from "../forms";
import { signOutEverywhereAction } from "@/app/actions";
import { btn } from "@/components/ui";
import { Download, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireUser();
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-5 p-5">
        <Avatar name={me.name} size={84} />
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2 font-display text-[20px] font-bold">
            {me.name} {(isManager(me) || me.roleLabel) && <ManagerChip role={me.roleLabel} />}
          </div>
          <div className="text-[13.5px] text-muted">
            @{me.username}
            {me.title && ` · ${me.title}`}
          </div>
          <div className="mt-3">
            <PhotoPicker userId={me.id} name={me.name} hasPhoto={me.hasAvatar} />
          </div>
        </div>
      </section>
      <ChangePasswordForm />
      <section className="card max-w-md space-y-3 p-5">
        <div className="flex items-center gap-2 font-display text-[15px] font-bold">
          <ShieldCheck className="size-4 text-electric" /> Security
        </div>
        <p className="text-[13px] text-muted">Lost a phone or used a shared computer? Sign out everywhere — you&rsquo;ll need your password again on every device.</p>
        <form action={signOutEverywhereAction}>
          <button className={btn("secondary", "sm")}>
            <LogOut className="size-3.5" /> Sign out on all devices
          </button>
        </form>
        {can.downloadBackup(me) && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-[13px] text-muted">Admins: download a full backup of everything (keep it somewhere safe — it contains all the company&rsquo;s data).</p>
            <a href="/api/backup" className={btn("secondary", "sm")}>
              <Download className="size-3.5" /> Download a backup
            </a>
          </div>
        )}
        <Link href="/privacy" className="inline-block text-[13px] font-medium text-electric hover:underline">
          Privacy & security policy →
        </Link>
      </section>
    </div>
  );
}
