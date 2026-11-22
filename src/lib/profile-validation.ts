import { z } from "zod";

const studyTagSchema = z
  .string()
  .trim()
  .min(1, "성향 태그가 비어 있습니다.")
  .max(24, "성향 태그는 24자 이하로 입력해 주세요.");

export const profileSchema = z.object({
  name: z.string().trim().min(2, "이름은 2자 이상 입력해 주세요.").max(30, "이름은 30자 이하로 입력해 주세요."),
  nickname: z
    .string()
    .trim()
    .min(2, "닉네임은 2자 이상 입력해 주세요.")
    .max(20, "닉네임은 20자 이하로 입력해 주세요.")
    .regex(/^[가-힣A-Za-z0-9_]+$/, "닉네임은 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다."),
  major: z.string().trim().min(2, "전공을 입력해 주세요.").max(60, "전공은 60자 이하로 입력해 주세요."),
  grade: z.coerce.number().int().min(1, "학년을 선택해 주세요.").max(6, "학년은 6학년 이하로 선택해 주세요."),
  bio: z.string().trim().max(200, "소개는 200자 이하로 입력해 주세요."),
  studyTags: z
    .array(studyTagSchema)
    .max(8, "성향 태그는 최대 8개까지 선택할 수 있습니다.")
    .superRefine((tags, context) => {
      const seen = new Set<string>();

      tags.forEach((tag, index) => {
        const normalizedTag = tag.toLocaleLowerCase("ko-KR");
        if (seen.has(normalizedTag)) {
          context.addIssue({
            code: "custom",
            message: "같은 성향 태그는 한 번만 선택할 수 있습니다.",
            path: [index],
          });
        }
        seen.add(normalizedTag);
      });
    }),
  studyStyle: z.enum(["ONLINE", "OFFLINE", "HYBRID", "ANY"]),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export type ProfileActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  status?: "success" | "error";
};

export function profileValidationState(error: z.ZodError): ProfileActionState {
  return { fieldErrors: error.flatten().fieldErrors, status: "error" };
}
