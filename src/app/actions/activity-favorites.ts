"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getActivities } from "@/lib/activities";
import { removeActivityFavorite, saveActivityFavorite } from "@/lib/activity-favorites";
import { isAuthConfigured } from "@/lib/auth-config";

export async function setActivityFavorite(url: string, selected: boolean) {
  const session = isAuthConfigured() ? await auth() : null;
  const userId = session?.user?.id;
  if (!userId) return "로그인이 필요합니다";
  if (typeof url !== "string" || url.length > 3000 || typeof selected !== "boolean") {
    return "공고를 확인할 수 없습니다.";
  }

  try {
    if (selected) {
      const { activities } = await getActivities();
      const activity = activities.find((entry) => entry.url === url);
      if (!activity) return "현재 이 공고를 불러올 수 없습니다.";
      await saveActivityFavorite(userId, activity);
    } else {
      await removeActivityFavorite(userId, url);
    }
  } catch {
    return "즐겨찾기를 변경하지 못했습니다. 다시 시도해 주세요.";
  }

  revalidatePath("/activities");
  return null;
}
