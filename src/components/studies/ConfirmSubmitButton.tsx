"use client";

import { MouseEvent, ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  confirmMessage: string;
  className?: string;
  children: ReactNode;
};

// 삭제·탈퇴처럼 되돌리기 어려운 작업 전에 확인 창을 띄우는 제출 버튼입니다.
export function ConfirmSubmitButton({ confirmMessage, className, children }: ConfirmSubmitButtonProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmMessage)) event.preventDefault();
  }

  return <button type="submit" className={className} onClick={handleClick}>{children}</button>;
}
