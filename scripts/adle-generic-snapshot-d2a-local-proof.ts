#!/usr/bin/env node
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const historicalV2 = "20260731200000_add_adle_generic_lesson_snapshot_v2.sql";
const reconciliation = "20260822190000_reconcile_adle_generic_snapshot_persistence_v2_v3.sql";
const proofSql = readFileSync(path.join(root, "supabase/tests/adle_generic_snapshot_d2a.sql"), "utf8");
const topologyFixtureSql = readFileSync(path.join(root, "supabase/tests/adle_generic_snapshot_d2a_topology_fixture.sql"), "utf8");
const cliCache = mkdtempSync(path.join(tmpdir(), "scarletts-spells-d2a-supabase-cli-"));

function run(command: string, args: string[], input?: string): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 30_000_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  return output;
}

function runAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} failed\n${output}`));
    });
  });
}

function topologyWorkdir(name: string): string {
  const workdir = mkdtempSync(path.join(tmpdir(), `scarletts-spells-d2a-${name}-`));
  const targetSupabase = path.join(workdir, "supabase");
  const targetMigrations = path.join(targetSupabase, "migrations");
  mkdirSync(targetMigrations, { recursive: true });
  cpSync(path.join(root, "supabase/config.toml"), path.join(targetSupabase, "config.toml"));
  return workdir;
}

const psqlArgs = [
  "exec", "-i", "supabase_db_scarletts-spells",
  "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
];

async function proveTopology(name: string, includeHistoricalV2: boolean): Promise<void> {
  const workdir = topologyWorkdir(name);
  const cli = ["--yes", "--cache", cliCache, "supabase@2.115.0"];
  let resetCompleted = false;
  try {
    run("npx", [...cli, "stop", "--no-backup", "--workdir", workdir]);
    run("npx", [
      ...cli,
      "start", "--workdir", workdir,
      "--exclude", "gotrue,postgrest,realtime,storage-api,imgproxy,kong,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
      "--ignore-health-check",
    ]);
    resetCompleted = true;
    run("docker", psqlArgs, topologyFixtureSql);
    if (includeHistoricalV2) {
      run("docker", psqlArgs, readFileSync(path.join(root, "supabase/migrations", historicalV2), "utf8"));
    }
    run("docker", psqlArgs, readFileSync(path.join(root, "supabase/migrations", reconciliation), "utf8"));
    const proof = run(
      "docker",
      psqlArgs,
      proofSql,
    );
    assert.match(proof, /PASS: D2A local SQL persistence/);

    const call = (caseKey: string) => runAsync("docker", [
      ...psqlArgs, "-At", "-c",
      `select public.persist_adle_generic_daily_plan_v3(
        'd2a00000-0000-4000-8000-000000000001',
        'd2a00000-0000-4000-8000-000000000002',
        plan_date, header, items, '[]'::jsonb, snapshot
      ) from public.d2a_snapshot_concurrency_inputs where case_key='${caseKey}'`,
    ]);
    const identical = await Promise.all([call("identical"), call("identical")]);
    assert.equal(identical[0].trim(), identical[1].trim(), "identical concurrent calls must return one assignment id");

    const conflicting = await Promise.allSettled([call("conflict-a"), call("conflict-b")]);
    assert.equal(conflicting.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(conflicting.filter((result) => result.status === "rejected").length, 1);
    const counts = run("docker", [
      ...psqlArgs, "-At", "-c",
      `select count(*) || ':' || coalesce(sum(item_count),0) from (
        select a.id, count(i.id) as item_count
        from public.daily_assignments a
        left join public.assignment_items i on i.daily_assignment_id=a.id
        where a.parent_user_id='d2a00000-0000-4000-8000-000000000001'
          and a.assignment_date in ('2099-01-06','2099-01-07')
        group by a.id
      ) rows`,
    ]).trim();
    assert.equal(counts, "2:2", "concurrent writes must leave one complete assignment/item set per date");
    console.log(`PASS: D2A ${name} topology`);
  } finally {
    if (resetCompleted) {
      run("docker", [
        ...psqlArgs, "-c",
        "delete from auth.users where id='d2a00000-0000-4000-8000-000000000001'; drop table if exists public.d2a_snapshot_concurrency_inputs;",
      ]);
      run("npx", [...cli, "stop", "--no-backup", "--workdir", workdir]);
    }
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  try {
    await proveTopology("repository-like", true);
    await proveTopology("production-like-without-20260731200000", false);
    console.log("PASS: D2A dual-topology local Supabase proof");
  } finally {
    rmSync(cliCache, { recursive: true, force: true });
  }
}

void main();
