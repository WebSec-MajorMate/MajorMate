import "server-only";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { CommunityThrottle } from "@/models/CommunitySupport";
import User from "@/models/User";

// Missing status means ACTIVE for pre-upgrade documents.
export const activeContent = { status: { $nin: ["HIDDEN", "DELETED"] as const } };
export async function communityActor(kind: string, limit = 30) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.");
  await connectToDatabase();
  const user = await User.findById(session.user.id).select("nickname role").lean();
  if (!user) throw new Error("계정을 확인할 수 없습니다.");
  await CommunityThrottle.init();
  const bucket = Math.floor(Date.now() / 60000);
  const key = `${session.user.id}:${kind}:${bucket}`;
  try {
    const result = await CommunityThrottle.findOneAndUpdate({ key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * 60000) } }, { upsert: true, returnDocument: "after" }).lean();
    if (Number(result?.count) > limit) throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) throw new Error("요청이 겹쳤습니다. 다시 시도해 주세요.");
    throw error;
  }
  return { id: session.user.id, nickname: user.nickname, isAdmin: user.role === "ADMIN" };
}
export function publicAuthor(author: unknown, nickname: unknown, anonymous: unknown, viewerId?: string) {
  return { isMine: !!viewerId && String(author) === viewerId, authorNickname: anonymous ? "익명" : String(nickname) };
}
