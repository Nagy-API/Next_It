import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { isManager } from "@/domain/permissions";

/** Managers land on the overview; everyone else lands on their own tasks. */
export default async function Landing() {
  const user = await requireUser();
  redirect(isManager(user) ? "/overview" : "/my-work");
}
