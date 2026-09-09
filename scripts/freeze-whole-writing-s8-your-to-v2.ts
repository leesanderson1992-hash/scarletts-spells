import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONTEXT_YOUR_TO_CANDIDATES_V2 } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { recordFingerprint, sha256 } from "./lib/whole-writing-g2-corpus";
import { lockedYourToFilesV2 } from "./lib/whole-writing-s8-your-to-release";

const root = resolve(import.meta.dirname, "..");
const corpus = join(root, "data/whole-writing/g2-context-family-corpora");
const args = process.argv.slice(2);
if (args.length > 1 || args.some((a) => !["--your-v2", "--to-v2"].includes(a))) throw new Error("Unknown freeze option");
const selected = args.length ? [CONTEXT_YOUR_TO_CANDIDATES_V2[args[0] === "--your-v2" ? 0 : 1]] : CONTEXT_YOUR_TO_CANDIDATES_V2;
for (const c of selected) {
  const output = join(corpus, "release-evaluations", c.manifest.releaseKey, "release.json");
  if (existsSync(output)) throw new Error(`Release already pinned; never overwrite: ${output}`);
  for (const [file, hash] of Object.entries(c.manifest.sourceFingerprints)) {
    if (sha256(readFileSync(join(root, "lib/writing-engine/whole-writing", file))) !== hash) throw new Error(`Stale source constant: ${file}`);
  }
  const sourceName = c.manifest.familyKey === "YOUR_YOURE" ? "context-your-v2.ts" : "context-to-v2.ts";
  const pin = {
    schemaVersion: 1, status: "UNPUBLISHED_OFFLINE_RELEASE_CANDIDATE",
    baseline: "5b1a1090edf659093557684955b0ee66c7c50f34",
    documentationAuthorityBaseline: "f7865ab9edab410a3a6f5aba6965457705319b5f",
    manifest: c.manifest, manifestFingerprint: c.fingerprint,
    sourceSha256: (c.manifest.sourceFingerprints as Record<string, string>)[sourceName],
    sourceDependencies: c.manifest.sourceFingerprints,
    packageFingerprint: JSON.parse(readFileSync(join(corpus, "manifest.json"), "utf8")).packageFingerprint as string,
    lockedFiles: Object.fromEntries(lockedYourToFilesV2(c.manifest.familyKey).map((p) => [p, sha256(readFileSync(join(corpus, p)))])),
    publicationPerformed: false, parentDeliveryEnabled: false,
  };
  mkdirSync(join(corpus, "release-evaluations", c.manifest.releaseKey), { recursive: true });
  writeFileSync(output, `${JSON.stringify({ ...pin, fingerprint: recordFingerprint(pin) }, null, 2)}\n`, { flag: "wx" });
  console.log(`${c.manifest.releaseKey}: ${recordFingerprint(pin)}`);
}
