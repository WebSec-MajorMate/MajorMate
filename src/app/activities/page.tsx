import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { isAuthConfigured } from "@/lib/auth-config";
import { connection } from "next/server";

export const instant = false;

export default async function ActivitiesPage() {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();

  return (
    <SiteFrame user={session?.user ?? null}>
      <main className="page-wrap">
        <section className="page-intro">
          <div>
            <div className="eyebrow eyebrow--dark">
              <span className="pulse-dot" /> CONTEST & ACTIVITIES
            </div>
            <h1>
              대회 및 공모전<br />
              <em>최신 정보를 확인해요.</em>
            </h1>
            <p>
              IT/SW, 창업, 대학생 대외활동 및 공모전 소식을 한곳에 모아 스터디원을 쉽게 모집할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="empty-state">
          <b>공모전 및 대외활동 정보 수집 중</b>
          <p>
            [팀원 4 담당 영역] 분야별 필터, 마감일 카운트다운(D-Day) 및 스크랩 기능이 연결될 예정입니다.
          </p>
        </section>
      </main>
    </SiteFrame>
  );
}
