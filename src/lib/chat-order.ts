import "server-only";
import type { ClientSession, Types } from "mongoose";
import Message from "@/models/Message";
import MessageRoom from "@/models/MessageRoom";

// A room is the serialization point for both migration and sends. Incrementing
// the counter and inserting the message commit in the SAME transaction. Another
// writer cannot commit a higher sequence while a lower one remains uncommitted.
export async function prepareMessageOrder(userId: string, roomId: string) {
  const room = await MessageRoom.findOne({ _id: roomId, participants: userId }).lean();
  if (!room || room.orderVersion === 1) return;
  await Message.init();
  await Message.db.transaction(async (session) => {
    const locked = await MessageRoom.findOneAndUpdate(
      { _id: roomId, participants: userId, orderVersion: { $ne: 1 } },
      { $inc: { orderLock: 1 } }, { session, returnDocument: "after" },
    );
    if (!locked) return;
    // Historical commit order cannot be reconstructed. Freeze one deterministic
    // legacy order once; all new writes thereafter use the transactional counter.
    const legacy = await Message.find({ room: roomId }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
    if (legacy.length) {
      await Message.updateMany({ room: roomId }, { $unset: { sequence: 1 } }, { session });
      await Message.bulkWrite(legacy.map((message, index) => ({ updateOne: {
        filter: { _id: message._id, room: roomId }, update: { $set: { sequence: index + 1 } },
      } })), { session });
    }
    // Preserve each message's existing isRead flag; discard the old ID watermark.
    await MessageRoom.updateOne({ _id: roomId, participants: userId }, {
      $set: { orderVersion: 1, lastSequence: legacy.length, readSequences: {} },
    }, { session });
  });
}

export async function appendOrderedMessage(userId: string, roomId: string, receiver: Types.ObjectId | string, content: string, clientMessageId: string | undefined, session: ClientSession) {
  const room = await MessageRoom.findOneAndUpdate(
    { _id: roomId, participants: userId, orderVersion: 1, lastSequence: { $lt: Number.MAX_SAFE_INTEGER } },
    { $inc: { lastSequence: 1 } }, { session, returnDocument: "after" },
  );
  if (!room) throw new Error("Message room order is unavailable");
  const [message] = await Message.create([{ room: roomId, sender: userId, receiver, content, clientMessageId, sequence: room.lastSequence }], { session });
  await MessageRoom.updateOne({ _id: roomId, participants: userId }, {
    $set: { lastMessage: content, lastMessageAt: message.createdAt },
  }, { session });
  return message;
}
