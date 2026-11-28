"use client";
export default function CommunityError({ reset }: { reset: () => void }) {
 return <main className="page-wrap"><div className="empty-state" role="alert"><h1>커뮤니티를 불러오지 못했어요</h1><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button className="button button--primary" onClick={reset}>다시 시도</button></div></main>;
}
