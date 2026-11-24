import Link from "next/link";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { StudyCard } from "@/components/studies/StudyCard";
import { isAuthConfigured } from "@/lib/auth-config";
import { searchStudies } from "@/lib/studies";
import { STUDY_CATEGORIES } from "@/lib/study-constants";
import { studySearchSchema } from "@/lib/study-validation";
import { connection } from "next/server";

export const instant = false;

type StudiesPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudiesPage({ searchParams }: StudiesPageProps) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const rawParams = await searchParams;
  // 쿼리스트링은 Zod로 검증해 문자열/열거형 값만 DB 조회에 사용한다.
  const filters = studySearchSchema.parse({
    q: firstValue(rawParams.q) ?? "",
    category: firstValue(rawParams.category) || undefined,
    meetingType: firstValue(rawParams.meetingType) || undefined,
    status: firstValue(rawParams.status) ?? "RECRUITING",
  });
  const [session, studies] = await Promise.all([auth(), searchStudies(filters)]);
  const isFiltered = Boolean(filters.q || filters.category || filters.meetingType || filters.status !== "RECRUITING");

  return <SiteFrame user={session?.user ?? null}>
    <main className="page-wrap">
      <section className="page-intro page-intro--study"><div><div className="eyebrow eyebrow--dark"><span className="pulse-dot" />STUDY MATCHING</div><h1>나와 맞는 시간,<br /><em>같은 목표의 사람.</em></h1><p>실제 MajorMate 회원이 등록한 스터디를 둘러보고 참여를 신청해 보세요.</p></div><Link className="button button--primary" href="/studies/new">+ 스터디 모집</Link></section>
      <form className="study-search entry-form" method="get" action="/studies">
        <div className="filter-title"><b>스터디 검색</b></div>
        <div className="study-filters">
          <label>키워드<input name="q" maxLength={50} defaultValue={filters.q} placeholder="제목, 과목, 소개 검색" /></label>
          <label>카테고리<select name="category" defaultValue={filters.category ?? ""}><option value="">전체</option>{STUDY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>진행 방식<select name="meetingType" defaultValue={filters.meetingType ?? ""}><option value="">전체</option><option value="ONLINE">온라인</option><option value="OFFLINE">오프라인</option></select></label>
          <label>모집 상태<select name="status" defaultValue={filters.status}><option value="RECRUITING">모집 중만 보기</option><option value="ALL">마감 포함 전체</option></select></label>
        </div>
        <div className="decision-buttons"><button type="submit">검색</button>{isFiltered ? <Link className="button button--ghost" href="/studies">필터 초기화</Link> : null}</div>
      </form>
      <div className="results-head"><span>검색 결과 <b>{studies.length}</b>개</span></div>
      <section className="study-grid">{studies.length ? studies.map((study) => <StudyCard key={study.id} study={study} />) : <div className="empty-state"><b>{isFiltered ? "조건에 맞는 스터디가 없어요" : "현재 모집 중인 스터디가 없어요"}</b><p>{isFiltered ? "검색 조건을 바꾸거나 직접 스터디를 만들어 보세요." : "첫 번째 그룹장이 되어 스터디를 만들어 보세요."}</p><Link className="button button--primary" href="/studies/new">스터디 모집하기</Link></div>}</section>
    </main>
  </SiteFrame>;
}
