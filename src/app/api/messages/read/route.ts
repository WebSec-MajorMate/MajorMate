import { chatRead } from "@/lib/chat";
import { chatBody, chatFailure, chatUser } from "@/lib/chat-http";

export async function POST(request: Request) {
  try {
    const userId = await chatUser();
    await chatRead(userId, await chatBody(request));
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return chatFailure(error); }
}
