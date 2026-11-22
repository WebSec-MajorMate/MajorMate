import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { isAuthConfigured } from "@/lib/auth-config";
import { connection } from "next/server";

export const instant = false;

export default async function CalendarPage() {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();

  return (
    <SiteFrame user={session?.user ?? null}>
      <main className="page-wrap">
        <section className="page-intro">
          <div>
            <div className="eyebrow eyebrow--dark">
              <span className="pulse-dot" /> STUDY CALENDAR
            </div>
            <h1>
              스터디 일정을<br />
              <em>한눈에 관리해요.</em>
            </h1>
            <p>
              내가 참여 중인 스터디의 정기 모임, 과제 제출일, 발표 일정을 캘린더에서 확인하세요.
            </p>
          </div>
        </section>

        <section className="empty-state">
          <b>캘린더 기능 준비 중</b>
          <p>
            [팀원 3 담당 영역] 스터디별 모임 일정 등록 및 Google Calendar 연동 내보내기 기능이 곧 추가됩니다.
          </p>
        </section>
      </main>
    </SiteFrame>
  );
}
