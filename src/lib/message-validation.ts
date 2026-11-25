import { z } from "zod";

export const messageIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const startConversationSchema = z.object({
  nickname: z.string().trim().min(2, "상대 닉네임을 입력해 주세요.").max(20),
});
export const sendMessageSchema = z.object({
  roomId: messageIdSchema,
  content: z.string().trim().min(1, "쪽지 내용을 입력해 주세요.").max(2000, "쪽지는 2000자까지 보낼 수 있습니다."),
});
export type MessageActionState = { error?: string; success?: boolean };

export function participantKey(ids: string[]) {
  return ids.map((id) => id.toLowerCase()).sort().join(":");
}
