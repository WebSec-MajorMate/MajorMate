import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { getModeratorReports, getModeratorPosts } from "@/app/actions/community";
import { CommandForm } from "@/components/community/CommunityControls";
import { SiteFrame } from "@/components/layout/SiteChrome";
export const instant = false;
export default async function ModerationPage() {
 await connection();
 const [reports, posts] = await Promise.all([getModeratorReports(), getModeratorPosts()]); if (!reports) notFound();
 const session = await auth();
 return <SiteFrame user={session?.user ?? null}><main className="page-wrap narrow-page"><h1>커뮤니티 신고 검토</h1><p>신고만으로 자동 삭제되지 않습니다. 관리자의 판단과 처리 기록을 저장합니다.</p>
 {reports.length ? reports.map(r => <article className="community-detail-card" key={r.id}><Link href={`/community/${r.postId}`}>{r.title}</Link><p>{r.targetType === "COMMENT" ? "댓글" : "게시글"} · {r.reason} · {r.status}</p><p>{r.detail}</p><details><summary>신고 대상 내용 검토</summary><p className="community-post-content">{r.content}</p></details><div className="community-detail-actions">{(["HIDDEN","ACTIVE"] as const).map(status => <CommandForm key={status} fields={{ op: "moderate", postId: r.postId, targetType: r.targetType, targetId: r.targetId, status }}>{status === "HIDDEN" ? "숨김 처리" : "복구 / 검토 완료"}</CommandForm>)}<CommandForm fields={{ op: "pin", postId: r.postId, enabled: "true" }}>공지 지정</CommandForm><CommandForm fields={{ op: "pin", postId: r.postId, enabled: "false" }}>공지 해제</CommandForm></div></article>) : <p>접수된 신고가 없습니다.</p>}
<h2>최근 게시글 관리</h2><p>최근 30개 글의 공지 지정과 숨김 상태를 관리합니다.</p>{posts?.map(p => <article className="community-detail-card" key={p.id}><Link href={`/community/${p.id}`}>{p.title}</Link><p>{p.hidden ? "숨김" : "공개"} · {p.isPinned ? "공지" : "일반글"}</p><div className="community-detail-actions"><CommandForm fields={{ op: "pin", postId: p.id, enabled: String(!p.isPinned) }}>{p.isPinned ? "공지 해제" : "공지 지정"}</CommandForm><CommandForm fields={{ op: "moderate", postId: p.id, status: p.hidden ? "ACTIVE" : "HIDDEN" }}>{p.hidden ? "복구" : "숨김"}</CommandForm></div></article>)}
 </main></SiteFrame>;
}
