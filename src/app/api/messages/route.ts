import { chatConversation, chatRooms, chatSend, chatSince, ChatError } from "@/lib/chat";
import { chatBody, chatFailure, chatUser } from "@/lib/chat-http";
import { chatQuerySchema } from "@/lib/message-validation";

export async function GET(request: Request) {
  try {
    const userId = await chatUser();
    const parsed = chatQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ChatError(400, "잘못된 대화 요청입니다.");
    const { roomId, before, after } = parsed.data;
    if ((before || after) && !roomId || before && after) throw new ChatError(400, "잘못된 대화 요청입니다.");
    const data = roomId ? after ? await chatSince(userId, roomId, after) : await chatConversation(userId, roomId, before) : await chatRooms(userId);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return chatFailure(error); }
}

export async function POST(request: Request) {
  try {
    const userId = await chatUser();
    const message = await chatSend(userId, await chatBody(request));
    return Response.json(message, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return chatFailure(error); }
}
