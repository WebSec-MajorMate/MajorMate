"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/auth";
import { isAuthConfigured } from "@/lib/auth-config";
import { updateMyProfile } from "@/lib/profile";
import {
  profileSchema,
  profileValidationState,
  type ProfileActionState,
} from "@/lib/profile-validation";

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

async function requireUserId() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/my");
  }

  return session.user.id;
}

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!isAuthConfigured()) {
    return { message: "계정 서비스를 준비 중입니다. 잠시 후 다시 시도해 주세요.", status: "error" };
  }

  // Server Actions can be invoked without rendering /my, so verify the session again here.
  const userId = await requireUserId();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    nickname: formData.get("nickname"),
    major: formData.get("major"),
    grade: formData.get("grade"),
    bio: formData.get("bio"),
    studyTags: formData.getAll("studyTags"),
    studyStyle: formData.get("studyStyle"),
  });

  if (!parsed.success) {
    return profileValidationState(parsed.error);
  }

  try {
    // The action never receives a target user ID; the authenticated user can update only their own profile.
    const updatedProfile = await updateMyProfile(userId, parsed.data);

    if (!updatedProfile) {
      return { message: "프로필을 찾을 수 없습니다. 다시 로그인해 주세요.", status: "error" };
    }

    // Use the persisted, validated values rather than form data when renewing the encrypted JWT session.
    await unstable_update({
      user: {
        name: updatedProfile.name,
        nickname: updatedProfile.nickname,
        major: updatedProfile.major,
        grade: updatedProfile.grade,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return {
        fieldErrors: { nickname: ["이미 사용 중인 닉네임입니다."] },
        message: "닉네임을 확인해 주세요.",
        status: "error",
      };
    }

    console.error("Failed to update profile", error);
    return { message: "프로필 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.", status: "error" };
  }

  revalidatePath("/my");
  return { message: "프로필이 저장되었습니다.", status: "success" };
}
