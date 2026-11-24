import { z } from "zod";
import { MEETING_DAYS, STUDY_CATEGORIES } from "@/lib/study-constants";

export const studySchema = z.object({
  title: z.string().trim().min(3, "제목은 3자 이상 입력해 주세요.").max(100, "제목은 100자 이하로 입력해 주세요."),
  subject: z.string().trim().min(2, "과목 또는 주제를 입력해 주세요.").max(60),
  category: z.enum(STUDY_CATEGORIES, { error: "카테고리를 선택해 주세요." }),
  description: z.string().trim().min(10, "스터디 소개는 10자 이상 입력해 주세요.").max(2000),
  meetingDays: z.array(z.enum(MEETING_DAYS)).min(1, "모임 요일을 하나 이상 선택해 주세요."),
  meetingTime: z.string().trim().min(2, "모임 시간을 입력해 주세요.").max(60),
  meetingType: z.enum(["ONLINE", "OFFLINE"]),
  maxMembers: z.coerce.number().int().min(2, "모집 인원은 2명 이상이어야 합니다.").max(20, "모집 인원은 최대 20명입니다."),
});

export const studyApplicationSchema = z.object({
  message: z.string().trim().min(5, "신청 메시지는 5자 이상 입력해 주세요.").max(500, "신청 메시지는 500자 이하로 입력해 주세요."),
});

// 목록 검색/필터용 쿼리스트링 검증. 잘못된 값은 안전한 기본값으로 대체해 NoSQL 쿼리에 객체가 전달되지 않게 한다.
export const studySearchSchema = z.object({
  q: z.string().trim().max(50).catch(""),
  category: z.enum(STUDY_CATEGORIES).optional().catch(undefined),
  meetingType: z.enum(["ONLINE", "OFFLINE"]).optional().catch(undefined),
  status: z.enum(["RECRUITING", "ALL"]).catch("RECRUITING"),
});

export type StudySearchFilters = z.infer<typeof studySearchSchema>;

export const studyStatusSchema = z.enum(["RECRUITING", "CLOSED"]);

// 제출 실패 시 폼에 다시 채워 넣을 입력값. 같은 사용자의 화면에만 되돌려주며 JSX가 이스케이프해 출력한다.
export type StudyFormValues = {
  title: string;
  subject: string;
  category: string;
  description: string;
  meetingDays: string[];
  meetingTime: string;
  meetingType: string;
  maxMembers: string;
};

export type StudyActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  values?: StudyFormValues;
};

export function readStudyFormValues(formData: FormData): StudyFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    title: text("title"),
    subject: text("subject"),
    category: text("category"),
    description: text("description"),
    meetingDays: formData.getAll("meetingDays").filter((day): day is string => typeof day === "string"),
    meetingTime: text("meetingTime"),
    meetingType: text("meetingType"),
    maxMembers: text("maxMembers"),
  };
}

export function studyValidationState(error: z.ZodError, values?: StudyFormValues): StudyActionState {
  return { fieldErrors: error.flatten().fieldErrors, values };
}
