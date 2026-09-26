import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";

export default async function SettingsIndex() {
  const me = await requireUser();
  redirect(me.isAdmin ? "/settings/brands" : "/settings/account");
}
