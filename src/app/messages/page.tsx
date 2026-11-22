import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { isAuthConfigured } from "@/lib/auth-config";
import { connection } from "next/server";
import Link from "next/link";

export const instant = false;

export default async function MessagesPage() {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();

  return (
    <SiteFrame user={session?.user ?? null}>
      <main className="page-wrap">
        <section className="page-intro">
          <div>
            <div className="eyebrow eyebrow--dark">
              <span className="pulse-dot" /> 1:1 MESSAGES
            </div>
            <h1>
              스터디원과<br />
              <em>안전하게 소통해요.</em>
            </h1>
            <p>
              개인 연락처 공개 없이 관심 있는 스터디 모집자나 팀원에게 익명/실명 쪽지를 보낼 수 있습니다.
            </p>
          </div>
        </section>

        {!session?.user ? (
          <section className="empty-state">
            <b>로그인이 필요합니다</b>
            <p>쪽지함을 확인하고 메시지를 보내려면 먼저 로그인해 주세요.</p>
            <div style={{ marginTop: "16px" }}>
              <Link href="/login" className="button button--primary">
                로그인하러 가기
              </Link>
            </div>
          </section>
        ) : (
          <section className="empty-state">
            <b>쪽지함이 비어있습니다</b>
            <p>
              [팀원 3 담당 영역] 스터디 상세 페이지나 프로필에서 쪽지 보내기 버튼을 통해 대화를 시작할 수 있습니다.
            </p>
          </section>
        )}
      </main>
    </SiteFrame>
  );
}
