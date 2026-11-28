"use server";
import { isValidObjectId, type ClientSession } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { commentInputSchema, communityValidationState, postInputSchema, postCategorySchema } from "@/lib/community-validation";
import type { CommunityActionState } from "@/lib/community-validation";
import type { ScrapTargetType } from "@/lib/community-types";
import { activeContent, communityActor } from "@/lib/community-policy";
import Comment from "@/models/Comment";
import Post from "@/models/Post";
import CommunityAttachment from "@/models/CommunityAttachment";
import Scrap from "@/models/Scrap";
import Study from "@/models/Study";
import { BoardFavorite, CommunityNotification, CommunityReport, Reaction } from "@/models/CommunitySupport";
import { z } from "zod";

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, "잘못된 대상입니다.");
function validId(id: string) { idSchema.parse(id); }
function refresh(postId?: string) {
 revalidatePath("/community"); revalidatePath("/my");
 if (postId) revalidatePath(`/community/${postId}`);
}
function failure(error: unknown): CommunityActionState {
 if (error instanceof z.ZodError) return { ...communityValidationState(error), message: "입력값을 확인해 주세요." };
 if (typeof error === "object" && error && "code" in error && error.code === 11000) return { message: "이미 처리되었거나 요청이 겹쳤습니다. 새로고침해 주세요." };
 return { message: error instanceof Error && !/mongo|database|query|connection|server|buffer|transaction/i.test(error.message) ? error.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
function postInput(data: FormData) {
 return postInputSchema.parse({ category: data.get("category"), title: data.get("title"), content: data.get("content"), tags: data.get("tags") ?? "", isAnonymous: data.get("isAnonymous") === "on" });
}

function attachmentInput(data: FormData) {
 return z.string().max(99).parse(data.get("attachmentIds") ?? "").split(",").filter(Boolean).map(id => idSchema.parse(id));
}
async function bindAttachments(ids: string[], postId: string, owner: string, session: ClientSession) {
 if (ids.length > 4 || new Set(ids).size !== ids.length) throw new Error("이미지는 4장까지 첨부할 수 있습니다.");
 const files = await CommunityAttachment.find({ _id: { $in: ids }, owner, $or: [{ post: null }, { post: postId }] }).session(session);
 if (files.length !== ids.length) throw new Error("첨부 이미지의 소유권을 확인할 수 없습니다.");
 await CommunityAttachment.updateMany({ _id: { $in: ids }, owner }, { $set: { post: postId }, $unset: { expiresAt: 1 } }, { session });
 await CommunityAttachment.deleteMany({ owner, post: postId, _id: { $nin: ids } }, { session });
}

export async function createPostAction(_state: CommunityActionState, data: FormData): Promise<CommunityActionState> {
 let id = "";
 try {
  const actor = await communityActor("post", 5); const input = postInput(data);
  const attachmentIds = attachmentInput(data); await CommunityAttachment.init();
  await Post.db.transaction(async session => {
   const [post] = await Post.create([{ ...input, attachmentIds, author: actor.id, authorNickname: actor.nickname }], { session }); id = String(post._id);
   await bindAttachments(attachmentIds, id, actor.id, session);
  });
 } catch (error) { return failure(error); }
 refresh(); redirect(`/community/${id}`);
}
export async function updatePostAction(id: string, _state: CommunityActionState, data: FormData): Promise<CommunityActionState> {
 try {
  validId(id); const actor = await communityActor("post", 10); const input = postInput(data);
  const attachmentIds = attachmentInput(data); await CommunityAttachment.init();
  await Post.db.transaction(async session => {
   const post = await Post.findOne({ _id: id, author: actor.id, ...activeContent }).session(session);
   if (!post) throw new Error("수정 권한이 없거나 게시글이 삭제되었습니다.");
   // Identity mode is immutable: changing it can reveal previously anonymous participation.
   post.title = input.title; post.content = input.content; post.tags = input.tags;
   if (input.category !== "QUESTION") post.acceptedCommentId = null;
   post.category = input.category;
   await bindAttachments(attachmentIds, id, actor.id, session);
   post.set("attachmentIds", attachmentIds);
   await post.save({ session });
  });
 } catch (error) { return failure(error); }
 refresh(id); redirect(`/community/${id}`);
}
export async function deletePostAction(id: string, _data: FormData) {
 void _data; validId(id); const actor = await communityActor("delete");
 await Post.updateOne({ _id: id, author: actor.id, ...activeContent }, { $set: { status: "DELETED", acceptedCommentId: null } });
 refresh(id); redirect("/community");
}
export async function createCommentAction(postId: string, _state: CommunityActionState, data: FormData): Promise<CommunityActionState> {
 try {
  validId(postId); const actor = await communityActor("comment", 15);
  await CommunityNotification.init();
  const input = commentInputSchema.parse({ content: data.get("content") });
  const parentValue = data.get("parentId"); const parentId = parentValue ? idSchema.parse(parentValue) : null; if (parentId) validId(String(parentId));
  await Post.db.transaction(async session => {
   const post = await Post.findOne({ _id: postId, ...activeContent }).session(session);
   if (!post) throw new Error("게시글을 찾을 수 없습니다.");
   const parent = parentId ? await Comment.findOne({ _id: parentId, post: postId, parentId: null, ...activeContent }).session(session) : null;
   if (parentId && !parent) throw new Error("답글을 등록할 수 없는 댓글입니다.");
   const [comment] = await Comment.create([{ post: postId, author: actor.id, authorNickname: actor.nickname, content: input.content, parentId: parentId || null, isAnonymous: data.get("isAnonymous") === "on" }], { session });
   post.commentCount += 1; await post.save({ session, timestamps: false });
   const recipients = new Map<string, "COMMENT" | "REPLY">();
   recipients.set(String(post.author), "COMMENT");
   if (parent) recipients.set(String(parent.author), "REPLY");
   for (const [recipient, type] of recipients) if (recipient !== actor.id) {
    await CommunityNotification.updateOne({ recipient, eventKey: `comment:${comment._id}` }, { $setOnInsert: { recipient, type, post: postId, comment: comment._id, eventKey: `comment:${comment._id}` } }, { upsert: true, session });
   }
  });
  refresh(postId); return { success: true, message: "댓글을 등록했습니다." };
 } catch (error) { return failure(error); }
}
export async function updateCommentAction(id: string, _state: CommunityActionState, data: FormData): Promise<CommunityActionState> {
 let postId = "";
 try {
  validId(id); const actor = await communityActor("comment");
  const input = commentInputSchema.parse({ content: data.get("content") });
  await Post.db.transaction(async session => {
   const comment = await Comment.findOne({ _id: id, author: actor.id, ...activeContent }).session(session);
   if (!comment) throw new Error("댓글 수정 권한이 없습니다.");
   const post = await Post.findOne({ _id: comment.post, ...activeContent }).session(session);
   if (!post) throw new Error("게시글을 찾을 수 없습니다.");
   comment.content = input.content; await comment.save({ session });
   // Touch the parent to serialize mutations against deletion/moderation.
   post.interactionVersion = (post.interactionVersion ?? 0) + 1; await post.save({ session, timestamps: false }); postId = String(post._id);
  });
  refresh(postId); return { success: true, message: "댓글을 수정했습니다." };
 } catch (error) { return failure(error); }
}
export async function deleteCommentAction(id: string, _data: FormData) {
 void _data; validId(id); const actor = await communityActor("delete"); let postId = "";
 await Post.db.transaction(async session => {
  const comment = await Comment.findOne({ _id: id, author: actor.id, ...activeContent }).session(session);
  if (!comment) return;
  const post = await Post.findOne({ _id: comment.post, ...activeContent }).session(session);
  if (!post) return;
  comment.status = "DELETED"; comment.content = "삭제된 댓글입니다."; await comment.save({ session });
  post.commentCount = Math.max(0, post.commentCount - 1);
  if (String(post.acceptedCommentId) === id) post.acceptedCommentId = null;
  await post.save({ session, timestamps: false }); postId = String(post._id);
 });
 refresh(postId);
}
export async function setScrapAction(targetType: ScrapTargetType, targetId: string, shouldSave: boolean, _data: FormData) {
 void _data;
 if (!["POST", "STUDY"].includes(targetType) || typeof shouldSave !== "boolean" || !isValidObjectId(targetId)) return;
 // Keep existing study behavior and shared MY storage.
 const actor = await communityActor("scrap", 60);
 await Scrap.init();
 const criteria = { user: actor.id, targetType, targetId };
 if (targetType === "POST") {
  await Post.db.transaction(async session => {
   const post = await Post.findOne({ _id: targetId, ...activeContent }).session(session);
   if (!post) throw new Error("게시글을 찾을 수 없습니다.");
   if (shouldSave) await Scrap.updateOne(criteria, { $setOnInsert: criteria }, { upsert: true, session });
   else await Scrap.deleteOne(criteria, { session });
   post.interactionVersion = (post.interactionVersion ?? 0) + 1; await post.save({ session, timestamps: false });
  });
 } else if (await Study.exists({ _id: targetId })) {
  if (shouldSave) await Scrap.updateOne(criteria, { $setOnInsert: criteria }, { upsert: true });
  else await Scrap.deleteOne(criteria);
 }
 refresh(targetType === "POST" ? targetId : undefined);
 revalidatePath("/studies"); revalidatePath(`/studies/${targetId}`);
}
export async function communityCommandAction(_state: CommunityActionState, data: FormData): Promise<CommunityActionState> {
 try {
  const actor = await communityActor("interaction", 40);
  const op = z.enum(["like", "accept", "favorite", "report", "read", "moderate", "pin"]).parse(data.get("op"));
  if (op === "favorite") {
   const category = postCategorySchema.parse(data.get("category")); await BoardFavorite.init();
   if (data.get("enabled") === "true") await BoardFavorite.updateOne({ user: actor.id, category }, { $setOnInsert: { user: actor.id, category } }, { upsert: true });
   else await BoardFavorite.deleteOne({ user: actor.id, category });
  } else if (op === "read") {
   const id = data.get("id");
   if (id) validId(String(id));
   await CommunityNotification.updateMany({ recipient: actor.id, ...(id ? { _id: id } : {}) }, { $set: { isRead: true } });
  } else {
   const postId = String(data.get("postId")); validId(postId);
   await Promise.all([Reaction.init(), CommunityReport.init(), CommunityNotification.init()]);
   await Post.db.transaction(async session => {
    const isModeration = op === "moderate" || op === "pin";
    if (isModeration && !actor.isAdmin) throw new Error("관리자만 처리할 수 있습니다.");
    const post = await Post.findOne({ _id: postId, ...(isModeration ? { status: { $ne: "DELETED" } } : activeContent) }).session(session);
    if (!post) throw new Error("게시글을 찾을 수 없습니다.");
    const targetType = z.enum(["POST", "COMMENT"]).parse(data.get("targetType") ?? "POST");
    const targetId = targetType === "POST" ? postId : String(data.get("targetId")); validId(targetId);
    const comment = targetType === "COMMENT" ? await Comment.findOne({ _id: targetId, post: postId, ...(isModeration ? { status: { $ne: "DELETED" } } : activeContent) }).session(session) : null;
    if (targetType === "COMMENT" && !comment) throw new Error("댓글을 찾을 수 없습니다.");
    if (op === "like") {
     if (String(comment ? comment.author : post.author) === actor.id) throw new Error("자신의 글이나 댓글에는 공감할 수 없습니다.");
     const criteria = { user: actor.id, targetType, targetId };
     if (data.get("enabled") === "true") await Reaction.updateOne(criteria, { $setOnInsert: { ...criteria, post: postId } }, { upsert: true, session });
     else await Reaction.deleteOne(criteria, { session });
    } else if (op === "accept") {
     if (String(post.author) !== actor.id || post.category !== "QUESTION") throw new Error("질문 작성자만 채택할 수 있습니다.");
     if (!comment || comment.parentId || String(comment.author) === actor.id) throw new Error("다른 사용자의 최상위 답변만 채택할 수 있습니다.");
     const enabled = data.get("enabled") === "true";
     post.acceptedCommentId = enabled ? comment._id : null;
     if (enabled) await CommunityNotification.updateOne({ recipient: comment.author, eventKey: `accepted:${postId}:${comment._id}` }, { $setOnInsert: { recipient: comment.author, eventKey: `accepted:${postId}:${comment._id}`, type: "ACCEPTED", post: postId, comment: comment._id } }, { upsert: true, session });
    } else if (op === "report") {
     const reason = z.enum(["ABUSE", "SPAM", "PRIVACY", "OTHER"]).parse(data.get("reason"));
     const detail = z.string().trim().max(500).parse(data.get("detail") ?? "");
     if (reason === "OTHER" && !detail) throw new Error("기타 신고 사유를 입력해 주세요.");
     if (String(comment ? comment.author : post.author) === actor.id) throw new Error("자신의 콘텐츠는 신고할 수 없습니다.");
     await CommunityReport.updateOne({ reporter: actor.id, targetType, targetId }, { $setOnInsert: { reporter: actor.id, targetType, targetId, post: postId, reason, detail } }, { upsert: true, session });
    } else if (op === "pin") {
     post.isPinned = data.get("enabled") === "true";
    } else if (op === "moderate") {
     const status = z.enum(["ACTIVE", "HIDDEN"]).parse(data.get("status"));
     if (comment) {
      comment.status = status; await comment.save({ session });
      if (status === "HIDDEN" && String(post.acceptedCommentId) === targetId) post.acceptedCommentId = null;
      post.commentCount = await Comment.countDocuments({ post: postId, ...activeContent }).session(session);
     } else post.status = status;
     await CommunityReport.updateMany({ targetType, targetId }, { $set: { status: "REVIEWED", reviewer: actor.id, reviewedAt: new Date(), resolution: status } }, { session });
    }
    post.interactionVersion = (post.interactionVersion ?? 0) + 1; await post.save({ session, timestamps: false });
   });
   refresh(postId);
  }
  refresh(); revalidatePath("/community/moderation");
  return { success: true, message: op === "report" ? "신고를 접수했습니다. 운영자가 검토합니다." : "반영했습니다." };
 } catch (error) { return failure(error); }
}
export async function getModeratorReports() {
 const session = await auth();
 if (!session?.user?.id) return null;
 await connectToDatabase();
 const user = await (await import("@/models/User")).default.findById(session.user.id).select("role").lean();
 if (user?.role !== "ADMIN") return null;
 const reports = await CommunityReport.find().sort({ createdAt: -1 }).limit(100).lean();
 const posts = await Post.find({ _id: { $in: reports.map(r => r.post) }, status: { $ne: "DELETED" } }).select("title content status isPinned").lean();
 const comments = await Comment.find({ _id: { $in: reports.filter(r => r.targetType === "COMMENT").map(r => r.targetId) } }).select("content status").lean();
 const commentMap = new Map(comments.map(c => [String(c._id), c]));
 const available = new Map(posts.map(p => [String(p._id), p]));
 return reports.filter(r => available.has(String(r.post))).map(r => ({ id: String(r._id), postId: String(r.post), title: available.get(String(r.post))!.title, targetId: String(r.targetId), targetType: String(r.targetType), content: r.targetType === "COMMENT" ? commentMap.get(String(r.targetId))?.content ?? "삭제된 댓글" : available.get(String(r.post))!.content, reason: String(r.reason), detail: String(r.detail), status: String(r.status) }));
}

export async function getModeratorPosts() {
 const session = await auth(); if (!session?.user?.id) return null;
 await connectToDatabase();
 const user = await (await import("@/models/User")).default.findById(session.user.id).select("role").lean();
 if (user?.role !== "ADMIN") return null;
 const rows = await Post.find({ status: { $ne: "DELETED" } }).select("title status isPinned").sort({ createdAt: -1, _id: -1 }).limit(30).lean();
 return rows.map(p => ({ id: String(p._id), title: p.title, isPinned: !!p.isPinned, hidden: p.status === "HIDDEN" }));
}
