"use client";

import { useActionState } from "react";
import type { CommunityActionState } from "@/lib/community-validation";

export type CommentFormAction = (previousState: CommunityActionState, formData: FormData) => Promise<CommunityActionState>;
const initialState: CommunityActionState = {};

export function CommentForm({
  action,
  initialContent = "",
  isEdit = false,
}: {
  action: CommentFormAction;
  initialContent?: string;
  isEdit?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return <form action={formAction} className={`entry-form comment-form${isEdit ? " comment-form--edit" : ""}`} noValidate>
    <label className="auth-field">{isEdit ? "댓글 수정" : "댓글 작성"}
      <textarea name="content" minLength={1} maxLength={1000} rows={isEdit ? 3 : 4} defaultValue={initialContent} placeholder="댓글을 입력해 주세요." required />
      {state.fieldErrors?.content?.[0] ? <small>{state.fieldErrors.content[0]}</small> : null}
    </label>
    {state.message ? <p className={`auth-message${state.success ? " auth-message--success" : ""}`} role={state.success ? "status" : "alert"}>{state.message}</p> : null}
    <button className="button button--primary" type="submit" disabled={isPending}>{isPending ? "저장 중…" : isEdit ? "댓글 수정" : "댓글 등록"}</button>
  </form>;
}
