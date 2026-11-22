import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { PostForm } from "@/components/community/PostForm";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { updatePostAction } from "@/app/actions/community";
import { isAuthConfigured } from "@/lib/auth-config";
import { getPostById } from "@/lib/community";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

type EditPostPageProps = { params: Promise<{ postId: string }> };

export default async function EditCommunityPostPage({ params }: EditPostPageProps) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const { postId } = await params;
  const [session, post] = await Promise.all([auth(), getPostById(postId, false)]);
  if (!post) notFound();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/community/${postId}/edit`)}`);
  if (session.user.id !== post.authorId) redirect(`/community/${postId}`);

  return <SiteFrame user={session.user}>
    <main className="page-wrap narrow-page">
      <Link className="back-link" href={`/community/${post.id}`}>← 게시글로 돌아가기</Link>
      <section className="study-form-card community-form-card">
        <div className="section-kicker">MAJOR COMMUNITY</div>
        <h1 className="community-form-title">게시글 수정</h1>
        <PostForm
          action={updatePostAction.bind(null, post.id)}
          initialValues={{ category: post.category, title: post.title, content: post.content }}
          cancelHref={`/community/${post.id}`}
        />
      </section>
    </main>
  </SiteFrame>;
}
