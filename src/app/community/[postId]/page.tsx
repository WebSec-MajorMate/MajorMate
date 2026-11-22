import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { CommentForm } from "@/components/community/CommentForm";
import { ScrapButton } from "@/components/community/ScrapButton";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { createCommentAction, deleteCommentAction, deletePostAction, updateCommentAction } from "@/app/actions/community";
import { isAuthConfigured } from "@/lib/auth-config";
import { getPostById, getPostComments, hasScrap } from "@/lib/community";
import { POST_CATEGORY_LABELS } from "@/lib/community-types";

export const instant = false;

type CommunityPostPageProps = { params: Promise<{ postId: string }> };

export default async function CommunityPostPage({ params }: CommunityPostPageProps) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const { postId } = await params;
  const [session, post] = await Promise.all([auth(), getPostById(postId)]);
  if (!post) notFound();

  const user = session?.user ?? null;
  const [comments, isScrapped] = await Promise.all([
    getPostComments(post.id),
    user ? hasScrap(user.id, "POST", post.id) : false,
  ]);
  const isAuthor = user?.id === post.authorId;

  return <SiteFrame user={user}>
    <main className="page-wrap narrow-page community-detail-page">
      <Link className="back-link" href="/community">← 커뮤니티 목록</Link>
      <article className="community-detail-card">
        <div className="community-detail-top"><span className="category">{POST_CATEGORY_LABELS[post.category]}</span><time dateTime={post.createdAt.toISOString()}>{post.createdAt.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</time></div>
        <h1>{post.title}</h1>
        <div className="community-detail-byline"><span>{post.authorNickname}</span><span>조회 {post.viewCount}</span><span>댓글 {post.commentCount}</span></div>
        <div className="community-post-content">{post.content}</div>
        <div className="community-detail-actions">
          <ScrapButton userId={user?.id ?? null} targetType="POST" targetId={post.id} isScrapped={isScrapped} returnTo={`/community/${post.id}`} />
          {isAuthor ? <div className="community-author-actions"><Link className="button button--ghost" href={`/community/${post.id}/edit`}>수정</Link><form action={deletePostAction.bind(null, post.id)}><button className="button button--danger" type="submit">삭제</button></form></div> : null}
        </div>
      </article>

      <section className="community-comments" id="comments">
        <div className="section-heading section-heading--compact"><div><span className="section-kicker">DISCUSSION</span><h2>댓글 <span>{post.commentCount}</span></h2></div></div>
        {user ? <CommentForm action={createCommentAction.bind(null, post.id)} /> : <div className="comment-login-prompt"><p>댓글을 작성하려면 로그인이 필요해요.</p><Link className="button button--primary" href={`/login?callbackUrl=${encodeURIComponent(`/community/${post.id}#comments`)}`}>로그인</Link></div>}
        <div className="comment-list">
          {comments.length ? comments.map((comment) => <article className="comment-card" id={`comment-${comment.id}`} key={comment.id}>
            <div className="comment-card-head"><div><b>{comment.authorNickname}</b><time dateTime={comment.createdAt.toISOString()}>{comment.createdAt.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</time></div>
              {user?.id === comment.authorId ? <div className="comment-actions"><details><summary>수정</summary><CommentForm action={updateCommentAction.bind(null, comment.id)} initialContent={comment.content} isEdit /></details><form action={deleteCommentAction.bind(null, comment.id)}><button type="submit" className="text-button text-button--danger">삭제</button></form></div> : null}
            </div>
            <p>{comment.content}</p>
          </article>) : <div className="empty-state comment-empty"><b>아직 댓글이 없어요</b><p>첫 댓글로 대화를 시작해 보세요.</p></div>}
        </div>
      </section>
    </main>
  </SiteFrame>;
}
