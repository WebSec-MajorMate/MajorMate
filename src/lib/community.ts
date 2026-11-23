import "server-only";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { POST_CATEGORY_LABELS } from "@/lib/community-types";
import type { PostCategory, ScrapTargetType } from "@/lib/community-types";
import Comment from "@/models/Comment";
import Post from "@/models/Post";
import Scrap from "@/models/Scrap";
import Study from "@/models/Study";

export type PostSummary = {
  id: string;
  authorId: string;
  authorNickname: string;
  category: PostCategory;
  title: string;
  content: string;
  viewCount: number;
  commentCount: number;
  createdAt: Date;
};

export type PostDetail = PostSummary & { likeCount: number };

export type CommentSummary = {
  id: string;
  authorId: string;
  authorNickname: string;
  content: string;
  createdAt: Date;
};

export type ScrapSummary = {
  id: string;
  targetType: "POST" | "STUDY";
  title: string;
  description: string;
  href: string;
  createdAt: Date;
};

type CommunityPostFilter = {
  category?: PostCategory;
  $or?: Array<{
    title?: { $regex: string; $options: "i" };
    content?: { $regex: string; $options: "i" };
  }>;
};

function toPostSummary(post: Record<string, unknown>): PostSummary {
  return {
    id: String(post._id),
    authorId: String(post.author),
    authorNickname: String(post.authorNickname),
    category: post.category as PostCategory,
    title: String(post.title),
    content: String(post.content).slice(0, 220),
    viewCount: Number(post.viewCount ?? 0),
    commentCount: Number(post.commentCount ?? 0),
    createdAt: post.createdAt as Date,
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getCommunityPosts(options: {
  category?: PostCategory;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  await connectToDatabase();

  const filter: CommunityPostFilter = {};
  if (options.category) filter.category = options.category;

  const query = options.query?.trim().slice(0, 100) ?? "";
  if (query) {
    const safeQuery = escapeRegex(query);
    filter.$or = [
      { title: { $regex: safeQuery, $options: "i" } },
      { content: { $regex: safeQuery, $options: "i" } },
    ];
  }

  const pageSize = Math.min(Math.max(options.pageSize ?? 10, 1), 30);
  const total = await Post.countDocuments(filter);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(options.page ?? 1, 1), pageCount);
  const posts = await Post.find(filter)
    .select("author authorNickname category title content viewCount commentCount createdAt")
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean();

  return { posts: posts.map((post) => toPostSummary(post as unknown as Record<string, unknown>)), total, page, pageCount };
}

export async function getPostById(id: string, countView = true): Promise<PostDetail | null> {
  if (!isValidObjectId(id)) return null;
  await connectToDatabase();
  const query = countView
    ? Post.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { returnDocument: "after" })
    : Post.findById(id);
  const post = await query
    .select("author authorNickname category title content viewCount likeCount commentCount createdAt")
    .lean();
  if (!post) return null;

  const raw = post as unknown as Record<string, unknown>;
  return { ...toPostSummary(raw), content: String(raw.content), likeCount: Number(raw.likeCount ?? 0) };
}

export async function getPostComments(postId: string): Promise<CommentSummary[]> {
  if (!isValidObjectId(postId)) return [];
  await connectToDatabase();
  const comments = await Comment.find({ post: postId }).sort({ createdAt: 1, _id: 1 }).lean();
  return comments.map((comment) => ({
    id: String(comment._id),
    authorId: String(comment.author),
    authorNickname: comment.authorNickname,
    content: comment.content,
    createdAt: comment.createdAt,
  }));
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
    postIds.length ? Post.find({ _id: { $in: postIds } }).select("title category").lean() : [],
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
