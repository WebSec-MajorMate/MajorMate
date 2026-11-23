"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { updateProfileAction } from "@/app/actions/profile";
import type { ProfileSnapshot } from "@/lib/profile";
import type { ProfileActionState } from "@/lib/profile-validation";

const initialState: ProfileActionState = {};

const suggestedTags = [
  "온라인 선호",
  "오프라인 선호",
  "평일 저녁",
  "주말 스파르타",
  "자격증",
  "프로젝트",
  "시험 대비",
  "꾸준한 학습",
  "발표·토론",
  "실습 중심",
  "초보 환영",
  "심화 학습",
];

const studyStyleOptions = [
  { value: "ANY", label: "방식 무관" },
  { value: "ONLINE", label: "온라인 선호" },
  { value: "OFFLINE", label: "오프라인 선호" },
  { value: "HYBRID", label: "온·오프라인 모두 가능" },
] as const;

function tagKey(tag: string) {
  return tag.trim().toLocaleLowerCase("ko-KR");
}

type ProfileEditFormProps = {
  profile: ProfileSnapshot;
};

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);
  const [isEditing, setIsEditing] = useState(false);
  const [tags, setTags] = useState(profile.studyTags);
  const [newTag, setNewTag] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const profileTagKey = profile.studyTags.join("\u0001");
  const profileTags = useMemo(() => profile.studyTags, [profileTagKey]);

  useEffect(() => {
    setTags(profileTags);
  }, [profileTags]);

  useEffect(() => {
    if (state.status === "success") {
      setIsEditing(false);
      setNewTag("");
      setTagMessage("");
    }
  }, [state.status]);

  const selectableTags = useMemo(() => {
    const suggestedTagKeys = new Set(suggestedTags.map(tagKey));
    return [...suggestedTags, ...tags.filter((tag) => !suggestedTagKeys.has(tagKey(tag)))];
  }, [tags]);

  function toggleTag(tag: string) {
    const normalizedTag = tagKey(tag);
    const existingIndex = tags.findIndex((item) => tagKey(item) === normalizedTag);

    if (existingIndex >= 0) {
      setTags(tags.filter((_, index) => index !== existingIndex));
      setTagMessage("");
      return;
    }

    if (tags.length >= 8) {
      setTagMessage("성향 태그는 최대 8개까지 선택할 수 있습니다.");
      return;
    }

    setTags([...tags, tag]);
    setTagMessage("");
  }

  function addTag() {
    const trimmedTag = newTag.trim();

    if (!trimmedTag) {
      setTagMessage("추가할 태그를 입력해 주세요.");
      return;
    }

    if (trimmedTag.length > 24) {
      setTagMessage("성향 태그는 24자 이하로 입력해 주세요.");
      return;
    }

    if (tags.some((tag) => tagKey(tag) === tagKey(trimmedTag))) {
      setTagMessage("같은 성향 태그는 한 번만 선택할 수 있습니다.");
      return;
    }

    if (tags.length >= 8) {
      setTagMessage("성향 태그는 최대 8개까지 선택할 수 있습니다.");
      return;
    }

    setTags([...tags, trimmedTag]);
    setNewTag("");
    setTagMessage("");
  }

  return (
    <section className="account-card profile-edit-card">
      <div className="profile-edit-header">
        <div>
          <span className="account-label">PROFILE SETTINGS</span>
          <h2>프로필 수정</h2>
          <p>전공과 학습 성향을 최신 상태로 관리해 보세요.</p>
        </div>
        <button className="button button--outline" onClick={() => setIsEditing((open) => !open)} type="button">
          {isEditing ? "닫기" : "수정하기"}
        </button>
      </div>

      {state.message ? (
        <p className={`profile-form-message${state.status === "success" ? " profile-form-message--success" : ""}`} role="status">
          {state.message}
        </p>
      ) : null}

      {isEditing ? (
        <form action={formAction} className="profile-edit-form" noValidate>
          <p className="profile-edit-email">로그인 이메일 <strong>{profile.email}</strong></p>
          <div className="profile-edit-grid">
            <label className="profile-edit-field">
              <span>이름</span>
              <input autoComplete="name" defaultValue={profile.name} maxLength={30} name="name" required />
              {state.fieldErrors?.name?.[0] ? <small>{state.fieldErrors.name[0]}</small> : null}
            </label>
            <label className="profile-edit-field">
              <span>닉네임</span>
              <input autoComplete="nickname" defaultValue={profile.nickname} maxLength={20} name="nickname" required />
              {state.fieldErrors?.nickname?.[0] ? <small>{state.fieldErrors.nickname[0]}</small> : null}
            </label>
            <label className="profile-edit-field">
              <span>전공</span>
              <input defaultValue={profile.major} maxLength={60} name="major" required />
              {state.fieldErrors?.major?.[0] ? <small>{state.fieldErrors.major[0]}</small> : null}
            </label>
            <label className="profile-edit-field">
              <span>학년</span>
              <select defaultValue={profile.grade} name="grade" required>
                {[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
              </select>
              {state.fieldErrors?.grade?.[0] ? <small>{state.fieldErrors.grade[0]}</small> : null}
            </label>
          </div>

          <label className="profile-edit-field">
            <span>한 줄 소개 <em>선택</em></span>
            <textarea defaultValue={profile.bio} maxLength={200} name="bio" placeholder="같이 공부하고 싶은 분야나 목표를 소개해 주세요." rows={3} />
            {state.fieldErrors?.bio?.[0] ? <small>{state.fieldErrors.bio[0]}</small> : <small className="profile-field-hint">최대 200자</small>}
          </label>

          <fieldset className="profile-style-field">
            <legend>선호 학습 방식</legend>
            <div className="profile-style-options">
              {studyStyleOptions.map((option) => (
                <label key={option.value}>
                  <input defaultChecked={profile.studyStyle === option.value} name="studyStyle" type="radio" value={option.value} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            {state.fieldErrors?.studyStyle?.[0] ? <small>{state.fieldErrors.studyStyle[0]}</small> : null}
          </fieldset>

          <fieldset className="profile-tag-field">
            <legend>학습 성향 태그 <small>{tags.length}/8</small></legend>
            <p>나를 잘 표현하는 태그를 고르거나 직접 추가해 보세요.</p>
            <div className="profile-tag-choices" aria-label="학습 성향 태그 선택">
              {selectableTags.map((tag) => {
                const selected = tags.some((item) => tagKey(item) === tagKey(tag));
                return (
                  <button
                    aria-pressed={selected}
                    className={`profile-tag-choice${selected ? " profile-tag-choice--selected" : ""}`}
                    key={tagKey(tag)}
                    onClick={() => toggleTag(tag)}
                    type="button"
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
            <div className="profile-tag-add">
              <input
                aria-label="직접 추가할 성향 태그"
                maxLength={24}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder="직접 태그 추가"
                value={newTag}
              />
              <button className="button button--ghost" onClick={addTag} type="button">추가</button>
            </div>
            {tagMessage ? <small className="profile-tag-error" role="alert">{tagMessage}</small> : null}
            {state.fieldErrors?.studyTags?.[0] ? <small className="profile-tag-error" role="alert">{state.fieldErrors.studyTags[0]}</small> : null}
            {tags.map((tag) => <input key={tagKey(tag)} name="studyTags" type="hidden" value={tag} />)}
          </fieldset>

          <div className="profile-form-actions">
            <button className="button button--ghost" disabled={isPending} onClick={() => setIsEditing(false)} type="button">취소</button>
            <button className="button button--primary" disabled={isPending} type="submit">{isPending ? "저장 중…" : "프로필 저장"}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
