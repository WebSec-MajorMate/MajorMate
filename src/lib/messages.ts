import "server-only";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { messageIdSchema } from "@/lib/message-validation";
import MessageRoom from "@/models/MessageRoom";
import Message from "@/models/Message";
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
  const otherId = room.participants.find((id) => String(id) !== session.user.id);
  const other = otherId ? await User.findById(otherId).select("nickname").lean() : null;
  const cursor = messageIdSchema.safeParse(before);
  const messages = await Message.find({ room: roomId, ...(cursor.success ? { _id: { $lt: cursor.data } } : {}) })
    .sort({ _id: -1 }).limit(51).lean();
  const hasOlder = messages.length > 50;
  const page = messages.slice(0, 50).reverse();
  return {
    nickname: other?.nickname ?? "탈퇴한 사용자",
    canSend: !!other,
    olderCursor: hasOlder ? String(page[0]._id) : null,
    messages: page.map((message) => ({ id: String(message._id), content: message.content, mine: String(message.sender) === session.user.id, createdAt: message.createdAt })),
  };
}
