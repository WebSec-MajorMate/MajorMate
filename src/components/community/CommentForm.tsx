"use client";

import { useActionState, useState } from "react";
import type { CommunityActionState } from "@/lib/community-validation";

export type CommentFormAction = (previousState: CommunityActionState, formData: FormData) => Promise<CommunityActionState>;
const initialState: CommunityActionState = {};

export function CommentForm({
  action,
  initialContent = "",
  isEdit = false,
  parentId,
}: {
  action: CommentFormAction;
  initialContent?: string;
  isEdit?: boolean;
  parentId?: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [anonymous, setAnonymous] = useState(false);
  const [state, formAction, isPending] = useActionState(async (previous: CommunityActionState, data: FormData) => { const result = await action(previous, data); if (result.success && !isEdit) setContent(""); return result; }, initialState);

  return <form action={formAction} className={`entry-form comment-form${isEdit ? " comment-form--edit" : ""}`} noValidate>
    <label className="auth-field">{isEdit ? "댓글 수정" : "댓글 작성"}
      <textarea name="content" minLength={1} maxLength={1000} rows={isEdit ? 3 : 4} value={content} onChange={event => setContent(event.target.value)} placeholder="댓글을 입력해 주세요." required />
      {state.fieldErrors?.content?.[0] ? <small>{state.fieldErrors.content[0]}</small> : null}
    </label>
    {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
    {!isEdit ? <label className="community-checkbox"><input type="checkbox" name="isAnonymous" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} />익명으로 작성</label> : null}
    {state.message ? <p className={`auth-message${state.success ? " auth-message--success" : ""}`} role={state.success ? "status" : "alert"}>{state.message}</p> : null}
    <button className="button button--primary" type="submit" disabled={isPending}>{isPending ? "저장 중…" : isEdit ? "댓글 수정" : "댓글 등록"}</button>
  </form>;
}
