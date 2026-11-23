import { InferSchemaType, Model, Schema, model, models } from "mongoose";

const CommentSchema = new Schema(
  {
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorNickname: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

CommentSchema.index({ post: 1, createdAt: 1 });

export type CommentRecord = InferSchemaType<typeof CommentSchema>;

const Comment = (models.Comment as Model<CommentRecord>) || model<CommentRecord>("Comment", CommentSchema);

export default Comment;
