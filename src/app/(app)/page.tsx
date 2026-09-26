import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";

/** Managers land on the company overview; everyone else lands on their own tasks. */
export default async function Landing() {
  const user = await requireUser();
  const manager = user.isAdmin || user.teams.includes("leadership") || user.teams.includes("account");
  redirect(manager ? "/overview" : "/my-work");
}
