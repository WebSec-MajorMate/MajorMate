import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const ActivitySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    organizer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    category: {
      type: String,
      enum: ["CONTEST", "PROJECT", "ACTIVITY", "CLUB"],
      default: "CONTEST",
      required: true,
      index: true,
    },
    targetAudience: {
      type: String,
      default: "대학생",
      trim: true,
    },
    deadline: {
      type: Date,
      required: true,
      index: true,
    },
    linkUrl: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ActivitySchema.index({ deadline: 1, createdAt: -1 });

export type ActivityRecord = InferSchemaType<typeof ActivitySchema>;

const Activity = (models.Activity as Model<ActivityRecord>) || model<ActivityRecord>("Activity", ActivitySchema);

export default Activity;
