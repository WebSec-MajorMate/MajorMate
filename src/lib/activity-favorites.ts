import { createHash } from "node:crypto";
import { Schema, model, models, type Model } from "mongoose";
import type { Activity } from "@/lib/activities";
import { connectToDatabase } from "@/lib/mongodb";

type Favorite = { _id: string; userId: string; activity: Activity; savedAt: Date };

const schema = new Schema<Favorite>({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  activity: { type: Schema.Types.Mixed, required: true },
  savedAt: { type: Date, required: true },
}, { versionKey: false });

const Favorite = (models.ActivityFavorite as Model<Favorite>) ??
  model<Favorite>("ActivityFavorite", schema);

function favoriteId(userId: string, url: string) {
  return createHash("sha256").update(JSON.stringify([userId, url])).digest("hex");
}

export async function listActivityFavorites(userId: string) {
  await connectToDatabase();
  const records = await Favorite.find({ userId }).sort({ savedAt: -1 }).lean();
  return records.map(({ activity }) => activity);
}

export async function saveActivityFavorite(userId: string, activity: Activity) {
  await connectToDatabase();
  const _id = favoriteId(userId, activity.url);
  await Favorite.updateOne(
    { _id, userId },
    { $setOnInsert: { activity, savedAt: new Date() } },
    { upsert: true },
  );
}

export async function removeActivityFavorite(userId: string, url: string) {
  await connectToDatabase();
  await Favorite.deleteOne({ _id: favoriteId(userId, url), userId });
}
