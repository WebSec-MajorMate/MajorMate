/* eslint-disable @typescript-eslint/no-require-imports -- Opt-in real database/API integration check. */
// Prefer `node tests/chat-local.cjs` (isolated local replica set and app server).
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const { setServers } = require("node:dns");
const fs = require("node:fs");
const path = require("node:path");
const { hash } = require("bcryptjs");

async function main() {
  const base = process.env.CHAT_TEST_URL || "http://localhost:3100";
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Integration checks require a local app server.");
  if (!/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI ?? "") && process.env.CHAT_TEST_ALLOW_EXTERNAL !== "1") {
    throw new Error("External database mutation requires explicit approval and CHAT_TEST_ALLOW_EXTERNAL=1. Use chat-local.cjs instead.");
  }
  if (process.argv.includes("--keep") && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(process.env.MONGODB_URI ?? "")) throw new Error("Retaining fixtures is only allowed with a local database.");
  const dns = process.env.MONGODB_DNS_SERVERS?.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (dns?.length) setServers(dns);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const fixturePath = path.join(__dirname, "../.next/chat-fixture.json");
  if (process.argv.includes("--cleanup")) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const ids = fixture.users.map((user) => new mongoose.Types.ObjectId(user.id));
    assert.ok(ids.length === 3 && fixture.users.every((user) => user.email.endsWith("@chat-test.invalid")));
    await db.collection("messages").deleteMany({ sender: { $in: ids } });
    await db.collection("messagerooms").deleteMany({ participants: { $in: ids } });
    await db.collection("users").deleteMany({ _id: { $in: ids }, email: { $in: fixture.users.map((user) => user.email) } });
    fs.unlinkSync(fixturePath);
    console.log("Temporary chat fixtures removed.");
    await mongoose.disconnect();
    return;
  }
  const run = randomUUID().slice(0, 8);
  const password = `Dm-${randomUUID()}!`;
  const passwordHash = await hash(password, 10);
  const users = ["A", "B", "C"].map((name) => ({ _id: new mongoose.Types.ObjectId(), name: `DM검증${name}`, nickname: `DM검증${name}${run}`, email: `${name.toLowerCase()}-${run}@chat-test.invalid`, passwordHash, major: "컴퓨터공학", grade: 3, role: "USER", mannerScore: 36.5, studyTags: [], studyStyle: "ANY", bio: "" }));
  let keep = false;
  try {
    await db.collection("users").insertMany(users);
    const pair = users.slice(0, 2).map((user) => String(user._id)).sort().join(":");
    const roomId = new mongoose.Types.ObjectId();
    await db.collection("messagerooms").insertOne({ _id: roomId, participants: users.slice(0, 2).map((user) => user._id), participantKey: pair, lastMessage: "", lastMessageAt: new Date(), readThrough: {}, createdAt: new Date(), updatedAt: new Date() });
    const { encode } = await import("next-auth/jwt");
    const cookieName = "__Secure-majormate.session-token";
    const cookies = await Promise.all(users.map(async (user) => `${cookieName}=${await encode({ secret: process.env.AUTH_SECRET, salt: cookieName, token: { id: String(user._id), name: user.name, nickname: user.nickname, major: user.major, grade: user.grade }, maxAge: 3600 })}`));
    const request = (who, url, body, headers = {}) => fetch(base + url, { method: body === undefined ? "GET" : "POST", headers: { Cookie: cookies[who], Origin: base, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const room = String(roomId);
    assert.equal((await fetch(base + "/api/messages")).status, 401);
    for (const url of [`/api/messages?roomId=${room}`, `/api/messages/stream?roomId=${room}`, `/api/messages?roomId=${room}&after=0`]) assert.equal((await request(2, url)).status, 404);
    assert.equal((await request(0, "/api/messages", { roomId: room, content: "hello", clientMessageId: randomUUID() }, { Origin: "https://other.invalid" })).status, 403);
    const payload = { roomId: room, content: "첫 번째 실시간 메시지", clientMessageId: randomUUID() };
    const [send1, send2] = await Promise.all([request(0, "/api/messages", payload), request(0, "/api/messages", payload)]);
    assert.equal(send1.status, 200, await send1.clone().text());
    assert.equal(send2.status, 200, await send2.clone().text());
    const first = await send1.json();
    assert.equal(first.id, (await send2.json()).id);
    assert.equal(await db.collection("messages").countDocuments({ room: roomId, clientMessageId: payload.clientMessageId }), 1);
    assert.equal((await request(0, "/api/messages", { ...payload, content: "변조" })).status, 409);
    assert.equal((await request(2, "/api/messages", { ...payload, clientMessageId: randomUUID() })).status, 404);
    assert.equal((await (await request(1, "/api/messages")).json())[0].unreadCount, 1);
    const controller = new AbortController();
    const sse = await fetch(base + `/api/messages/stream?roomId=${room}`, { headers: { Cookie: cookies[1] }, signal: controller.signal });
    assert.equal(sse.status, 200);
    assert.match(sse.headers.get("content-type"), /text\/event-stream/);
    const reader = sse.body.getReader();
    const decoder = new TextDecoder();
    const firstFrame = decoder.decode((await reader.read()).value);
    assert.ok(firstFrame.includes(first.id));
    const nextResponse = await request(0, "/api/messages", { roomId: room, content: "자동으로 도착하는 메시지", clientMessageId: randomUUID() });
    assert.equal(nextResponse.status, 200);
    const next = await nextResponse.json();
    let observed = false;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      let buffer = "";
      while (!observed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes(next.id)) observed = true;
      }
    } finally { clearTimeout(timeout); controller.abort(); }
    assert.ok(observed, "new messages should arrive on the existing SSE connection");
    assert.equal((await request(2, "/api/messages/read", { roomId: room, through: next.sequence })).status, 404);
    assert.equal((await request(1, "/api/messages/read", { roomId: room, through: next.sequence })).status, 200);
    assert.equal((await (await request(1, "/api/messages")).json())[0].unreadCount, 0);
    assert.equal((await (await request(0, `/api/messages?roomId=${room}`)).json()).readThrough, next.sequence);
    // Older receipts must never move the read watermark backwards.
    await request(1, "/api/messages/read", { roomId: room, through: first.sequence });
    assert.equal((await (await request(0, `/api/messages?roomId=${room}`)).json()).readThrough, next.sequence);
    const bulk = Array.from({ length: 125 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), sequence: next.sequence + index + 1, room: roomId, sender: users[1]._id, receiver: users[0]._id, content: `이전 대화 검증 ${index + 1}`, isRead: false, createdAt: new Date(), updatedAt: new Date() }));
    await db.collection("messages").insertMany(bulk);
    await db.collection("messagerooms").updateOne({ _id: roomId }, { $set: { lastSequence: next.sequence + 125 } });
    const latest = await (await request(0, `/api/messages?roomId=${room}`)).json();
    assert.equal(latest.messages.length, 50);
    assert.ok(latest.olderCursor);
    const older = await (await request(0, `/api/messages?roomId=${room}&before=${latest.olderCursor}`)).json();
    assert.equal(older.messages.length, 50);
    assert.ok(older.messages.at(-1).sequence < latest.messages[0].sequence);
    const catchup = await (await request(0, `/api/messages?roomId=${room}&after=${next.sequence}`)).json();
    assert.equal(catchup.messages.length, 100);
    assert.equal(catchup.hasMore, true);
    const catchup2 = await (await request(0, `/api/messages?roomId=${room}&after=${catchup.messages.at(-1).sequence}`)).json();
    assert.equal(catchup2.messages.length, 25);
    assert.equal(catchup2.hasMore, false);
    const page = await request(0, `/messages/${room}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes("메시지 입력") && html.includes("이전 대화 검증 125"));
    assert.ok(html.includes("대화 목록") && html.includes(users[1].nickname));
    console.log("PASS: authentication, IDOR, CSRF, concurrent idempotency, SSE delivery, unread counts, monotonic receipts, history and >100-message recovery.");
    await require("./chat-regressions.cjs")(db, users, request);
    if (process.argv.includes("--keep")) {
      fs.writeFileSync(fixturePath, JSON.stringify({ roomId: room, password, users: users.map((user) => ({ id: String(user._id), email: user.email, nickname: user.nickname })) }));
      keep = true;
      console.log("Temporary UI fixtures retained in ignored .next/chat-fixture.json. Run --cleanup after browser checks.");
    }
  } finally {
    if (!keep) {
      const ids = users.map((user) => user._id);
      await db.collection("messages").deleteMany({ sender: { $in: ids } });
      await db.collection("messagerooms").deleteMany({ participants: { $in: ids } });
      await db.collection("users").deleteMany({ _id: { $in: ids } });
    }
    await mongoose.disconnect();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
