import { XMLParser, XMLValidator } from "fast-xml-parser";
import ICAL from "ical.js";

export type Activity = {
  url: string;
  title: string;
  source: string;
  category: string;
  detail?: string;
  publishedDate?: string;
  deadline?: string;
  rolling?: boolean;
  eventDate?: string;
  employer?: string;
  employerLogo?: string;
};

const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hackathon = /해커톤|hackathon/i;
const contest = /공모전|공모대전|경진\s*대회|해커톤|hackathon|아이디어\s*공모/i;
const resultsNotice = /결과\s*(발표|안내|공고)|수상작\s*(발표|공개|공고)|선정\s*결과|수상자\s*(발표|안내|공고)|성료/;

function dateOnly(value: string) {
  const match = /^(\d{4})[.-]?(\d{2})[.-]?(\d{2})$/.exec(value);
  if (!match) return undefined;
  const iso = match.slice(1).join("-");
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(iso)
    ? iso
    : undefined;
}

function publicationDate(value?: string) {
  const input = value?.trim() ?? "";
  if (/^\d{4}(?:[.-]?\d{2}){2}$/.test(input)) return dateOnly(input);
  if (/^\d{14}$/.test(input)) return dateOnly(input.slice(0, 8));
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input)) {
    return dateOnly(input.slice(0, 10));
  }
  if (!/(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})$/i.test(input)) return undefined;
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? seoulDate.format(timestamp) : undefined;
}

function applicationDeadline(value: string) {
  const text = value.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>|&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ");
  const range = /(?:접수|신청|모집|응모|공모|지원)\s*(?:기간)?\s*[:：]?\s*(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})\s*[일.]?(?:\s*\([^)]{1,12}\))?\s*[~～–-]\s*(?:(20\d{2})\s*[년./-]\s*)?(\d{1,2})\s*[월./-]\s*(\d{1,2})/i.exec(text);
  const explicit = /(?:접수|신청|모집|응모|지원)\s*마감(?:일)?\s*[:：]?\s*(20\d{2})\s*[년./-]\s*(\d{1,2})\s*[월./-]\s*(\d{1,2})/.exec(text);
  if (!range && !explicit) return undefined;
  const year = range ? range[4] || range[1] : explicit![1];
  const month = range ? range[5] : explicit![2];
  const day = range ? range[6] : explicit![3];
  return dateOnly([year, month.padStart(2, "0"), day.padStart(2, "0")].join("-"));
}

function publicUrl(value: string | undefined, domain?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (domain && url.hostname !== domain)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

async function fetchFeed(url: string | URL, revalidate: number) {
  const response = await fetch(url, {
    next: { revalidate },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Upstream status ${response.status}`);
  return response;
}

const posterRetryAfter = new Map<string, number>();

export function getPosterRetryAfter(host: string) {
  return posterRetryAfter.get(host) ?? 0;
}

async function posterPage(url: string) {
  const host = new URL(url).hostname;
  if (getPosterRetryAfter(host) > Date.now()) return "";
  const response = await fetch(url, {
    redirect: "error",
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(2_500),
  });
  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const seconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
    const until = seconds === undefined ? Date.parse(header ?? "") : Date.now() + seconds * 1000;
    posterRetryAfter.set(host, Math.max(Date.now() + 60_000, Number.isFinite(until) ? until : 0));
  }
  if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
    return response.text();
  }
  return "";
}

function originalPosterAttachment(listing: string) {
  const image = /<img\b[^>]*\bsrc="\/thumb\/[^"]+"[^>]*\bdata-full="([^"]+)"[^>]*\balt="[^"]*포스터"/i.exec(listing);
  const source = publicUrl(image?.[1].replaceAll("&amp;", "&"));
  if (!source) return undefined;
  const url = new URL(source);
  if (url.hostname === "www.contestkorea.com" && /\/category_/i.test(url.pathname)) return undefined;
  const isOriginal =
    (url.hostname === "api.linkareer.com" && /^\/attachments\/\d+$/.test(url.pathname)) ||
    (url.hostname === "www.wevity.com" && url.pathname.startsWith("/upload/contest/")) ||
    (url.hostname === "www.contestkorea.com" && url.pathname.startsWith("/admincenter/files/meet/")) ||
    (url.hostname === "cdn.allforyoung.com" && /^\/media\/posts\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) ||
    (url.hostname === "www.code-c.kr" && /^\/data\/poster\/\d+\/\d+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) ||
    (url.hostname === "www.thinkcontest.com" && url.pathname === "/thinkgood/common/display.do" &&
      url.searchParams.get("filepath") === "contest_poster/image/");
  return isOriginal ? source : undefined;
}

export async function getActivityPoster(activityUrl: string) {
  try {
    const activity = new URL(activityUrl);
    if (activity.hostname === "www.scnu.ac.kr" && activity.pathname === "/SCNU/na/ntt/selectNttInfo.do") {
      const listing = await posterPage(activity.href);
      return /<img\b[^>]*\bsrc="(https:\/\/www\.scnu\.ac\.kr\/(?:upload\/editor|editor\/x_free\/upload)\/\d{8}\/[^"?#]+\.(?:jpe?g|png|webp))"/i
        .exec(listing)?.[1];
    }
    let organizerUrl = publicUrl(activity.href, "luma.com");
    if (activity.hostname === "www.gongmoaview.com" && activity.pathname.startsWith("/contests/")) {
      const listing = await posterPage(activity.href);
      const original = originalPosterAttachment(listing);
      if (original) return original;
      for (const link of listing.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const label = link[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        if (!label.includes("원문에서 확인")) continue;
        organizerUrl = publicUrl(/\bhref="([^"]+)"/i.exec(link[1])?.[1], "luma.com");
        if (organizerUrl) break;
      }
    }
    if (!organizerUrl) return undefined;

    const html = await posterPage(organizerUrl);
    for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
      if (!/\balt="Cover Image for /i.test(image[0])) continue;
      const src = /(?:\s)src="([^"]+)"/i.exec(image[0])?.[1];
      const coverUrl = publicUrl(src?.replaceAll("&amp;", "&"), "images.lumacdn.com");
      if (!coverUrl) continue;
      // Luma's organizer upload is embedded in the rendered CDN resize URL.
      const upload = /\/uploads\/[\w/-]+\.(?:jpe?g|png|webp|avif)$/i.exec(new URL(coverUrl).pathname)?.[0];
      if (upload) return new URL(upload, coverUrl).href;
    }
  } catch {
    return undefined;
  }
}

async function msit(key: string, today: string): Promise<Activity[]> {
  // The gateway returns ten announcements per page. Read up to five recent pages.
  const cutoff = new Date(Date.parse(today) - 45 * 86_400_000).toISOString().slice(0, 10);
  const activities: Activity[] = [];
  for (let page = 1; page <= 5; page++) {
    const items = await msitPage(key, page);
    for (const item of items) {
      const title = item.subject?.trim();
      const link = publicUrl(item.viewUrl, "www.msit.go.kr");
      const published = dateOnly(item.pressDt ?? "");
      if (!title || !link || !published || published < cutoff || published > today ||
          !contest.test(title) || resultsNotice.test(title)) continue;
      // The feed provides a publication date, but no application deadline.
      activities.push({ url: link, title, source: "과학기술정보통신부",
        category: hackathon.test(title) ? "해커톤" : "공모전", publishedDate: published });
    }
    const lastPublished = dateOnly(items.at(-1)?.pressDt ?? "");
    if (items.length < 10 || (lastPublished && lastPublished < cutoff)) break;
  }
  return activities;
}

async function msitPage(key: string, page: number) {
  const url = new URL("https://apis.data.go.kr/1721000/msitannouncementinfo/businessAnnouncMentList");
  url.search = new URLSearchParams({ ServiceKey: key, pageNo: String(page), numOfRows: "10", returnType: "xml" }).toString();
  const response = await fetchFeed(url, 86_400);
  const xml = await response.text();
  if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error("Invalid MSIT XML");
  }
  const parser = new XMLParser({ parseTagValue: false, isArray: (name) => name === "item" });
  const data: { response?: {
    header?: { resultCode?: string };
    body?: { items?: { item?: { subject?: string; viewUrl?: string; pressDt?: string }[] } };
  } } = parser.parse(xml);
  if (data.response?.header?.resultCode !== "00" || !data.response.body) {
    throw new Error("MSIT rejected the request");
  }

  return data.response.body.items?.item ?? [];
}

async function readRss(url: string, revalidate: number) {
  const response = await fetchFeed(url, revalidate);
  const xml = await response.text();
  if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error("Invalid RSS");
  }
  const parser = new XMLParser({
    parseTagValue: false,
    isArray: (name) => name === "item",
  });
  const feed: { rss?: { channel?: { item?: {
    title?: string;
    link?: string;
    category?: string;
    description?: string;
    pubDate?: string;
  }[] } } } = parser.parse(xml);
  if (!feed.rss?.channel) throw new Error("Missing RSS channel");
  return feed.rss.channel.item ?? [];
}

async function gongmoa(): Promise<Activity[]> {
  const items = await readRss("https://www.gongmoaview.com/rss.xml", 600);
  return items.flatMap((item) => {
    const url = publicUrl(item.link, "www.gongmoaview.com");
    if (!url || !new URL(url).pathname.startsWith("/contests/") || !item.title) return [];
    const deadline = applicationDeadline(item.description ?? "");
    return [{
      url,
      title: item.title,
      source: "공모아뷰",
      category: hackathon.test(item.title) ? "해커톤" : item.category || "대외활동",
      detail: item.description,
      publishedDate: publicationDate(item.pubDate),
      deadline,
    }];
  });
}

const announcementFeeds = [
  {
    name: "국립순천대학교",
    feed: "https://www.scnu.ac.kr/SCNU/na/ntt/selectRssFeed.do?mi=1187&bbsId=1066",
    host: "www.scnu.ac.kr",
    path: "/SCNU/na/ntt/selectNttInfo.do",
    recruitment: /서포터즈.*모집|참가자\s*모집|참여자\s*모집/,
  },
  {
    name: "중소벤처기업부",
    feed: "https://mss.go.kr/rss/smba/board/310.do",
    host: "www.mss.go.kr",
    path: "/site/smba/ex/bbs/View.do",
    recruitment: /(?:예비창업자|대학생).*(?:모집|선발)/,
  },
  {
    name: "인천대학교",
    feed: "https://eng.inu.ac.kr/bbs/shinbang/327/rssList?row=50",
    host: "www.inu.ac.kr",
    path: /^\/bbs\/shinbang\/327\/\d+\/artclView$/,
    recruitment: /(?:서포터즈|참가자|참여자|참여청년|교육과정|일경험).*모집/,
    requireDeadline: true,
  },
];

async function recentAnnouncements(source: typeof announcementFeeds[number], today: string): Promise<Activity[]> {
  const items = await readRss(source.feed, 3600);
  const cutoff = new Date(Date.parse(today) - 45 * 86_400_000).toISOString().slice(0, 10);
  const candidates = items.flatMap((item) => {
    const title = item.title?.trim();
    const url = publicUrl(item.link?.replace(/^http:/, "https:"), source.host);
    const date = publicationDate(item.pubDate);
    const path = url ? new URL(url).pathname : "";
    if (!title || !url || !(typeof source.path === "string" ? path === source.path : source.path.test(path)) ||
        !date || date < cutoff || date > today || resultsNotice.test(title) ||
        !(contest.test(title) || source.recruitment.test(title))) return [];
    const deadline = applicationDeadline(item.description ?? "");
    if (source.requireDeadline && !deadline) return [];
    const category = hackathon.test(title) ? "해커톤"
      : contest.test(title) ? "공모전" : source.host === "www.mss.go.kr" ? "창업"
        : /교육과정/.test(title) ? "교육·강연" : "대외활동";
    return [{ url, title, source: source.name, category, publishedDate: date, deadline }];
  });
  if (source.host !== "www.scnu.ac.kr") return candidates;
  return Promise.all(candidates.map(async (activity) => {
    if (activity.deadline) return activity;
    const body = await posterPage(activity.url).catch(() => "");
    return { ...activity, deadline: applicationDeadline(body) };
  }));
}

const lumaFeeds = [
  { name: "Luma 서울", query: "entity=discover&id=discplace-eQieweHXBFCWbCj" },
  { name: "Hashed Events", query: "entity=calendar&id=cal-ylx8HtmmzipNDX6", domesticOnly: true },
];

async function luma(source: typeof lumaFeeds[number]): Promise<Activity[]> {
  const response = await fetchFeed("https://api.lu.ma/ics/get?" + source.query, 43_200);
  const calendar = new ICAL.Component(ICAL.parse(await response.text()));
  return calendar.getAllSubcomponents("vevent").flatMap((component) => {
    const event = new ICAL.Event(component);
    if (!event.summary || !event.startDate || event.isRecurring() ||
        component.getFirstPropertyValue("status") === "CANCELLED") return [];
    if (source.domesticOnly && !/대한민국|South Korea|서울|Seoul|부산|Busan|판교|Pangyo/i.test(event.location ?? "")) return [];
    const category = hackathon.test(event.summary) ? "해커톤"
      : /밋업|meetup|워크숍|workshop|컨퍼런스|conference|심포지엄|symposium|세미나|seminar/i.test(event.summary)
        ? "행사" : undefined;
    if (!category) return [];
    const url = publicUrl(
      /Get up-to-date information at: (https:\/\/luma\.com\/[^\s]+)/.exec(event.description ?? "")?.[1],
      "luma.com",
    );
    if (!url) return [];
    const created = component.getFirstPropertyValue("created");
    return [{
      url,
      title: event.summary,
      source: source.name,
      category,
      publishedDate: created instanceof ICAL.Time ? seoulDate.format(created.toJSDate()) : undefined,
      deadline: applicationDeadline(event.description ?? ""),
      eventDate: event.startDate.isDate
        ? event.startDate.toString()
        : seoulDate.format(event.startDate.toJSDate()),
    }];
  });
}

async function kStartup(key: string): Promise<Activity[]> {
  const url = new URL("https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01");
  url.search = new URLSearchParams({
    serviceKey: key,
    returnType: "json",
    perPage: "100",
    "cond[rcrt_prgs_yn::EQ]": "Y",
  }).toString();
  const response = await fetchFeed(url, 600);
  const data: { data?: {
    biz_pbanc_nm?: string;
    detl_pg_url?: string;
    aply_trgt?: string;
    pbanc_rcpt_end_dt?: string;
  }[] } = await response.json();
  if (!Array.isArray(data.data)) throw new Error("Invalid K-Startup response");
  return data.data.flatMap((item) => {
    const title = item.biz_pbanc_nm;
    const link = publicUrl(item.detl_pg_url);
    if (!link || !title ||
        !/대학생/.test(item.aply_trgt ?? "") && !/공모전|경진대회|해커톤/.test(title)) return [];
    return [{
      url: link,
      title,
      source: "K-Startup",
      category: hackathon.test(title) ? "해커톤" : "창업",
      deadline: dateOnly(item.pbanc_rcpt_end_dt ?? ""),
    }];
  });
}

async function bizinfo(key: string, today: string): Promise<Activity[]> {
  const url = new URL("https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do");
  url.search = new URLSearchParams({ crtfcKey: key, dataType: "json", searchCnt: "100" }).toString();
  const response = await fetchFeed(url, 3600);
  const data: { jsonArray?: { item?: {
    title?: string; pblancNm?: string; link?: string; pblancUrl?: string;
    reqstDt?: string; reqstBeginEndDe?: string; trgetNm?: string; author?: string;
    pubDate?: string; creatPnttm?: string;
  }[] } } = await response.json();
  if (!data?.jsonArray || (data.jsonArray.item != null && !Array.isArray(data.jsonArray.item))) {
    throw new Error("Invalid Bizinfo response");
  }
  return (data.jsonArray.item ?? []).flatMap((item) => {
    const title = (item.pblancNm || item.title)?.trim();
    const link = publicUrl(item.pblancUrl || item.link, "www.bizinfo.go.kr");
    const dates = /(\d{4}[.-]?\d{2}[.-]?\d{2})\s*[~～]\s*(\d{4}[.-]?\d{2}[.-]?\d{2})/
      .exec(item.reqstBeginEndDe || item.reqstDt || "");
    const start = dateOnly(dates?.[1] ?? "");
    const deadline = dateOnly(dates?.[2] ?? "");
    if (!title || !link || !start || !deadline || start > today || deadline < today ||
        resultsNotice.test(title) ||
        !(contest.test(title) || /대학생|예비\s*창업자/.test(title + " " + (item.trgetNm ?? "")))) return [];
    const category = hackathon.test(title) ? "해커톤" : contest.test(title) ? "공모전" : "창업";
    return [{ url: link, title, source: "기업마당", category, deadline,
      publishedDate: publicationDate(item.creatPnttm || item.pubDate),
      detail: item.author?.trim() ? "주최 " + item.author.trim() : undefined }];
  });
}

const careerBoards = [
  { name: "크래프톤", token: "krafton", logo: "krafton.png", link: "https://job-boards.greenhouse.io/krafton" },
  { name: "쿠팡", token: "coupang", logo: "coupang.jpg", link: "https://www.coupang.jobs/" },
  { name: "몰로코", token: "moloco", logo: "moloco.png", link: "https://job-boards.greenhouse.io/moloco" },
  { name: "센드버드", token: "sendbird", logo: "sendbird.png", link: "https://sendbird.com/careers" },
  { name: "애피어", token: "appier", logo: "appier.svg", link: "https://job-boards.greenhouse.io/appier" },
];

async function companyJobs(board: typeof careerBoards[number]): Promise<Activity[]> {
  const response = await fetchFeed("https://boards-api.greenhouse.io/v1/boards/" + board.token + "/jobs", 3600);
  const data: { jobs?: {
    id?: number; title?: string; absolute_url?: string; location?: { name?: string };
  }[] } = await response.json();
  if (!Array.isArray(data.jobs)) throw new Error("Invalid Greenhouse response");
  const candidates = data.jobs.flatMap((job) => {
    const title = job.title?.trim();
    const location = job.location?.name?.trim();
    const url = publicUrl(job.absolute_url);
    if (!title || !location || !url ||
        !/South Korea|\bKorea\b|\bSeoul\b|대한민국|한국|서울|판교|성남|분당|경기|인천|부산|대전|대구/i.test(location) ||
        !/\b(?:intern|internship|new grad(?:uate)?|graduate program|entry.level)\b|인턴|신입/i.test(title) ||
        /경력\s*(?:인재|직)|[2-9]\s*년\s*이상|인턴\s*(?:관리|운영)|\bsenior\b/i.test(title)) return [];
    return [{ id: job.id, activity: { url, title, source: board.name, employer: board.name,
      employerLogo: "/company-logos/" + board.logo, category: "채용·인턴", detail: location } }];
  });
  return Promise.all(candidates.map(async ({ id, activity }) => {
    if (!Number.isSafeInteger(id)) return activity;
    try {
      const response = await fetchFeed(
        "https://boards-api.greenhouse.io/v1/boards/" + board.token + "/jobs/" + id, 3600,
      );
      const data: { content?: string } = await response.json();
      const content = data.content ?? "";
      return { ...activity, deadline: applicationDeadline(content),
        rolling: /상시\s*(?:채용|모집)|채용\s*(?:완료\s*)?시\s*(?:조기\s*)?마감|open until filled/i.test(content) };
    } catch {
      return activity;
    }
  }));
}

export const activitySourceGroups = {
  activity: ["공모아뷰", "국립순천대학교", "인천대학교", "Luma 서울", "Hashed Events"],
  contest: ["공모아뷰", "국립순천대학교", "인천대학교", "중소벤처기업부", "과학기술정보통신부"],
  jobs: careerBoards.map(({ name }) => name),
};

export const careerSourceLinks = careerBoards.map(({ name, link }) => ({ name, link }));

export async function getActivities() {
  const today = seoulDate.format(new Date());
  const key = process.env.K_STARTUP_SERVICE_KEY?.trim();
  const msitKey = process.env.MSIT_SERVICE_KEY?.trim();
  const bizinfoKey = process.env.BIZINFO_API_KEY?.trim();
  const sources = [
    { name: "공모아뷰", load: gongmoa },
    ...careerBoards.map((board) => ({ name: board.name, load: () => companyJobs(board) })),
    ...lumaFeeds.map((source) => ({ name: source.name, load: () => luma(source) })),
    ...announcementFeeds.map((source) => ({
      name: source.name,
      load: () => recentAnnouncements(source, today),
    })),
  ];
  if (key) sources.push({ name: "K-Startup", load: () => kStartup(key) });
  if (msitKey) sources.push({ name: "과학기술정보통신부", load: () => msit(msitKey, today) });
  if (bizinfoKey) sources.push({ name: "기업마당", load: () => bizinfo(bizinfoKey, today) });

  const results = await Promise.allSettled(sources.map(({ load }) => load()));
  const activities = new Map<string, Activity>();
  const failedSources: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failedSources.push(sources[index].name);
      return;
    }
    for (const activity of result.value) {
      const date = activity.deadline ?? activity.eventDate;
      if ((!date || date >= today) && !activities.has(activity.url)) {
        activities.set(activity.url, activity);
      }
    }
  });

  return {
    today,
    failedSources,
    activities: [...activities.values()].sort((a, b) =>
      (a.deadline ?? a.eventDate ?? "9999").localeCompare(b.deadline ?? b.eventDate ?? "9999"),
    ),
  };
}
