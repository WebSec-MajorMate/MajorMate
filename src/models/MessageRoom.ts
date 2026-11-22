import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const MessageRoomSchema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
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
MessageRoomSchema.index({ lastMessageAt: -1 });

export type MessageRoomRecord = InferSchemaType<typeof MessageRoomSchema>;

const MessageRoom =
  (models.MessageRoom as Model<MessageRoomRecord>) ||
  model<MessageRoomRecord>("MessageRoom", MessageRoomSchema);

export default MessageRoom;
