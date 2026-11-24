"use client";

import { useActionState } from "react";
import { updateStudyAction } from "@/app/actions/studies";
import { MEETING_DAYS, STUDY_CATEGORIES } from "@/lib/study-constants";
import { StudyActionState } from "@/lib/study-validation";
import { StudySummary } from "@/lib/studies";

const initialState: StudyActionState = {};

export function EditStudyForm({ study }: { study: StudySummary }) {
  const action = updateStudyAction.bind(null, study.id);
  const [state, formAction, isPending] = useActionState(action, initialState);
  // 제출 실패 시 서버가 돌려준 입력값을 우선 사용하고, 없으면 저장된 스터디 값을 보여준다.
  const values = state.values;
  // select는 defaultValue만 바꾸면 제출 후 폼 초기화 때 이전 값으로 돌아가므로, 값이 바뀌면 key로 다시 만든다.

  return <form action={formAction} className="entry-form study-entry-form" noValidate>
    {state.message ? <p className="auth-message" role="alert">{state.message}</p> : null}
    <label>스터디 제목<input name="title" maxLength={100} defaultValue={values?.title ?? study.title} required />{state.fieldErrors?.title?.[0] ? <small>{state.fieldErrors.title[0]}</small> : null}</label>
    <div className="form-two"><label>카테고리<select key={`category-${values?.category ?? ""}`} name="category" defaultValue={values?.category ?? study.category}>{STUDY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>{state.fieldErrors?.category?.[0] ? <small>{state.fieldErrors.category[0]}</small> : null}</label><label>과목 또는 주제<input name="subject" maxLength={60} defaultValue={values?.subject ?? study.subject} required />{state.fieldErrors?.subject?.[0] ? <small>{state.fieldErrors.subject[0]}</small> : null}</label></div>
    <label>스터디 소개<textarea name="description" rows={6} maxLength={2000} defaultValue={values?.description ?? study.description} required />{state.fieldErrors?.description?.[0] ? <small>{state.fieldErrors.description[0]}</small> : null}</label>
    <fieldset className="study-days"><legend>모임 요일</legend><div>{MEETING_DAYS.map((day) => <label key={day}><input name="meetingDays" type="checkbox" value={day} defaultChecked={(values?.meetingDays ?? study.meetingDays).includes(day)} />{day}</label>)}</div>{state.fieldErrors?.meetingDays?.[0] ? <small>{state.fieldErrors.meetingDays[0]}</small> : null}</fieldset>
    <div className="form-two"><label>모임 시간<input name="meetingTime" maxLength={60} defaultValue={values?.meetingTime ?? study.meetingTime} required />{state.fieldErrors?.meetingTime?.[0] ? <small>{state.fieldErrors.meetingTime[0]}</small> : null}</label><label>진행 방식<select key={`meetingType-${values?.meetingType ?? ""}`} name="meetingType" defaultValue={values?.meetingType ?? study.meetingType}><option value="ONLINE">온라인</option><option value="OFFLINE">오프라인</option></select></label></div>
    <label>최대 인원<input name="maxMembers" type="number" min={Math.max(2, study.currentMembers)} max="20" defaultValue={values?.maxMembers ?? study.maxMembers} required />{state.fieldErrors?.maxMembers?.[0] ? <small>{state.fieldErrors.maxMembers[0]}</small> : null}</label>
    <p className="form-notice">현재 참여 인원({study.currentMembers}명)보다 적게는 줄일 수 없습니다.</p>
    <button className="button button--primary button--wide" type="submit" disabled={isPending}>{isPending ? "저장 중…" : "수정 내용 저장"}</button>
  </form>;
}
