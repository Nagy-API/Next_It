import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { settingsTabsFor } from "@/server/settings-tabs";

export default async function SettingsIndex() {
  const me = await requireUser();
  const [first] = await settingsTabsFor(me);
  redirect(`/settings/${first}`);
}
