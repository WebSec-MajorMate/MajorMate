"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { ChatConversation, ChatFrame, ChatMessage } from "@/lib/chat-types";
import { isNearChatBottom, mergeChatMessages, observedReadBoundary } from "@/lib/chat-client";
import { StartConversationForm } from "./MessageForms";
import styles from "@/app/messages/messages.module.css";

type PendingMessage = ChatMessage & { status: "sending" | "failed"; error?: string };
const time = (date: string) => new Date(date).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
const day = (date: string) => new Date(date).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data as T;
}

export function ChatInbox({ roomId, initial, failed, nickname, userId }: {
  roomId?: string; initial: ChatFrame; failed: boolean; nickname: string; userId: string;
}) {
  const [rooms, setRooms] = useState(initial.rooms);
  const [conversation, setConversation] = useState(initial.conversation);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [error, setError] = useState(failed ? "대화를 불러오지 못했습니다. 다시 연결하고 있어요." : "");
  const [search, setSearch] = useState("");
  const [newChat, setNewChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [retryConnection, setRetryConnection] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef(true);
  const conversationRef = useRef(conversation);
  // A local send acknowledgement can jump past unseen messages; only a completed
  // server synchronization advances this cursor.
  const syncedCursor = useRef(initial.conversation?.messages.at(-1)?.sequence ?? 0);
  const renderedMessages = useRef<ChatMessage[]>([]);
  const readThrough = useRef(0);
  const sending = useRef(new Set<string>());
  const olderInFlight = useRef(false);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const active = useRef(true);
  const storageReady = useRef(false);
  const abortRequests = useRef<AbortController | null>(null);
  const draftKey = `majormate:dm-draft:${userId}:${roomId}`;

  useEffect(() => {
    active.current = true;
    abortRequests.current = new AbortController();
    // Storage can be unavailable in private browsing; chatting still works.
    Promise.resolve().then(() => {
      if (!active.current) return;
      try {
        const saved = sessionStorage.getItem(draftKey);
        if (saved) setDraft(saved);
        const outbox: PendingMessage[] = JSON.parse(sessionStorage.getItem(`${draftKey}:outbox`) ?? "[]");
        if (Array.isArray(outbox)) setPending(outbox.filter((message) => typeof message?.id === "string" && typeof message.content === "string" && message.content.length <= 2000)
          .map((message) => ({ ...message, status: "failed", error: "이전 전송 결과를 확인하려면 다시 보내기를 눌러 주세요." })));
      } catch {}
      storageReady.current = true;
    });
    return () => { active.current = false; abortRequests.current?.abort(); };
  }, [draftKey]);

  useEffect(() => {
    if (!storageReady.current) return;
    try {
      if (pending.length) sessionStorage.setItem(`${draftKey}:outbox`, JSON.stringify(pending));
      else sessionStorage.removeItem(`${draftKey}:outbox`);
    } catch {}
  }, [pending, draftKey]);

  function changeDraft(value: string) {
    setDraft(value);
    try { if (value) sessionStorage.setItem(draftKey, value); else sessionStorage.removeItem(draftKey); } catch {}
  }

  const markRead = useCallback(async (force = false) => {
    const through = observedReadBoundary(renderedMessages.current, syncedCursor.current, renderedMessages.current.at(-1)?.sequence ?? 0);
    if (!roomId || !through || !bottom.current || document.visibilityState !== "visible" || (!force && through <= readThrough.current)) return;
    readThrough.current = through;
    try {
      await jsonRequest("/api/messages/read", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, through }), signal: abortRequests.current?.signal });
      if (active.current) setRooms((previous) => previous.map((room) => room.id === roomId ? { ...room, unreadCount: 0 } : room));
    } catch { if (readThrough.current === through) readThrough.current = 0; }
  }, [roomId]);

  useEffect(() => {
    let source: EventSource | null = null;
    let disposed = false;
    let queue = Promise.resolve();
    const controller = new AbortController();
    const connect = () => {
      source?.close();
      if (disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
      source = new EventSource(`/api/messages/stream${roomId ? `?roomId=${roomId}` : ""}`);
      source.addEventListener("snapshot", (event: MessageEvent) => {
        const frame: ChatFrame = JSON.parse(event.data);
        queue = queue.then(async () => {
          if (disposed) return;
          let incoming = frame.conversation;
          // Recover all missed room sequences before advancing synchronization.
          if (roomId && incoming?.messages.length) {
            let cursor = syncedCursor.current;
            const newest = incoming.messages.at(-1)!.sequence;
            const recovered: ChatMessage[] = [];
            while (cursor < newest) {
              const batch = await jsonRequest<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/messages?roomId=${roomId}&after=${cursor}`, { signal: controller.signal });
              recovered.push(...batch.messages);
              const next = batch.messages.at(-1)?.sequence;
              if (!batch.hasMore || !next || next <= cursor) break;
              cursor = next;
            }
            incoming = { ...incoming, messages: mergeChatMessages(recovered, incoming.messages) };
          }
          if (disposed) return;
          setRooms(frame.rooms);
          if (incoming) {
            syncedCursor.current = Math.max(syncedCursor.current, incoming.messages.at(-1)?.sequence ?? 0);
            const previous = conversationRef.current;
            const messages = mergeChatMessages(previous?.messages ?? [], incoming.messages);
            if (!bottom.current && messages.at(-1)?.id !== previous?.messages.at(-1)?.id) setHasNew(true);
            const next = { ...incoming, messages, olderCursor: previous ? previous.olderCursor : incoming.olderCursor };
            conversationRef.current = next;
            setConversation(next);
            const confirmed = new Set(messages.map((message) => message.clientMessageId));
            setPending((items) => items.filter((message) => !confirmed.has(message.clientMessageId)));
          }
          setError("");
          setConnection("live");
          // Receipts run after React commits this snapshot to the DOM below.
        }).catch(() => { if (!disposed) { setConnection("offline"); setError("연결을 복구하고 있어요. 메시지는 다시 연결되면 동기화됩니다."); } });
      });
      source.addEventListener("unavailable", (event: MessageEvent) => {
        const { status } = JSON.parse(event.data);
        setConnection("offline");
        setError(status === 404 ? "이 대화방에 접근할 수 없습니다." : "대화 연결을 복구하고 있어요.");
        if (status === 404 || status === 401) source?.close();
      });
      source.onerror = () => { if (!disposed) setConnection("offline"); };
    };
    const visibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) { connect(); void markRead(); }
      else { source?.close(); setConnection("offline"); }
    };
    connect();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    return () => {
      disposed = true; source?.close(); controller.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", visibility);
      window.removeEventListener("offline", visibility);
    };
  }, [roomId, markRead, retryConnection]);

  useLayoutEffect(() => {
    renderedMessages.current = conversation?.messages ?? [];
    const element = scroll.current;
    if (!element) return;
    if (prepend.current) {
      element.scrollTop = prepend.current.top + element.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (bottom.current) element.scrollTop = element.scrollHeight;
    void markRead();
  }, [conversation, pending.length, markRead]);

  async function loadOlder() {
    if (!roomId || olderInFlight.current || !conversationRef.current?.olderCursor) return;
    olderInFlight.current = true;
    setLoadingOlder(true);
    try {
      const older = await jsonRequest<ChatConversation>(`/api/messages?roomId=${roomId}&before=${conversationRef.current.olderCursor}`, { signal: abortRequests.current?.signal });
      if (!active.current) return;
      if (scroll.current) prepend.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop };
      const next = { ...conversationRef.current!, olderCursor: older.olderCursor, messages: mergeChatMessages(older.messages, conversationRef.current!.messages) };
      conversationRef.current = next;
      setConversation(next);
    } catch { if (active.current) setError("이전 대화를 불러오지 못했습니다. 다시 시도해 주세요."); }
    finally { olderInFlight.current = false; if (active.current) setLoadingOlder(false); }
  }

  async function deliver(message: PendingMessage) {
    if (!roomId || sending.current.has(message.id)) return;
    sending.current.add(message.id);
    setPending((items) => items.map((item) => item.id === message.id ? { ...item, status: "sending", error: undefined } : item));
    try {
      const confirmed = await jsonRequest<ChatMessage>("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, content: message.content, clientMessageId: message.clientMessageId }), signal: abortRequests.current?.signal });
      if (!active.current) return;
      const current = conversationRef.current;
      if (current) {
        const next = { ...current, messages: mergeChatMessages(current.messages, [confirmed]) };
        conversationRef.current = next;
        setConversation(next);
      }
      setPending((items) => items.filter((item) => item.id !== message.id));
      setRooms((items) => items.map((room) => room.id === roomId ? { ...room, lastMessage: confirmed.content, lastMessageAt: confirmed.createdAt } : room)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)));
    } catch (cause) {
      if (active.current) setPending((items) => items.map((item) => item.id === message.id ? { ...item, status: "failed", error: cause instanceof Error ? cause.message : "전송 실패" } : item));
    } finally { sending.current.delete(message.id); }
  }

  function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || content.length > 2000 || !conversation?.canSend) return;
    const clientMessageId = crypto.randomUUID();
    const message: PendingMessage = { id: clientMessageId, sequence: 0, isRead: false, clientMessageId, content, mine: true, createdAt: new Date().toISOString(), status: "sending" };
    bottom.current = true;
    setHasNew(false);
    setPending((items) => [...items, message]);
    changeDraft("");
    void deliver(message);
    composer.current?.focus();
  }

  function handleKeys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); }
  }

  function jumpToLatest() {
    bottom.current = true;
    setHasNew(false);
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    void markRead();
  }

  const totalUnread = rooms.reduce((sum, room) => sum + room.unreadCount, 0);
  const allMessages = [...(conversation?.messages ?? []), ...pending];
  return <main className={styles.page}>
    <div className={`${styles.shell} ${roomId ? styles.withConversation : ""}`}>
      <aside className={styles.sidebar} aria-label="대화 목록">
        <div className={styles.inboxHeading}><div><span className={styles.eyebrow}>DIRECT MESSAGES</span><h1>메시지 {totalUnread > 0 && <span className={styles.total}>{totalUnread}</span>}</h1></div>
          <button className={styles.newButton} onClick={() => setNewChat(!newChat)} aria-expanded={newChat} aria-label="새 대화 시작">＋</button></div>
        <p className={styles.myName}>{nickname}님의 대화</p>
        {newChat && <section className={styles.start}><h2>새 대화</h2><StartConversationForm /></section>}
        <label className={styles.search}><span className={styles.srOnly}>대화 검색</span><input placeholder="대화 상대 검색" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <nav className={styles.roomList} aria-label="내 대화방">
          {rooms.filter((room) => room.nickname.toLowerCase().includes(search.toLowerCase())).map((room) => <Link key={room.id} href={`/messages/${room.id}`} prefetch={false}
            className={`${styles.room} ${roomId === room.id ? styles.selected : ""}`} aria-current={roomId === room.id ? "page" : undefined}>
            <span className={styles.avatar}>{room.nickname.slice(0, 1)}</span><span className={styles.roomCopy}><strong>{room.nickname}</strong><span>{room.lastMessage || "첫 메시지를 보내 보세요."}</span></span>
            <span className={styles.roomMeta}><time dateTime={room.lastMessageAt}>{time(room.lastMessageAt)}</time>{room.unreadCount > 0 && <span className={styles.badge} aria-label={`안 읽은 메시지 ${room.unreadCount}개`}>{room.unreadCount > 99 ? "99+" : room.unreadCount}</span>}</span>
          </Link>)}
          {rooms.length === 0 && <div className={styles.listEmpty}><p>아직 시작한 대화가 없어요.</p><button onClick={() => setNewChat(true)}>첫 메시지 보내기 ↗</button></div>}
          {rooms.length > 0 && !rooms.some((room) => room.nickname.toLowerCase().includes(search.toLowerCase())) && <p className={styles.listEmpty}>검색 결과가 없습니다.</p>}
        </nav>
        <div className={styles.connection} role="status"><span data-live={connection === "live"} />{connection === "live" ? "메시지 자동 업데이트 중" : connection === "connecting" ? "연결하는 중…" : "다시 연결하는 중…"}
          {connection === "offline" && <button onClick={() => setRetryConnection((value) => value + 1)}>재연결</button>}</div>
      </aside>
      <section className={styles.conversation} aria-label="대화">
        {roomId ? <>
          <header className={styles.chatHeading}><Link href="/messages" className={styles.back} aria-label="대화 목록으로">←</Link><span className={styles.avatar}>{conversation?.nickname.slice(0, 1) ?? "?"}</span><div><h2>{conversation?.nickname ?? "대화 불러오는 중"}</h2><p>MajorMate에서 나누는 1:1 대화</p></div></header>
          {error && <div className={styles.error} role="alert">{error}<button onClick={() => setRetryConnection((value) => value + 1)}>다시 시도</button></div>}
          <div className={styles.timeline} ref={scroll} tabIndex={0} aria-label="메시지 내역" onScroll={() => {
            if (!scroll.current) return;
            bottom.current = isNearChatBottom(scroll.current);
            if (bottom.current) { setHasNew(false); void markRead(); }
            if (scroll.current.scrollTop < 40) void loadOlder();
          }}>
            {conversation?.olderCursor && <button className={styles.older} disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "불러오는 중…" : "이전 대화 불러오기"}</button>}
            {allMessages.length === 0 && conversation && <div className={styles.welcome}><span className={styles.largeAvatar}>{conversation.nickname.slice(0, 1)}</span><h3>{conversation.nickname}님과의 대화</h3><p>가벼운 인사로 대화를 시작해 보세요.</p></div>}
            <ol className={styles.messages} aria-label="대화 메시지">
              {allMessages.map((message, index) => {
                const previous = allMessages[index - 1];
                const pendingMessage = "status" in message ? message as PendingMessage : null;
                const showDay = !previous || day(previous.createdAt) !== day(message.createdAt);
                return <li key={message.id} className={styles.messageRow}>
                  {showDay && <div className={styles.day}>{day(message.createdAt)}</div>}
                  <div className={message.mine ? styles.mine : styles.theirs}>
                    <p className={styles.bubble}>{message.content}</p><div className={styles.messageMeta}><time dateTime={message.createdAt}>{time(message.createdAt)}</time>
                      {message.mine && <span>{pendingMessage ? pendingMessage.status === "sending" ? "전송 중…" : "전송 실패" : message.isRead || (conversation?.readThrough && message.sequence <= conversation.readThrough) ? "읽음" : "전송됨"}</span>}</div>
                    {pendingMessage?.status === "failed" && <div className={styles.retry}><span>{pendingMessage.error}</span><button onClick={() => void deliver(pendingMessage)}>다시 보내기</button><button onClick={() => setPending((items) => items.filter((item) => item.id !== message.id))}>지우기</button></div>}
                  </div>
                </li>;
              })}
            </ol>
          </div>
          {hasNew && <button className={styles.newMessages} onClick={jumpToLatest}>새 메시지 ↓</button>}
          {conversation?.canSend ? <form className={styles.composer} onSubmit={send}>
            <label className={styles.srOnly} htmlFor="message-content">메시지 입력</label><textarea id="message-content" ref={composer} rows={2} maxLength={2000} placeholder="메시지를 입력하세요…" value={draft} onChange={(event) => changeDraft(event.target.value)} onKeyDown={handleKeys} />
            <div className={styles.composerBottom}><span>Enter 전송 · Shift+Enter 줄바꿈 <small>{draft.length}/2000</small></span><button disabled={!draft.trim()} type="submit">보내기 ↑</button></div>
          </form> : conversation && <p className={styles.closed}>탈퇴한 사용자에게는 메시지를 보낼 수 없습니다.</p>}
        </> : <div className={styles.empty}><div className={styles.emptyIcon}>↗</div><span className={styles.eyebrow}>A LITTLE HELLO, A NEW CONNECTION</span><h2>대화가 시작되는 곳</h2><p>스터디 이야기부터 궁금했던 질문까지.<br />MajorMate 친구에게 메시지를 보내 보세요.</p><button onClick={() => setNewChat(true)}>새 메시지 보내기</button>{error && <p role="alert">{error}</p>}</div>}
      </section>
    </div>
  </main>;
}
