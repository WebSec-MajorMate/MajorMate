"use client";
/* eslint-disable @next/next/no-img-element -- Original same-origin bytes preserve private draft authorization and no-store semantics. */
import { useState } from "react";
import { COMMUNITY_IMAGE_TYPES, MAX_COMMUNITY_IMAGE_BYTES } from "@/lib/community-images";
export function AttachmentsInput({ initialIds = [], onBusyChange, onDirty }: { initialIds?: string[]; onDirty: () => void; onBusyChange: (busy: boolean) => void }) {
 const [ids, setIds] = useState(initialIds);
 const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
 return <section className="community-upload"><label>이미지 첨부 (최대 4장 · 각 5MB)
  <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || ids.length >= 4} onChange={async event => {
   const files = Array.from(event.target.files ?? []); event.target.value = "";
   if (ids.length + files.length > 4) { setMessage("이미지는 최대 4장까지 첨부할 수 있어요."); return; }
   if (files.some(file => !/\.(jpe?g|png|webp)$/i.test(file.name) || !COMMUNITY_IMAGE_TYPES.includes(file.type) || file.size > MAX_COMMUNITY_IMAGE_BYTES || !file.size)) { setMessage("JPEG, PNG, WebP 형식의 5MB 이하 이미지만 첨부해 주세요."); return; }
   setBusy(true); onBusyChange(true); setMessage("");
   try {
    for (const file of files) {
     const response = await fetch("/api/community/attachments", { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file });
     const result = await response.json();
     if (!response.ok) throw new Error(result.message ?? "업로드에 실패했습니다.");
     setIds(previous => [...previous, result.id]); onDirty();
    }
   } catch (error) { setMessage(error instanceof Error ? error.message : "이미지를 저장하지 못했습니다."); }
   finally { setBusy(false); onBusyChange(false); }
  }} />
 </label><input type="hidden" name="attachmentIds" value={ids.join(",")} />
 <p className="form-notice">새 이미지는 임시 저장되며 게시글 등록·수정 시 연결됩니다. 사용하지 않은 임시 이미지는 24시간 뒤 정리됩니다.</p>
 <div className="community-attachments">{ids.map((id,index) => <div key={id}><AttachmentImage id={id} index={index} /><button className="community-control" type="button" disabled={busy} onClick={() => { setIds(previous => previous.filter(value => value !== id)); onDirty(); }} aria-label={`첨부 이미지 ${index + 1} 제거`}>제거 (저장 시 반영)</button></div>)}</div>
 {busy ? <p role="status">이미지를 안전하게 저장하고 있어요…</p> : null}{message ? <p role="alert">{message}</p> : null}
 </section>;
}
export function AttachmentImage({ id, index }: { id: string; index: number }) {
 const [failed, setFailed] = useState(false);
 return failed ? <p role="status">첨부 이미지 {index + 1}를 불러오지 못했습니다.</p> : <a href={`/api/community/attachments/${id}`} target="_blank" rel="noopener noreferrer" aria-label={`첨부 이미지 ${index + 1} 확대 (새 탭)`}><img src={`/api/community/attachments/${id}`} alt={`게시글 첨부 이미지 ${index + 1}`} loading="lazy" onError={() => setFailed(true)} /></a>;
}
