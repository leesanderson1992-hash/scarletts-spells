import { readFileSync } from "node:fs";
import { buildIngReleasePackage } from "../lib/adle/ing/release";

const option = (name: string) => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error(`required:${name}`); return process.argv[index + 1]; };
// Produces a checksummed inactive package only. It cannot publish or activate.
const words = JSON.parse(readFileSync(option("--words"), "utf8"));
const approvals = JSON.parse(readFileSync(option("--approvals"), "utf8"));
console.log(JSON.stringify(buildIngReleasePackage(words, option("--release-key"), approvals), null, 2));
