import Link from "next/link";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { RefreshMessagesButton, StartConversationForm } from "@/components/messages/MessageForms";
import { isAuthConfigured } from "@/lib/auth-config";
import { getMyMessageRooms } from "@/lib/messages";
import styles from "./messages.module.css";

export const instant = false;

export default async function MessagesPage() {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();
  const user = session?.user ?? null;
  const result = user ? await getMyMessageRooms().then((rooms) => ({ rooms, failed: false })).catch(() => ({ rooms: [], failed: true })) : { rooms: [], failed: false };
  const { rooms, failed } = result;
  return <SiteFrame user={user}>
    <main className="page-wrap narrow-page">
      <section className="page-intro"><div><div className="eyebrow eyebrow--dark">1:1 MESSAGES</div><h1>쪽지함</h1><p>개인 연락처 공개 없이 닉네임으로 대화하세요.</p></div></section>
      {!user ? <section className="empty-state"><h2>로그인이 필요합니다</h2><Link className="button button--primary" href="/login?callbackUrl=%2Fmessages">로그인하기</Link></section> : <>
        <section className={styles.panel}><h2>새 대화</h2><StartConversationForm /></section>
        <section className={styles.panel} aria-label="내 대화방">
          <div className={styles.heading}><h2>내 대화방</h2><RefreshMessagesButton /></div>
          {failed ? <p role="alert">쪽지함을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p> : rooms.length === 0 ? <p>아직 대화가 없습니다. 상대 닉네임으로 대화를 시작해 보세요.</p> :
            <ul className={styles.rooms}>{rooms.map((room) => <li key={room.id}><Link href={`/messages/${room.id}`} className={styles.room}>
              <strong>{room.nickname}</strong><time dateTime={room.lastMessageAt.toISOString()}>{room.lastMessageAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
              <p>{room.lastMessage || "첫 쪽지를 보내 보세요."}</p>
            </Link></li>)}</ul>}
        </section>
      </>}
    </main>
  </SiteFrame>;
}
