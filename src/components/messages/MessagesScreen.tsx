import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { isAuthConfigured } from "@/lib/auth-config";
import { chatConversation, chatRooms, ChatError } from "@/lib/chat";
import type { ChatFrame } from "@/lib/chat-types";
import { ChatInbox } from "./ChatInbox";

export async function MessagesScreen({ roomId }: { roomId?: string }) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(roomId ? `/messages/${roomId}` : "/messages")}`);
  let initial: ChatFrame = { rooms: [], conversation: null };
  let failed = false;
  try {
    const [rooms, conversation] = await Promise.all([
      chatRooms(session.user.id), roomId ? chatConversation(session.user.id, roomId) : Promise.resolve(null),
    ]);
    initial = { rooms, conversation };
  } catch (error) {
    if (error instanceof ChatError && (error.status === 400 || error.status === 404)) notFound();
    failed = true;
  }
  return <SiteFrame user={session.user}><ChatInbox key={`${session.user.id}:${roomId ?? "inbox"}`} userId={session.user.id} roomId={roomId} initial={initial} failed={failed} nickname={session.user.nickname} /></SiteFrame>;
}
