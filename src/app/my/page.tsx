import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { ProfileDashboard } from "@/components/auth/ProfileDashboard";
import { isAuthConfigured } from "@/lib/auth-config";
import { listProfileActivities } from "@/lib/profile-activities";
import { getMyProfile } from "@/lib/profile";
import { getMyStudySummaries } from "@/lib/studies";
import { getMyScrapSummaries } from "@/lib/community";
import { redirect } from "next/navigation";
import { connection } from "next/server";

// Account routes intentionally wait for a request instead of streaming a static shell.
export const instant = false;

export default async function MyPage() {
  // Auth.js creates cryptographic values while reading the session.
  // Render this account route only after a real request arrives.
  await connection();

  if (!isAuthConfigured()) {
    return <AuthSetupNotice />;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/my");
  }

  const [profile, studies, scraps, activities] = await Promise.all([
    getMyProfile(session.user.id),
    getMyStudySummaries(session.user.id),
    getMyScrapSummaries(session.user.id),
    listProfileActivities(session.user.id).catch(() => null),
  ]);

  if (!profile) {
    redirect("/login?callbackUrl=/my");
  }

  return <ProfileDashboard user={profile} studies={studies} scraps={scraps} activities={activities} />;
}
