import { randomBytes } from "node:crypto";
import { Schema, model, models, type Model } from "mongoose";
import { getActivities, type Activity } from "@/lib/activities";
import { listActivityFavorites } from "@/lib/activity-favorites";
import { connectToDatabase } from "@/lib/mongodb";

type ProfileActivity = {
  _id: string;
  userId: string;
  url: string;
  title: string;
  category: string;
  evidence: Buffer;
  evidenceType: string;
  savedAt: Date;
};

const schema = new Schema<ProfileActivity>({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  url: { type: String, required: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  evidence: { type: Buffer, required: true, select: false },
  evidenceType: { type: String, required: true },
  savedAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ userId: 1, url: 1 }, { unique: true });

const Entry = (models.ProfileActivity as Model<ProfileActivity>) ??
  model<ProfileActivity>("ProfileActivity", schema);

export async function profileActivityOptions(userId: string) {
  const [{ activities }, favorites] = await Promise.all([
    getActivities(),
    listActivityFavorites(userId),
  ]);
  const options = new Map<string, Activity>();
  for (const activity of [...favorites, ...activities]) {
    if (activity.category !== "채용·인턴") options.set(activity.url, activity);
  }
  return [...options.values()];
}

export async function listProfileActivities(userId: string) {
  await connectToDatabase();
  const entries = await Entry.find({ userId }).select("url title category").sort({ savedAt: -1 }).lean();
  return entries.map(({ _id, url, title, category }) => ({ id: _id, url, title, category }));
}

export type ProfileActivitySummary = Awaited<ReturnType<typeof listProfileActivities>>[number];

export async function getProfileActivity(userId: string, id: string) {
  await connectToDatabase();
  return Entry.findOne({ _id: id, userId }).select("url title category evidenceType").lean();
}

export async function updateProfileActivity(userId: string, id: string, activity: Pick<Activity, "url" | "title" | "category">, evidence: Buffer, evidenceType: string) {
  await connectToDatabase();
  await Entry.init();
  const result = await Entry.updateOne({ _id: id, userId }, {
    $set: { url: activity.url, title: activity.title, category: activity.category, evidence, evidenceType },
  }, { runValidators: true });
  return result.matchedCount > 0;
}

export async function deleteProfileActivity(userId: string, id: string) {
  await connectToDatabase();
  await Entry.deleteOne({ _id: id, userId });
}

export async function saveProfileActivity(userId: string, activity: Pick<Activity, "url" | "title" | "category">, evidence: Buffer, evidenceType: string) {
  await connectToDatabase();
  await Entry.init();
  await Entry.updateOne({ userId, url: activity.url }, {
    $set: { url: activity.url, title: activity.title, category: activity.category, evidence, evidenceType },
    $setOnInsert: { _id: randomBytes(32).toString("hex"), savedAt: new Date() },
  }, { upsert: true, runValidators: true });
}

export async function getProfileActivityEvidence(userId: string, id: string) {
  await connectToDatabase();
  return Entry.findOne({ _id: id, userId }).select("+evidence evidenceType");
}
