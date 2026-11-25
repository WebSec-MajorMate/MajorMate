"use client";

import { type KeyboardEvent, useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addProfileActivity } from "@/app/actions/profile-activities";

export function ActivityForm({ options, edit }: {
  options: { url: string; title: string; category: string }[];
  edit?: { id: string; url: string; title: string; evidenceType: string };
}) {
  const [state, submit, pending] = useActionState(addProfileActivity, { message: "" });
  const [query, setQuery] = useState(edit?.title ?? "");
  const [selectedUrl, setSelectedUrl] = useState(edit?.url ?? "");
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fileName, setFileName] = useState("");
  const [missingEvidence, setMissingEvidence] = useState(false);
  const evidenceInput = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const terms = selectedUrl ? [] : query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = options.filter(({ title, category }) => {
    const searchable = `${title} ${category}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  useEffect(() => {
    if (open && activeIndex >= 0) {
      list.current?.children.item(activeIndex)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function choose(option: (typeof options)[number]) {
    setSelectedUrl(option.url);
    setQuery(option.title);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (matches.length) {
        setActiveIndex((index) => event.key === "ArrowDown"
          ? Math.min(index + 1, matches.length - 1)
          : index < 0 ? matches.length - 1 : Math.max(index - 1, 0));
      }
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (matches[activeIndex]) choose(matches[activeIndex]);
    }
  }
  const format = edit?.evidenceType === "application/pdf" ? "PDF"
    : edit?.evidenceType === "image/png" ? "PNG" : "JPG";
  return (
    <form className="entry-form" action={submit} onReset={() => setFileName("")}
      onSubmit={(event) => {
        if (!evidenceInput.current?.files?.[0]) {
          event.preventDefault();
          setMissingEvidence(true);
        }
      }}>
      {edit && <input type="hidden" name="editId" value={edit.id} />}
      <div className="profile-activity-picker" ref={picker}>
        <label htmlFor="profile-activity-search">참여한 공모전 또는 활동</label>
        <input id="profile-activity-search" type="text" role="combobox" value={query}
          placeholder="목록에서 선택하거나 검색" autoComplete="off"
          aria-autocomplete="list" aria-controls="profile-activity-options" aria-expanded={open}
          aria-activedescendant={open && matches[activeIndex] ? `profile-activity-option-${activeIndex}` : undefined}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onBlur={() => setActiveIndex(-1)}
          onKeyDown={handleKeys}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedUrl("");
            setActiveIndex(-1);
            setOpen(true);
          }} />
        <input name="activity" type="hidden" value={selectedUrl} />
        <ul id="profile-activity-options" ref={list} className="profile-activity-options"
          role="listbox" aria-label="활동 목록" hidden={!open}>
          {matches.map((option, index) => (
            <li key={option.url} id={`profile-activity-option-${index}`} role="option"
              aria-selected={option.url === selectedUrl} data-active={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
              <span>{option.category}</span>{option.title}
            </li>
          ))}
        </ul>
        {open && !matches.length && (
          <p className="profile-activity-no-results" role="status">검색어와 일치하는 활동이 없어요.</p>
        )}
      </div>
      {edit && (
        <div className="profile-edit-current">
          <strong>기존 증빙 파일</strong><small>{format}</small>
        </div>
      )}
      <div className={edit ? "profile-edit-upload" : undefined} style={{ display: "grid", minWidth: 0, gap: 4 }}>
        <input ref={evidenceInput} name="evidence" type="file" hidden style={{ display: "none" }}
          accept="image/png,image/jpeg,application/pdf"
          onChange={(event) => {
            const name = event.currentTarget.files?.[0]?.name ?? "";
            setFileName(name);
            if (name) setMissingEvidence(false);
          }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <button type="button" aria-describedby="profile-evidence-hint"
            onClick={() => evidenceInput.current?.click()}
            style={{ flexShrink: 0, padding: 0, border: 0, background: "transparent", color: "#1d4ed8",
              fontSize: 13, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
            {edit ? "자료 변경하기" : "자료 제출하기"}
          </button>
          {fileName && <span role="status" style={{ minWidth: 0, fontSize: 11, overflowWrap: "anywhere" }}>{fileName}</span>}
        </div>
        <span id="profile-evidence-hint" style={{ fontSize: 10, color: "#626e84" }}>PNG·JPG·PDF, 최대 3MB</span>
        {missingEvidence && <span role="alert" style={{ color: "#b42318", fontSize: 12 }}>증빙 자료를 제출해 주세요.</span>}
      </div>
      <p className="panel-copy">{edit ? "저장하면 현재 증빙 파일이 새 파일로 교체됩니다."
        : "첨부 파일은 본인만 받을 수 있습니다. 저장하면 프로필에 ‘증빙 첨부’로 표시됩니다."}</p>
      {state.message && <p role="alert">{state.message}</p>}
      <div className={edit ? "profile-edit-actions" : undefined}>
        {edit && <Link href="/my#profile-activities" className="profile-edit-cancel">취소</Link>}
        <button type="submit" className="button button--primary" disabled={pending || (!selectedUrl && Boolean(fileName))}>
          {pending ? "저장 중…" : edit ? "변경사항 저장" : "활동 저장"}
        </button>
      </div>
    </form>
  );
}
