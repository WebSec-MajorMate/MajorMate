import { createHash } from "node:crypto";
import { Schema, model, models, type Model } from "mongoose";
import { getActivityPoster, getPosterRetryAfter } from "@/lib/activities";
import { connectToDatabase } from "@/lib/mongodb";

type PosterRecord = { _id: string; imageUrl?: string; retryAt?: Date };

const schema = new Schema<PosterRecord>({
  _id: { type: String, required: true },
  imageUrl: String,
  retryAt: Date,
}, { versionKey: false });
const Poster = (models.ActivityPosterCache as Model<PosterRecord>) ??
  model<PosterRecord>("ActivityPosterCache", schema);

const leaseId = "gongmoaview:request-slot";
const requestInterval = 10 * 60_000;

export function isGongmoaPoster(url: string) {
  return url.startsWith("https://www.gongmoaview.com/contests/");
}

function posterId(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

export async function readGongmoaPosters(urls: string[]) {
  if (!urls.length) return { images: new Map<string, string>(), pending: undefined };
  await connectToDatabase();
  const ids = urls.map(posterId);
  const records = new Map((await Poster.find({ _id: { $in: ids } }).lean())
    .map((record) => [record._id, record]));
  const images = new Map<string, string>();
  const now = Date.now();
  let pending: string | undefined;
  urls.forEach((url, index) => {
    const record = records.get(ids[index]);
    if (record?.imageUrl) images.set(url, record.imageUrl);
    else if (!pending && (!record?.retryAt || record.retryAt.getTime() <= now)) pending = url;
  });
  return { images, pending };
}

export async function refreshGongmoaPoster(url: string) {
  await connectToDatabase();
  const now = new Date();
  await Poster.updateOne({ _id: leaseId }, { $setOnInsert: { retryAt: now } }, { upsert: true });
  const slot = await Poster.updateOne(
    { _id: leaseId, retryAt: { $lte: now } },
    { $set: { retryAt: new Date(now.getTime() + requestInterval) } },
  );
  if (!slot.modifiedCount) return;

  const id = posterId(url);
  const existing = await Poster.findById(id).lean();
  if (existing?.imageUrl || (existing?.retryAt && existing.retryAt > now)) return;
  const imageUrl = await getActivityPoster(url);
  const retryAfter = getPosterRetryAfter("www.gongmoaview.com");
  if (retryAfter > Date.now()) {
    await Poster.updateOne({ _id: leaseId }, { $max: { retryAt: new Date(retryAfter) } });
  }
  await Poster.updateOne({ _id: id }, {
    $set: imageUrl ? { imageUrl } : {
      retryAt: new Date(retryAfter > Date.now() ? retryAfter : Date.now() + 24 * 60 * 60_000),
    },
  }, { upsert: true });
}
