import { InferSchemaType, Model, Schema, model, models } from "mongoose";
import { POST_CATEGORIES } from "@/lib/community-types";

const PostSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorNickname: { type: String, required: true, trim: true, maxlength: 20 },
    category: { type: String, enum: [...POST_CATEGORIES], default: "FREE", required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    content: { type: String, required: true, trim: true, minlength: 5, maxlength: 10000 },
    viewCount: { type: Number, default: 0, min: 0 },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    interactionVersion: { type: Number, default: 0 },
    isAnonymous: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    attachmentIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ["ACTIVE", "HIDDEN", "DELETED"], default: "ACTIVE", index: true },
    isPinned: { type: Boolean, default: false },
    acceptedCommentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null },
  },
  { timestamps: true, versionKey: false },
);

PostSchema.index({ category: 1, createdAt: -1 });
PostSchema.index({ createdAt: -1 });
PostSchema.index({ status: 1, category: 1, createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });

export type PostRecord = InferSchemaType<typeof PostSchema>;

const Post = (models.Post as Model<PostRecord>) || model<PostRecord>("Post", PostSchema);

export default Post;
