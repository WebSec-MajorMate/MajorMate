import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { CommandForm } from "@/components/community/CommunityControls";
import { isAuthConfigured } from "@/lib/auth-config";
import { getCommunityPosts, getCommunitySidebar, getCommunityPersonal, getScrappedTargetIds } from "@/lib/community";
import { POST_CATEGORIES, POST_CATEGORY_LABELS } from "@/lib/community-types";
import { communityFilterSchema } from "@/lib/community-validation";
import type { CommunityFilters } from "@/lib/community-validation";
export const instant = false;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default async function CommunityPage({ searchParams }: Props) {
 await connection();
 if (!isAuthConfigured()) return <AuthSetupNotice />;
 const [session, raw] = await Promise.all([auth(), searchParams]);
 const parsed = communityFilterSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
 const f = parsed.success ? parsed.data : communityFilterSchema.parse({});
 const href = (patch: Partial<CommunityFilters> = {}) => {
  const next = { ...f, page: 1, ...patch }; const p = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v !== "" && v !== "all" && !(k === "category" && v === "ALL") && !(k === "page" && v === 1) && !(k === "sort" && v === "latest")) p.set(k, String(v));
  return p.size ? `/community?${p}` : "/community";
 };
 const returnTo = href({ page: f.page });
 const [result, sidebar, personal] = await Promise.all([getCommunityPosts({ filters: f }), getCommunitySidebar(f.period === "week"), getCommunityPersonal()]);
 const userId = session?.user?.id ?? null;
 const scraps = userId ? await getScrappedTargetIds(userId, "POST", result.posts.map(p => p.id)) : new Set<string>();
 return <SiteFrame user={session?.user ?? null}><main className="page-wrap community-hub">
  <header className="community-hub-intro"><div><div className="eyebrow eyebrow--dark"><span className="pulse-dot" />MAJOR COMMUNITY</div><div className="community-heading"><h1>전공 커뮤니티</h1><p>질문하고, 정보를 나누고, 함께 성장해요.</p></div></div><Link className="button button--primary" href={userId ? "/community/new" : "/login?callbackUrl=%2Fcommunity%2Fnew"}>+ 글쓰기</Link></header>
  {!parsed.success ? <p role="alert">검색 조건이 올바르지 않아 기본 목록을 표시합니다.</p> : null}
  <div className="community-hub-grid">
   <aside className="community-board-menu"><h2>게시판</h2><nav aria-label="게시판">
    <Link href={href({ category: "ALL", activity: "all", solved: "all" })} aria-current={f.category === "ALL" && f.activity === "all" ? "page" : undefined}>▱ 전체 게시글</Link>
    <Link href={href({ sort: "popular", period: "day", activity: "all" })}>♨ 인기글 (HOT)</Link>
    {POST_CATEGORIES.map(category => <div className="community-board-item" key={category}><Link href={href({ category, activity: "all", solved: "all" })} aria-current={f.category === category && f.activity === "all" ? "page" : undefined}>{POST_CATEGORY_LABELS[category]}게시판</Link>{userId ? <CommandForm fields={{ op: "favorite", category, enabled: String(!personal.favorites.includes(category)) }} pressed={personal.favorites.includes(category)} label={`${POST_CATEGORY_LABELS[category]}게시판 즐겨찾기`}>{personal.favorites.includes(category) ? "★" : "☆"}</CommandForm> : null}</div>)}
   </nav><h2>내 활동</h2><nav aria-label="내 활동">{([["mine", "내가 쓴 글"], ["commented", "댓글 단 글"], ["scraps", "스크랩"]] as const).map(([activity, label]) => <Link key={activity} href={userId ? href({ activity, category: "ALL", sort: "latest", period: "all", solved: "all" }) : "/login?callbackUrl=%2Fcommunity"} aria-current={f.activity === activity ? "page" : undefined}>{label}</Link>)}</nav>
   {personal.favorites.length ? <><h2>즐겨찾는 게시판</h2>{POST_CATEGORIES.filter(c => personal.favorites.includes(c)).map(c => <Link className="community-favorite-link" key={c} href={href({ category: c, activity: "all", solved: "all" })}>★ {POST_CATEGORY_LABELS[c]}게시판</Link>)}</> : null}
   {userId ? <details className="community-notifications"><summary>커뮤니티 알림 ({personal.notifications.filter(n => !n.isRead).length})</summary><CommandForm fields={{ op: "read" }}>전체 읽음</CommandForm>{personal.notifications.length ? personal.notifications.map(n => <div key={n.id}><Link href={n.href}>{n.isRead ? "" : "● "}{n.type === "ACCEPTED" ? "답변이 채택되었습니다" : n.type === "REPLY" ? "내 댓글에 답글이 달렸습니다" : "내 글에 댓글이 달렸습니다"}</Link>{!n.isRead ? <CommandForm fields={{ op: "read", id: n.id }}>읽음</CommandForm> : null}</div>) : <p>아직 알림이 없어요.</p>}</details> : null}
   {personal.isAdmin ? <Link className="community-favorite-link" href="/community/moderation">신고·공지 관리</Link> : null}
   </aside>
   <section className="community-hub-main" aria-label="게시글 목록">
    <form action="/community" className="community-hub-search">
     {Object.entries(f).filter(([k]) => !["q", "scope", "page", "sort", "period"].includes(k)).map(([k,v]) => <input type="hidden" name={k} value={v} key={k} />)}
     <label className="sr-only" htmlFor="community-scope">검색 범위</label><select id="community-scope" name="scope" defaultValue={f.scope}><option value="all">제목+내용</option><option value="title">제목</option><option value="content">내용</option><option value="tag">태그</option></select>
     <label className="sr-only" htmlFor="community-query">검색어</label><input id="community-query" name="q" defaultValue={f.q} maxLength={100} placeholder="제목 또는 내용 검색" /><button className="button button--primary">검색</button>
     <details className="community-filter"><summary aria-label="정렬 및 기간 필터"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/></svg><span className="sr-only">필터</span></summary><div className="community-filter-panel"><label htmlFor="community-sort-select">정렬<select id="community-sort-select" name="sort" defaultValue={f.sort}><option value="latest">최신순</option><option value="popular">인기순</option><option value="comments">댓글순</option></select></label><label htmlFor="community-period-select">기간<select id="community-period-select" name="period" defaultValue={f.period}><option value="all">전체</option><option value="day">최근 24시간</option><option value="week">최근 7일</option></select></label><button className="button button--primary">필터 적용</button></div></details>
    </form>
    {f.category === "QUESTION" ? <nav className="community-sort" aria-label="질문 상태">{([["all","전체"],["waiting","답변 대기"],["solved","해결 완료"]] as const).map(([solved,label]) => <Link key={solved} href={href({ solved })} aria-current={f.solved === solved ? "page" : undefined}>{label}</Link>)}</nav> : null}
    <div className="list-meta"><span>게시글 <b>{result.total}</b>개 · {result.page}/{result.pageCount}페이지</span>{f.tag ? <Link href={href({ tag: "" })}>#{f.tag} ×</Link> : null}</div>
    {f.activity !== "all" && !userId ? <p>내 활동을 보려면 <Link href="/login">로그인</Link>해 주세요.</p> : null}
    <div className="community-post-list">{result.posts.map(post => <CommunityPostCard key={post.id} post={post} userId={userId} isScrapped={scraps.has(post.id)} returnTo={returnTo} />)}
    {!result.posts.length ? <div className="empty-state"><b>{f.sort === "popular" ? "아직 인기글이 없어요" : f.q || f.tag ? "검색 결과가 없어요" : "아직 게시글이 없어요"}</b><p>다른 조건으로 찾아보거나 첫 이야기를 남겨 보세요.</p><Link className="button button--ghost" href="/community/new">글쓰기</Link></div> : null}</div>
    {result.pageCount > 1 ? <nav className="community-pagination" aria-label="페이지">{result.page > 1 ? <Link href={href({ page: result.page - 1 })}>← 이전</Link> : <span>← 이전</span>}<span>{result.page} / {result.pageCount}</span>{result.page < result.pageCount ? <Link href={href({ page: result.page + 1 })}>다음 →</Link> : <span>다음 →</span>}</nav> : null}
   </section>
   <aside className="community-live">
    <section><h2>♨ {f.period === "week" ? "이번 주" : "오늘의"} 인기글</h2><Link className="side-link" href={href({ sort: "popular", period: f.period === "week" ? "day" : "week", category: "ALL", activity: "all", solved: "all", q: "", tag: "" })}>{f.period === "week" ? "최근 24시간 보기" : "최근 7일 보기"}</Link><ol>{sidebar.popular.map(post => <li key={post.id}><Link href={`/community/${post.id}`}>{post.title}</Link><small>{POST_CATEGORY_LABELS[post.category]} · ♡ {post.likeCount} · 댓글 {post.commentCount}</small></li>)}</ol>{!sidebar.popular.length ? <p>아직 인기글이 없어요.</p> : null}<small>최근 {f.period === "week" ? "7일" : "24시간"} · 공감 3 + 참여 계정별 댓글 2</small></section>
    <section><h2>답변을 기다리는 질문</h2>{sidebar.waiting.map(p => <Link className="community-side-post" key={p.id} href={`/community/${p.id}`}>{p.title}<small>댓글 {p.commentCount}</small></Link>)}{!sidebar.waiting.length ? <p>답변을 기다리는 질문이 없어요.</p> : null}<Link className="side-link" href={href({ category: "QUESTION", solved: "waiting", activity: "all", sort: "latest", period: "all", q: "", tag: "" })}>질문 더보기 →</Link></section>
    <details className="community-guide"><summary>커뮤니티 이용 안내</summary><p>서로 존중하며 대화해 주세요. 개인정보는 게시하지 마세요. 욕설·스팸·개인정보 노출은 신고하면 운영자가 검토합니다.</p></details>
   </aside>
  </div>
 </main></SiteFrame>;
}
