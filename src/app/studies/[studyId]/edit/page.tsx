import Link from "next/link";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { EditStudyForm } from "@/components/studies/EditStudyForm";
import { isAuthConfigured } from "@/lib/auth-config";
import { getStudyById } from "@/lib/studies";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

type EditStudyPageProps = { params: Promise<{ studyId: string }> };

export default async function EditStudyPage({ params }: EditStudyPageProps) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const { studyId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/studies/${studyId}/edit`)}`);
  const study = await getStudyById(studyId);
  // URL의 studyId만 믿지 않고 세션 사용자가 그룹장인지 서버에서 확인한다.
  if (!study || study.owner.id !== session.user.id) redirect(`/studies/${studyId}`);

  return <SiteFrame user={session.user}>
    <main className="page-wrap narrow-page">
      <Link className="back-link" href={`/studies/${study.id}`}>← 스터디 상세</Link>
      <section className="page-intro"><div><div className="eyebrow eyebrow--dark"><span className="pulse-dot" />EDIT STUDY</div><h1>모집글을<br /><em>수정해 보세요.</em></h1><p>변경한 내용은 저장 즉시 모집글에 반영됩니다.</p></div></section>
      <section className="study-form-card"><EditStudyForm study={study} /></section>
    </main>
  </SiteFrame>;
}
