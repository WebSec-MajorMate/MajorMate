"use client";

import { useTransition } from "react";
import { setActivityFavorite } from "@/app/actions/activity-favorites";

export function FavoriteButton({ url, selected, loggedIn }: {
  url: string;
  selected: boolean;
  loggedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!loggedIn) {
      window.alert("로그인이 필요합니다");
      return;
    }
    startTransition(async () => {
      try {
        const message = await setActivityFavorite(url, !selected);
        if (message) window.alert(message);
      } catch {
        window.alert("즐겨찾기를 변경하지 못했습니다. 다시 시도해 주세요.");
      }
    });
  }

  return (
    <button type="button" className="activities-favorite" aria-pressed={selected}
      aria-label={selected ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"} disabled={pending} onClick={toggle}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
        fill={selected ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2"
        strokeLinejoin="round" strokeLinecap="round">
        <path d="m12 3.4 2.6 5.4 6 .9-4.3 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9-4.3-4.2 6-.9L12 3.4Z" />
      </svg>
    </button>
  );
}
