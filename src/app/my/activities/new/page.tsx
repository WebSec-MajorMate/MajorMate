import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AuthSetupNotice } from "@/components/auth/AuthSetupNotice";
import { SiteFrame } from "@/components/layout/SiteChrome";
import { isAuthConfigured } from "@/lib/auth-config";
import { getProfileActivity, profileActivityOptions } from "@/lib/profile-activities";
import { ActivityForm } from "./ActivityForm";

export const instant = false;

export default async function NewProfileActivity({ searchParams }: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  await connection();
  if (!isAuthConfigured()) return <AuthSetupNotice />;
  const session = await auth();
  const { edit: editId } = await searchParams;
  if (editId !== undefined && (typeof editId !== "string" || !/^[a-f0-9]{64}$/.test(editId))) notFound();
  const callback = editId ? `/my/activities/new?edit=${editId}` : "/my/activities/new";
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  const entry = editId ? await getProfileActivity(session.user.id, editId) : null;
  if (editId && !entry) notFound();
  const options = await profileActivityOptions(session.user.id)
    .then((items) => items.map(({ url, title, category }) => ({ url, title, category })))
    .catch(() => null);
  const editOptions = entry ? [
    { url: entry.url, title: entry.title, category: entry.category },
    ...(options ?? []).filter(({ url }) => url !== entry.url),
  ] : [];
  return (
    <SiteFrame user={session.user}>
      <link rel="stylesheet" href="/profile-activities.css?v=4" precedence="profile-activities" />
      <main className="page-wrap narrow-page">
        <Link href="/my" className="back-link">‹ 내 프로필</Link>
        <section className={entry ? "account-card profile-activity-edit" : "account-card"}>
          <h1>{entry ? "활동 수정" : "활동 추가하기"}</h1>
          {entry ? <ActivityForm key={entry._id} options={editOptions} edit={{
            id: entry._id, url: entry.url, title: entry.title, evidenceType: entry.evidenceType,
          }} />
            : options?.length ? <ActivityForm options={options} />
            : <p>{options ? "선택할 수 있는 공고가 없습니다." : "활동 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}</p>}
        </section>
      </main>
    </SiteFrame>
  );
}
