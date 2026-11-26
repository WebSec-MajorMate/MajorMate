"use server";

import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { MessageActionState, participantKey, sendMessageSchema, startConversationSchema } from "@/lib/message-validation";
import { appendOrderedMessage, prepareMessageOrder } from "@/lib/chat-order";
import MessageRoom from "@/models/MessageRoom";
import Message from "@/models/Message";
import User from "@/models/User";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function startConversationAction(_state: MessageActionState, formData: FormData): Promise<MessageActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인 후 이용해 주세요." };
  const parsed = startConversationSchema.safeParse({ nickname: formData.get("nickname") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let roomId: string;
  try {
    await connectToDatabase();
    const other = await User.findOne({ nickname: parsed.data.nickname }).select("_id").lean();
    if (!other) return { error: "해당 닉네임의 사용자를 찾을 수 없습니다." };
    const userId = session.user.id;
    const otherId = String(other._id);
    if (userId === otherId) return { error: "본인에게는 쪽지를 보낼 수 없습니다." };
    // Ensure the uniqueness index exists before concurrent room creation.
    await MessageRoom.init();
    const key = participantKey([userId, otherId]);
    const keyed = await MessageRoom.findOne({ participantKey: key }).select("_id").lean();
    if (keyed) roomId = String(keyed._id);
    else {
      // Reuse rooms created before participantKey was introduced.
      const legacy = await MessageRoom.findOne({ participants: { $all: [userId, otherId], $size: 2 } }).select("_id").lean();
      try {
        const room = legacy
          ? await MessageRoom.findOneAndUpdate({ _id: legacy._id }, { $set: { participantKey: key } }, { new: true })
          : await MessageRoom.findOneAndUpdate({ participantKey: key }, { $setOnInsert: { participants: [userId, otherId] } }, { upsert: true, new: true, runValidators: true });
        if (!room) return { error: "대화방을 열지 못했습니다." };
        roomId = String(room._id);
      } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
        const room = await MessageRoom.findOne({ participantKey: key }).select("_id").lean();
        if (!room) throw error;
        roomId = String(room._id);
      }
    }
  } catch {
    return { error: "대화방을 열지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/messages");
  redirect(`/messages/${roomId}`);
}

export async function sendMessageAction(roomId: string, _state: MessageActionState, formData: FormData): Promise<MessageActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인 후 이용해 주세요." };
  const parsed = sendMessageSchema.safeParse({ roomId, content: formData.get("content") });
  if (!parsed.success) return { error: "올바른 대화방과 1~2000자의 쪽지 내용을 입력해 주세요." };
  try {
    await connectToDatabase();
    const room = await MessageRoom.findOne({ _id: parsed.data.roomId, participants: session.user.id }).lean();
    if (!room || room.participants.length !== 2) return { error: "대화방을 찾을 수 없습니다." };
    const receiver = room.participants.find((id) => String(id) !== session.user.id);
    if (!receiver || !await User.exists({ _id: receiver })) return { error: "상대방에게 쪽지를 보낼 수 없습니다." };
    await prepareMessageOrder(session.user.id, parsed.data.roomId);
    // Message and room preview commit together, so a failed send cannot leave half-written data.
    await Message.db.transaction(async (transaction) => {
      await appendOrderedMessage(session.user.id, parsed.data.roomId, receiver, parsed.data.content, undefined, transaction);
    });
  } catch {
    return { error: "쪽지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/messages");
  revalidatePath(`/messages/${roomId}`);
  return { success: true };
}
