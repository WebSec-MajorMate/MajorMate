import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import { auth } from "@/auth";
import { activeContent, communityActor } from "@/lib/community-policy";
import { connectToDatabase } from "@/lib/mongodb";
import CommunityAttachment from "@/models/CommunityAttachment";
import Post from "@/models/Post";
import { isCommunitySameOrigin } from "@/lib/community-request";
type Context = { params: Promise<{ attachmentId: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
  const { attachmentId } = await params;
  if (!isValidObjectId(attachmentId)) return new Response(null, { status: 404 });
  await connectToDatabase();
  const file = await CommunityAttachment.findById(attachmentId).select("+data").lean();
  if (!file) return new Response(null, { status: 404 });
  if (file.post) {
    if (!await Post.exists({ _id: file.post, attachmentIds: file._id, ...activeContent })) return new Response(null, { status: 404 });
  } else if ((await auth())?.user?.id !== String(file.owner)) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": file.mime, "Content-Length": String(file.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": `inline; filename="${file._id}.${file.mime === "image/png" ? "png" : file.mime === "image/webp" ? "webp" : "jpg"}"` } });
}
export async function DELETE(request: NextRequest, { params }: Context) {
  if (!isCommunitySameOrigin(request)) return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  const { attachmentId } = await params;
  if (!isValidObjectId(attachmentId)) return new Response(null, { status: 404 });
  try {
    const actor = await communityActor("upload-delete", 20);
    const result = await CommunityAttachment.deleteOne({ _id: attachmentId, owner: actor.id, post: null });
    return new Response(null, { status: result.deletedCount ? 204 : 404 });
  } catch { return NextResponse.json({ message: "삭제 권한이 없거나 요청이 너무 많습니다." }, { status: 403 }); }
}
