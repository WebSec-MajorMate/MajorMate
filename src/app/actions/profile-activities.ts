"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/auth-config";
import { deleteProfileActivity, getProfileActivity, profileActivityOptions, saveProfileActivity, updateProfileActivity } from "@/lib/profile-activities";

function evidenceType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
}

export async function addProfileActivity(_: { message: string }, form: FormData) {
  const session = isAuthConfigured() ? await auth() : null;
  const userId = session?.user?.id;
  if (!userId) return { message: "로그인이 필요합니다." };

  const url = form.get("activity");
  const editId = form.get("editId");
  const file = form.get("evidence");
  if (typeof url !== "string" || !url || url.length > 3000) return { message: "활동을 선택해 주세요." };
  if (editId !== null && (typeof editId !== "string" || !/^[a-f0-9]{64}$/.test(editId))) {
    return { message: "활동을 확인할 수 없습니다." };
  }
  if (!(file instanceof File) || file.size === 0) return { message: "증빙 자료를 제출해 주세요." };
  if (file.size > 3 * 1024 * 1024) {
    return { message: "3MB 이하의 증빙 파일을 첨부해 주세요." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = evidenceType(bytes);
  if (!type || file.type !== type) return { message: "PNG, JPG 또는 PDF 파일을 첨부해 주세요." };

  try {
    const current = typeof editId === "string" ? await getProfileActivity(userId, editId) : null;
    if (editId && !current) return { message: "수정할 활동을 찾을 수 없습니다." };
    const activity = current?.url === url ? current
      : (await profileActivityOptions(userId)).find((entry) => entry.url === url);
    if (!activity) return { message: "선택한 활동을 확인할 수 없습니다. 목록을 새로고침해 주세요." };
    if (typeof editId === "string") {
      const updated = await updateProfileActivity(userId, editId, activity, bytes, type);
      if (!updated) return { message: "수정할 활동을 찾을 수 없습니다." };
    } else {
      await saveProfileActivity(userId, activity, bytes, type);
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return { message: "이미 내 활동에 등록된 공고입니다." };
    }
    return { message: "활동을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/my");
  redirect("/my#profile-activities");
}

export async function removeProfileActivity(id: string) {
  const session = isAuthConfigured() ? await auth() : null;
  if (!session?.user?.id) return "로그인이 필요합니다.";
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) return "활동을 확인할 수 없습니다.";
  try {
    await deleteProfileActivity(session.user.id, id);
  } catch {
    return "활동을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  revalidatePath("/my");
  return null;
}
