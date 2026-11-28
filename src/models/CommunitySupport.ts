import { Schema, model, models } from "mongoose";

// These collections are additive. Existing posts/comments/scraps are never reseeded.
const reaction = new Schema({
  user: { type: Schema.Types.ObjectId, required: true },
  targetType: { type: String, enum: ["POST", "COMMENT"], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  post: { type: Schema.Types.ObjectId, required: true, index: true },
}, { timestamps: true });
reaction.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });
reaction.index({ post: 1, createdAt: -1 });
reaction.index({ targetType: 1, targetId: 1, createdAt: -1 });
export const Reaction = models.CommunityReaction || model("CommunityReaction", reaction);

const favorite = new Schema({ user: { type: Schema.Types.ObjectId, required: true }, category: { type: String, enum: ["FREE", "QUESTION", "INFO", "REVIEW"], required: true } });
favorite.index({ user: 1, category: 1 }, { unique: true });
export const BoardFavorite = models.BoardFavorite || model("BoardFavorite", favorite);

const report = new Schema({
  reporter: { type: Schema.Types.ObjectId, required: true },
  targetType: { type: String, enum: ["POST", "COMMENT"], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  post: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: ["ABUSE", "SPAM", "PRIVACY", "OTHER"], required: true },
  detail: { type: String, maxlength: 500, default: "" },
  status: { type: String, enum: ["OPEN", "REVIEWED"], default: "OPEN" },
  reviewer: Schema.Types.ObjectId,
  reviewedAt: Date,
  resolution: String,
}, { timestamps: true });
report.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
export const CommunityReport = models.CommunityReport || model("CommunityReport", report);

const notification = new Schema({
  recipient: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ["COMMENT", "REPLY", "ACCEPTED"], required: true },
  post: { type: Schema.Types.ObjectId, required: true },
  comment: Schema.Types.ObjectId,
  eventKey: { type: String, required: true },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });
notification.index({ recipient: 1, eventKey: 1 }, { unique: true });
notification.index({ recipient: 1, createdAt: -1 });
export const CommunityNotification = models.CommunityNotification || model("CommunityNotification", notification);

const throttle = new Schema({ key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } });
throttle.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const CommunityThrottle = models.CommunityThrottle || model("CommunityThrottle", throttle);

const view = new Schema({ user: { type: Schema.Types.ObjectId, required: true }, post: { type: Schema.Types.ObjectId, required: true }, bucket: { type: Number, required: true }, expiresAt: { type: Date, required: true } });
view.index({ user: 1, post: 1, bucket: 1 }, { unique: true });
view.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const CommunityView = models.CommunityView || model("CommunityView", view);
