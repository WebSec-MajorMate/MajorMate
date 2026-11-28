/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const mongoose = require("mongoose");
const { hash } = require("bcryptjs");
const loader = require("./community-loader.cjs");
require("@next/env").loadEnvConfig(process.cwd());
test("production HTTP: real Auth.js login, persisted anonymous post, cross-account update denial and upload protection", { skip:process.env.COMMUNITY_HTTP_TEST !== "1", timeout:120000 }, async () => {
 const dbName = "mm_http_test_" + Date.now();
 const port = 3013, base = "http://127.0.0.1:" + port;
 let child; let serverErrors = "";
 if (process.env.MONGODB_DNS_SERVERS) require("node:dns").setServers(process.env.MONGODB_DNS_SERVERS.split(","));
 try {
  await mongoose.connect(process.env.MONGODB_URI,{dbName,serverSelectionTimeoutMS:10000});
  const load = loader(); const User = load("src/models/User.ts").default; const Post = load("src/models/Post.ts").default;
  const password = randomBytes(20).toString("hex"); const passwordHash = await hash(password,10);
  const a = await User.create({name:"HTTP 검증A",nickname:"HTTP계정A",email:"http-a@community.invalid",passwordHash,major:"테스트",grade:1});
  await User.create({name:"HTTP 검증B",nickname:"HTTP계정B",email:"http-b@community.invalid",passwordHash,major:"테스트",grade:1});
  const uri = new URL(process.env.MONGODB_URI); if (!uri.searchParams.has("authSource")) uri.searchParams.set("authSource",mongoose.connection.getClient().options.credentials?.source || "admin"); uri.pathname = "/" + dbName;
  child = spawn(process.execPath,[path.resolve("node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:process.cwd(),env:{...process.env,MONGODB_URI:uri.toString(), MONGODB_DNS_SERVERS:require("node:dns").getServers().join(",")},windowsHide:true,stdio:["ignore","pipe","pipe"]});
  await new Promise((resolve,reject) => { const timer=setTimeout(() => reject(new Error("HTTP test server startup timed out")),30000); child.stdout.on("data",data => { if(data.toString().includes("Ready")) { clearTimeout(timer);resolve(); } }); child.stderr.on("data",data => { serverErrors += data.toString(); }); child.once("error",reject); child.once("exit",code => { clearTimeout(timer);reject(new Error("HTTP test server exited: "+code)); }); });
  function client() {
   const jar = new Map();
   return async (url,options={}) => {
    const response = await fetch(base+url,{...options,redirect:"manual",headers:{...options.headers,cookie:[...jar].map(([k,v]) => k+"="+v).join("; ")}});
    for(const line of response.headers.getSetCookie()) { const cookie=line.split(";")[0]; const eq=cookie.indexOf("="); jar.set(cookie.slice(0,eq),cookie.slice(eq+1)); }
    return response;
   };
  }
  const A=client(), B=client();
  for(const [request,email] of [[A,"http-a@community.invalid"],[B,"http-b@community.invalid"]]) {
   const csrf = await (await request("/api/auth/csrf")).json();
   const login = await request("/api/auth/callback/credentials",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",origin:base},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+"/community"})});
   assert.equal(login.status,302); assert.equal(login.headers.get("location").includes("error"),false,"Auth.js error: "+new URL(login.headers.get("location"),base).searchParams.get("error"));
   const session = await (await request("/api/auth/session")).json(); assert.ok(session.user?.id);
  }
  function formFields(html) {
   const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m=>m[0]).find(s=>s.includes('name="title"'));
   assert.ok(form,"Post form must be server rendered");
   const fields = new FormData();
   const decode = s => s.replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
   for(const match of form.matchAll(/<input\b[^>]*>/g)) {
    const name=match[0].match(/name="([^"]+)"/)?.[1], value=match[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if(name?.startsWith("$ACTION")) fields.set(decode(name),decode(value));
   }
   assert.ok([...fields.keys()].some(k=>k.startsWith("$ACTION")),"Progressive action fields required");
   return fields;
  }
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
  const upload=await A("/api/community/attachments",{method:"POST",headers:{origin:base,"content-type":"image/png","x-file-name":"test.png"},body:png}); assert.equal(upload.status,201);
  const image=await upload.json(); assert.equal((await B(image.href)).status,404); assert.equal((await A(image.href)).status,200);
  const newPage = await (await A("/community/new")).text(); const fields=formFields(newPage);
  for(const [k,v] of Object.entries({category:"QUESTION",title:"HTTP 실제 게시글",content:"<script>alert(1)</script> 실제 DB 저장",tags:"보안",isAnonymous:"on",attachmentIds:image.id})) fields.set(k,v);
  const created=await A("/community/new",{method:"POST",headers:{origin:base},body:fields});
  assert.equal(created.status,303); const location=created.headers.get("location"); assert.match(location,/\/community\/[a-f0-9]{24}/);
  assert.equal((await B(image.href)).status,200);
  assert.ok((await (await A("/community")).text()).includes("HTTP 실제 게시글"));
  const raw=await Post.findOne({title:"HTTP 실제 게시글"}); assert.equal(String(raw.author),String(a._id));
  const publicHtml=await (await B(location)).text(); assert.equal(publicHtml.includes(String(a._id)),false); assert.equal(publicHtml.includes("HTTP계정A"),false); assert.ok(publicHtml.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  const editUrl=location+"/edit"; const editFields=formFields(await (await A(editUrl)).text());
  for(const [k,v] of Object.entries({category:"FREE",title:"권한 위조 수정",content:"다른 계정이 수정",tags:"",attachmentIds:""})) editFields.set(k,v);
  const denied=await B(editUrl,{method:"POST",headers:{origin:base},body:editFields}); assert.notEqual(denied.status,303);
  assert.equal((await Post.findById(raw._id)).title,"HTTP 실제 게시글");
  const unauth=await fetch(base+"/api/community/attachments",{method:"POST",headers:{origin:base,"content-type":"image/png","x-file-name":"test.png"},body:"x"}); assert.equal(unauth.status,401);
  const csrfDenied=await A("/api/community/attachments",{method:"POST",headers:{origin:"http://evil.invalid","content-type":"image/png","x-file-name":"test.png"},body:"x"}); assert.equal(csrfDenied.status,403);
 } catch(error) { console.error("SERVER_ERROR_TYPES:", serverErrors.split("\n").filter(line => /\[auth\]\[error\]|\[auth\]\[cause\]|Error:/.test(line)).map(line => line.replace(/mongodb(?:\+srv)?:\/\/\S+/gi,"[redacted]")).join("\n")); console.error("HTTP_CHECK_FAILURE:", String(error.message).replace(/mongodb(?:\+srv)?:\/\/\S+/gi,"[redacted]")); throw error; } finally {
  if(child && child.exitCode === null) { child.kill(); await new Promise(resolve => { child.once("exit",resolve); setTimeout(resolve,3000); }); }
  try { if(mongoose.connection.readyState===1 && mongoose.connection.name===dbName && /^mm_http_test_\d+$/.test(dbName)) await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
 }
});
