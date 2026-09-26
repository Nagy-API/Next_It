import { requireUser } from "@/server/auth";
import { ChangePasswordForm } from "../forms";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireUser();
  return (
    <div className="space-y-4">
      <p className="text-[14px] text-muted">
        Signed in as <b className="text-ink">{me.name}</b> (@{me.username}).
      </p>
      <ChangePasswordForm />
    </div>
  );
}
