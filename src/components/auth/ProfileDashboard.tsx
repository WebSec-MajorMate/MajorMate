import Link from "next/link";
import { ProfileEditForm } from "@/components/auth/ProfileEditForm";
import { SiteFrame } from "@/components/layout/SiteChrome";
import type { ProfileSnapshot } from "@/lib/profile";
import { StudySummary } from "@/lib/studies";

type ProfileDashboardProps = {
  user: ProfileSnapshot;
  studies: StudySummary[];
};

export function ProfileDashboard({ user, studies }: ProfileDashboardProps) {
  const displayName = user.name || user.nickname;
  const studyStyleLabel = {
    ONLINE: "온라인 선호",
    OFFLINE: "오프라인 선호",
    HYBRID: "온·오프라인 모두 가능",
    ANY: "방식 무관",
  }[user.studyStyle];

  return <SiteFrame user={user}>
    <main className="account-page"><section className="account-wrap">
      <div className="account-hero"><div className="account-avatar">{displayName.slice(0, 1)}</div><div><p>MY MAJORMATE</p><h1>{displayName}님, 환영합니다.</h1><span>{user.major} · {user.grade}학년</span></div></div>
      <div className="account-grid"><section className="account-card"><span className="account-label">PROFILE</span><h2>내 기본 정보</h2><dl className="account-details"><div><dt>닉네임</dt><dd>{user.nickname}</dd></div><div><dt>이메일</dt><dd>{user.email || "등록된 이메일 없음"}</dd></div><div><dt>전공 / 학년</dt><dd>{user.major} / {user.grade}학년</dd></div><div className="account-bio"><dt>한 줄 소개</dt><dd>{user.bio || "아직 작성한 소개가 없어요."}</dd></div></dl></section><section className="account-card account-card--manner"><span className="account-label">MANNER TEMPERATURE</span><h2>매너온도</h2><div className="manner-score"><strong>{user.mannerScore.toFixed(1)}°C</strong><span>함께할수록 쌓이는 신뢰도</span></div><p className="manner-description">스터디 활동과 상호 평가를 바탕으로 관리되는 지표예요.</p></section><section className="account-card account-card--wide"><span className="account-label">STUDY PREFERENCE</span><h2>나의 학습 성향</h2><dl className="account-details account-details--compact"><div><dt>선호 방식</dt><dd>{studyStyleLabel}</dd></div></dl>{user.studyTags.length ? <div className="profile-tag-list" aria-label="나의 성향 태그">{user.studyTags.map((tag, index) => <span className="profile-tag" key={`${tag}-${index}`}>#{tag}</span>)}</div> : <p className="profile-empty-copy">등록한 성향 태그가 없어요. 프로필 수정에서 추가할 수 있습니다.</p>}</section><ProfileEditForm profile={user} /><section className="account-card account-card--accent"><span className="account-label">STUDY</span><h2>내가 만든 스터디</h2>{studies.length ? <div className="my-study-links">{studies.map((study) => <Link href={`/studies/${study.id}/manage`} key={study.id}>{study.title}<small>{study.currentMembers} / {study.maxMembers}명 · 신청 관리</small></Link>)}</div> : <p>아직 만든 스터디가 없어요.</p>}<Link className="button button--primary" href="/studies/new">스터디 모집하기</Link></section></div>
    </section></main>
  </SiteFrame>;
}
