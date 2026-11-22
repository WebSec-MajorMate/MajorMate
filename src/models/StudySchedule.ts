import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const StudyScheduleSchema = new Schema(
  {
    study: {
      type: Schema.Types.ObjectId,
      ref: "Study",
      required: true,
      index: true,
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    attendees: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

StudyScheduleSchema.index({ study: 1, startDate: 1 });

export type StudyScheduleRecord = InferSchemaType<typeof StudyScheduleSchema>;

const StudySchedule =
  (models.StudySchedule as Model<StudyScheduleRecord>) ||
  model<StudyScheduleRecord>("StudySchedule", StudyScheduleSchema);

export default StudySchedule;
