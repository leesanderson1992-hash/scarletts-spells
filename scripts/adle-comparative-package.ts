import { readFileSync } from "node:fs";
import { buildComparativeReleasePackage } from "../lib/adle/inflection/release";
const option = (name: string) => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error(`required:${name}`); return process.argv[i + 1]; };
// Produces a checksummed inactive package only. No credentials or publisher call.
const families = JSON.parse(readFileSync(option("--families"), "utf8"));
const approvals = JSON.parse(readFileSync(option("--approvals"), "utf8"));
console.log(JSON.stringify(buildComparativeReleasePackage(families, option("--release-key"), approvals), null, 2));
