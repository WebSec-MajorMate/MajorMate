"use client";

import Link from "next/link";
import { AttachmentsInput } from "@/components/community/AttachmentsInput";
import { useActionState, useEffect, useState } from "react";
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
  initialValues?: { category: PostCategory; title: string; content: string; tags?: string[]; attachmentIds?: string[]; isAnonymous?: boolean };
  cancelHref?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "FREE");
  const [anonymous, setAnonymous] = useState(initialValues?.isAnonymous ?? false);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty && !isPending) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (dirty && !isPending && target && !window.confirm("작성 중인 내용을 버리고 나갈까요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    const back = () => { if (dirty && !isPending && !window.confirm("작성 중인 내용을 버리고 나갈까요?")) history.forward(); };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true); window.addEventListener("popstate", back);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); window.removeEventListener("popstate", back); };
  }, [dirty, isPending]);
  return <form onChange={() => setDirty(true)} action={formAction} className="entry-form community-entry-form" noValidate>
    {state.message ? <p className="auth-message" role="status">{state.message}</p> : null}
    <label className="auth-field">카테고리
      <select name="category" value={category} onChange={event => setCategory(event.target.value as PostCategory)} required>
        {POST_CATEGORIES.map((category) => <option key={category} value={category}>{POST_CATEGORY_LABELS[category]}</option>)}
      </select>
      {state.fieldErrors?.category?.[0] ? <small>{state.fieldErrors.category[0]}</small> : null}
    </label>
    <label className="auth-field">제목
      <input name="title" minLength={2} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="제목을 입력해 주세요." required />
      {state.fieldErrors?.title?.[0] ? <small>{state.fieldErrors.title[0]}</small> : null}
    </label>
    <label className="auth-field">내용
      <textarea name="content" minLength={5} maxLength={5000} rows={12} value={content} onChange={event => setContent(event.target.value)} placeholder="전공과 학교생활에 대한 이야기를 나눠 보세요." required />
      {state.fieldErrors?.content?.[0] ? <small>{state.fieldErrors.content[0]}</small> : null}
    </label>
    {initialValues?.tags?.length ? <input type="hidden" name="tags" value={initialValues.tags.join(",")} /> : null}
    <label className="community-checkbox"><input type="checkbox" name="isAnonymous" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} disabled={!!initialValues} />익명으로 작성 {initialValues ? "(작성 후 익명 여부는 변경할 수 없어요)" : ""}</label>
    <AttachmentsInput initialIds={initialValues?.attachmentIds} onBusyChange={setUploading} onDirty={() => setDirty(true)} />
    <div className="community-form-actions"><Link className="button button--ghost" href={cancelHref}>취소</Link><button className="button button--primary" type="submit" disabled={isPending || uploading}>{isPending ? "저장 중…" : initialValues ? "수정 완료" : "게시글 등록"}</button></div>
  </form>;
}
