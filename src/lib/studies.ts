import "server-only";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { DEFAULT_STUDY_CATEGORY } from "@/lib/study-constants";
import { StudySearchFilters } from "@/lib/study-validation";
import Study from "@/models/Study";
import StudyApplication from "@/models/StudyApplication";

type OwnerSnapshot = { _id: { toString(): string }; nickname: string; major: string; grade: number };

export type StudySummary = {
  id: string;
  title: string;
  subject: string;
  category: string;
  description: string;
  meetingDays: string[];
  meetingTime: string;
  meetingType: "ONLINE" | "OFFLINE";
  maxMembers: number;
  currentMembers: number;
  status: "RECRUITING" | "CLOSED";
  owner: { id: string; nickname: string; major: string; grade: number };
  createdAt: Date;
};

function toStudySummary(study: Record<string, unknown>): StudySummary {
  const owner = study.owner as OwnerSnapshot;
  return {
    id: String(study._id),
    title: String(study.title),
    subject: String(study.subject),
    category: String(study.category ?? DEFAULT_STUDY_CATEGORY),
    description: String(study.description),
    meetingDays: study.meetingDays as string[],
    meetingTime: String(study.meetingTime),
    meetingType: study.meetingType as "ONLINE" | "OFFLINE",
    maxMembers: Number(study.maxMembers),
    currentMembers: Number(study.currentMembers),
    status: study.status as "RECRUITING" | "CLOSED",
    owner: { id: String(owner._id), nickname: owner.nickname, major: owner.major, grade: owner.grade },
    createdAt: new Date(study.createdAt as Date),
  };
}

export async function getRecruitingStudies(limit?: number) {
  await connectToDatabase();
  const query = Study.find({ status: "RECRUITING" }).sort({ createdAt: -1 }).populate("owner", "nickname major grade");
  if (limit) query.limit(limit);
  const studies = await query.lean();
  return studies.map((study) => toStudySummary(study as unknown as Record<string, unknown>));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 모집글 목록 검색: 키워드/카테고리/진행방식/모집상태. 입력은 이미 Zod로 검증된 값만 받는다.
export async function searchStudies(filters: StudySearchFilters) {
  await connectToDatabase();
  const query: Record<string, unknown> = {};
  if (filters.status === "RECRUITING") query.status = "RECRUITING";
  if (filters.category) query.category = filters.category;
  if (filters.meetingType) query.meetingType = filters.meetingType;
  if (filters.q) {
    const pattern = escapeRegExp(filters.q);
    query.$or = [
      { title: { $regex: pattern, $options: "i" } },
      { subject: { $regex: pattern, $options: "i" } },
      { description: { $regex: pattern, $options: "i" } },
    ];
  }
  const studies = await Study.find(query).sort({ createdAt: -1 }).limit(60).populate("owner", "nickname major grade").lean();
  return studies.map((study) => toStudySummary(study as unknown as Record<string, unknown>));
}

export async function getStudyById(id: string) {
  if (!isValidObjectId(id)) return null;
  await connectToDatabase();
  const study = await Study.findById(id).populate("owner", "nickname major grade").lean();
  return study ? toStudySummary(study as unknown as Record<string, unknown>) : null;
}

export async function getStudyApplicationStatus(studyId: string, userId: string) {
  if (!isValidObjectId(studyId)) return null;
  await connectToDatabase();
  const application = await StudyApplication.findOne({ study: studyId, applicant: userId }).select("status").lean();
  return application?.status ?? null;
}

export type ManagedApplication = {
  id: string;
  message: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REMOVED";
  createdAt: Date;
  applicant: { id: string; nickname: string; major: string; grade: number };
};

export async function getManagedApplications(studyId: string, ownerId: string) {
  if (!isValidObjectId(studyId)) return [];
  await connectToDatabase();
  const study = await Study.findOne({ _id: studyId, owner: ownerId }).select("_id").lean();
  if (!study) return [];
  const applications = await StudyApplication.find({ study: studyId })
    .sort({ createdAt: -1 })
    .populate("applicant", "nickname major grade")
    .lean();
  return applications.map((application) => {
    const applicant = application.applicant as unknown as OwnerSnapshot;
    return {
      id: String(application._id),
      message: application.message,
      status: application.status as ManagedApplication["status"],
      createdAt: new Date(application.createdAt),
      applicant: { id: String(applicant._id), nickname: applicant.nickname, major: applicant.major, grade: applicant.grade },
    };
  });
}

export async function getMyStudySummaries(userId: string) {
  await connectToDatabase();
  const studies = await Study.find({ owner: userId }).sort({ createdAt: -1 }).populate("owner", "nickname major grade").lean();
  return studies.map((study) => toStudySummary(study as unknown as Record<string, unknown>));
}

export type StudyMember = {
  // 강퇴 처리에 쓰는 신청서 ID는 그룹장에게만 내려준다. (그룹장 항목은 빈 문자열)
  applicationId: string;
  userId: string;
  nickname: string;
  major: string;
  grade: number;
  isOwner: boolean;
};

// 그룹장 또는 승인된 멤버인지 확인한다. 세션 사용자 ID 기준으로 서버에서 판단한다.
export async function getStudyViewerRole(studyId: string, userId: string): Promise<"OWNER" | "MEMBER" | "NONE"> {
  if (!isValidObjectId(studyId) || !isValidObjectId(userId)) return "NONE";
  await connectToDatabase();
  const owned = await Study.exists({ _id: studyId, owner: userId });
  if (owned) return "OWNER";
  const member = await StudyApplication.exists({ study: studyId, applicant: userId, status: "APPROVED" });
  return member ? "MEMBER" : "NONE";
}

// 멤버 목록은 그룹장/승인된 멤버에게만 공개한다. 그 외에는 null.
export async function getStudyMembers(studyId: string, viewerId: string): Promise<StudyMember[] | null> {
  const role = await getStudyViewerRole(studyId, viewerId);
  if (role === "NONE") return null;
  const [study, approved] = await Promise.all([
    Study.findById(studyId).populate("owner", "nickname major grade").lean(),
    StudyApplication.find({ study: studyId, status: "APPROVED" }).sort({ updatedAt: 1 }).populate("applicant", "nickname major grade").lean(),
  ]);
  if (!study) return null;
  const owner = study.owner as unknown as OwnerSnapshot;
  const members: StudyMember[] = [
    { applicationId: "", userId: String(owner._id), nickname: owner.nickname, major: owner.major, grade: owner.grade, isOwner: true },
  ];
  for (const application of approved) {
    const applicant = application.applicant as unknown as OwnerSnapshot | null;
    if (!applicant) continue;
    members.push({
      applicationId: role === "OWNER" ? String(application._id) : "",
      userId: String(applicant._id),
      nickname: applicant.nickname,
      major: applicant.major,
      grade: applicant.grade,
      isOwner: false,
    });
  }
  return members;
}
