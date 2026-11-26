import "server-only";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { chatReadSchema, chatSendSchema, messageIdSchema } from "@/lib/message-validation";
import { appendOrderedMessage, prepareMessageOrder } from "@/lib/chat-order";
import type { ChatConversation, ChatMessage, ChatRoom } from "@/lib/chat-types";
import Message from "@/models/Message";
import MessageRoom from "@/models/MessageRoom";
import User from "@/models/User";

export class ChatError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function serialize(message: { _id: unknown; sender: unknown; content: string; createdAt: Date; clientMessageId?: string | null; sequence?: number | null; isRead: boolean }, userId: string): ChatMessage {
  if (!message.sequence) throw new Error("Message order is unavailable");
  return { id: String(message._id), sequence: message.sequence, isRead: message.isRead, content: message.content, mine: String(message.sender) === userId,
    createdAt: message.createdAt.toISOString(), clientMessageId: message.clientMessageId ?? undefined };
}

// All callers obtain userId from the server session, never from a request body.
export async function chatRooms(userId: string): Promise<ChatRoom[]> {
  await connectToDatabase();
  const rooms = await MessageRoom.find({ participants: userId }).sort({ lastMessageAt: -1, _id: -1 }).lean();
  const others = rooms.flatMap((room) => room.participants.filter((id) => String(id) !== userId));
  const [users, counts] = await Promise.all([
    User.find({ _id: { $in: others } }).select("nickname").lean(),
    Message.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { room: { $in: rooms.map((room) => room._id) }, receiver: new Types.ObjectId(userId), isRead: false } },
      { $group: { _id: "$room", count: { $sum: 1 } } },
    ]),
  ]);
  const names = new Map(users.map((user) => [String(user._id), user.nickname]));
  const unread = new Map(counts.map((entry) => [String(entry._id), entry.count]));
  return rooms.map((room) => ({ id: String(room._id),
    nickname: names.get(String(room.participants.find((id) => String(id) !== userId))) ?? "탈퇴한 사용자",
    lastMessage: room.lastMessage, lastMessageAt: room.lastMessageAt.toISOString(),
    unreadCount: unread.get(String(room._id)) ?? 0 }));
}

export async function chatConversation(userId: string, roomId: string, before?: number): Promise<ChatConversation> {
  if (!messageIdSchema.safeParse(roomId).success || (before !== undefined && (!Number.isSafeInteger(before) || before < 0))) {
    throw new ChatError(400, "잘못된 대화 요청입니다.");
  }
  await connectToDatabase();
  await prepareMessageOrder(userId, roomId);
  const room = await MessageRoom.findOne({ _id: roomId, participants: userId }).lean();
  if (!room) throw new ChatError(404, "대화방을 찾을 수 없습니다.");
  const otherId = String(room.participants.find((id) => String(id) !== userId));
  const [other, messages] = await Promise.all([
    User.findById(otherId).select("nickname").lean(),
    Message.find({ room: roomId, ...(before !== undefined ? { sequence: { $lt: before } } : {}) }).sort({ sequence: -1 }).limit(51).lean(),
  ]);
  const page = messages.slice(0, 50).reverse();
  const markers = room.readSequences as Map<string, number> | Record<string, number> | undefined;
  return { nickname: other?.nickname ?? "탈퇴한 사용자", canSend: !!other,
    olderCursor: messages.length > 50 ? page[0].sequence! : null,
    readThrough: (markers instanceof Map ? markers.get(otherId) : markers?.[otherId]) ?? null,
    messages: page.map((message) => serialize(message, userId)) };
}

export async function chatSince(userId: string, roomId: string, after: number) {
  // Authorize even if a caller already loaded a conversation in the same request.
  if (!messageIdSchema.safeParse(roomId).success || (!Number.isSafeInteger(after) || after < 0)) throw new ChatError(400, "잘못된 대화 요청입니다.");
  await connectToDatabase();
  if (!await MessageRoom.exists({ _id: roomId, participants: userId })) throw new ChatError(404, "대화방을 찾을 수 없습니다.");
  await prepareMessageOrder(userId, roomId);
  const messages = await Message.find({ room: roomId, sequence: { $gt: after } }).sort({ sequence: 1 }).limit(101).lean();
  return { messages: messages.slice(0, 100).map((message) => serialize(message, userId)), hasMore: messages.length > 100 };
}

export async function chatSend(userId: string, input: unknown): Promise<ChatMessage> {
  const parsed = chatSendSchema.safeParse(input);
  if (!parsed.success) throw new ChatError(400, "1~2000자의 메시지를 입력해 주세요.");
  const { roomId, content, clientMessageId } = parsed.data;
  await connectToDatabase();
  await prepareMessageOrder(userId, roomId);
  const room = await MessageRoom.findOne({ _id: roomId, participants: userId }).lean();
  if (!room || room.participants.length !== 2) throw new ChatError(404, "대화방을 찾을 수 없습니다.");
  const filter = { room: roomId, sender: userId, clientMessageId };
  const existing = await Message.findOne(filter).lean();
  if (existing) {
    if (existing.content !== content) throw new ChatError(409, "이미 사용한 전송 번호입니다.");
    return serialize(existing, userId);
  }
  const receiver = room.participants.find((id) => String(id) !== userId);
  if (!receiver || !await User.exists({ _id: receiver })) throw new ChatError(409, "탈퇴한 사용자에게는 보낼 수 없습니다.");
  await Message.init();
  try {
    return await Message.db.transaction(async (session) => {
      const message = await appendOrderedMessage(userId, roomId, receiver, content, clientMessageId, session);
      return serialize(message, userId);
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      const winner = await Message.findOne(filter).lean();
      if (winner && winner.content === content) return serialize(winner, userId);
      throw new ChatError(409, "전송 번호가 중복되었습니다.");
    }
    throw error;
  }
}

export async function chatRead(userId: string, input: unknown) {
  const parsed = chatReadSchema.safeParse(input);
  if (!parsed.success) throw new ChatError(400, "잘못된 읽음 요청입니다.");
  const { roomId, through } = parsed.data;
  await connectToDatabase();
  if (!await MessageRoom.exists({ _id: roomId, participants: userId })) throw new ChatError(404, "대화방을 찾을 수 없습니다.");
  await prepareMessageOrder(userId, roomId);
  if (!await Message.exists({ sequence: through, room: roomId, receiver: userId })) throw new ChatError(400, "메시지를 찾을 수 없습니다.");
  await Message.db.transaction(async (session) => {
    await Message.updateMany({ room: roomId, receiver: userId, sequence: { $lte: through }, isRead: false }, { $set: { isRead: true } }, { session });
    await MessageRoom.updateOne({ _id: roomId, participants: userId }, { $max: { [`readSequences.${userId}`]: through } }, { session });
  });
}
