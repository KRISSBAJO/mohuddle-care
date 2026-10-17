import { ChatApp } from "@/components/chat/ChatApp";
import { Empty } from "@/components/app/ui";
import { listChats } from "@/server/chat/service";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/* Chat with anyone in the agency: one-to-one, groups, your home's group and Announcements. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireUser();
  const settings = await getSettings();
  if (settings.chat_enabled !== "on") return <Empty>Chat is switched off for this agency. An administrator can turn it on in Settings, Chat.</Empty>;
  const { c } = await searchParams;
  const chats = await listChats(user);
  const initial = c && chats.some(chat => chat.id === c) ? c : null;
  return <ChatApp me={{ id: user.id, name: user.name, role: user.role }} initialChats={chats} initialChat={initial} />;
}
