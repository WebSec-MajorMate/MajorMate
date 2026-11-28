/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
module.exports = function loader(mocks = {}) {
 const cache = new Map();
 function load(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const req = name => {
   if (Object.hasOwn(mocks, name)) return mocks[name];
   if (name === "server-only") return {};
   if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
   return require(name);
  };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: req, FormData, Request, Response, URL, Buffer, Uint8Array, Date, Map, Set, Error, console, process, URLSearchParams }, { filename });
  return mod.exports;
 }
 return load;
};
