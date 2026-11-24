"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { StudyActionState, readStudyFormValues, studyApplicationSchema, studySchema, studyStatusSchema, studyValidationState } from "@/lib/study-validation";
import Study from "@/models/Study";
import StudyApplication from "@/models/StudyApplication";
import StudySchedule from "@/models/StudySchedule";

async function requireUserId(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session.user.id;
}

export async function createStudyAction(
  _previousState: StudyActionState,
  formData: FormData,
): Promise<StudyActionState> {
  const values = readStudyFormValues(formData);
  const parsed = studySchema.safeParse({
    title: formData.get("title"),
    subject: formData.get("subject"),
    category: formData.get("category"),
    description: formData.get("description"),
    meetingDays: formData.getAll("meetingDays"),
    meetingTime: formData.get("meetingTime"),
    meetingType: formData.get("meetingType"),
    maxMembers: formData.get("maxMembers"),
  });

  if (!parsed.success) return studyValidationState(parsed.error, values);

  const userId = await requireUserId("/studies/new");
  let studyId: string;

  try {
    await connectToDatabase();
    const study = await Study.create({ ...parsed.data, owner: userId, currentMembers: 1 });
    studyId = study._id.toString();
  } catch (error) {
    console.error("Failed to create study", error);
    return { message: "스터디 모집글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.", values };
  }

  revalidatePath("/");
  revalidatePath("/studies");
  redirect(`/studies/${studyId}`);
}

export async function applyToStudyAction(
  studyId: string,
  _previousState: StudyActionState,
  formData: FormData,
): Promise<StudyActionState> {
  if (!isValidObjectId(studyId)) return { message: "존재하지 않는 스터디입니다." };
  const parsed = studyApplicationSchema.safeParse({ message: formData.get("message") });
  if (!parsed.success) return studyValidationState(parsed.error);

  const userId = await requireUserId(`/studies/${studyId}`);

  try {
    await connectToDatabase();
    const study = await Study.findById(studyId).select("owner status currentMembers maxMembers").lean();
    if (!study || study.status !== "RECRUITING") return { message: "현재 모집 중인 스터디가 아닙니다." };
    if (String(study.owner) === userId) return { message: "본인이 만든 스터디에는 신청할 수 없습니다." };
    if (study.currentMembers >= study.maxMembers) return { message: "모집 인원이 모두 찼습니다." };

    const existing = await StudyApplication.exists({ study: studyId, applicant: userId });
    if (existing) return { message: "이미 참여 신청한 스터디입니다." };

    await StudyApplication.create({ study: studyId, applicant: userId, message: parsed.data.message });
    revalidatePath(`/studies/${studyId}`);
    revalidatePath("/my");
    return { message: "참여 신청을 보냈습니다. 그룹장의 승인을 기다려 주세요." };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return { message: "이미 참여 신청한 스터디입니다." };
    }
    console.error("Failed to apply to study", error);
    return { message: "참여 신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function reviewStudyApplicationAction(
  studyId: string,
  applicationId: string,
  decision: "APPROVED" | "REJECTED",
) {
  if (!isValidObjectId(studyId) || !isValidObjectId(applicationId)) redirect("/studies");
  const userId = await requireUserId(`/studies/${studyId}/manage`);

  await connectToDatabase();
  const application = await StudyApplication.findOne({ _id: applicationId, study: studyId, status: "PENDING" }).lean();
  if (!application) return;

  const study = await Study.findOne({ _id: studyId, owner: userId }).select("currentMembers maxMembers status").lean();
  if (!study) redirect("/studies");

  if (decision === "APPROVED") {
    const updatedStudy = await Study.findOneAndUpdate(
      { _id: studyId, owner: userId, status: "RECRUITING", $expr: { $lt: ["$currentMembers", "$maxMembers"] } },
      { $inc: { currentMembers: 1 } },
      { new: true },
    ).lean();

    if (!updatedStudy) return;
    await StudyApplication.updateOne({ _id: applicationId, status: "PENDING" }, { $set: { status: "APPROVED" } });
    if (updatedStudy.currentMembers >= updatedStudy.maxMembers) {
      await Study.updateOne({ _id: studyId }, { $set: { status: "CLOSED" } });
    }
  } else {
    await StudyApplication.updateOne({ _id: applicationId, status: "PENDING" }, { $set: { status: "REJECTED" } });
  }

  revalidatePath("/");
  revalidatePath("/studies");
  revalidatePath(`/studies/${studyId}`);
  revalidatePath(`/studies/${studyId}/manage`);
  revalidatePath("/my");
}

function revalidateStudy(studyId: string) {
  revalidatePath("/");
  revalidatePath("/studies");
  revalidatePath(`/studies/${studyId}`);
  revalidatePath(`/studies/${studyId}/manage`);
  revalidatePath("/my");
}

// 스터디 수정: 그룹장만 가능. 소유권은 쿼리 조건(owner)으로 서버에서 검증한다.
export async function updateStudyAction(
  studyId: string,
  _previousState: StudyActionState,
  formData: FormData,
): Promise<StudyActionState> {
  const values = readStudyFormValues(formData);
  if (!isValidObjectId(studyId)) return { message: "존재하지 않는 스터디입니다.", values };
  const parsed = studySchema.safeParse({
    title: formData.get("title"),
    subject: formData.get("subject"),
    category: formData.get("category"),
    description: formData.get("description"),
    meetingDays: formData.getAll("meetingDays"),
    meetingTime: formData.get("meetingTime"),
    meetingType: formData.get("meetingType"),
    maxMembers: formData.get("maxMembers"),
  });
  if (!parsed.success) return studyValidationState(parsed.error, values);

  const userId = await requireUserId(`/studies/${studyId}/edit`);

  try {
    await connectToDatabase();
    // 이미 참여 중인 인원보다 최대 인원을 줄일 수 없다. (조건에 포함해 원자적으로 처리)
    const updated = await Study.findOneAndUpdate(
      { _id: studyId, owner: userId, currentMembers: { $lte: parsed.data.maxMembers } },
      { $set: parsed.data },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      const owned = await Study.exists({ _id: studyId, owner: userId });
      if (!owned) return { message: "수정 권한이 없거나 존재하지 않는 스터디입니다.", values };
      return { fieldErrors: { maxMembers: ["현재 참여 인원보다 적게 설정할 수 없습니다."] }, values };
    }

    // 정원이 이미 찬 상태라면 모집 마감 상태를 유지한다.
    if (updated.status === "RECRUITING" && updated.currentMembers >= updated.maxMembers) {
      await Study.updateOne({ _id: studyId, owner: userId }, { $set: { status: "CLOSED" } });
    }
  } catch (error) {
    console.error("Failed to update study", error);
    return { message: "스터디 정보를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.", values };
  }

  revalidateStudy(studyId);
  redirect(`/studies/${studyId}`);
}

// 스터디 삭제: 그룹장만 가능. 연관된 신청서/일정도 함께 정리한다.
export async function deleteStudyAction(studyId: string) {
  if (!isValidObjectId(studyId)) redirect("/studies");
  const userId = await requireUserId(`/studies/${studyId}`);

  await connectToDatabase();
  const deleted = await Study.findOneAndDelete({ _id: studyId, owner: userId }).select("_id").lean();
  if (!deleted) redirect(`/studies/${studyId}`);

  await Promise.all([StudyApplication.deleteMany({ study: studyId }), StudySchedule.deleteMany({ study: studyId })]);
  revalidateStudy(studyId);
  redirect("/studies");
}

// 모집 마감/재개: 그룹장만 가능. 정원이 찬 스터디는 재개할 수 없다.
export async function setStudyStatusAction(studyId: string, nextStatus: "RECRUITING" | "CLOSED") {
  if (!isValidObjectId(studyId)) redirect("/studies");
  const status = studyStatusSchema.safeParse(nextStatus);
  if (!status.success) redirect(`/studies/${studyId}`);
  const userId = await requireUserId(`/studies/${studyId}`);

  await connectToDatabase();
  const filter =
    status.data === "RECRUITING"
      ? { _id: studyId, owner: userId, $expr: { $lt: ["$currentMembers", "$maxMembers"] } }
      : { _id: studyId, owner: userId };
  await Study.updateOne(filter, { $set: { status: status.data } });
  revalidateStudy(studyId);
}

// 멤버 내보내기: 그룹장만 가능. 내보낸 사용자는 같은 스터디에 다시 신청할 수 없다.
export async function removeStudyMemberAction(studyId: string, applicationId: string) {
  if (!isValidObjectId(studyId) || !isValidObjectId(applicationId)) redirect("/studies");
  const userId = await requireUserId(`/studies/${studyId}/manage`);

  await connectToDatabase();
  const owned = await Study.exists({ _id: studyId, owner: userId });
  if (!owned) redirect(`/studies/${studyId}`);

  const removed = await StudyApplication.findOneAndUpdate(
    { _id: applicationId, study: studyId, status: "APPROVED" },
    { $set: { status: "REMOVED" } },
  ).select("_id").lean();
  if (!removed) return;

  await Study.updateOne({ _id: studyId, owner: userId, currentMembers: { $gt: 1 } }, { $inc: { currentMembers: -1 } });
  revalidateStudy(studyId);
}

// 스터디 탈퇴: 승인된 본인 신청서만 대상이 된다. 그룹장은 탈퇴 대신 삭제를 사용한다.
export async function leaveStudyAction(studyId: string) {
  if (!isValidObjectId(studyId)) redirect("/studies");
  const userId = await requireUserId(`/studies/${studyId}`);

  await connectToDatabase();
  const left = await StudyApplication.findOneAndDelete({ study: studyId, applicant: userId, status: "APPROVED" }).select("_id").lean();
  if (!left) return;

  await Study.updateOne({ _id: studyId, currentMembers: { $gt: 1 } }, { $inc: { currentMembers: -1 } });
  revalidateStudy(studyId);
}

// 참여 신청 취소: 검토 중인 본인 신청서만 취소할 수 있다.
export async function cancelStudyApplicationAction(studyId: string) {
  if (!isValidObjectId(studyId)) redirect("/studies");
  const userId = await requireUserId(`/studies/${studyId}`);

  await connectToDatabase();
  await StudyApplication.deleteOne({ study: studyId, applicant: userId, status: "PENDING" });
  revalidatePath(`/studies/${studyId}`);
  revalidatePath(`/studies/${studyId}/manage`);
  revalidatePath("/my");
}
