import Link from "next/link";
import { auth } from "@/auth";
import { cancelStudyApplicationAction, deleteStudyAction, leaveStudyAction, setStudyStatusAction } from "@/app/actions/studies";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { ApplyStudyForm } from "@/components/studies/ApplyStudyForm";
import { ConfirmSubmitButton } from "@/components/studies/ConfirmSubmitButton";
import { meetingTypeLabelForDisplay } from "@/components/studies/StudyCard";
import { isAuthConfigured } from "@/lib/auth-config";
import { getStudyApplicationStatus, getStudyById, getStudyMembers } from "@/lib/studies";
import { notFound } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

type StudyDetailPageProps = {
  params: Promise<{ studyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function applicationStatusLabel(status: string) {
  if (status === "APPROVED") return "참여가 승인되었습니다.";
  if (status === "REJECTED") return "참여 신청이 거절되었습니다.";
  if (status === "REMOVED") return "이 스터디에서 제외되어 다시 신청할 수 없습니다.";
  return "참여 신청을 검토 중입니다.";
}

export default async function StudyDetailPage({ params, searchParams }: StudyDetailPageProps) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const { studyId } = await params;
  const rawTab = (await searchParams).tab;
  const tab = rawTab === "members" ? "members" : "intro";
  const [session, study] = await Promise.all([auth(), getStudyById(studyId)]);
  if (!study) notFound();

  const user = session?.user ?? null;
  const isOwner = user?.id === study.owner.id;
  const applicationStatus = user && !isOwner ? await getStudyApplicationStatus(study.id, user.id) : null;
  const isMember = applicationStatus === "APPROVED";
  const isClosed = study.status === "CLOSED";
  const isFull = study.currentMembers >= study.maxMembers;
  // 멤버 목록은 그룹장/승인된 멤버만 조회할 수 있다. (서버에서 세션 기준으로 재검증)
  const members = tab === "members" && user ? await getStudyMembers(study.id, user.id) : null;

  return <SiteFrame user={user}>
    <main className="page-wrap narrow-page">
      <Link className="back-link" href="/studies">← 스터디 목록</Link>
      <section className="study-detail-card">
        <div className="study-detail-top"><div><span className="study-subject">{study.category} · {study.subject}</span><h1>{study.title}</h1><p>그룹장 {study.owner.nickname} · {study.owner.major} {study.owner.grade}학년</p></div><span className={`status status--${isClosed ? "closed" : "good"}`}>{isClosed ? "모집 마감" : "모집 중"}</span></div>
        <nav className="tag-row" aria-label="스터디 상세 탭">
          <Link className={`button ${tab === "intro" ? "button--primary" : "button--outline"}`} href={`/studies/${study.id}`} aria-current={tab === "intro" ? "page" : undefined}>소개</Link>
          <Link className={`button ${tab === "members" ? "button--primary" : "button--outline"}`} href={`/studies/${study.id}?tab=members`} aria-current={tab === "members" ? "page" : undefined}>멤버 {study.currentMembers}</Link>
        </nav>
        {tab === "intro" ? <>
          <p className="study-detail-description">{study.description}</p>
          <div className="study-detail-grid"><div><small>모임 요일</small><b>{study.meetingDays.join(" · ")}</b></div><div><small>모임 시간</small><b>{study.meetingTime}</b></div><div><small>진행 방식</small><b>{meetingTypeLabelForDisplay(study.meetingType)}</b></div><div><small>참여 인원</small><b>{study.currentMembers} / {study.maxMembers}명</b></div></div>
        </> : members ? <div className="applications-card">
          {members.map((member) => <article className="application-review" key={member.userId}><div className="applicant-summary"><span className="avatar">{member.nickname.slice(0, 1)}</span><div><b>{member.nickname}</b><small>{member.major} · {member.grade}학년</small></div><span className={`status status--${member.isOwner ? "wait" : "good"}`}>{member.isOwner ? "그룹장" : "멤버"}</span></div></article>)}
        </div> : <div className="empty-state"><b>멤버 목록은 참여 멤버에게만 공개돼요</b><p>현재 {study.currentMembers}명이 함께하고 있어요. 참여가 승인되면 멤버를 확인할 수 있습니다.</p></div>}
      </section>
      <section className="study-action-card">
        {isOwner ? <>
          <h2>내가 만든 스터디입니다</h2><p>참여 신청을 검토하고 모집글과 구성원을 관리할 수 있어요.</p>
          <div className="tag-row">
            <Link className="button button--primary" href={`/studies/${study.id}/manage`}>신청·멤버 관리</Link>
            <Link className="button button--outline" href={`/studies/${study.id}/edit`}>모집글 수정</Link>
            {isClosed ? (isFull ? null : <form action={setStudyStatusAction.bind(null, study.id, "RECRUITING")}><button className="button button--ghost" type="submit">모집 재개</button></form>) : <form action={setStudyStatusAction.bind(null, study.id, "CLOSED")}><button className="button button--ghost" type="submit">모집 마감</button></form>}
            <form action={deleteStudyAction.bind(null, study.id)}><ConfirmSubmitButton className="button button--ghost" confirmMessage="스터디를 삭제하면 신청 내역과 멤버 정보도 함께 삭제되며 되돌릴 수 없습니다. 삭제할까요?">스터디 삭제</ConfirmSubmitButton></form>
          </div>
        </> : !user ? <><h2>참여하려면 로그인이 필요해요</h2><p>로그인 후 스터디 참여 신청을 보낼 수 있습니다.</p><Link className="button button--primary" href={`/login?callbackUrl=${encodeURIComponent(`/studies/${study.id}`)}`}>로그인하고 신청하기</Link></>
        : isMember ? <><h2>{applicationStatusLabel("APPROVED")}</h2><p>이 스터디의 멤버로 활동 중입니다. 멤버 탭에서 함께하는 사람들을 확인해 보세요.</p><form action={leaveStudyAction.bind(null, study.id)}><ConfirmSubmitButton className="button button--ghost" confirmMessage="정말 이 스터디에서 탈퇴할까요?">스터디 탈퇴</ConfirmSubmitButton></form></>
        : applicationStatus === "PENDING" ? <><h2>{applicationStatusLabel("PENDING")}</h2><p>신청 상태는 MY 페이지와 이 화면에서 확인할 수 있습니다.</p><form action={cancelStudyApplicationAction.bind(null, study.id)}><ConfirmSubmitButton className="button button--ghost" confirmMessage="참여 신청을 취소할까요?">신청 취소</ConfirmSubmitButton></form></>
        : applicationStatus ? <><h2>{applicationStatusLabel(applicationStatus)}</h2><p>다른 스터디를 둘러보거나 새로운 스터디를 만들어 보세요.</p></>
        : isClosed ? <><h2>모집이 마감된 스터디입니다</h2><p>다른 스터디를 둘러보거나 새로운 스터디를 만들어 보세요.</p></>
        : <><h2>이 스터디에 참여할까요?</h2><p>신청 메시지는 그룹장에게만 전달됩니다.</p><ApplyStudyForm studyId={study.id} /></>}
      </section>
    </main>
  </SiteFrame>;
}
