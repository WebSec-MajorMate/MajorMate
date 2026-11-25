import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { PostForm } from "@/components/community/PostForm";
import { createPostAction } from "@/app/actions/community";
import { isAuthConfigured } from "@/lib/auth-config";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

export default async function NewCommunityPostPage() {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fcommunity%2Fnew");

  return <SiteFrame user={session.user}>
    <main className="page-wrap narrow-page">
      <Link className="back-link" href="/community">← 커뮤니티</Link>
      <section className="study-form-card community-form-card">
        <div className="section-kicker">MAJOR COMMUNITY</div>
        <h1 className="community-form-title">새 게시글</h1>
        <p className="community-form-copy">전공과 대학 생활에 관한 이야기를 나눠 보세요.</p>
        <PostForm action={createPostAction} />
      </section>
    </main>
  </SiteFrame>;
}
