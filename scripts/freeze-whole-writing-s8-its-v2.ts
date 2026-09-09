import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ITS_V2_MANIFEST, ITS_V2_MANIFEST_FINGERPRINT } from "../lib/writing-engine/whole-writing/context-its-v2";
import { recordFingerprint, sha256 } from "./lib/whole-writing-g2-corpus";
import { lockedItsFilesV2 } from "./lib/whole-writing-s8-its-release";

const repositoryRoot = resolve(import.meta.dirname, "..");
const corpusRoot = join(repositoryRoot, "data/whole-writing/g2-context-family-corpora");
const outputRoot = join(corpusRoot, "release-evaluations", ITS_V2_MANIFEST.releaseKey);
const outputPath = join(outputRoot, "release.json");
if (process.argv.slice(2).length) throw new Error("The ITS V2 freeze command accepts no options");
if (existsSync(outputPath)) throw new Error(`Release already pinned; never overwrite: ${outputPath}`);

const analyserPath = join(repositoryRoot, "lib/writing-engine/whole-writing/context-its-v2.ts");
const pin = {
  schemaVersion: 1,
  status: "UNPUBLISHED_OFFLINE_RELEASE_CANDIDATE",
  baseline: "845894d7f9d00eb65c9b32ac526c022e5bbf4926",
  documentationAuthorityBaseline: "f7865ab9edab410a3a6f5aba6965457705319b5f",
  manifest: ITS_V2_MANIFEST,
  manifestFingerprint: ITS_V2_MANIFEST_FINGERPRINT,
  sourceSha256: sha256(readFileSync(analyserPath)),
  packageFingerprint: JSON.parse(readFileSync(join(corpusRoot, "manifest.json"), "utf8")).packageFingerprint as string,
  lockedFiles: Object.fromEntries(lockedItsFilesV2().map((path) => [path, sha256(readFileSync(join(corpusRoot, path)))])),
  publicationPerformed: false,
  parentDeliveryEnabled: false,
};
mkdirSync(outputRoot, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ ...pin, fingerprint: recordFingerprint(pin) }, null, 2)}\n`, { flag: "wx" });
console.log(`${ITS_V2_MANIFEST.releaseKey}: ${recordFingerprint(pin)}`);
