import { z } from "zod";
import { POST_CATEGORIES } from "@/lib/community-types";

export const postCategorySchema = z.enum(POST_CATEGORIES);

export const postInputSchema = z.object({
  category: postCategorySchema,
  title: z.string().trim().min(2, "제목은 2자 이상 입력해 주세요.").max(100, "제목은 100자 이하로 입력해 주세요."),
  content: z.string().trim().min(2, "내용은 2자 이상 입력해 주세요.").max(10000, "내용은 10,000자 이하로 입력해 주세요."),
});

export const commentInputSchema = z.object({
  content: z.string().trim().min(1, "댓글 내용을 입력해 주세요.").max(2000, "댓글은 2,000자 이하로 입력해 주세요."),
});

export const communityFilterSchema = z.object({
  category: z.enum(["ALL", ...POST_CATEGORIES]).default("ALL"),
  q: z.string().trim().max(100, "검색어는 100자 이하로 입력해 주세요.").default(""),
  page: z.coerce.number().int().min(1).default(1),
});

export type CommunityActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  success?: boolean;
};

export function communityValidationState(error: z.ZodError): CommunityActionState {
  return { fieldErrors: error.flatten().fieldErrors };
}
