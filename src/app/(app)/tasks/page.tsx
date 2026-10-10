import { redirect } from "next/navigation";

/** Day tasks were removed: to-dos without a brand live in My tasks. Old links land there. */
export default function DayTasksMoved() {
  redirect("/my-work");
}
