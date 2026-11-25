import Link from "next/link";
import { setScrapAction } from "@/app/actions/community";

export function ScrapButton({
  userId,
  targetType,
  targetId,
  isScrapped,
  returnTo,
}: {
  userId: string | null;
  targetType: "POST" | "STUDY";
  targetId: string;
  isScrapped: boolean;
  returnTo: string;
}) {
  if (!userId) {
    return <Link className="scrap-button" href={`/login?callbackUrl=${encodeURIComponent(returnTo)}`} aria-label="로그인 후 스크랩하기">☆ 로그인 후 스크랩</Link>;
  }

  return <form action={setScrapAction.bind(null, targetType, targetId, !isScrapped)} className="scrap-form">
    <button className={`scrap-button${isScrapped ? " is-scrapped" : ""}`} type="submit" aria-pressed={isScrapped}>
      {isScrapped ? "★ 스크랩됨" : "☆ 스크랩"}
    </button>
  </form>;
}
