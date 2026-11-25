import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/auth-config";
import { getProfileActivityEvidence } from "@/lib/profile-activities";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = isAuthConfigured() ? await auth() : null;
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[a-f\d]{64}$/.test(id)) return new Response(null, { status: 404 });
  const entry = await getProfileActivityEvidence(session.user.id, id);
  if (!entry?.evidence) return new Response(null, { status: 404 });
  const extension = entry.evidenceType === "application/pdf" ? "pdf" : entry.evidenceType === "image/png" ? "png" : "jpg";
  return new Response(new Uint8Array(entry.evidence), {
    headers: {
      "Content-Type": entry.evidenceType,
      "Content-Disposition": `attachment; filename="evidence.${extension}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
