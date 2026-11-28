import type { NextRequest } from "next/server";
// Next can normalize nextUrl to localhost internally. Match the browser Origin
// against the actual HTTP Host, as Server Actions do, rather than that URL.
export function isCommunitySameOrigin(request: Pick<NextRequest, "headers" | "nextUrl">) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === origin
      && parsed.host === (request.headers.get("host") ?? request.nextUrl.host);
  } catch { return false; }
}
