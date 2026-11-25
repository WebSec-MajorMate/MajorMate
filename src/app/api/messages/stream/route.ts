import { chatConversation, chatRooms, ChatError } from "@/lib/chat";
import { chatFailure, chatUser } from "@/lib/chat-http";
import { chatQuerySchema } from "@/lib/message-validation";

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const userId = await chatUser();
    const parsed = chatQuerySchema.pick({ roomId: true }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ChatError(400, "잘못된 대화 요청입니다.");
    const { roomId } = parsed.data;
    // Authorize before sending streaming headers, so outsiders receive a real 404.
    const initial = { rooms: await chatRooms(userId), conversation: roomId ? await chatConversation(userId, roomId) : null };
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const stop = (close = true) => {
          if (stopped) return;
          stopped = true;
          clearTimeout(timer);
          request.signal.removeEventListener("abort", onAbort);
          if (close) controller.close();
        };
        const onAbort = () => stop();
        request.signal.addEventListener("abort", onAbort, { once: true });
        const deadline = Date.now() + 24_000;
        let previous = JSON.stringify(initial);
        controller.enqueue(encoder.encode(`retry: 1500\nevent: snapshot\ndata: ${previous}\n\n`));
        const tick = async () => {
          if (stopped) return;
          if (Date.now() >= deadline) { stop(); return; }
          try {
            const frame = { rooms: await chatRooms(userId), conversation: roomId ? await chatConversation(userId, roomId) : null };
            if (stopped) return;
            const serialized = JSON.stringify(frame);
            if (serialized !== previous) {
              controller.enqueue(encoder.encode(`event: snapshot\ndata: ${serialized}\n\n`));
              previous = serialized;
            } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch (error) {
            if (!stopped) {
              controller.enqueue(encoder.encode(`event: unavailable\ndata: ${JSON.stringify({ status: error instanceof ChatError ? error.status : 503 })}\n\n`));
              stop();
            }
            return;
          }
          if (!stopped) timer = setTimeout(tick, 2000);
        };
        if (request.signal.aborted) stop();
        else timer = setTimeout(tick, 2000);
        // cancel() is invoked separately when the consumer disconnects.
        cleanup = () => stop(false);
      },
      cancel() { cleanup(); },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    } });
  } catch (error) { return chatFailure(error); }
}
