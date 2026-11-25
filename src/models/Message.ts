import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const MessageSchema = new Schema(
  {
    room: {
      type: Schema.Types.ObjectId,
      ref: "MessageRoom",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    clientMessageId: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

MessageSchema.index({ room: 1, createdAt: 1 });
MessageSchema.index({ room: 1, _id: -1 });
MessageSchema.index({ receiver: 1, isRead: 1, room: 1 });
MessageSchema.index({ room: 1, sender: 1, clientMessageId: 1 }, {
  unique: true,
  partialFilterExpression: { clientMessageId: { $type: "string" } },
});

export type MessageRecord = InferSchemaType<typeof MessageSchema>;

const Message = (models.Message as Model<MessageRecord>) || model<MessageRecord>("Message", MessageSchema);

export default Message;
