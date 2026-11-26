import "server-only";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { messageIdSchema } from "@/lib/message-validation";
import MessageRoom from "@/models/MessageRoom";
import { chatConversation } from "@/lib/chat";
import User from "@/models/User";

export async function getMyMessageRooms() {
  const session = await auth();
  if (!session?.user?.id) return [];
  await connectToDatabase();
  const rooms = await MessageRoom.find({ participants: session.user.id }).sort({ lastMessageAt: -1, _id: -1 }).lean();
  const otherIds = rooms.flatMap((room) => room.participants.filter((id) => String(id) !== session.user.id));
  const users = await User.find({ _id: { $in: otherIds } }).select("nickname").lean();
  const nicknames = new Map(users.map((user) => [String(user._id), user.nickname]));
  return rooms.map((room) => ({
    id: String(room._id),
    nickname: nicknames.get(String(room.participants.find((id) => String(id) !== session.user.id))) ?? "탈퇴한 사용자",
    lastMessage: room.lastMessage,
    lastMessageAt: room.lastMessageAt,
  }));
}

export async function getMyConversation(roomId: string, before?: string) {
  const session = await auth();
  if (!session?.user?.id || !messageIdSchema.safeParse(roomId).success) return null;
  await connectToDatabase();
  const room = await MessageRoom.findOne({ _id: roomId, participants: session.user.id }).lean();
  if (!room) return null;
  // Retained for older server callers; ordering is shared with the chat API.
  const cursor = before === undefined ? undefined : Number(before);
  if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 0)) return null;
  return chatConversation(session.user.id, roomId, cursor);
}
