/* eslint-disable @typescript-eslint/no-require-imports -- Regression checks share the local replica set. */
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function clientFunctions() {
  const file = path.join(__dirname, "../src/lib/chat-client.ts");
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, Map });
  return testModule.exports;
}

function legacyActions(userId) {
  const cache = new Map();
  const overrides = {
    "server-only": {},
    "@/auth": { auth: async () => ({ user: { id: userId } }) },
    "@/lib/mongodb": { connectToDatabase: async () => mongoose },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
  };
  const load = (file) => {
    if (cache.has(file)) return cache.get(file);
    const testModule = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module: testModule, exports: testModule.exports, Map, Date,
      require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name),
    });
    cache.set(file, testModule.exports);
    return testModule.exports;
  };
  return load("src/app/actions/messages.ts");
}

module.exports = async function regressions(db, users, request) {
  const { observedReadBoundary, mergeChatMessages } = clientFunctions();
  async function room() {
    const _id = new mongoose.Types.ObjectId();
    await db.collection("messagerooms").insertOne({ _id, participants: users.slice(0, 2).map((user) => user._id), lastMessage: "", lastMessageAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    return _id;
  }
  async function json(responsePromise) {
    const response = await responsePromise;
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const send = (who, roomId, content) => json(request(who, "/api/messages", { roomId: String(roomId), content, clientMessageId: randomUUID() }));

  // P1: peer saves seq 2 while SSE is delayed; my seq 3 acknowledgement arrives
  // first. Exercise the real client's boundary and the real read API together.
  const r1 = await room();
  const seen = await send(0, r1, "already displayed");
  const delayed = await send(0, r1, "not delivered by SSE yet");
  const ownAck = await send(1, r1, "my acknowledgement");
  const rendered = mergeChatMessages([{ ...seen, mine: false }], [{ ...ownAck, mine: true }]);
  let through = observedReadBoundary(rendered, seen.sequence, ownAck.sequence);
  assert.equal(through, seen.sequence);
  await json(request(1, "/api/messages/read", { roomId: String(r1), through }));
  assert.equal((await db.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(delayed.id) })).isRead, false);
  assert.equal((await request(1, "/api/messages/read", { roomId: String(r1), through: ownAck.sequence })).status, 400);
  const recovered = await json(request(1, `/api/messages?roomId=${r1}&after=${seen.sequence}`));
  // Sync has completed but the old DOM is still displayed: boundary stays put.
  assert.equal(observedReadBoundary(rendered, ownAck.sequence, ownAck.sequence), seen.sequence);
  const committed = mergeChatMessages(rendered, recovered.messages);
  through = observedReadBoundary(committed, ownAck.sequence, ownAck.sequence);
  assert.equal(through, delayed.sequence);
  await json(request(1, "/api/messages/read", { roomId: String(r1), through }));
  assert.equal((await db.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(delayed.id) })).isRead, true);

  // P2: one process reserves sequence 1 and deliberately delays commit. The app
  // server in a DIFFERENT process attempts sequence 2 against the same room.
  const r2 = await room();
  await json(request(0, `/api/messages?roomId=${r2}`));
  const highId = new mongoose.Types.ObjectId("fffffffffffffffffffffff0");
  const session = await mongoose.startSession();
  let second;
  try {
    session.startTransaction();
    const reserved = await db.collection("messagerooms").findOneAndUpdate({ _id: r2 }, { $inc: { lastSequence: 1 } }, { session, returnDocument: "after" });
    assert.equal(reserved.lastSequence, 1);
    await db.collection("messages").insertOne({ _id: highId, room: r2, sender: users[0]._id, receiver: users[1]._id, sequence: 1, content: "delayed first transaction", isRead: false, createdAt: new Date(), updatedAt: new Date() }, { session });
    let secondFinished = false;
    second = send(0, r2, "second server process").then((message) => { secondFinished = true; return message; });
    const during = await json(request(1, `/api/messages?roomId=${r2}&after=0`));
    assert.equal(during.messages.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(secondFinished, false, "higher sequence must not commit ahead of the held transaction");
    await session.commitTransaction();
    const secondMessage = await second;
    assert.equal(secondMessage.sequence, 2);
    assert.ok(secondMessage.id < String(highId), "ObjectId order intentionally disagrees with committed room order");
  } finally {
    if (session.inTransaction()) await session.abortTransaction();
    await session.endSession();
  }
  const both = await json(request(1, `/api/messages?roomId=${r2}&after=0`));
  assert.equal(both.messages.map((message) => message.sequence).join(","), "1,2");
  const afterFirst = await json(request(1, `/api/messages?roomId=${r2}&after=1`));
  assert.equal(afterFirst.messages[0].sequence, 2);
  await json(request(1, "/api/messages/read", { roomId: String(r2), through: 1 }));
  const secondUnread = await db.collection("messages").findOne({ room: r2, sequence: 2 });
  assert.equal(secondUnread.isRead, false, "a smaller ObjectId must not be read by a lower sequence receipt");

  // A rolled-back reservation must not leave a sequence gap.
  const rollback = await mongoose.startSession();
  try {
    rollback.startTransaction();
    await db.collection("messagerooms").updateOne({ _id: r2 }, { $inc: { lastSequence: 1 } }, { session: rollback });
    await rollback.abortTransaction();
  } finally { await rollback.endSession(); }
  assert.equal((await send(0, r2, "after rollback")).sequence, 3);

  // Force the delayed message outside the latest 50. Recovery must still return
  // it, regardless of its ObjectId or whether snapshots still contain it.
  const bulk = Array.from({ length: 60 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), room: r2, sequence: index + 4, sender: users[0]._id, receiver: users[1]._id, content: "window filler", isRead: false, createdAt: new Date(), updatedAt: new Date() }));
  await db.collection("messages").insertMany(bulk);
  await db.collection("messagerooms").updateOne({ _id: r2 }, { $set: { lastSequence: 63 } });
  const window = await json(request(1, `/api/messages?roomId=${r2}`));
  assert.ok(!window.messages.some((message) => message.id === String(highId)));
  const all = await json(request(1, `/api/messages?roomId=${r2}&after=0`));
  assert.equal(all.messages[0].id, String(highId));
  assert.equal(all.messages.length, 63);
  const older = await json(request(1, `/api/messages?roomId=${r2}&before=${window.olderCursor}`));
  assert.equal(older.messages.at(-1).sequence, window.messages[0].sequence - 1);

  // Legacy data migrates once under concurrent readers, preserving read flags.
  const r3 = await room();
  const old = ["eeeeeeeeeeeeeeeeeeeeeee1", "111111111111111111111112", "aaaaaaaaaaaaaaaaaaaaaaa3"].map((id, index) => ({ _id: new mongoose.Types.ObjectId(id), room: r3, sender: users[0]._id, receiver: users[1]._id, content: `legacy ${index}`, isRead: index !== 1, createdAt: new Date(1000 + index * 1000), updatedAt: new Date() }));
  await db.collection("messages").insertMany(old);
  const [migratedA, migratedB] = await Promise.all([json(request(0, `/api/messages?roomId=${r3}`)), json(request(1, `/api/messages?roomId=${r3}`))]);
  assert.equal(migratedA.messages.map((message) => message.id).join(","), old.map((message) => String(message._id)).join(","));
  assert.equal(migratedB.messages.map((message) => message.sequence).join(","), "1,2,3");
  assert.equal(migratedB.messages.map((message) => message.isRead).join(","), "true,false,true");
  assert.equal((await send(1, r3, "post migration")).sequence, 4);
  const r4 = await room();
  const form = new FormData();
  form.set("content", "legacy Server Action");
  assert.equal((await legacyActions(String(users[0]._id)).sendMessageAction(String(r4), {}, form)).success, true);
  assert.equal((await send(1, r4, "new HTTP API")).sequence, 2);
  console.log("PASS: P1 delayed SSE/send acknowledgement/DOM boundary; P2 cross-process delayed commit, reversed ObjectIds, rollback, >50-window recovery and concurrent legacy migration.");
};
