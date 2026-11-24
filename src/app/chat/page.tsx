import { redirect } from "next/navigation";
import { ChatClient } from "@/components/chat/chat-client";
import { EmployeeShell } from "@/components/employee-shell";
import { currentUser } from "@/server/auth";
import { initials } from "@/server/console-service";
import { getServices } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/console");
  const { conversations } = await getServices();
  const view = await conversations.view(await conversations.activeConversation(user));

  return (
    <EmployeeShell
      user={{ name: user.name, email: user.email, initials: initials(user.name) }}
      active="atendimento"
      title="Atendimento"
      status={
        <span className="flex items-center gap-[7px] rounded-full bg-ok-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-ok-ink">
          <span className="size-[7px] rounded-full bg-ok" />
          Assistente online
        </span>
      }
    >
      <ChatClient initial={view} firstName={user.name.split(" ")[0] ?? user.name} />
    </EmployeeShell>
  );
}
