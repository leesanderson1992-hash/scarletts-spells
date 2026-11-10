/** Bind only this teaching-dictionary Preview branch to the pinned staging project. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const branch = "codex/canonical-teaching-dictionary";
assert(process.argv.includes("--apply") &&
  process.argv.includes("--confirm=teaching-preview:staging:branch"));
assert(spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim() === branch);
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
assert.equal(project.projectId, "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl");
assert.equal(project.orgId, "team_wGEZLHjfYh5juZIXKgZMGNRQ");
process.loadEnvFile(".env.staging.local");
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0],
  "qkpjbajicacbrphthibk");
assert.equal(new URL(process.env.SUPABASE_STAGING_DB_URL).username.split(".").at(-1),
  "qkpjbajicacbrphthibk");
const values = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SB_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_USER_IDS: process.env.STAGING_ADMIN_USER_ID,
};
for (const [key, value] of Object.entries(values)) {
  assert(value, `${key}_MISSING`);
  const result = spawnSync("vercel", ["env", "add", key, "preview", branch,
    "--yes", "--force", ...(key.startsWith("NEXT_PUBLIC_") ? ["--no-sensitive"] : [])],
    { input: value, encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) throw new Error(`PREVIEW_ENV_SET_FAILED:${key}:${result.status}`);
  console.log(`${key}: staging branch override installed`);
}
