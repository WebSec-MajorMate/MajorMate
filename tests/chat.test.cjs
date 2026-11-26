/* eslint-disable @typescript-eslint/no-require-imports -- Isolated adapters execute the real server module. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, "..", file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, Map, Date, URL, TextDecoder, Response,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name) }, { filename });
  return testModule.exports;
}
const validation = load("src/lib/message-validation.ts");
const user = "111111111111111111111111";
const other = "222222222222222222222222";
const roomId = "333333333333333333333333";
const messageId = "444444444444444444444444";
const clientMessageId = "53775a94-76b5-4c78-8114-468ec3f4abe1";
const query = (data) => ({ lean: async () => data, select() { return this; }, sort() { return this; }, limit() { return this; } });

function harness({ member = true, existing = null, duplicate = false } = {}) {
  const calls = { writes: [], filters: [], connects: 0 };
  const room = { _id: roomId, participants: [user, other], readThrough: { [other]: messageId } };
  const record = { _id: messageId, room: roomId, sender: user, content: "hello", clientMessageId, createdAt: new Date(), sequence: 2, isRead: false };
  let lookups = 0;
  const Message = {
    init: async () => {},
    findOne: () => query(duplicate && ++lookups > 1 ? record : existing),
    find: () => query([]),
    exists: async () => true,
    create: async (data) => { calls.writes.push({ type: "create", data }); if (duplicate) throw { code: 11000 }; return [record]; },
    updateMany: async (filter, update, options) => { calls.writes.push({ type: "read", filter, update, options }); },
    db: { transaction: async (fn) => fn("transaction") },
  };
  const Room = {
    findOne: (filter) => { calls.filters.push(filter); return query(member ? room : null); },
    exists: async (filter) => { calls.filters.push(filter); return member; },
    updateOne: async (filter, update, options) => { calls.writes.push({ type: "room", filter, update, options }); },
  };
  const chat = load("src/lib/chat.ts", {
    "server-only": {}, "@/lib/mongodb": { connectToDatabase: async () => { calls.connects++; } },
    "@/lib/chat-order": { prepareMessageOrder: async () => {}, appendOrderedMessage: async (sender, room, receiver, content, clientMessageId, session) => { const [message] = await Message.create([{ sender, room, receiver, content, clientMessageId }]); await Room.updateOne({ _id: room }, {}, { session }); return message; } },
    "@/lib/message-validation": validation, "@/models/Message": Message, "@/models/MessageRoom": Room,
    "@/models/User": { exists: async () => true, findById: () => query({ nickname: "상대" }) },
  });
  return { calls, chat, record };
}

test("chat validates UUID, scalar IDs, content and strict payloads", () => {
  const valid = { roomId, content: "hello", clientMessageId };
  assert.equal(validation.chatSendSchema.safeParse(valid).success, true);
  for (const invalid of [{ ...valid, roomId: { $ne: null } }, { ...valid, clientMessageId: "bad" }, { ...valid, content: " " }, { ...valid, sender: other }]) {
    assert.equal(validation.chatSendSchema.safeParse(invalid).success, false);
  }
});

test("outsider cannot send, read receipts, or recover messages", async () => {
  const { chat, calls } = harness({ member: false });
  await assert.rejects(chat.chatSend(user, { roomId, content: "hello", clientMessageId }), { status: 404 });
  await assert.rejects(chat.chatRead(user, { roomId, through: 2 }), { status: 404 });
  await assert.rejects(chat.chatSince(user, roomId, 0), { status: 404 });
  assert.ok(calls.filters.every((filter) => filter.participants === user));
  assert.equal(calls.writes.length, 0);
});

test("retry returns existing message without writing again", async () => {
  const original = harness().record;
  const { chat, calls } = harness({ existing: original });
  const result = await chat.chatSend(user, { roomId, content: "hello", clientMessageId });
  assert.equal(result.id, messageId);
  assert.equal(calls.writes.length, 0);
  await assert.rejects(chat.chatSend(user, { roomId, content: "changed", clientMessageId }), { status: 409 });
});

test("concurrent duplicate retry resolves to the original message", async () => {
  const { chat } = harness({ duplicate: true });
  assert.equal((await chat.chatSend(user, { roomId, content: "hello", clientMessageId })).id, messageId);
});

test("send derives sender and receiver and commits preview in the same transaction", async () => {
  const { chat, calls } = harness();
  await chat.chatSend(user, { roomId, content: "hello", clientMessageId });
  assert.equal(calls.writes[0].data[0].sender, user);
  assert.equal(calls.writes[0].data[0].receiver, other);
  assert.equal(calls.writes[1].options.session, "transaction");
});

test("read receipt is scoped to receiver and bounded by a real message", async () => {
  const { chat, calls } = harness();
  await chat.chatRead(user, { roomId, through: 2 });
  assert.equal(calls.writes[0].filter.receiver, user);
  assert.equal(calls.writes[0].filter.sequence.$lte, 2);
  assert.equal(calls.writes[1].update.$max[`readSequences.${user}`], 2);
});

test("snapshot merging preserves older history and removes duplicates", () => {
  const { mergeChatMessages, isNearChatBottom } = load("src/lib/chat-client.ts");
  const merged = mergeChatMessages([{ id: "01", sequence: 1 }, { id: "02", sequence: 2 }], [{ id: "03", sequence: 3 }, { id: "02", sequence: 2, content: "confirmed" }]);
  assert.equal(merged.map((entry) => entry.id).join(","), "01,02,03");
  assert.equal(merged[1].content, "confirmed");
  assert.equal(isNearChatBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 490 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 1000, clientHeight: 500, scrollTop: 100 }), false);
});

test("send acknowledgement cannot mark an unseen incoming message read before recovery and DOM commit", () => {
  const { observedReadBoundary, mergeChatMessages } = load("src/lib/chat-client.ts");
  const seen = { id: "ffff", sequence: 1, mine: false };
  const unseen = { id: "aaaa", sequence: 2, mine: false };
  const acknowledgement = { id: "0000", sequence: 3, mine: true };
  // SSE is delayed. My own acknowledgement renders before incoming sequence 2.
  const acknowledged = mergeChatMessages([seen], [acknowledgement]);
  assert.equal(observedReadBoundary(acknowledged, 1, 3), 1);
  // Recovery advanced, but React has not committed the recovered message yet.
  assert.equal(observedReadBoundary(acknowledged, 3, 3), 1);
  const rendered = mergeChatMessages(acknowledged, [unseen]);
  assert.equal(rendered.map((message) => message.sequence).join(","), "1,2,3");
  assert.equal(observedReadBoundary(rendered, 3, 3), 2);
});

test("HTTP entry point rejects CSRF, malformed JSON and oversized bodies", async () => {
  const { ChatError } = harness().chat;
  const { chatBody } = load("src/lib/chat-http.ts", { "server-only": {}, "@/auth": {}, "@/lib/auth-config": {}, "@/lib/chat": { ChatError } });
  const req = (body, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/messages", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
  await assert.rejects(chatBody(req("{}", "https://elsewhere.test")), { status: 403 });
  await assert.rejects(chatBody(req("{")), { status: 400 });
  await assert.rejects(chatBody(req("x".repeat(17000))), { status: 413 });
  assert.equal((await chatBody(req('{"content":"hello"}'))).content, "hello");
});

test("Origin validation uses the browser-facing host when Next binds to 0.0.0.0", async () => {
  const { ChatError } = harness().chat;
  const { chatBody } = load("src/lib/chat-http.ts", { "server-only": {}, "@/auth": {}, "@/lib/auth-config": {}, "@/lib/chat": { ChatError } });
  const req = (headers) => new Request("http://0.0.0.0:3000/api/messages", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: '{"content":"hello"}',
  });
  for (const host of ["localhost:3000", "127.0.0.1:3000", "192.168.0.12:3000"]) {
    assert.equal((await chatBody(req({ Host: host, Origin: `http://${host}` }))).content, "hello");
  }
  assert.equal((await chatBody(req({ Host: "internal:3000", "X-Forwarded-Host": "majormate.example", "X-Forwarded-Proto": "https", Origin: "https://majormate.example" }))).content, "hello");
  for (const origin of ["https://elsewhere.test", "http://localhost:3001", "https://localhost:3000", "null", "invalid", "http://localhost:3000/path"]) {
    await assert.rejects(chatBody(req({ Host: "localhost:3000", Origin: origin })), { status: 403 });
  }
  await assert.rejects(chatBody(req({ Host: "localhost:3000" })), { status: 403 });
  await assert.rejects(chatBody(req({ Host: "localhost:3000", Origin: "http://localhost:3000", "Sec-Fetch-Site": "cross-site" })), { status: 403 });
});
