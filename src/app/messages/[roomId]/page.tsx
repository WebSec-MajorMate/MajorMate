import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { RefreshMessagesButton, SendMessageForm } from "@/components/messages/MessageForms";
import { isAuthConfigured } from "@/lib/auth-config";
import { getMyConversation } from "@/lib/messages";
import styles from "../messages.module.css";

export const instant = false;

export default async function ConversationPage({ params, searchParams }: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fmessages");
  const { roomId } = await params;
  const { before } = await searchParams;
  const { conversation, failed } = await getMyConversation(roomId, before)
    .then((conversation) => ({ conversation, failed: false }))
    .catch(() => ({ conversation: null, failed: true }));
  if (!failed && !conversation) notFound();
  return <SiteFrame user={session.user}>
    <main className="page-wrap narrow-page">
      <Link href="/messages" className="back-link">← 쪽지함</Link>
      {failed || !conversation ? <section className={styles.panel}><p role="alert">대화를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p><RefreshMessagesButton /></section> : <>
        <section className={styles.panel}>
          <div className={styles.heading}><h1>{conversation.nickname}님과의 대화</h1><RefreshMessagesButton /></div>
          {before && <Link href={`/messages/${roomId}`}>최신 쪽지 보기</Link>}
          {conversation.olderCursor && <Link href={`/messages/${roomId}?before=${conversation.olderCursor}`}>이전 쪽지 보기</Link>}
          {conversation.messages.length === 0 ? <p>첫 쪽지를 보내 대화를 시작해 보세요.</p> : <ol className={styles.messages}>{conversation.messages.map((message) => <li key={message.id} className={message.mine ? styles.mine : styles.theirs}>
            <small>{message.mine ? "나" : conversation.nickname}</small><p>{message.content}</p><time dateTime={message.createdAt.toISOString()}>{message.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
          </li>)}</ol>}
        </section>
        <section className={styles.panel}>{conversation.canSend ? <SendMessageForm roomId={roomId} /> : <p>탈퇴한 사용자에게는 쪽지를 보낼 수 없습니다.</p>}</section>
      </>}
    </main>
  </SiteFrame>;
}
