import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { AttachmentImage } from "@/components/community/AttachmentsInput";
import { CommentForm } from "@/components/community/CommentForm";
import { ScrapButton } from "@/components/community/ScrapButton";
import { CommandForm, ConfirmDelete, CopyPostLink, ReportForm } from "@/components/community/CommunityControls";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { createCommentAction, deleteCommentAction, deletePostAction, updateCommentAction } from "@/app/actions/community";
import { isAuthConfigured } from "@/lib/auth-config";
import { getPostById, getPostComments, hasScrap } from "@/lib/community";
import type { CommentSummary } from "@/lib/community";
import { safeCommunityReturn } from "@/lib/community-validation";
import { POST_CATEGORY_LABELS } from "@/lib/community-types";
export const instant = false;
type Props = { params: Promise<{ postId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export default async function CommunityPostPage({ params, searchParams }: Props) {
 await connection();
 if (!isAuthConfigured()) return <AuthSetupNotice />;
 const [{ postId }, query, session] = await Promise.all([params, searchParams, auth()]);
 const post = await getPostById(postId); if (!post) notFound();
 const user = session?.user ?? null; const back = safeCommunityReturn(query.from);
 const newest = query.comments === "newest";
 const [comments, isScrapped] = await Promise.all([getPostComments(post.id, newest), user ? hasScrap(user.id, "POST", post.id) : false]);
 const date = (value: Date) => value.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
 const renderComment = (comment: CommentSummary) => <article className={`comment-card ${comment.parentId ? "community-reply" : ""} ${post.acceptedCommentId === comment.id ? "community-accepted" : ""}`} id={`comment-${comment.id}`} key={comment.id}>
  <div className="comment-card-head"><div><b>{comment.authorNickname}</b>{post.acceptedCommentId === comment.id ? <span className="community-status solved">✓ 채택된 답변</span> : null}<time dateTime={comment.createdAt.toISOString()}>{date(comment.createdAt)}</time></div>
   {comment.isMine && !comment.deleted ? <div className="comment-actions"><details><summary>수정</summary><CommentForm action={updateCommentAction.bind(null, comment.id)} initialContent={comment.content} isEdit /></details><ConfirmDelete action={deleteCommentAction.bind(null, comment.id)} /></div> : null}
  </div><p>{comment.content}</p>
  {!comment.deleted && user ? <div className="community-comment-controls">
   <CommandForm fields={{ op: "like", postId: post.id, targetType: "COMMENT", targetId: comment.id, enabled: String(!comment.isLiked) }} pressed={comment.isLiked} label="댓글 공감">♡ {comment.likeCount}</CommandForm>
   {post.isMine && post.category === "QUESTION" && comment.canAccept ? <CommandForm fields={{ op: "accept", postId: post.id, targetType: "COMMENT", targetId: comment.id, enabled: String(post.acceptedCommentId !== comment.id) }}>{post.acceptedCommentId === comment.id ? "채택 취소" : "답변 채택"}</CommandForm> : null}
   {!comment.isMine ? <ReportForm postId={post.id} targetType="COMMENT" targetId={comment.id} /> : null}
   {!comment.parentId ? <details><summary>답글</summary><CommentForm action={createCommentAction.bind(null, post.id)} parentId={comment.id} /></details> : null}
  </div> : null}
 </article>;
 const top = comments.filter(c => !c.parentId).sort((a,b) => Number(b.id === post.acceptedCommentId) - Number(a.id === post.acceptedCommentId));
 return <SiteFrame user={user}><main className="page-wrap narrow-page community-detail-page">
  <Link className="back-link" href={back}>← 커뮤니티 목록</Link>
  <article className="community-detail-card">
   <div className="community-detail-top"><span className="category">{POST_CATEGORY_LABELS[post.category]}</span>{post.category === "QUESTION" ? <span className={post.acceptedCommentId ? "community-status solved" : "community-status waiting"}>{post.acceptedCommentId ? "해결 완료" : "답변 대기"}</span> : null}<time dateTime={post.createdAt.toISOString()}>{date(post.createdAt)}</time></div>
   <h1>{post.title}</h1><div className="community-detail-byline"><span>{post.isAnonymous ? "익명(글쓴이)" : post.authorNickname}</span><span>조회 {post.viewCount}</span><span>댓글 {post.commentCount}</span>{post.updatedAt.getTime() !== post.createdAt.getTime() ? <span>수정 {date(post.updatedAt)}</span> : null}</div>
   <div className="community-post-content">{post.content}</div>
   <div className="community-attachments">{post.attachmentIds.map((id,index) => <AttachmentImage key={id} id={id} index={index} />)}</div>
   <div className="community-tags">{post.tags.map(tag => <Link href={`/community?tag=${encodeURIComponent(tag)}`} key={tag}>#{tag}</Link>)}</div>
   <div className="community-detail-actions">
    {user ? <CommandForm fields={{ op: "like", postId: post.id, enabled: String(!post.isLiked) }} pressed={post.isLiked} label="게시글 공감">♡ 공감 {post.likeCount}</CommandForm> : <Link href="/login">로그인 후 공감 ({post.likeCount})</Link>}
    <ScrapButton userId={user?.id ?? null} targetType="POST" targetId={post.id} isScrapped={isScrapped} returnTo={`/community/${post.id}`} />
    <CopyPostLink />
    {post.isMine ? <div className="community-author-actions"><Link className="button button--ghost" href={`/community/${post.id}/edit`}>수정</Link><ConfirmDelete action={deletePostAction.bind(null, post.id)} /></div> : user ? <ReportForm postId={post.id} /> : null}
   </div>
  </article>
  <section className="community-comments" id="comments"><div className="section-heading section-heading--compact"><h2>댓글 {post.commentCount}</h2><nav aria-label="댓글 정렬"><Link href={`/community/${post.id}?from=${encodeURIComponent(back)}#comments`}>등록순</Link> · <Link href={`/community/${post.id}?comments=newest&from=${encodeURIComponent(back)}#comments`}>최신순</Link></nav></div>
   {post.category === "QUESTION" ? <p className="form-notice">채택은 질문 작성자의 선택이며 답변의 정확성을 보증하지 않습니다.</p> : null}
   {user ? <CommentForm action={createCommentAction.bind(null, post.id)} /> : <div className="comment-login-prompt"><p>댓글을 작성하려면 로그인이 필요해요.</p><Link className="button button--primary" href={`/login?callbackUrl=${encodeURIComponent(`/community/${post.id}#comments`)}`}>로그인</Link></div>}
   <div className="comment-list">{top.map(comment => <div key={comment.id}>{renderComment(comment)}{comments.filter(reply => reply.parentId === comment.id).map(renderComment)}</div>)}
    {!comments.length ? <div className="empty-state"><b>아직 댓글이 없어요</b><p>첫 댓글로 대화를 시작해 보세요.</p></div> : null}
   </div><p className="form-notice">댓글은 최대 500개까지 표시합니다.</p>
  </section>
 </main></SiteFrame>;
}
