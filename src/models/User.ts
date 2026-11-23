import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 30,
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 20,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    major: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    grade: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
      required: true,
    },
    mannerScore: {
      type: Number,
      default: 36.5,
      min: 0,
      max: 100,
    },
    studyTags: {
      type: [String],
      default: [],
    },
    studyStyle: {
      type: String,
      enum: ["ONLINE", "OFFLINE", "HYBRID", "ANY"],
      default: "ANY",
    },
    bio: {
      type: String,
      default: "",
      maxlength: 200,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export type UserRecord = InferSchemaType<typeof UserSchema>;

const User = (models.User as Model<UserRecord>) || model<UserRecord>("User", UserSchema);

export default User;
