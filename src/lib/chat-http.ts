import "server-only";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/auth-config";
import { ChatError } from "@/lib/chat";

export async function chatUser() {
  const session = isAuthConfigured() ? await auth() : null;
  if (!session?.user?.id) throw new ChatError(401, "로그인이 필요합니다.");
  return session.user.id;
}

export async function chatBody(request: Request) {
  // Next's request.url can contain the bind address (0.0.0.0) instead of the
  // browser-facing host. Compare against the actual HTTP host, as Server Actions
  // do, and honor the public scheme/host supplied by the deployment proxy.
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  let sameOrigin = false;
  try {
    const source = new URL(origin ?? "");
    const target = new URL(`${protocol}://${host}`);
    sameOrigin = source.origin === origin && source.origin === target.origin &&
      !target.username && !target.password && ["http:", "https:"].includes(target.protocol);
  } catch { /* Missing, null or malformed origins are rejected. */ }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site") throw new ChatError(403, "허용되지 않은 요청입니다.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ChatError(415, "JSON 요청이 필요합니다.");
  const reader = request.body?.getReader();
  if (!reader) throw new ChatError(400, "요청 내용이 없습니다.");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new ChatError(413, "메시지가 너무 큽니다."); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ChatError) throw error;
    throw new ChatError(400, "요청 내용을 확인해 주세요.");
  } finally { reader.releaseLock(); }
}

export function chatFailure(error: unknown) {
  return Response.json({ error: error instanceof ChatError ? error.message : "대화를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, {
    status: error instanceof ChatError ? error.status : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
