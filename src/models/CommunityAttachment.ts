import { InferSchemaType, Model, Schema, model, models } from "mongoose";
const schema = new Schema({
  owner: { type: Schema.Types.ObjectId, required: true, index: true },
  post: { type: Schema.Types.ObjectId, default: null, index: true },
  data: { type: Buffer, required: true, select: false },
  mime: { type: String, enum: ["image/jpeg", "image/png", "image/webp"], required: true },
  size: { type: Number, required: true, max: 5 * 1024 * 1024 },
  expiresAt: { type: Date },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type CommunityAttachmentRecord = InferSchemaType<typeof schema>;
const CommunityAttachment = (models.CommunityAttachment as Model<CommunityAttachmentRecord>) || model<CommunityAttachmentRecord>("CommunityAttachment", schema);
export default CommunityAttachment;
