"use client";

import { useActionState } from "react";
import { createStudyAction } from "@/app/actions/studies";
import { MEETING_DAYS, STUDY_CATEGORIES } from "@/lib/study-constants";
import { StudyActionState } from "@/lib/study-validation";

const initialState: StudyActionState = {};

export function CreateStudyForm() {
  const [state, formAction, isPending] = useActionState(createStudyAction, initialState);
  // 제출 실패 시 서버가 돌려준 입력값을 다시 채워 사용자가 쓴 내용이 사라지지 않게 한다.
  const values = state.values;
  // select는 defaultValue만 바꾸면 제출 후 폼 초기화 때 이전 값으로 돌아가므로, 값이 바뀌면 key로 다시 만든다.

  return <form action={formAction} className="entry-form study-entry-form" noValidate>
    {state.message ? <p className="auth-message" role="alert">{state.message}</p> : null}
    <label>스터디 제목<input name="title" maxLength={100} placeholder="예: 웹 보안 실습 같이 끝내요" defaultValue={values?.title ?? ""} required />{state.fieldErrors?.title?.[0] ? <small>{state.fieldErrors.title[0]}</small> : null}</label>
    <div className="form-two"><label>카테고리<select key={`category-${values?.category ?? ""}`} name="category" defaultValue={values?.category ?? "전공"}>{STUDY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>{state.fieldErrors?.category?.[0] ? <small>{state.fieldErrors.category[0]}</small> : null}</label><label>과목 또는 주제<input name="subject" maxLength={60} placeholder="예: 웹 보안" defaultValue={values?.subject ?? ""} required />{state.fieldErrors?.subject?.[0] ? <small>{state.fieldErrors.subject[0]}</small> : null}</label></div>
    <label>스터디 소개<textarea name="description" rows={6} maxLength={2000} placeholder="목표, 진행 방식, 함께할 내용을 적어 주세요." defaultValue={values?.description ?? ""} required />{state.fieldErrors?.description?.[0] ? <small>{state.fieldErrors.description[0]}</small> : null}</label>
    <fieldset className="study-days"><legend>모임 요일</legend><div>{MEETING_DAYS.map((day) => <label key={day}><input name="meetingDays" type="checkbox" value={day} defaultChecked={values?.meetingDays.includes(day) ?? false} />{day}</label>)}</div>{state.fieldErrors?.meetingDays?.[0] ? <small>{state.fieldErrors.meetingDays[0]}</small> : null}</fieldset>
    <div className="form-two"><label>모임 시간<input name="meetingTime" maxLength={60} placeholder="예: 19:00 - 21:00" defaultValue={values?.meetingTime ?? ""} required />{state.fieldErrors?.meetingTime?.[0] ? <small>{state.fieldErrors.meetingTime[0]}</small> : null}</label><label>진행 방식<select key={`meetingType-${values?.meetingType ?? ""}`} name="meetingType" defaultValue={values?.meetingType ?? "ONLINE"}><option value="ONLINE">온라인</option><option value="OFFLINE">오프라인</option></select></label></div>
    <label>최대 인원<input name="maxMembers" type="number" min="2" max="20" defaultValue={values?.maxMembers ?? "4"} required />{state.fieldErrors?.maxMembers?.[0] ? <small>{state.fieldErrors.maxMembers[0]}</small> : null}</label>
    <p className="form-notice">모집글을 등록한 본인은 첫 멤버로 자동 반영됩니다.</p>
    <button className="button button--primary button--wide" type="submit" disabled={isPending}>{isPending ? "등록 중…" : "스터디 모집글 등록"}</button>
  </form>;
}
