import { z } from "zod";
import { POST_CATEGORIES } from "@/lib/community-types";
export const postCategorySchema = z.enum(POST_CATEGORIES);
export const postInputSchema = z.object({
  category: postCategorySchema,
  title: z.string().trim().min(2, "제목은 2자 이상 입력해 주세요.").max(100, "제목은 100자 이하로 입력해 주세요."),
  content: z.string().trim().min(5, "내용은 5자 이상 입력해 주세요.").max(5000, "내용은 5,000자 이하로 입력해 주세요."),
  tags: z.string().max(104).default("").transform(value => [...new Set(value.split(",").map(tag => tag.trim().replace(/^#/, "")).filter(Boolean))])
    .pipe(z.array(z.string().min(1).max(20, "태그는 각각 20자까지 입력할 수 있어요.")).max(5, "태그는 5개까지 입력할 수 있어요.")),
  isAnonymous: z.boolean().default(false),
});
export const commentInputSchema = z.object({
  content: z.string().trim().min(1, "댓글 내용을 입력해 주세요.").max(1000, "댓글은 1,000자 이하로 입력해 주세요."),
});
export const communityFilterSchema = z.object({
  category: z.enum(["ALL", ...POST_CATEGORIES]).default("ALL"),
  q: z.string().trim().max(100).default(""),
  scope: z.enum(["all", "title", "content", "tag"]).default("all"),
  sort: z.enum(["latest", "popular", "comments"]).default("latest"),
  period: z.enum(["all", "day", "week"]).default("all"),
  activity: z.enum(["all", "mine", "commented", "scraps"]).default("all"),
  solved: z.enum(["all", "waiting", "solved"]).default("all"),
  tag: z.string().trim().max(20).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type CommunityFilters = z.infer<typeof communityFilterSchema>;
export type CommunityActionState = { fieldErrors?: Record<string, string[] | undefined>; message?: string; success?: boolean };
export function communityValidationState(error: z.ZodError): CommunityActionState {
  return { fieldErrors: error.flatten().fieldErrors };
}
export function escapeCommunityRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function safeCommunityReturn(value: unknown) {
  return typeof value === "string" && /^\/community(?:\?[^#]*)?$/.test(value) && value.length <= 1500 ? value : "/community";
}
