"use client";
import { useActionState, useState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { communityCommandAction } from "@/app/actions/community";
import type { CommunityActionState } from "@/lib/community-validation";
import type { ReactNode } from "react";

function PendingButton({ children, pressed, label }: { children: ReactNode; pressed?: boolean; label?: string }) {
 const { pending } = useFormStatus();
 return <button className="community-control" type="submit" disabled={pending} aria-pressed={pressed} aria-label={label}>{pending ? "처리 중…" : children}</button>;
}
export function CommandForm({ fields, children, pressed, label }: { fields: Record<string, string>; children: ReactNode; pressed?: boolean; label?: string }) {
 const [state, action] = useActionState(communityCommandAction, {} as CommunityActionState);
 return <form action={action} className="community-command">
  {Object.entries(fields).map(([name, value]) => <input type="hidden" name={name} value={value} key={name} />)}
  <PendingButton pressed={pressed} label={label}>{children}</PendingButton>
  {state.message && !state.success ? <small role="alert">{state.message}</small> : null}
 </form>;
}
export function ReportForm({ postId, targetId, targetType = "POST" }: { postId: string; targetId?: string; targetType?: string }) {
 const [state, action, pending] = useActionState(communityCommandAction, {} as CommunityActionState);
 return <details className="community-report"><summary>신고</summary><form action={action}>
  <input type="hidden" name="op" value="report" /><input type="hidden" name="postId" value={postId} />
  <input type="hidden" name="targetId" value={targetId ?? postId} /><input type="hidden" name="targetType" value={targetType} />
  <label>신고 사유<select name="reason" required><option value="ABUSE">욕설·혐오</option><option value="SPAM">스팸</option><option value="PRIVACY">개인정보</option><option value="OTHER">기타</option></select></label>
  <label>상세 사유<textarea name="detail" maxLength={500} placeholder="기타 선택 시 사유를 입력해 주세요." /></label>
  <button className="button button--ghost" disabled={pending}>{pending ? "접수 중…" : "신고 접수"}</button>
  {state.message ? <p role="status">{state.message}</p> : null}
 </form></details>;
}
export function ConfirmDelete({ action, label = "삭제" }: { action: (data: FormData) => Promise<void>; label?: string }) {
 const [open, setOpen] = useState(false);
 const modal = useRef<HTMLDialogElement>(null);
 const [error, setError] = useState("");
 useEffect(() => { if (open) modal.current?.showModal(); }, [open]);
 return <><button className="text-button text-button--danger" type="button" onClick={() => setOpen(true)}>{label}</button>
 {open ? <dialog ref={modal} onCancel={() => setOpen(false)} className="community-confirm" aria-labelledby="delete-title"><h2 id="delete-title">삭제하시겠어요?</h2><p>삭제한 내용은 복구할 수 없습니다.</p><p role="alert">{error}</p><form action={async data => { try { await action(data); setOpen(false); } catch (error) { if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error; setError("삭제하지 못했습니다. 다시 시도해 주세요."); } }}><PendingButton>삭제하기</PendingButton><button type="button" className="button button--ghost" autoFocus onClick={() => setOpen(false)}>취소</button></form></dialog> : null}</>;
}
export function CopyPostLink() {
 const [message, setMessage] = useState("");
 return <><button className="community-control" onClick={async () => { try { await navigator.clipboard.writeText(location.href); setMessage("링크를 복사했습니다."); } catch { setMessage("주소창의 링크를 복사해 주세요."); } }}>링크 복사</button><span role="status">{message}</span></>;
}
