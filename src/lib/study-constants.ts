// 스터디 도메인에서 서버/클라이언트가 함께 쓰는 상수입니다. (server-only 의존성 없음)
export const STUDY_CATEGORIES = ["전공", "어학", "자격증", "코딩테스트", "공모전", "취업", "기타"] as const;

export type StudyCategory = (typeof STUDY_CATEGORIES)[number];

// 카테고리가 없던 기존 모집글을 위한 기본값입니다.
export const DEFAULT_STUDY_CATEGORY: StudyCategory = "기타";

export const MEETING_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
