export const POST_CATEGORIES = ["FREE", "QUESTION", "INFO", "REVIEW"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  FREE: "자유",
  QUESTION: "질문",
  INFO: "정보",
  REVIEW: "후기",
};

export const SCRAP_TARGET_TYPES = ["STUDY", "POST", "ACTIVITY"] as const;
export type ScrapTargetType = (typeof SCRAP_TARGET_TYPES)[number];

