/* eslint-disable @typescript-eslint/no-require-imports */
const mongoose = require("mongoose");
const { hash } = require("bcryptjs");
const loader = require("../tests/community-loader.cjs");
require("@next/env").loadEnvConfig(process.cwd());
// Explicit opt-in only. Never use the application's default database or clear collections.
async function seed() {
 const dbName = process.env.COMMUNITY_DEMO_DB;
 const password = process.env.COMMUNITY_DEMO_PASSWORD;
 if (!dbName || !/^majormate_community_demo(?:_[a-z0-9]+)?$/.test(dbName)) throw new Error("COMMUNITY_DEMO_DB must be majormate_community_demo or majormate_community_demo_<suffix>");
 if (!password || password.length < 12) throw new Error("Set COMMUNITY_DEMO_PASSWORD to a test-only password of at least 12 characters.");
 if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
 if (process.env.MONGODB_DNS_SERVERS) require("node:dns").setServers(process.env.MONGODB_DNS_SERVERS.split(","));
 await mongoose.connect(process.env.MONGODB_URI, { dbName, serverSelectionTimeoutMS: 10000 });
 if (mongoose.connection.name !== dbName) throw new Error("Database isolation failed");
 const load = loader(); const User = load("src/models/User.ts").default;
 const Post = load("src/models/Post.ts").default; const Comment = load("src/models/Comment.ts").default;
 const Scrap = load("src/models/Scrap.ts").default;
 const { Reaction, BoardFavorite, CommunityNotification } = load("src/models/CommunitySupport.ts");
 await Promise.all([User,Post,Comment,Scrap,Reaction,BoardFavorite,CommunityNotification].map(m => m.init()));
 const passwordHash = await hash(password, 12); const users = [];
 for (let i = 0; i < 4; i++) users.push(await User.findOneAndUpdate({ email: `demo${i}@community.invalid` }, { $setOnInsert: { name: `데모 계정 ${i}`, nickname: `데모사용자${i}`, email: `demo${i}@community.invalid`, passwordHash, major: "데모 전공", grade: 2, role: i === 3 ? "ADMIN" : "USER" } }, { upsert: true, returnDocument: "after" }));
 for (const category of ["FREE","QUESTION","INFO","REVIEW"]) for (let i = 1; i <= 15; i++) {
  const title = `[데모] ${category} 게시판 예시 ${i}`;
  const author = users[i % 3], responder = users[(i + 1) % 3];
  const post = await Post.findOneAndUpdate({ author: author._id, title }, { $setOnInsert: { author: author._id, authorNickname: author.nickname, category, title, content: "별도 데모 DB의 발표·테스트용 게시글입니다. 실제 사용자 데이터가 아닙니다.\n검색, 익명 표시, 댓글과 스크랩을 확인해 보세요.", tags: ["데모", i % 2 ? "전공공부" : "프로젝트"], isAnonymous: i % 2 === 0, isPinned: i === 1 && category === "INFO" } }, { upsert: true, returnDocument: "after" });
  const comment = await Comment.findOneAndUpdate({ post: post._id, author: responder._id, parentId: null }, { $setOnInsert: { post: post._id, author: responder._id, authorNickname: responder.nickname, content: "발표용 답변입니다. 실제 데이터와 분리되어 있습니다.", isAnonymous: i % 2 === 0 } }, { upsert: true, returnDocument: "after" });
  if (i % 3 === 0) {
   await Comment.updateOne({ post: post._id, author: author._id, parentId: comment._id }, { $setOnInsert: { post: post._id, author: author._id, authorNickname: author.nickname, parentId: comment._id, content: "글쓴이의 데모 답글입니다.", isAnonymous: post.isAnonymous } }, { upsert: true });
   await Reaction.updateOne({ user: responder._id, targetType: "POST", targetId: post._id }, { $setOnInsert: { user: responder._id, targetType: "POST", targetId: post._id, post: post._id } }, { upsert: true });
  }
  if (i % 2 === 0) await Scrap.updateOne({ user: users[0]._id, targetType: "POST", targetId: post._id }, { $setOnInsert: { user: users[0]._id, targetType: "POST", targetId: post._id } }, { upsert: true });
  const commentCount = await Comment.countDocuments({ post: post._id, status: { $nin: ["HIDDEN","DELETED"] } });
  await Post.updateOne({ _id: post._id }, { $set: { commentCount, acceptedCommentId: category === "QUESTION" && i % 2 === 0 ? comment._id : null } });
 }
 console.log("Seed complete: 60 demo posts (15 per category). Database:", dbName);
 console.log("Test accounts: demo0@community.invalid through demo3@community.invalid (demo3 is the demo-only admin).");
}
seed().catch(error => { console.error(error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, "[redacted]")); process.exitCode = 1; }).finally(() => mongoose.disconnect());
