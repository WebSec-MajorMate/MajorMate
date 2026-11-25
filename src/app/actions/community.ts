"use server";

import { isValidObjectId } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { commentInputSchema, communityValidationState, postInputSchema } from "@/lib/community-validation";
import type { CommunityActionState } from "@/lib/community-validation";
import type { ScrapTargetType } from "@/lib/community-types";
import { isAuthConfigured } from "@/lib/auth-config";
import Comment from "@/models/Comment";
import Post from "@/models/Post";
import Scrap from "@/models/Scrap";
import Study from "@/models/Study";
import User from "@/models/User";

async function requireUserId(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return session.user.id;
}

function authUnavailableMessage(): CommunityActionState {
  return { message: "계정 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요." };
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function createPostAction(
  _previousState: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  if (!isAuthConfigured()) return authUnavailableMessage();
  const parsed = postInputSchema.safeParse({
    category: formData.get("category"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) return communityValidationState(parsed.error);

  const userId = await requireUserId("/community/new");
  let postId = "";
  try {
    await connectToDatabase();
    const user = await User.findById(userId).select("nickname").lean();
    if (!user) return { message: "회원 정보를 확인할 수 없습니다. 다시 로그인해 주세요." };
    const post = await Post.create({ ...parsed.data, author: userId, authorNickname: user.nickname });
    postId = post._id.toString();
  } catch (error) {
    console.error("Failed to create community post", error);
    return { message: "게시글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/community");
  redirect(`/community/${postId}`);
}

export async function updatePostAction(
  postId: string,
  _previousState: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  if (!isAuthConfigured()) return authUnavailableMessage();
  if (!isValidObjectId(postId)) return { message: "게시글을 찾을 수 없습니다." };
  const parsed = postInputSchema.safeParse({
    category: formData.get("category"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  if (!parsed.success) return communityValidationState(parsed.error);

  const userId = await requireUserId(`/community/${postId}/edit`);
  let updated = false;
  try {
    await connectToDatabase();
    const result = await Post.updateOne({ _id: postId, author: userId }, { $set: parsed.data }, { runValidators: true });
    updated = result.matchedCount > 0;
  } catch (error) {
    console.error("Failed to update community post", error);
    return { message: "게시글을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  if (!updated) return { message: "게시글을 수정할 수 없습니다." };
  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
  redirect(`/community/${postId}`);
}

export async function deletePostAction(postId: string, _formData: FormData) {
  if (!isValidObjectId(postId)) redirect("/community");
  if (!isAuthConfigured()) redirect("/community");
  const userId = await requireUserId(`/community/${postId}`);

  await connectToDatabase();
  const result = await Post.deleteOne({ _id: postId, author: userId });
  if (result.deletedCount) {
    try {
      await Promise.all([
        Comment.deleteMany({ post: postId }),
        Scrap.deleteMany({ targetType: "POST", targetId: postId }),
      ]);
    } catch (error) {
      console.error("Failed to clean up deleted community post references", error);
    }
  }

  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
  revalidatePath("/my");
  redirect("/community");
}

export async function createCommentAction(
  postId: string,
  _previousState: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  if (!isAuthConfigured()) return authUnavailableMessage();
  if (!isValidObjectId(postId)) return { message: "게시글을 찾을 수 없습니다." };
  const parsed = commentInputSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return communityValidationState(parsed.error);

  const userId = await requireUserId(`/community/${postId}#comments`);
  try {
    await connectToDatabase();
    const user = await User.findById(userId).select("nickname").lean();
    if (!user) return { message: "회원 정보를 확인할 수 없습니다. 다시 로그인해 주세요." };

    const comment = await Comment.create({ post: postId, author: userId, authorNickname: user.nickname, content: parsed.data.content });
    const postUpdate = await Post.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
    if (postUpdate.matchedCount === 0) {
      await Comment.deleteOne({ _id: comment._id, author: userId });
      return { message: "게시글이 삭제되어 댓글을 등록하지 못했습니다." };
    }
  } catch (error) {
    console.error("Failed to create community comment", error);
    return { message: "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/community/${postId}`);
  revalidatePath("/community");
  return { message: "댓글을 등록했습니다.", success: true };
}

export async function updateCommentAction(
  commentId: string,
  _previousState: CommunityActionState,
  formData: FormData,
): Promise<CommunityActionState> {
  if (!isAuthConfigured()) return authUnavailableMessage();
  if (!isValidObjectId(commentId)) return { message: "댓글을 찾을 수 없습니다." };
  const parsed = commentInputSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return communityValidationState(parsed.error);

  const userId = await requireUserId("/community");
  let postId = "";
  try {
    await connectToDatabase();
    const comment = await Comment.findOneAndUpdate(
      { _id: commentId, author: userId },
      { $set: { content: parsed.data.content } },
      { returnDocument: "after", runValidators: true },
    ).select("post").lean();
    if (!comment) return { message: "댓글을 수정할 수 없습니다." };
    postId = String(comment.post);
  } catch (error) {
    console.error("Failed to update community comment", error);
    return { message: "댓글을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/community/${postId}`);
  return { message: "댓글을 수정했습니다.", success: true };
}

export async function deleteCommentAction(commentId: string, _formData: FormData) {
  if (!isValidObjectId(commentId) || !isAuthConfigured()) return;
  const userId = await requireUserId("/community");
  await connectToDatabase();
  const comment = await Comment.findOne({ _id: commentId, author: userId }).select("post").lean();
  if (!comment) return;
  const result = await Comment.deleteOne({ _id: commentId, author: userId });
  if (result.deletedCount) {
    await Post.updateOne({ _id: comment.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
    revalidatePath(`/community/${comment.post}`);
    revalidatePath("/community");
  }
}

export async function setScrapAction(
  targetType: ScrapTargetType,
  targetId: string,
  shouldSave: boolean,
  _formData: FormData,
) {
  if (!isAuthConfigured() || !["POST", "STUDY"].includes(targetType) || typeof shouldSave !== "boolean" || !isValidObjectId(targetId)) return;

  const path = targetType === "POST" ? `/community/${targetId}` : `/studies/${targetId}`;
  const userId = await requireUserId(path);
  try {
    await connectToDatabase();
    const targetExists = targetType === "POST" ? await Post.exists({ _id: targetId }) : await Study.exists({ _id: targetId });
    if (!targetExists) return;

    const criteria = { user: userId, targetType, targetId };
    if (shouldSave) {
      try {
        await Scrap.updateOne(criteria, { $setOnInsert: criteria }, { upsert: true });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
      }
    } else {
      await Scrap.deleteOne(criteria);
    }
  } catch (error) {
    console.error("Failed to update community scrap", error);
    return;
  }

  revalidatePath("/community");
  revalidatePath("/studies");
  revalidatePath(path);
  revalidatePath("/my");
}
