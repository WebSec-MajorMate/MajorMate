import Link from "next/link";
import Image from "next/image";
import { after, connection } from "next/server";
import { auth } from "@/auth";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { activitySourceGroups, careerSourceLinks, getActivities, getActivityPoster } from "@/lib/activities";
import { listActivityFavorites } from "@/lib/activity-favorites";
import { isGongmoaPoster, readGongmoaPosters, refreshGongmoaPoster } from "@/lib/activity-poster-cache";
import { isAuthConfigured } from "@/lib/auth-config";
import { FavoriteButton } from "./FavoriteButton";
import { PosterImage } from "./PosterImage";


export const instant = false;

const pageSize = 16;
const rowSize = 10;
const categoryColors: Record<string, string> = {
  공모전: "activities-contest",
  해커톤: "activities-hackathon",
  대외활동: "activities-general",
  행사: "activities-event",
  창업: "activities-startup",
  "채용·인턴": "activities-hackathon",
};

const fields = [
  { id: "ideas", label: "기획·아이디어", pattern: /아이디어|기획|정책\s*제안|지역\s*문제|문제\s*해결|서비스\s*제안/ },
  { id: "tech", label: "IT·AI·데이터", pattern: /\b(?:AI|IT|SW|LLM|RAG|devfest|software|hackathon)\b|해커톤|인공지능|프로그래밍|코딩|클라우드|데이터|앱\s*개발|웹\s*개발/i },
  { id: "creative", label: "디자인·웹툰", pattern: /디자인|디자이너|웹툰|만화|일러스트|캐릭터|포스터|시각예술|\bdesign\b/i },
  { id: "media", label: "영상·사진", pattern: /영상|사진|촬영|영화|숏폼|릴스|다큐멘터리|\b(?:UCC|video|photo)\b/i },
  { id: "writing", label: "문학·글쓰기", pattern: /문학|글쓰기|에세이|소설|백일장|수필|시조|동시\s*공모|슬로건|표어|카피라이팅|시\s*공모/ },
  { id: "business", label: "창업·마케팅", pattern: /창업|스타트업|마케팅|브랜딩|비즈니스|경영|startup|marketing/i },
  { id: "science", label: "과학·공학", pattern: /과학|공학|로봇|발명|우주|항공|바이오|반도체|\b(?:science|engineering|robotics)\b/i },
  { id: "environment", label: "환경·ESG", pattern: /환경|기후|탄소|에너지|생태|자원\s*순환|지속\s*가능|\bESG\b/i },
  { id: "public", label: "사회·봉사", pattern: /봉사|사회\s*공헌|시민\s*참여|시민\s*위원|정책|인권|복지|공익/ },
];
const businessField = fields.find(({ id }) => id === "business")!;

const groups = {
  activity: "대외활동",
  contest: "공모전",
  jobs: "취업정보",
} as const;

type Group = keyof typeof groups | "favorites";
type Filters = { q?: string; category?: string; field?: string; page?: string; group?: Group };

function activityFields(title: string, category: string) {
  if (category === "채용·인턴") return [{ id: "jobs", label: "채용·인턴" }];
  const matching = fields.filter(({ pattern }) => pattern.test(title));
  if (category === "창업" && !matching.includes(businessField)) matching.push(businessField);
  return matching.length ? matching : [{ id: "other", label: "기타" }];
}

function activityHref(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.size ? `/activities?${params}` : "/activities";
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [session, { activities, failedSources, today }, params] = await Promise.all([
    isAuthConfigured() ? auth() : null,
    getActivities(),
    searchParams,
  ]);

  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const group = typeof params.group === "string" &&
    (params.group === "favorites" || Object.hasOwn(groups, params.group))
    ? params.group as Group : "activity";
  const userId = session?.user?.id;
  const favorites = userId ? await listActivityFavorites(userId).catch(() => null) : [];
  const favoriteUrls = new Set(favorites?.map(({ url }) => url));
  const currentActivities = new Map(activities.map((activity) => [activity.url, activity]));
  const groupActivities = group === "favorites"
    ? (favorites ?? []).map((activity) => currentActivities.get(activity.url) ?? activity)
    : activities.filter(({ source, category }) => {
    if (!activitySourceGroups[group].includes(source)) return false;
    if (group === "jobs") return category === "채용·인턴";
    const isContest = category === "공모전" || category === "해커톤";
    return group === "contest" ? isContest : !isContest && category !== "채용·인턴";
  });
  const categories = [...new Set(groupActivities.map(({ category }) => category))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const category = typeof params.category === "string" && categories.includes(params.category)
    ? params.category : "";
  const fieldOptions = [{ id: "jobs", label: "채용·인턴" }, ...fields, { id: "other", label: "기타" }];
  const field = typeof params.field === "string" && fieldOptions.some(({ id }) => id === params.field)
    ? params.field : "";
  const matches = groupActivities.map((activity) => ({
    ...activity,
    fields: activityFields(activity.title, activity.category),
  })).filter((activity) =>
    (!category || activity.category === category) &&
    (!field || activity.fields.some(({ id }) => id === field)) &&
    (!query || [activity.title, activity.detail, activity.source].some((value) =>
      value?.toLowerCase().includes(query.toLowerCase()),
    )),
  );
  const paginated = Boolean(field) || group === "favorites";
  const pageCount = paginated ? Math.max(1, Math.ceil(matches.length / pageSize)) : 1;
  const requestedPage = typeof params.page === "string" && /^\d+$/.test(params.page)
    ? Number(params.page) : 1;
  const page = Math.max(1, Math.min(pageCount, requestedPage));
  const rows = group === "favorites" ? [{
    id: "favorites", label: "저장한 공고", count: matches.length,
    items: matches.slice((page - 1) * pageSize, page * pageSize),
  }].filter(({ count }) => count > 0) : fieldOptions.filter(({ id }) => !field || id === field).flatMap(({ id, label }) => {
    const items = matches.filter((activity) => activity.fields.some((entry) => entry.id === id));
    if (!items.length) return [];
    return [{
      id, label, count: items.length,
      items: field ? items.slice((page - 1) * pageSize, page * pageSize) : items.slice(0, rowSize),
    }];
  });
  const urls = [...new Set(rows.flatMap(({ items }) =>
    items.filter(({ employerLogo }) => !employerLogo).map(({ url }) => url),
  ))];
  const gongmoa = await readGongmoaPosters(urls.filter(isGongmoaPoster)).catch(() => null);
  const pendingPoster = gongmoa?.pending;
  if (pendingPoster) after(() => refreshGongmoaPoster(pendingPoster).catch(() => {}));
  const posters = new Map(gongmoa?.images);
  const otherUrls = urls.filter((url) => !isGongmoaPoster(url));
  const posterBatchSize = 5;
  for (let index = 0; index < otherUrls.length; index += posterBatchSize) {
    const batch = otherUrls.slice(index, index + posterBatchSize);
    const entries = await Promise.all(batch.map(async (url) => [url, await getActivityPoster(url)] as const));
    for (const [url, poster] of entries) if (poster) posters.set(url, poster);
  }

  return (
    <SiteFrame user={session?.user ?? null}>
      <link rel="stylesheet" href="/activities.css" precedence="activities" />
      <main className="page-wrap">
        <header className="activities-hero">
          <div>
            <h1>대외활동·공모전·취업정보</h1>
            <p>대학생 공모전부터 서포터즈, 신입·인턴 모집까지.</p>
          </div>
          <form action="/activities" className="activities-search" role="search">
            <input type="hidden" name="group" value={group} />
            {category && <input type="hidden" name="category" value={category} />}
            {field && <input type="hidden" name="field" value={field} />}
            <input aria-label="공고 검색" name="q" type="search" defaultValue={query}
              placeholder="공고명 또는 주최 기관 검색" maxLength={100} />
            <button type="submit">검색</button>
          </form>
        </header>
        <nav className="activities-categories" aria-label="정보 유형">
          {(Object.entries(groups) as [Group, string][]).map(([id, label]) => (
            <Link key={id} href={activityHref({ q: query, group: id })}
              aria-current={id === group ? "page" : undefined}>{label}</Link>
          ))}
          <Link className="activities-favorites-link" href="/activities?group=favorites"
            aria-current={group === "favorites" ? "page" : undefined}>즐겨찾기</Link>
        </nav>

        {categories.length > 1 && <nav className="activities-categories" aria-label="공고 유형">
          {["", ...categories].map((value) => (
            <Link key={value} href={activityHref({ q: query, category: value, field, group })}
              aria-current={value === category ? "page" : undefined}>
              {value || "모든 유형"}
            </Link>
          ))}
        </nav>}

        <section aria-labelledby="activity-list-title">
          <div className="activities-results">
            <h2 id="activity-list-title">{category || (group === "favorites" ? "즐겨찾기" : groups[group])} <span>{matches.length}건</span></h2>
            <a href="https://devpost.com/hackathons" target="_blank" rel="noopener noreferrer">
              해외 해커톤 · Devpost ↗
            </a>
          </div>
          {failedSources.length > 0 && (
            <p className="activities-note">{failedSources.join(", ")} 공고를 일시적으로 불러오지 못했어요.</p>
          )}
          {favorites === null && <p className="activities-note">즐겨찾기를 불러오지 못했습니다.</p>}
          {field && <Link className="activities-row-link" href={activityHref({ q: query, category, group })}>‹ 전체 분야</Link>}
          {rows.length ? rows.map((row) => (
            <section className="activities-field-row" key={row.id} aria-labelledby={`field-${row.id}`}>
              <div className="activities-row-heading">
                <h3 id={`field-${row.id}`}>{row.label}</h3>
                {group !== "favorites" && !field && row.count > rowSize && (
                  <Link className="activities-row-link" href={activityHref({ q: query, category, field: row.id, group })}
                    aria-label={`${row.label} 공고 모두 보기`}>더 보기 ›</Link>
                )}
              </div>
            <ul className="activities-grid activities-row" tabIndex={0} aria-labelledby={`field-${row.id}`}>
              {row.items.map((activity) => {
                const poster = posters.get(activity.url);
                const organizer = /^주최\s+(.+?)(?:\s+·\s+|$)/.exec(activity.detail ?? "")?.[1];
                const date = activity.deadline ?? activity.eventDate;
                const isNewContest = activity.publishedDate === today &&
                  (activity.category === "공모전" || activity.category === "해커톤");
                const days = date ? (Date.parse(date) - Date.parse(today)) / 86_400_000 : null;
                const countdown = days === null ? undefined : days === 0 ? "D-Day" : `D-${days}`;
                const scheduleBadge = days !== null && days < 0 ? (activity.deadline ? "마감" : "행사 종료")
                  : activity.deadline ? countdown
                  : activity.eventDate ? `행사 ${countdown}`
                    : activity.rolling ? "상시채용" : "마감일 확인";
                return (
                  <li key={activity.url} className="activities-card-item">
                    <FavoriteButton url={activity.url} selected={favoriteUrls.has(activity.url)} loggedIn={Boolean(userId)} />
                    <a className="activities-card" href={activity.url} target="_blank" rel="noopener noreferrer">
                      <div className={`activities-poster ${activity.employerLogo ? "activities-company-poster" : categoryColors[activity.category] ?? "activities-general"}`}>
                        {activity.employerLogo && (
                          <Image src={activity.employerLogo} alt="" fill unoptimized
                            className="activities-company-logo" sizes="(max-width: 815px) 155px, 210px" />
                        )}
                        {!activity.employerLogo && (
                          <span className="activities-poster-title" aria-hidden="true">{activity.title}</span>
                        )}
                        {poster && <PosterImage key={poster} src={poster} />}
                        <div className="activities-poster-labels">
                          <span className="activities-category-label">{activity.category}</span>
                          {isNewContest && <span className="activities-new-label" aria-label="오늘 게시된 공고">NEW</span>}
                        </div>
                        <strong className="activities-deadline">{scheduleBadge}</strong>
                      </div>
                      <div className="activities-card-body">
                        <h4>{activity.title}</h4>
                        {activity.employer && <p>{activity.employer} · {activity.detail}</p>}
                        {organizer && <p>{organizer}</p>}
                        <div className="activities-card-meta">
                          {date && <span>{activity.deadline ? "마감" : "행사"} <time dateTime={date}>{date}</time></span>}
                          {!date && <span>{activity.rolling ? "채용 일정은 원문에서 확인" : "마감일은 원문에서 확인"}</span>}
                        </div>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
            </section>
          )) : (
            <div className="empty-state">
              <b>{group === "favorites" && !userId ? "로그인이 필요합니다" :
                query || category || field ? "조건에 맞는 공고가 없어요." :
                  group === "favorites" ? "저장한 공고가 없어요." : "지금 표시할 공고가 없어요."}</b>
              {group === "favorites" && !userId && <Link href="/login?callbackUrl=%2Factivities%3Fgroup%3Dfavorites">로그인</Link>}
              {(query || category || field) && <Link href={activityHref({ group })}>필터 초기화</Link>}
            </div>
          )}
          {pageCount > 1 && (
            <nav className="activities-pagination" aria-label="공고 페이지">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <Link key={number} href={activityHref({ q: query, category, field, page: String(number), group })}
                  aria-current={number === page ? "page" : undefined}>
                  {number}
                </Link>
              ))}
            </nav>
          )}
          <p className="activities-note">지원 전 원문에서 일정과 참가 자격을 확인해 주세요.</p>
          <details className="activities-note">
            <summary>공고 출처</summary>
            <a href="https://www.gongmoaview.com/about/open-data">공모아뷰</a>
            {" · "}
            <a href="https://luma.com/seoul">Luma 서울</a>
            {" · "}
            <a href="https://www.scnu.ac.kr/SCNU/na/ntt/selectRssFeed.do?mi=1187&bbsId=1066">국립순천대학교</a>
            {" · "}
            <a href="https://mss.go.kr/rss/smba/board/310.do">중소벤처기업부</a>
            {" · "}
            <a href="https://eng.inu.ac.kr/shinbang/2542/subview.do">인천대학교</a>
            {" · "}
            <a href="https://luma.com/hashed_events">Hashed Events</a>
            {careerSourceLinks.map(({ name, link }) => (
              <span key={name}>{" · "}<a href={link}>{name}</a></span>
            ))}
            {process.env.MSIT_SERVICE_KEY?.trim() && (
              <>{" · "}<a href="https://www.data.go.kr/data/15074634/openapi.do">과학기술정보통신부</a></>
            )}
            {process.env.K_STARTUP_SERVICE_KEY?.trim() && (
              <>{" · "}<a href="https://www.k-startup.go.kr/">K-Startup</a></>
            )}
            {process.env.BIZINFO_API_KEY?.trim() && (
              <>{" · "}<a href="https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi">기업마당</a></>
            )}
          </details>
        </section>
      </main>
    </SiteFrame>
  );
}
