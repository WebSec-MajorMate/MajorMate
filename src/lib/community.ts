import "server-only";
import { isValidObjectId, Types, PipelineStage } from "mongoose";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { activeContent, publicAuthor } from "@/lib/community-policy";
import { communityFilterSchema, escapeCommunityRegex } from "@/lib/community-validation";
import type { CommunityFilters } from "@/lib/community-validation";
import { POST_CATEGORY_LABELS } from "@/lib/community-types";
import type { PostCategory, ScrapTargetType } from "@/lib/community-types";
import Comment from "@/models/Comment";
import Post from "@/models/Post";
import Scrap from "@/models/Scrap";
import Study from "@/models/Study";
import User from "@/models/User";
import { BoardFavorite, CommunityNotification, CommunityView, Reaction } from "@/models/CommunitySupport";

export type PostSummary = {
 id: string; isMine: boolean; authorNickname: string; category: PostCategory; title: string; content: string;
 viewCount: number; commentCount: number; likeCount: number; isLiked: boolean; tags: string[];
 attachmentIds: string[]; isAnonymous: boolean; isPinned: boolean; acceptedCommentId: string | null; createdAt: Date; updatedAt: Date;
};
export type PostDetail = PostSummary;
export type CommentSummary = {
 id: string; isMine: boolean; authorNickname: string; content: string; createdAt: Date;
 parentId: string | null; deleted: boolean; likeCount: number; isLiked: boolean; canAccept: boolean;
};
export type ScrapSummary = { id: string; targetType: "POST" | "STUDY"; title: string; description: string; href: string; createdAt: Date };

function summary(post: Record<string, unknown>, viewer?: string): PostSummary {
 return {
  id: String(post._id), ...publicAuthor(post.author, post.authorNickname, post.isAnonymous, viewer),
  category: post.category as PostCategory, title: String(post.title), content: String(post.content).slice(0, 220),
  viewCount: Number(post.viewCount ?? 0), commentCount: Number(post.actualComments ?? 0), likeCount: Number(post.actualLikes ?? 0),
  isLiked: !!post.isLiked, tags: (post.tags as string[]) ?? [], isAnonymous: !!post.isAnonymous,
  attachmentIds: ((post.attachmentIds as unknown[]) ?? []).map(String),
  isPinned: !!post.isPinned, acceptedCommentId: post.acceptedCommentId ? String(post.acceptedCommentId) : null,
  createdAt: post.createdAt as Date, updatedAt: (post.updatedAt ?? post.createdAt) as Date,
 };
}
function metrics(since: Date | null, viewer?: string): PipelineStage[] {
 return [
  { $lookup: { from: Reaction.collection.name, let: { pid: "$_id", owner: "$author" }, pipeline: [
   { $match: { targetType: "POST", $expr: { $eq: ["$targetId", "$$pid"] } } },
   { $group: { _id: null, count: { $sum: 1 }, mine: { $max: { $cond: [{ $eq: ["$user", viewer ? new Types.ObjectId(viewer) : null] }, 1, 0] } },
    score: { $sum: { $cond: [{ $and: [{ $ne: ["$user", "$$owner"] }, ...(since ? [{ $gte: ["$createdAt", since] }] : [])] }, 3, 0] } } } },
  ], as: "reactionStats" } },
  { $lookup: { from: Comment.collection.name, let: { pid: "$_id", owner: "$author" }, pipeline: [
   { $match: { ...activeContent, $expr: { $eq: ["$post", "$$pid"] } } },
   // One contribution per non-author account prevents repeated comments inflating HOT.
   { $group: { _id: "$author", count: { $sum: 1 }, score: { $max: { $cond: [{ $and: [{ $ne: ["$author", "$$owner"] }, ...(since ? [{ $gte: ["$createdAt", since] }] : [])] }, 2, 0] } } } },
   { $group: { _id: null, count: { $sum: "$count" }, score: { $sum: "$score" } } },
  ], as: "commentStats" } },
  { $set: {
   actualLikes: { $ifNull: [{ $first: "$reactionStats.count" }, 0] },
   actualComments: { $ifNull: [{ $first: "$commentStats.count" }, 0] },
   isLiked: { $eq: [{ $first: "$reactionStats.mine" }, 1] },
   score: { $add: [{ $ifNull: [{ $first: "$reactionStats.score" }, 0] }, { $ifNull: [{ $first: "$commentStats.score" }, 0] }] },
  } },
 ];
}
export async function getCommunityPosts(options: { category?: PostCategory; query?: string; page?: number; pageSize?: number; pinFirst?: boolean; filters?: CommunityFilters } = {}) {
 await connectToDatabase();
 const session = await auth(); const viewer = session?.user?.id;
 const f = options.filters ?? communityFilterSchema.parse({ category: options.category, q: options.query, page: options.page });
 const period = f.sort === "popular" && f.period === "all" ? "day" : f.period;
 const since = period === "all" ? null : new Date(Date.now() - (period === "day" ? 1 : 7) * 86400000);
 const filter: Record<string, unknown> = { ...activeContent };
 if (f.category !== "ALL") filter.category = f.category;
 if (since) filter.createdAt = { $gte: since };
 if (f.tag) filter.tags = f.tag;
 if (f.solved !== "all") { filter.category = "QUESTION"; filter.acceptedCommentId = f.solved === "waiting" ? null : { $ne: null }; }
 if (f.q) {
  const regex = { $regex: escapeCommunityRegex(f.q), $options: "i" };
  filter.$or = (f.scope === "all" ? ["title", "content"] : [f.scope === "tag" ? "tags" : f.scope]).map(key => ({ [key]: regex }));
 }
 let activityStages: PipelineStage[] = [];
 if (f.activity !== "all") {
  if (!viewer) filter._id = null;
  else if (f.activity === "mine") filter.author = new Types.ObjectId(viewer);
  else {
   const isComments = f.activity === "commented";
   activityStages = [
    { $lookup: { from: isComments ? Comment.collection.name : Scrap.collection.name, let: { pid: "$_id" }, pipeline: [
     { $match: { ...(isComments ? activeContent : { targetType: "POST" }), [isComments ? "author" : "user"]: new Types.ObjectId(viewer), $expr: { $eq: [isComments ? "$post" : "$targetId", "$$pid"] } } },
     { $sort: { createdAt: -1 } }, { $limit: 1 },
    ], as: "activity" } },
    { $match: { "activity.0": { $exists: true } } },
    { $set: { activityAt: { $first: "$activity.createdAt" } } },
   ];
  }
 }
 const base: PipelineStage[] = [{ $match: filter }, ...activityStages, ...metrics(since, viewer), ...(f.sort === "popular" ? [{ $match: { score: { $gt: 0 } } } as PipelineStage] : [])];
 const size = Math.min(Math.max(options.pageSize ?? 15, 1), 30);
 const totals = await Post.aggregate([...base, { $count: "total" }]);
 const total = totals[0]?.total ?? 0; const pageCount = Math.max(1, Math.ceil(total / size)); const page = Math.min(f.page, pageCount);
 const order: Record<string, 1 | -1> = f.sort === "popular" ? { score: -1, createdAt: -1, _id: -1 } : f.sort === "comments" ? { actualComments: -1, createdAt: -1, _id: -1 } : f.activity === "commented" || f.activity === "scraps" ? { activityAt: -1, createdAt: -1, _id: -1 } : { createdAt: -1, _id: -1 };
 const rows = await Post.aggregate([...base, { $sort: options.pinFirst === false ? order : { isPinned: -1, ...order } }, { $skip: (page - 1) * size }, { $limit: size }]);
 return { posts: rows.map(row => summary(row, viewer)), total, page, pageCount };
}
export async function getPostById(id: string, countView = true): Promise<PostDetail | null> {
 if (!isValidObjectId(id)) return null;
 await connectToDatabase();
 const viewer = (await auth())?.user?.id;
 // Anonymous visits do not increment: no tracking cookie/IP needed. Authenticated views: once per 30-minute bucket.
 if (countView && viewer && await Post.exists({ _id: id, ...activeContent })) {
  await CommunityView.init();
  const bucket = Math.floor(Date.now() / 1800000);
  try {
   const result = await CommunityView.updateOne({ user: viewer, post: id, bucket }, { $setOnInsert: { expiresAt: new Date(Date.now() + 3600000) } }, { upsert: true });
   if (result.upsertedCount) await Post.updateOne({ _id: id, ...activeContent }, { $inc: { viewCount: 1 } });
  } catch (error) { if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error; }
 }
 const rows = await Post.aggregate([{ $match: { _id: new Types.ObjectId(id), ...activeContent } }, ...metrics(null, viewer), { $limit: 1 }]);
 return rows[0] ? { ...summary(rows[0], viewer), content: String(rows[0].content) } : null;
}
export async function getPostComments(postId: string, newest = false): Promise<CommentSummary[]> {
 if (!isValidObjectId(postId)) return [];
 await connectToDatabase();
 const viewer = (await auth())?.user?.id;
 const post = await Post.findOne({ _id: postId, ...activeContent }).select("author").lean();
 if (!post) return [];
 const comments = await Comment.find({ post: postId }).sort({ createdAt: 1, _id: 1 }).limit(500).lean();
 const identities = new Map<string, number>();
 const reactions = await Reaction.aggregate([
  { $match: { targetType: "COMMENT", targetId: { $in: comments.map(c => c._id) } } },
  { $group: { _id: "$targetId", count: { $sum: 1 }, mine: { $max: { $cond: [{ $eq: ["$user", viewer ? new Types.ObjectId(viewer) : null] }, 1, 0] } } } },
 ]);
 const reactionMap = new Map(reactions.map(r => [String(r._id), { count: Number(r.count), mine: !!r.mine }]));
 const rows = comments.map(comment => {
  const author = String(comment.author); const id = String(comment._id);
  if (comment.isAnonymous && author !== String(post.author) && !identities.has(author)) identities.set(author, identities.size + 1);
  const deleted = comment.status === "DELETED" || comment.status === "HIDDEN";
  return {
   id, isMine: author === viewer, authorNickname: deleted ? "" : comment.isAnonymous ? author === String(post.author) ? "익명(글쓴이)" : `익명 ${identities.get(author)}` : comment.authorNickname,
   content: deleted ? "삭제되었거나 숨겨진 댓글입니다." : comment.content, createdAt: comment.createdAt,
   parentId: comment.parentId ? String(comment.parentId) : null, deleted,
   likeCount: deleted ? 0 : (reactionMap.get(id)?.count ?? 0),
   isLiked: !deleted && !!reactionMap.get(id)?.mine,
   canAccept: !deleted && author !== viewer && !comment.parentId,
  };
 });
 return newest ? rows.reverse() : rows;
}
export async function getCommunitySidebar(week = false) {
 const popular = await getCommunityPosts({ filters: communityFilterSchema.parse({ sort: "popular", period: week ? "week" : "day" }), pageSize: 5, pinFirst: false });
 const waiting = await getCommunityPosts({ filters: communityFilterSchema.parse({ category: "QUESTION", solved: "waiting" }), pageSize: 3 });
 const tags = await Post.aggregate([{ $match: { ...activeContent, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } }, { $unwind: "$tags" }, { $group: { _id: "$tags", count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 6 }]);
 return { popular: popular.posts, waiting: waiting.posts, tags: tags.map(t => ({ tag: String(t._id), count: Number(t.count) })) };
}
export async function getCommunityPersonal() {
 const viewer = (await auth())?.user?.id;
 if (!viewer) return { isAdmin: false, favorites: [] as string[], notifications: [] as { id: string; type: string; href: string; isRead: boolean }[] };
 await connectToDatabase();
 const currentUser = await User.findById(viewer).select("role").lean();
 const favorites = await BoardFavorite.find({ user: viewer }).limit(4).lean();
 const notifications = await CommunityNotification.aggregate([
  { $match: { recipient: new Types.ObjectId(viewer) } }, { $sort: { createdAt: -1, _id: -1 } },
  { $lookup: { from: Post.collection.name, localField: "post", foreignField: "_id", as: "p" } },
  { $unwind: "$p" }, { $match: { "p.status": { $nin: ["HIDDEN", "DELETED"] } } },
  { $lookup: { from: Comment.collection.name, localField: "comment", foreignField: "_id", as: "c" } },
  { $match: { "c.0": { $exists: true }, "c.0.status": { $nin: ["HIDDEN", "DELETED"] } } }, { $limit: 30 },
 ]);
 return { isAdmin: currentUser?.role === "ADMIN", favorites: favorites.map(f => String(f.category)), notifications: notifications.map(n => ({ id: String(n._id), type: String(n.type), href: `/community/${n.post}#comment-${n.comment}`, isRead: !!n.isRead })) };
}
export async function getScrappedTargetIds(userId: string, targetType: ScrapTargetType, targetIds: string[]) {
  if (!isValidObjectId(userId) || targetIds.length === 0) return new Set<string>();
  const validIds = targetIds.filter(isValidObjectId);
  if (!validIds.length) return new Set<string>();

  await connectToDatabase();
  const scraps = await Scrap.find({ user: userId, targetType, targetId: { $in: validIds } }).select("targetId").lean();
  return new Set(scraps.map((scrap) => String(scrap.targetId)));
}

export async function hasScrap(userId: string, targetType: "POST" | "STUDY", targetId: string) {
  if (!isValidObjectId(userId) || !isValidObjectId(targetId)) return false;
  await connectToDatabase();
  return Boolean(await Scrap.exists({ user: userId, targetType, targetId }));
}

export async function getMyScrapSummaries(userId: string): Promise<ScrapSummary[]> {
  if (!isValidObjectId(userId)) return [];
  await connectToDatabase();

  const scraps = await Scrap.find({ user: userId, targetType: { $in: ["POST", "STUDY"] } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(60)
    .lean();
  if (!scraps.length) return [];

  const postIds = scraps.filter((scrap) => scrap.targetType === "POST").map((scrap) => scrap.targetId);
  const studyIds = scraps.filter((scrap) => scrap.targetType === "STUDY").map((scrap) => scrap.targetId);
  const [posts, studies] = await Promise.all([
    postIds.length ? Post.find({ _id: { $in: postIds }, ...activeContent }).select("title category").lean() : [],
    studyIds.length ? Study.find({ _id: { $in: studyIds } }).select("title subject status").lean() : [],
  ]);

  const postById = new Map(posts.map((post) => [String(post._id), post] as const));
  const studyById = new Map(studies.map((study) => [String(study._id), study] as const));

  return scraps.flatMap<ScrapSummary>((scrap) => {
    const id = String(scrap.targetId);
    const createdAt = scrap.createdAt;
    if (scrap.targetType === "POST") {
      const post = postById.get(id);
      return post ? [{ id, targetType: "POST" as const, title: post.title, description: POST_CATEGORY_LABELS[post.category as PostCategory], href: `/community/${id}`, createdAt }] : [];
    }

    if (scrap.targetType === "STUDY") {
      const study = studyById.get(id);
      return study ? [{ id, targetType: "STUDY" as const, title: study.title, description: `${study.subject} · ${study.status === "RECRUITING" ? "모집 중" : "모집 마감"}`, href: `/studies/${id}`, createdAt }] : [];
    }

    return [];
  });
}
