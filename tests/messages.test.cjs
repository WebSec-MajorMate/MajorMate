/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS adapter loads isolated server modules for Node tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the actual TypeScript modules with isolated auth/database adapters.
function load(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename });
  return testModule.exports;
}

const validation = load("src/lib/message-validation.ts");
const me = "111111111111111111111111";
const other = "222222222222222222222222";
const roomId = "333333333333333333333333";
const query = (result) => ({ lean: async () => result, select() { return this; }, sort() { return this; }, limit() { return this; } });

function harness({ loggedIn = true, room = null, recipient = { _id: other } } = {}) {
  const calls = { writes: [], transactions: 0, connects: 0, filters: [] };
  const roomModel = {
    init: async () => {},
    findOne: (filter) => { calls.filters.push(filter); return query(room); },
    updateOne: async (...args) => { calls.writes.push({ type: "preview", args }); },
  };
  const messageModel = {
    db: { transaction: async (callback) => { calls.transactions++; await callback("transaction-session"); } },
    create: async (...args) => { calls.writes.push({ type: "message", args }); return [{ content: args[0][0].content, createdAt: new Date() }]; },
    find: () => { throw new Error("Unauthorized message query"); },
  };
  const mocks = {
    "@/lib/chat-order": { prepareMessageOrder: async () => {}, appendOrderedMessage: async (sender, room, receiver, content, clientMessageId, session) => { const [message] = await messageModel.create([{ sender, room, receiver, content }], { session }); await roomModel.updateOne({ _id: room }, {}, { session }); return message; } },
    "@/lib/chat": { chatConversation: async () => { throw new Error("Unexpected authorized query"); } },
    "server-only": {},
    "@/auth": { auth: async () => loggedIn ? { user: { id: me } } : null },
    "@/lib/mongodb": { connectToDatabase: async () => { calls.connects++; } },
    "@/lib/message-validation": validation,
    "@/models/MessageRoom": roomModel,
    "@/models/Message": messageModel,
    "@/models/User": { findOne: () => query(recipient), exists: async () => !!recipient },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
  };
  return { calls, roomModel, actions: load("src/app/actions/messages.ts", mocks), queries: load("src/lib/messages.ts", mocks) };
}

test("validation rejects object injection, blank and oversized messages", () => {
  for (const content of [{ $gt: "" }, "   ", "x".repeat(2001)]) {
    assert.equal(validation.sendMessageSchema.safeParse({ roomId, content }).success, false);
  }
  assert.equal(validation.sendMessageSchema.safeParse({ roomId: "bad-id", content: "hello" }).success, false);
  assert.equal(validation.startConversationSchema.safeParse({ nickname: { $ne: null } }).success, false);
});

test("pair key is independent of participant order and case", () => {
  assert.equal(validation.participantKey([me, other]), validation.participantKey([other, me]));
  assert.equal(validation.participantKey(["ABC", "DEF"]), "abc:def");
});

test("room schema requires exactly two distinct participants", async () => {
  const Room = load("src/models/MessageRoom.ts").default;
  for (const participants of [[], [me], [me, me], [me, other, roomId]]) {
    await assert.rejects(new Room({ participants, participantKey: "test" }).validate());
  }
  await new Room({ participants: [me, other], participantKey: validation.participantKey([me, other]) }).validate();
  assert.ok(Room.schema.indexes().some(([fields, options]) => fields.participantKey === 1 && options.unique));
});

test("unauthenticated send cannot connect or write", async () => {
  const h = harness({ loggedIn: false });
  assert.ok((await h.actions.sendMessageAction(roomId, {}, new FormData())).error);
  assert.equal(h.calls.connects, 0);
  assert.equal(h.calls.writes.length, 0);
});

test("outsider cannot send; lookup includes session participant", async () => {
  const h = harness();
  const data = new FormData(); data.set("content", "hello");
  assert.ok((await h.actions.sendMessageAction(roomId, {}, data)).error);
  assert.equal(h.calls.filters[0].participants, me);
  assert.equal(h.calls.writes.length, 0);
});

test("sender and receiver come from session and room, ignoring forged fields", async () => {
  const h = harness({ room: { _id: roomId, participants: [me, other] } });
  const data = new FormData();
  data.set("content", "  <script>alert(1)</script>  ");
  data.set("sender", other); data.set("receiver", me);
  assert.equal((await h.actions.sendMessageAction(roomId, {}, data)).success, true);
  const message = h.calls.writes[0].args[0][0];
  assert.equal(message.sender, me); assert.equal(message.receiver, other);
  assert.equal(message.content, "<script>alert(1)</script>");
  assert.equal(h.calls.transactions, 1);
  assert.equal(h.calls.writes[0].args[1].session, h.calls.writes[1].args[2].session);
});

test("outsider cannot query messages in an inaccessible room", async () => {
  const h = harness();
  assert.equal(await h.queries.getMyConversation(roomId), null);
  assert.equal(h.calls.filters[0].participants, me);
});

test("invalid room ID cannot trigger database access", async () => {
  const h = harness();
  assert.equal(await h.queries.getMyConversation("invalid"), null);
  assert.equal(h.calls.connects, 0);
});

test("conversation creation rejects self and missing recipient", async () => {
  for (const recipient of [null, { _id: me }]) {
    const h = harness({ recipient });
    const data = new FormData(); data.set("nickname", "테스트");
    assert.ok((await h.actions.startConversationAction({}, data)).error);
    assert.equal(h.calls.writes.length, 0);
  }
});

test("existing pair room is reused", async () => {
  const h = harness({ room: { _id: roomId } });
  const data = new FormData(); data.set("nickname", "테스트");
  await assert.rejects(h.actions.startConversationAction({}, data), new RegExp(`REDIRECT:/messages/${roomId}`));
  assert.equal(h.calls.filters[0].participantKey, validation.participantKey([me, other]));
  assert.equal(h.calls.writes.length, 0);
});

test("new room uses an atomic upsert with the canonical pair key", async () => {
  const h = harness();
  let captured;
  h.roomModel.findOneAndUpdate = async (...args) => { captured = args; return { _id: roomId }; };
  const data = new FormData(); data.set("nickname", "테스트");
  await assert.rejects(h.actions.startConversationAction({}, data), /REDIRECT:/);
  assert.equal(captured[0].participantKey, validation.participantKey([other, me]));
  assert.equal(captured[2].upsert, true);
  assert.equal(captured[1].$setOnInsert.participants.join(":"), `${me}:${other}`);
});

test("concurrent duplicate room creation returns the winning room", async () => {
  const h = harness();
  let lookups = 0;
  h.roomModel.findOne = () => query(++lookups === 3 ? { _id: roomId } : null);
  h.roomModel.findOneAndUpdate = async () => { throw { code: 11000 }; };
  const data = new FormData(); data.set("nickname", "테스트");
  await assert.rejects(h.actions.startConversationAction({}, data), new RegExp(`REDIRECT:/messages/${roomId}`));
});
