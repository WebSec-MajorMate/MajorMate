import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { ProfileDashboard } from "@/components/auth/ProfileDashboard";
import { isAuthConfigured } from "@/lib/auth-config";
import { listProfileActivities } from "@/lib/profile-activities";
import { getMyStudySummaries } from "@/lib/studies";
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

  const [studies, activities] = await Promise.all([
    getMyStudySummaries(session.user.id),
    listProfileActivities(session.user.id).catch(() => null),
  ]);
  return <ProfileDashboard user={session.user} studies={studies} activities={activities} />;
}
