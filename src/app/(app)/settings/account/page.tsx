import { requireUser } from "@/server/auth";
import { Avatar, ManagerChip } from "@/components/ui";
import { PhotoPicker } from "@/components/photo";
import { isManager } from "@/domain/permissions";
import { ChangePasswordForm } from "../forms";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireUser();
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-5 p-5">
        <Avatar name={me.name} size={84} />
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2 font-display text-[20px] font-bold">
            {me.name} {isManager(me) && <ManagerChip />}
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
    </div>
  );
}
