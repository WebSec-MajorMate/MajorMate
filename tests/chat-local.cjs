/* eslint-disable @typescript-eslint/no-require-imports -- Local integration test process orchestration. */
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

async function main() {
  const port = process.env.CHAT_TEST_PORT || "3101";
  const base = `http://localhost:${port}`;
  // Bind locally and use a replica set because message/receipt writes are transactional.
  const mongo = await MongoMemoryReplSet.create({
    binary: { version: "7.0.24", downloadDir: path.join(__dirname, "../node_modules/.cache/mongodb-binaries") },
    replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
  });
  const env = { ...process.env, NODE_ENV: "production", MONGODB_URI: mongo.getUri("majormate_chat_test"), MONGODB_DNS_SERVERS: "", AUTH_SECRET: randomBytes(32).toString("hex"), CHAT_TEST_URL: base, CHAT_TEST_ALLOW_EXTERNAL: "0" };
  const app = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", port], { env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (data) => process.stdout.write(data));
  app.stderr.on("data", (data) => process.stderr.write(data));
  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    app.kill();
    await mongo.stop();
    const fixture = path.join(__dirname, "../.next/chat-fixture.json");
    if (fs.existsSync(fixture)) fs.unlinkSync(fixture);
  };
  process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
  process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(base + "/api/messages")).status === 401) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Local chat test server did not start.");
    const args = [path.join(__dirname, "chat.integration.cjs"), ...(process.argv.includes("--ui") ? ["--keep"] : [])];
    const check = spawn(process.execPath, args, { env, stdio: "inherit" });
    const status = await new Promise((resolve) => check.on("exit", resolve));
    if (status !== 0) throw new Error(`Chat integration failed (${status}).`);
    if (process.argv.includes("--ui")) {
      console.log(`Local UI fixtures ready at ${base}. Ctrl+C removes the local database and stops the server.`);
      await new Promise(() => {});
    }
  } finally { await cleanup(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
