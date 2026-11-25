import "server-only";

import { isValidObjectId } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import type { ProfileInput } from "@/lib/profile-validation";
import User from "@/models/User";

export type ProfileSnapshot = {
  id: string;
  name: string;
  email: string;
  nickname: string;
  major: string;
  grade: number;
  bio: string;
  mannerScore: number;
  studyTags: string[];
  studyStyle: ProfileInput["studyStyle"];
};

function toProfileSnapshot(user: Record<string, unknown>): ProfileSnapshot {
  const score = Number(user.mannerScore);
  const studyStyle = user.studyStyle;

  return {
    id: String(user._id),
    name: String(user.name),
    email: String(user.email),
    nickname: String(user.nickname),
    major: String(user.major),
    grade: Number(user.grade),
    bio: typeof user.bio === "string" ? user.bio : "",
    mannerScore: Number.isFinite(score) ? score : 36.5,
    studyTags: Array.isArray(user.studyTags) ? user.studyTags.filter((tag): tag is string => typeof tag === "string") : [],
    studyStyle: studyStyle === "ONLINE" || studyStyle === "OFFLINE" || studyStyle === "HYBRID" ? studyStyle : "ANY",
  };
}

export async function getMyProfile(userId: string) {
  if (!isValidObjectId(userId)) return null;

  await connectToDatabase();
  const user = await User.findById(userId)
    .select("name email nickname major grade bio mannerScore studyTags studyStyle")
    .lean();

  return user ? toProfileSnapshot(user as unknown as Record<string, unknown>) : null;
}

export async function updateMyProfile(userId: string, profile: ProfileInput) {
  if (!isValidObjectId(userId)) return null;

  await connectToDatabase();
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        name: profile.name,
        nickname: profile.nickname,
        major: profile.major,
        grade: profile.grade,
        bio: profile.bio,
        studyTags: profile.studyTags,
        studyStyle: profile.studyStyle,
      },
    },
    { new: true, runValidators: true },
  )
    .select("name email nickname major grade bio mannerScore studyTags studyStyle")
    .lean();

  return user ? toProfileSnapshot(user as unknown as Record<string, unknown>) : null;
}
