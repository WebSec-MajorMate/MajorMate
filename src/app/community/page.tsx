import Link from "next/link";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { isAuthConfigured } from "@/lib/auth-config";
import { getCommunityPosts, getScrappedTargetIds } from "@/lib/community";
import { POST_CATEGORIES, POST_CATEGORY_LABELS } from "@/lib/community-types";
import type { PostCategory } from "@/lib/community-types";
import { communityFilterSchema } from "@/lib/community-validation";
import { connection } from "next/server";

export const instant = false;

type SearchParams = Record<string, string | string[] | undefined>;
type CommunityPageProps = { searchParams: Promise<SearchParams> };
type CategoryFilter = "ALL" | PostCategory;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function categoryLabel(category: CategoryFilter) {
  return category === "ALL" ? "전체" : POST_CATEGORY_LABELS[category];
}

function communityHref(category: CategoryFilter, query: string, page = 1) {
  const params = new URLSearchParams();
  if (category !== "ALL") params.set("category", category);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/community?${search}` : "/community";
}

export default async function CommunityPage({ searchParams }: CommunityPageProps) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;

  const [session, rawSearchParams] = await Promise.all([auth(), searchParams]);
  const parsedFilters = communityFilterSchema.safeParse({
    category: first(rawSearchParams.category),
    q: first(rawSearchParams.q),
    page: first(rawSearchParams.page),
  });
  const filters = parsedFilters.success ? parsedFilters.data : { category: "ALL" as const, q: "", page: 1 };
  const category: CategoryFilter = filters.category;
  const result = await getCommunityPosts({
    category: category === "ALL" ? undefined : category,
    query: filters.q,
    page: filters.page,
  });
  const userId = session?.user?.id ?? null;
  const scrappedIds = userId
    ? await getScrappedTargetIds(userId, "POST", result.posts.map((post) => post.id))
    : new Set<string>();

  return <SiteFrame user={session?.user ?? null}>
    <main className="page-wrap">
      <section className="page-intro community-intro">
        <div><div className="eyebrow eyebrow--dark"><span className="pulse-dot" />MAJOR COMMUNITY</div><h1>전공 이야기를<br /><em>안전하게 나눠요.</em></h1><p>수업, 진로, 학교생활에 대한 질문과 경험을 나눠 보세요.</p></div>
        <Link className="button button--primary" href={userId ? "/community/new" : `/login?callbackUrl=${encodeURIComponent("/community/new")}`}>+ 글쓰기</Link>
      </section>

      <div className="community-layout">
        <section className="community-main" aria-label="게시글 목록">
          <div className="filter-bar">
            <form className="community-search-form" action="/community" method="get">
              <input type="hidden" name="category" value={category} />
              <label className="search-field"><span aria-hidden="true">⌕</span><input name="q" defaultValue={filters.q} maxLength={100} placeholder="제목이나 내용으로 검색" aria-label="게시글 검색어" /></label>
              <button className="button button--primary community-search-button" type="submit">검색</button>
            </form>
            <nav className="category-tabs community-category-tabs" aria-label="게시글 카테고리">
              {(["ALL", ...POST_CATEGORIES] as CategoryFilter[]).map((item) => <Link key={item} href={communityHref(item, filters.q)} className={category === item ? "is-selected" : ""} aria-current={category === item ? "page" : undefined}>{categoryLabel(item)}</Link>)}
            </nav>
          </div>

          <div className="list-meta"><span>게시글 <b>{result.total}</b>개</span>{filters.q ? <span>“{filters.q}” 검색 결과</span> : <span>{categoryLabel(category)} 게시판</span>}</div>
          <div className="community-post-list">
            {result.posts.length ? result.posts.map((post) => <CommunityPostCard key={post.id} post={post} userId={userId} isScrapped={scrappedIds.has(post.id)} />) : <div className="empty-state community-results-empty"><b>{filters.q || category !== "ALL" ? "조건에 맞는 게시글이 없어요" : "아직 게시글이 없어요"}</b><p>첫 번째 글을 작성해 커뮤니티를 시작해 보세요.</p>{userId ? <Link className="button button--primary" href="/community/new">게시글 작성하기</Link> : null}</div>}
          </div>

          {result.pageCount > 1 ? <nav className="community-pagination" aria-label="게시글 페이지">
            {result.page > 1 ? <Link href={communityHref(category, filters.q, result.page - 1)} aria-label="이전 페이지">← 이전</Link> : <span aria-disabled="true">← 이전</span>}
            <span>{result.page} / {result.pageCount}</span>
            {result.page < result.pageCount ? <Link href={communityHref(category, filters.q, result.page + 1)} aria-label="다음 페이지">다음 →</Link> : <span aria-disabled="true">다음 →</span>}
          </nav> : null}
        </section>

        <aside className="community-aside">
          <section className="side-card side-card--notice"><div className="side-card-head"><span className="side-icon">✦</span><b>함께 지켜요</b></div><p>서로 존중하는 표현을 사용하고, 개인정보나 비밀번호는 게시글과 댓글에 올리지 마세요.</p></section>
          <section className="side-card"><div className="side-card-head"><span className="side-icon side-icon--peach">✎</span><b>커뮤니티 안내</b></div><p>자유, 질문, 정보, 후기 게시판에서 전공 생활에 도움이 되는 이야기를 나눌 수 있어요.</p><Link className="side-link" href={userId ? "/community/new" : `/login?callbackUrl=${encodeURIComponent("/community/new")}`}>게시글 작성하기 →</Link></section>
        </aside>
      </div>
    </main>
  </SiteFrame>;
}
