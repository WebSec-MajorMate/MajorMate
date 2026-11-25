"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { removeProfileActivity } from "@/app/actions/profile-activities";

const iconPaths = {
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z",
  delete: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6m4-6v6",
  download: "M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4",
};

function ActionLabel({ name, label }: { name: keyof typeof iconPaths; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}>
        <path d={iconPaths[name]} />
      </svg>
      <span>{label}</span>
    </span>
  );
}

export function ProfileActivityMenu({ id, title }: { id: string; title: string }) {
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function remove() {
    if (!window.confirm("이 활동과 첨부한 증빙 파일을 삭제할까요?")) return;
    startTransition(async () => {
      try {
        const error = await removeProfileActivity(id);
        if (error) window.alert(error);
        else setOpen(false);
      } catch {
        window.alert("활동을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="profile-activity-menu" ref={menu} onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
      <button ref={trigger} type="button" className="profile-activity-menu-trigger"
        aria-label={`${title} 관리`} aria-expanded={open} aria-controls={`profile-menu-${id}`}
        onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <div className="profile-activity-menu-items" id={`profile-menu-${id}`}>
          <Link href={`/my/activities/new?edit=${id}`}><ActionLabel name="edit" label="수정하기" /></Link>
          <button type="button" onClick={remove} disabled={pending}>
            <ActionLabel name="delete" label={pending ? "삭제 중…" : "삭제하기"} />
          </button>
          <a href={`/api/profile-activities/${id}/evidence`}><ActionLabel name="download" label="증빙 파일 받기" /></a>
        </div>
      )}
    </div>
  );
}
