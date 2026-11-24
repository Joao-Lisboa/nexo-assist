import { redirect } from "next/navigation";
import { ConsoleClient } from "@/components/console/console-client";
import { currentUser } from "@/server/auth";
import { initials } from "@/server/console-service";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "analyst") redirect("/chat");
  return <ConsoleClient analyst={{ name: user.name, initials: initials(user.name), team: user.team ?? "N1" }} />;
}
