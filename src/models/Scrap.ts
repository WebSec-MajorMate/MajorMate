import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { SCRAP_TARGET_TYPES } from "@/lib/community-types";

const ScrapSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: [...SCRAP_TARGET_TYPES], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true, versionKey: false },
);

ScrapSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
ScrapSchema.index({ user: 1, createdAt: -1 });

export type ScrapRecord = InferSchemaType<typeof ScrapSchema>;

const Scrap = (models.Scrap as Model<ScrapRecord>) || model<ScrapRecord>("Scrap", ScrapSchema);

export default Scrap;
