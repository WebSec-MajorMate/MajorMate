import Link from "next/link";
import type { PostSummary } from "@/lib/community";
import { POST_CATEGORY_LABELS } from "@/lib/community-types";
import { ScrapButton } from "@/components/community/ScrapButton";

export function CommunityPostCard({
  post,
  userId,
  isScrapped,
}: {
  post: PostSummary;
  userId: string | null;
  isScrapped: boolean;
}) {
  return <article className="community-post-card">
    <Link href={`/community/${post.id}`} className="community-post-link">
      <div className="post-row-top"><span className="category">{POST_CATEGORY_LABELS[post.category]}</span><time className="post-time" dateTime={post.createdAt.toISOString()}>{post.createdAt.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</time></div>
      <h2>{post.title}</h2>
      <p>{post.content}</p>
      <div className="post-meta"><span>{post.authorNickname}</span><span>조회 {post.viewCount}</span><span>댓글 {post.commentCount}</span></div>
    </Link>
    <ScrapButton userId={userId} targetType="POST" targetId={post.id} isScrapped={isScrapped} returnTo={`/community/${post.id}`} />
  </article>;
}
