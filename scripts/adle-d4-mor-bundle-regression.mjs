import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BUILD_ROOT = ".next";
const ROUTE_ROOT = join(BUILD_ROOT, "server/app/learn/week/adle/page");
const CLIENT_MANIFEST = join(BUILD_ROOT, "server/app/learn/week/adle/page_client-reference-manifest.js");
const DYNAMIC_MANIFEST = join(ROUTE_ROOT, "react-loadable-manifest.json");
const BUDGET_BYTES = 150 * 1024;
const WORD_LAB_MARKERS = ["Rebuild the word", "un- is the first two letters"];

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function staticChunkPath(relativePath) {
  return join(BUILD_ROOT, relativePath.replace(/^\/?_next\//, ""));
}

const clientManifest = readFileSync(CLIENT_MANIFEST, "utf8");
const entryStart = clientManifest.indexOf('"entryJSFiles"');
assert(entryStart >= 0, "ADLE client-reference manifest exposes entryJSFiles");
const entrySection = clientManifest.slice(entryStart);
const entryChunks = [...new Set([...entrySection.matchAll(/static\/chunks\/[A-Za-z0-9._~-]+\.js/g)].map((match) => match[0]))];
assert(entryChunks.length > 0, "ADLE route has client entry chunks");

const dynamicManifest = JSON.parse(readFileSync(DYNAMIC_MANIFEST, "utf8"));
const dynamicChunks = [...new Set(Object.values(dynamicManifest).flatMap((entry) => entry.files ?? []).filter((file) => file.endsWith(".js")))];
assert(dynamicChunks.length > 0, "ADLE route has a dynamic Word Lab chunk");
assert(dynamicChunks.every((chunk) => !entryChunks.includes(chunk)), "Word Lab dynamic chunks are absent from the ADLE entry chunk list");

const entryText = entryChunks.map((chunk) => readFileSync(staticChunkPath(chunk), "utf8")).join("\n");
assert(WORD_LAB_MARKERS.every((marker) => !entryText.includes(marker)), "warm ADLE entry chunks contain no Word Lab implementation markers");

const dynamicBuffers = dynamicChunks.map((chunk) => readFileSync(staticChunkPath(chunk)));
const dynamicText = dynamicBuffers.map((buffer) => buffer.toString("utf8")).join("\n");
assert(WORD_LAB_MARKERS.some((marker) => dynamicText.includes(marker)), "dynamic chunk contains the Word Lab implementation");
const compressedBytes = dynamicBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0);
assert(compressedBytes <= BUDGET_BYTES, `Word Lab dynamic chunks stay within ${BUDGET_BYTES} compressed bytes`);

const rawBytes = dynamicChunks.reduce((total, chunk) => total + statSync(staticChunkPath(chunk)).size, 0);
const buildSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
console.log("ADLE D4_MOR bundle regression passed", JSON.stringify({
  buildSha,
  entryChunks,
  dynamicChunks,
  rawBytes,
  compressedBytes,
  compressedBudgetBytes: BUDGET_BYTES,
}));
