import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { getServices } from "@/server/services";

export async function POST() {
  return handle(async () => {
    const user = await requireUser("employee");
    const { conversations } = await getServices();
    return conversations.view(await conversations.startNewConversation(user));
  });
}
