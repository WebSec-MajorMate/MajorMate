import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const MessageRoomSchema = new Schema(
  {
    participants: {
      type: [{
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      }],
      required: true,
      validate: {
        validator: (ids: Schema.Types.ObjectId[]) => ids.length === 2 && String(ids[0]) !== String(ids[1]),
        message: "대화방에는 서로 다른 사용자 두 명이 필요합니다.",
      },
    },
    participantKey: { type: String, required: true },
    readThrough: { type: Map, of: String, default: {} },
    study: {
      type: Schema.Types.ObjectId,
      ref: "Study",
      default: null,
    },
    lastMessage: {
      type: String,
      default: "",
      trim: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

MessageRoomSchema.index({ participants: 1 });
// Partial index allows legacy rooms without a key; new rooms always supply one.
MessageRoomSchema.index({ participantKey: 1 }, { unique: true, partialFilterExpression: { participantKey: { $type: "string" } } });
MessageRoomSchema.index({ lastMessageAt: -1 });

export type MessageRoomRecord = InferSchemaType<typeof MessageRoomSchema>;

const MessageRoom =
  (models.MessageRoom as Model<MessageRoomRecord>) ||
  model<MessageRoomRecord>("MessageRoom", MessageRoomSchema);

export default MessageRoom;
