"use client";

import Link from "next/link";
import { useActionState } from "react";
import { POST_CATEGORIES, POST_CATEGORY_LABELS } from "@/lib/community-types";
import type { PostCategory } from "@/lib/community-types";
import type { CommunityActionState } from "@/lib/community-validation";

export type PostFormAction = (previousState: CommunityActionState, formData: FormData) => Promise<CommunityActionState>;
const initialState: CommunityActionState = {};

export function PostForm({
  action,
  initialValues,
  cancelHref = "/community",
}: {
  action: PostFormAction;
  initialValues?: { category: PostCategory; title: string; content: string };
  cancelHref?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return <form action={formAction} className="entry-form community-entry-form" noValidate>
    {state.message ? <p className="auth-message" role="status">{state.message}</p> : null}
    <label className="auth-field">카테고리
      <select name="category" defaultValue={initialValues?.category ?? "FREE"} required>
        {POST_CATEGORIES.map((category) => <option key={category} value={category}>{POST_CATEGORY_LABELS[category]}</option>)}
      </select>
      {state.fieldErrors?.category?.[0] ? <small>{state.fieldErrors.category[0]}</small> : null}
    </label>
    <label className="auth-field">제목
      <input name="title" maxLength={100} defaultValue={initialValues?.title} placeholder="제목을 입력해 주세요." required />
      {state.fieldErrors?.title?.[0] ? <small>{state.fieldErrors.title[0]}</small> : null}
    </label>
    <label className="auth-field">내용
      <textarea name="content" maxLength={10000} rows={12} defaultValue={initialValues?.content} placeholder="전공과 학교생활에 대한 이야기를 나눠 보세요." required />
      {state.fieldErrors?.content?.[0] ? <small>{state.fieldErrors.content[0]}</small> : null}
    </label>
    <p className="form-notice">다른 사람을 존중하는 표현을 사용해 주세요. HTML 코드는 일반 텍스트로 표시됩니다.</p>
    <div className="community-form-actions"><Link className="button button--ghost" href={cancelHref}>취소</Link><button className="button button--primary" type="submit" disabled={isPending}>{isPending ? "저장 중…" : initialValues ? "수정 완료" : "게시글 등록"}</button></div>
  </form>;
}
