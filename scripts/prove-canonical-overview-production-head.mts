/** Side-effect-free authenticated HEAD readback for a staged Production build. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import pg from "pg";

const url = process.argv[2];
const sha = process.argv[3];
const method = process.argv.includes("--get") ? "GET" : "HEAD";
if (!url || !/^https:\/\/scarletts-spells(?:-[a-z0-9-]+)?\.vercel\.app$/u.test(url)
  || !sha || !/^[a-f0-9]{40}$/u.test(sha)) throw new Error("EXACT_DEPLOYMENT_AND_SHA_REQUIRED");
// The Vercel CLI can inject a stale local DB URL; use the verified workspace
// connection for the read-only Vault lookup.
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const databaseUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!databaseUrl || new URL(databaseUrl).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
let secret: string;
try {
  await db.connect();
  await db.query("begin read only");
  const result = await db.query(`select decrypted_secret from vault.decrypted_secrets
    where name='writing_context_production_cron_secret'`);
  if (result.rows.length !== 1 || !result.rows[0].decrypted_secret)
    throw new Error("PRODUCTION_CRON_SECRET_UNAVAILABLE");
  secret = result.rows[0].decrypted_secret;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
if (secret.length < 20 || /[\r\n"]/u.test(secret)) throw new Error("CRON_SECRET_FORMAT_UNEXPECTED");
const output = await new Promise<string>((resolve, reject) => {
  const child = spawn("vercel", ["curl", "/api/internal/context-recovery", "--deployment", url,
    "--scope", "team_wGEZLHjfYh5juZIXKgZMGNRQ", "--",
    ...(method === "HEAD" ? ["--head"] : ["--include", "--request", "GET"]),
    "--config", "-"],
  { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve(stdout)
    : reject(new Error(`VERCEL_CURL_FAILED:${code}:${stderr.slice(0, 200)}`)));
  child.stdin.end(`silent\nshow-error\nheader = "Authorization: Bearer ${secret}"\n`);
});
const lines = output.toLowerCase().split(/\r?\n/u);
const header = (name: string) => lines.find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? null;
const result = { status: Number(/^http\/\S+\s+(\d{3})/u.exec(lines[0] ?? "")?.[1] ?? 0),
  deploymentSha: header("x-context-deployment-sha"),
  runtimeFingerprint: header("x-context-runtime-fingerprint"),
  releaseHold: header("x-context-release-hold"),
  identityValid: header("x-context-identity-valid"),
  identityFailures: header("x-context-identity-failures") };
console.log(JSON.stringify(result, null, 2));
assert.equal(result.status, 200);
if (method === "HEAD") {
  assert.equal(result.deploymentSha, sha);
  assert.equal(result.runtimeFingerprint,
    "5d2de1feb5104acbba1ad3edb2652830b6fdd71d40af36af422eabd47274bd35");
  assert.equal(result.releaseHold, "disabled");
  assert.equal(result.identityValid, "true");
  assert.equal(result.identityFailures, "none");
}
if (method === "GET") {
  const separator = /\r?\n\r?\n/u.exec(output);
  if (!separator) throw new Error("RECOVERY_RESPONSE_BODY_MISSING");
  const body = JSON.parse(output.slice(separator.index + separator[0].length));
  assert.equal(body.deploymentSha, sha);
  assert.equal(body.runtimeFingerprint,
    "5d2de1feb5104acbba1ad3edb2652830b6fdd71d40af36af422eabd47274bd35");
  assert.equal(body.releaseHold, false);
  console.log(JSON.stringify({ recoveryGet: "passed", course: body.course?.status ?? null,
    adle: body.adle?.status ?? null }));
}
