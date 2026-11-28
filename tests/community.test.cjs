/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const loader = require("./community-loader.cjs");
const load = loader();
const validation = load("src/lib/community-validation.ts");
test("post validation rejects injection, invalid category, oversized inputs and tags", () => {
 const base = { category: "FREE", title: "제목입니다", content: "내용입니다" };
 for (const patch of [{ title: { $ne: null } }, { category: "ADMIN" }, { content: " " }, { title: "x".repeat(101) }, { content: "x".repeat(5001) }, { tags: "a,b,c,d,e,f" }, { tags: "x".repeat(21) }]) assert.equal(validation.postInputSchema.safeParse({ ...base, ...patch }).success, false);
 const parsed = validation.postInputSchema.parse({ ...base, tags: " #전공, 취업, 전공 " });
 assert.equal(parsed.tags.join(","), "전공,취업");
});
test("search escapes all regex metacharacters; search/filter objects are rejected", () => {
 const value = ".*+?^${}()|[]\\";
 assert.equal(new RegExp(validation.escapeCommunityRegex(value)).test(value), true);
 assert.equal(new RegExp(validation.escapeCommunityRegex(".*")).test("other"), false);
 for (const patch of [{ q: { $gt: "" } }, { page: -1 }, { page: 1.1 }, { q: "x".repeat(101) }, { sort: "$where" }, { period: "year" }]) assert.equal(validation.communityFilterSchema.safeParse(patch).success, false);
});
test("list return URL refuses external URLs and other routes", () => {
 for (const url of ["https://evil.test", "//evil.test", "/my", "/community/abc", "/community#x"]) assert.equal(validation.safeCommunityReturn(url), "/community");
 assert.equal(validation.safeCommunityReturn("/community?q=test&page=2"), "/community?q=test&page=2");
});
test("anonymous public author has no identity or account ID", () => {
 const policy = loader({ "@/auth": {}, "@/lib/mongodb": {}, "@/models/CommunitySupport": {}, "@/models/User": {} })("src/lib/community-policy.ts");
 const dto = policy.publicAuthor("secret-user-id", "secret-name", true, "viewer");
 assert.equal(dto.authorNickname, "익명"); assert.equal(dto.isMine, false);
 assert.equal(JSON.stringify(dto).includes("secret"), false);
});
test("all mutation entry points reject unauthenticated callers before writes", async () => {
 let connects = 0;
 const loadActions = loader({
  "@/auth": { auth: async () => null },
  "@/lib/mongodb": { connectToDatabase: async () => { connects++; } },
  "next/cache": { revalidatePath: () => {} },
  "next/navigation": { redirect: () => { throw new Error("redirect"); } },
 });
 const actions = loadActions("src/app/actions/community.ts");
 const id = "111111111111111111111111";
 for (const fn of [
  () => actions.createPostAction({}, new FormData()),
  () => actions.updatePostAction(id, {}, new FormData()),
  () => actions.createCommentAction(id, {}, new FormData()),
  () => actions.updateCommentAction(id, {}, new FormData()),
  () => actions.communityCommandAction({}, new FormData()),
 ]) assert.match((await fn()).message, /로그인/);
 await assert.rejects(actions.deletePostAction(id, new FormData()), /로그인/);
 await assert.rejects(actions.deleteCommentAction(id, new FormData()), /로그인/);
 await assert.rejects(actions.setScrapAction("POST", id, true, new FormData()), /로그인/);
 assert.equal(connects, 0);
});
test("reaction, favorite, report, notification and view schemas enforce compound uniqueness", () => {
 const models = load("src/models/CommunitySupport.ts");
 for (const [model, keys] of [[models.Reaction, ["user","targetType","targetId"]], [models.BoardFavorite, ["user","category"]], [models.CommunityReport, ["reporter","targetType","targetId"]], [models.CommunityNotification, ["recipient","eventKey"]], [models.CommunityView, ["user","post","bucket"]]]) assert.ok(model.schema.indexes().some(([fields, opts]) => opts.unique && keys.every(key => fields[key] === 1)));
});

test("image validation rejects SVG/HTML, MIME spoofing, oversized files and extension mismatch", () => {
 const image = load("src/lib/community-images.ts");
 const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
 image.validateCommunityImage(png,"image/png");
 image.validateCommunityImageName("증빙.png","image/png");
 for (const [bytes,mime] of [[png,"image/jpeg"],[Buffer.from("<svg/>"),"image/svg+xml"],[Buffer.from("<html>"),"image/png"],[Buffer.alloc(5*1024*1024+1),"image/png"]]) assert.throws(() => image.validateCommunityImage(bytes,mime));
 for (const [name,mime] of [["x.svg","image/png"],["../x.png","image/png"],["x.png","image/jpeg"],["x.html","text/html"]]) assert.throws(() => image.validateCommunityImageName(name,mime));
});
test("image upload rejects cross-origin and unauthenticated requests", async () => {
 const { NextRequest } = require("next/server");
 const route = loader({
  "@/auth": { auth: async () => null }, "@/lib/mongodb": {},
 })("src/app/api/community/attachments/route.ts");
 assert.equal((await route.POST(new NextRequest("http://localhost/api/community/attachments", { method: "POST", headers: { origin: "http://evil.test" }, body: "x" }))).status,403);
 assert.equal((await route.POST(new NextRequest("http://localhost/api/community/attachments", { method: "POST", headers: { origin: "http://localhost" }, body: "x" }))).status,401);
});
test("image upload validates bytes and size before storing; does not return owner", async () => {
 const { NextRequest } = require("next/server"); let writes = 0;
 const route = loader({
  "@/lib/community-policy": { communityActor: async () => ({ id: "111111111111111111111111" }) },
  "@/models/CommunityAttachment": { countDocuments: async () => 0, create: async () => { writes++; return { _id: "222222222222222222222222" }; } },
 })("src/app/api/community/attachments/route.ts");
 const request = (body, type = "image/png", name = "x.png", extra = {}) => new NextRequest("http://localhost/api/community/attachments", { method: "POST", headers: { origin: "http://localhost", "content-type": type, "x-file-name": name, ...extra }, body });
 assert.equal((await route.POST(request("<html>"))).status,400);
 assert.equal((await route.POST(request("x","image/png","x.png",{ "content-length": String(5*1024*1024+1) }))).status,413);
 const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
 const response = await route.POST(request(png)); assert.equal(response.status,201); assert.equal(writes,1);
 assert.equal(JSON.stringify(await response.json()).includes("111111111111111111111111"),false);
});
test("draft image privacy, hidden post images and foreign draft deletion are enforced", async () => {
 const id = "222222222222222222222222"; const owner = "111111111111111111111111";
 const { NextRequest } = require("next/server"); let attached = false; let viewer = "outsider"; let deletionFilter;
 const route = loader({
  "@/auth": { auth: async () => ({ user: { id: viewer } }) },
  "@/lib/mongodb": { connectToDatabase: async () => {} },
  "@/lib/community-policy": { activeContent: { status: { $nin: ["HIDDEN","DELETED"] } }, communityActor: async () => ({ id: viewer }) },
  "@/models/CommunityAttachment": { findById: () => ({ select: () => ({ lean: async () => ({ _id: id, owner, post: attached ? "333333333333333333333333" : null, data: Buffer.from("image"), mime:"image/png", size:5 }) }) }), deleteOne: async f => { deletionFilter = f; return { deletedCount: 0 }; } },
  "@/models/Post": { exists: async () => false },
 })("src/app/api/community/attachments/[attachmentId]/route.ts");
 const context = { params: Promise.resolve({ attachmentId:id }) }; const request = new NextRequest("http://localhost/api/community/attachments/" + id);
 assert.equal((await route.GET(request,context)).status,404);
 viewer = owner; const own = await route.GET(request,context); assert.equal(own.status,200); assert.equal(own.headers.get("cache-control"),"private, no-store");
 attached = true; assert.equal((await route.GET(request,context)).status,404);
 viewer = "outsider";
 assert.equal((await route.DELETE(new NextRequest(request.url,{ method:"DELETE",headers:{origin:"http://localhost"} }),context)).status,404);
 assert.equal(deletionFilter.owner,"outsider"); assert.equal(deletionFilter.post,null);
});

test("same-origin check uses actual Host when Next normalizes its internal URL", () => {
 const { isCommunitySameOrigin } = load("src/lib/community-request.ts");
 const request = origin => ({ headers:new Headers({ origin,host:"127.0.0.1:3013" }), nextUrl:new URL("http://localhost:3013") });
 assert.equal(isCommunitySameOrigin(request("http://127.0.0.1:3013")),true);
 for(const origin of ["http://evil.test","null","http://127.0.0.1:3013/path","javascript:alert(1)"]) assert.equal(isCommunitySameOrigin(request(origin)),false);
});

test("MongoDB DNS override configures both callback and promise resolvers before connecting", async () => {
 const originalUri=process.env.MONGODB_URI, originalDns=process.env.MONGODB_DNS_SERVERS;
 const calls=[]; const connection={connected:true};
 try {
  process.env.MONGODB_URI="mongodb://test.invalid/example"; process.env.MONGODB_DNS_SERVERS="1.1.1.1, 8.8.8.8";
  const db=loader({
   mongoose:{connect:async () => { calls.push("connect");return connection; }},
   "node:dns":{setServers:s => {calls.push("callback:"+s.join(","));},promises:{setServers:s => {calls.push("promise:"+s.join(","));}}},
  })("src/lib/mongodb.ts");
  assert.equal(await db.connectToDatabase(),connection);
  assert.equal(await db.connectToDatabase(),connection);
  assert.equal(calls.join("|"),"callback:1.1.1.1,8.8.8.8|promise:1.1.1.1,8.8.8.8|connect");
 } finally {
  if(originalUri===undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI=originalUri;
  if(originalDns===undefined) delete process.env.MONGODB_DNS_SERVERS; else process.env.MONGODB_DNS_SERVERS=originalDns;
 }
});
