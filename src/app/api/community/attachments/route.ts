import { NextRequest, NextResponse } from "next/server";
import { communityActor } from "@/lib/community-policy";
import { MAX_COMMUNITY_IMAGE_BYTES, validateCommunityImage, validateCommunityImageName } from "@/lib/community-images";
import CommunityAttachment from "@/models/CommunityAttachment";
import { isCommunitySameOrigin } from "@/lib/community-request";
export async function POST(request: NextRequest) {
  if (!isCommunitySameOrigin(request)) return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  try {
    const actor = await communityActor("upload", 8);
    if (await CommunityAttachment.countDocuments({ owner: actor.id, post: null }) >= 20) return NextResponse.json({ message: "임시 첨부가 너무 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    const mime = request.headers.get("content-type") ?? "";
    const encodedName = request.headers.get("x-file-name") ?? "";
    if (encodedName.length > 1024) return NextResponse.json({ message: "파일 이름이 너무 깁니다." }, { status: 400 });
    let name = ""; try { name = decodeURIComponent(encodedName); } catch { return NextResponse.json({ message: "파일 이름을 확인해 주세요." }, { status: 400 }); }
    validateCommunityImageName(name, mime);
    const declared = Number(request.headers.get("content-length"));
    if (declared > MAX_COMMUNITY_IMAGE_BYTES) return NextResponse.json({ message: "이미지는 각각 5MB 이하여야 합니다." }, { status: 413 });
    const reader = request.body?.getReader(); if (!reader) return NextResponse.json({ message: "이미지가 없습니다." }, { status: 400 });
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_COMMUNITY_IMAGE_BYTES) { await reader.cancel(); return NextResponse.json({ message: "이미지는 각각 5MB 이하여야 합니다." }, { status: 413 }); }
      chunks.push(value);
    }
    const data = Buffer.concat(chunks); validateCommunityImage(data, mime);
    const attachment = await CommunityAttachment.create({ owner: actor.id, data, mime, size: data.length, expiresAt: new Date(Date.now() + 86400000) });
    const id = String(attachment._id);
    return NextResponse.json({ id, href: `/api/community/attachments/${id}`, mime, size: data.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("로그인") ? 401 : message.includes("요청이 너무") ? 429 : /이미지|형식|JPEG|파일/.test(message) ? 400 : 503;
    return NextResponse.json({ message: status === 503 ? "이미지를 저장하지 못했습니다. 다시 시도해 주세요." : message }, { status });
  }
}
