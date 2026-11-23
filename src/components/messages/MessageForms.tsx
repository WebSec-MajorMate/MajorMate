"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessageAction, startConversationAction } from "@/app/actions/messages";
import type { MessageActionState } from "@/lib/message-validation";

const initialState: MessageActionState = {};

export function StartConversationForm() {
  const [state, action, pending] = useActionState(startConversationAction, initialState);
  return <form action={action} className="entry-form">
    <label>상대 닉네임<input name="nickname" minLength={2} maxLength={20} placeholder="정확한 닉네임을 입력해 주세요" required /></label>
    {state.error && <p role="alert">{state.error}</p>}
    <button className="button button--primary" disabled={pending}>{pending ? "대화방 여는 중…" : "대화 시작"}</button>
  </form>;
}

export function SendMessageForm({ roomId }: { roomId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = async (previous: MessageActionState, data: FormData) => {
    const result = await sendMessageAction(roomId, previous, data);
    if (result.success) formRef.current?.reset();
    return result;
  };
  const [state, formAction, pending] = useActionState(action, initialState);
  return <form ref={formRef} action={formAction} className="entry-form">
    <label>쪽지 내용<textarea name="content" rows={4} maxLength={2000} required placeholder="쪽지를 입력해 주세요 (최대 2000자)" /></label>
    {state.error && <p role="alert">{state.error}</p>}
    {state.success && <p role="status">쪽지를 보냈습니다.</p>}
    <button className="button button--primary" disabled={pending}>{pending ? "보내는 중…" : "쪽지 보내기"}</button>
  </form>;
}

export function RefreshMessagesButton() {
  const router = useRouter();
  return <button className="button" type="button" onClick={() => router.refresh()}>새 쪽지 확인</button>;
}
