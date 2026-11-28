import Link from "next/link";
import type { PostSummary } from "@/lib/community";
import { POST_CATEGORY_LABELS } from "@/lib/community-types";
import { ScrapButton } from "@/components/community/ScrapButton";
import { CommandForm } from "@/components/community/CommunityControls";
export function CommunityPostCard({ post, userId, isScrapped, returnTo = "/community" }: { post: PostSummary; userId: string | null; isScrapped: boolean; returnTo?: string }) {
 const href = `/community/${post.id}?from=${encodeURIComponent(returnTo)}`;
 return <article className="community-post-card">
  <div className="community-row-body">
   <Link href={href} className="community-post-link">
    <div className="community-row-title"><span className="category">{POST_CATEGORY_LABELS[post.category]}</span>{post.isPinned ? <span className="community-status">공지</span> : null}<h2>{post.title}</h2>{post.attachmentIds.length ? <span aria-label={`첨부 이미지 ${post.attachmentIds.length}장`}>▧ {post.attachmentIds.length}</span> : null}{post.category === "QUESTION" ? <span className={post.acceptedCommentId ? "community-status solved" : "community-status waiting"}>{post.acceptedCommentId ? "✓ 해결 완료" : "답변 대기"}</span> : null}</div>
    <p>{post.content}</p>
   </Link>
   <div className="community-tags">{post.tags.slice(0, 3).map(tag => <Link href={`/community?tag=${encodeURIComponent(tag)}`} key={tag}>#{tag}</Link>)}</div>
   <div className="post-meta"><span>{post.authorNickname}</span><time dateTime={post.createdAt.toISOString()}>{post.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span>댓글 {post.commentCount}</span><span>조회 {post.viewCount}</span></div>
   {userId ? <CommandForm fields={{ op: "like", postId: post.id, enabled: String(!post.isLiked) }} pressed={post.isLiked} label={post.isLiked ? "게시글 공감 취소" : "게시글 공감"}>♡ {post.likeCount}</CommandForm> : <Link href="/login" className="community-control" aria-label="로그인 후 공감">♡ {post.likeCount}</Link>}
  </div>
  <ScrapButton userId={userId} targetType="POST" targetId={post.id} isScrapped={isScrapped} returnTo={href} />
 </article>;
}
