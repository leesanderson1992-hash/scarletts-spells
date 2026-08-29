import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const EXPECTED_BASE_SHA = "a57fe67fe840fa02f0d326391c230daa9a36f485";
const root = resolve(import.meta.dirname, "..");
const receiptPath = resolve(root, "scripts/fixtures/adle-phase-e7b-restoration-receipt.json");
const restorationPath = resolve(root, "scripts/sql/adle-phase-e7b-forward-restoration.sql");

const capturedFunctions = [
  {
    signature: "public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)",
    expectedHash: "79a98937b6664476f857b331a34eabd21d7170f4ec337681c2a54351c9103ff8",
  },
  {
    signature: "public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)",
    expectedHash: "afa14e96373e76c15ba2e90f090de3169ac626870fe4093cb6c84ae7f420185e",
  },
  {
    signature: "public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)",
    expectedHash: "d6697eddbefc3f9636f9ff6645b74fd2f28670746fa69d66178d65f955af37d7",
  },
  {
    signature: "public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)",
    expectedHash: "ac5ab5f28efc192de35be465c2c7e167d7e91a081321b8dbfb3d96ed7557b576",
  },
  {
    signature: "public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)",
    expectedHash: "4ee491437a6e6edd287ae187424ea013405a5bbbb9e1f0756f75813511be62c1",
  },
  {
    signature: "public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)",
    expectedHash: "8398fd1077d13846d3c02a3ff7b0613ae628e316763f1be1296d689522e48c2b",
  },
  {
    signature: "public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)",
    expectedHash: "bf99950e871a45ef1260eff1626d291c09f23b2449cf286a486888c46e2811c0",
  },
] as const;

const aggregateValidator = {
  signature: "public.adle_lesson_snapshot_is_structurally_valid(jsonb)",
  expectedHash: "37fe23fa813f0e3746161f691460e1481daf6852476a3ae8a2406629e5689823",
} as const;

type CapturedFunction = {
  signature: string;
  definition: string;
  definitionSha256: string;
  serviceRoleExecute: boolean;
  authenticatedExecute: boolean;
  anonExecute: boolean;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function currentHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function statement(definition: string) {
  return `${definition.trimEnd()};`;
}

function grantStatements(row: CapturedFunction) {
  const grants = [
    `revoke all on function ${row.signature} from public, anon, authenticated;`,
  ];
  if (row.serviceRoleExecute) grants.push(`grant execute on function ${row.signature} to service_role;`);
  if (row.authenticatedExecute) grants.push(`grant execute on function ${row.signature} to authenticated;`);
  if (row.anonExecute) grants.push(`grant execute on function ${row.signature} to anon;`);
  return grants.join("\n");
}

function restorationSql(rows: CapturedFunction[], aggregate: CapturedFunction) {
  const bySignature = new Map(rows.map((row) => [row.signature, row]));
  const ordered = [
    "public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)",
    "public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)",
    "public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)",
    "public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)",
    "public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)",
    "public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)",
    "public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)",
  ].map((signature) => bySignature.get(signature) ?? (() => { throw new Error(`Missing captured ${signature}.`); })());

  const absentChecks = ordered.map((row) => `    '${row.signature}'`).join(",\n");
  const definitions = [ordered[0], ordered[1], aggregate, ...ordered.slice(2)]
    .map((row) => statement(row.definition))
    .join("\n\n");
  const grants = [...ordered, aggregate].map(grantStatements).join("\n\n");
  const hashes = [...ordered, aggregate].map((row) =>
    `        ('${row.signature}', '${row.definitionSha256}')`,
  ).join(",\n");

  return `-- Generated from the final Production pg_get_functiondef receipt captured by Phase E7A/E7B.
-- Restoration is separately governed. Never repair or replay the historical migration ledger.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $phase_e7b_restore_preflight$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
${absentChecks}
  ]
  loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Phase E7B restoration expected an absent retired function: %', v_signature;
    end if;
  end loop;

  select pg_get_functiondef('public.adle_lesson_snapshot_is_structurally_valid(jsonb)'::regprocedure)
    into v_definition;
  if v_definition not like '%when ''3'' then%'
     or v_definition like '%when ''2'' then%'
  then
    raise exception 'Phase E7B restoration requires the v3-only aggregate validator';
  end if;
end
$phase_e7b_restore_preflight$;

${definitions}

${grants}

do $phase_e7b_restore_postflight$
declare
  v_expected record;
  v_oid regprocedure;
  v_hash text;
begin
  for v_expected in
    select * from (values
${hashes}
    ) expected(signature, definition_sha256)
  loop
    v_oid := to_regprocedure(v_expected.signature);
    if v_oid is null then
      raise exception 'Phase E7B restoration failed to recreate %', v_expected.signature;
    end if;
    select encode(extensions.digest(pg_get_functiondef(v_oid), 'sha256'), 'hex') into v_hash;
    if v_hash <> v_expected.definition_sha256 then
      raise exception 'Phase E7B restoration hash mismatch for %', v_expected.signature;
    end if;
  end loop;
end
$phase_e7b_restore_postflight$;

commit;
`;
}

async function main() {
  if (!process.argv.includes("--write")) {
    throw new Error("Pass --write to refresh the governed restoration receipt and SQL artifact.");
  }
  if (currentHead() !== EXPECTED_BASE_SHA) {
    throw new Error(`Restoration capture is pinned to ${EXPECTED_BASE_SHA}.`);
  }
  const connectionString = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim()
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim();
  if (!connectionString) throw new Error("Missing the Production database URL.");
  const url = new URL(connectionString);
  if (
    url.hostname !== required("ADLE_PHASE_E_PRODUCTION_HOST")
    || !url.username.includes(PRODUCTION_PROJECT_REF)
  ) {
    throw new Error("Restoration capture is pinned to the acknowledged Production project.");
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const readOnly = await client.query<{ transaction_read_only: string }>("show transaction_read_only");
    if (readOnly.rows[0]?.transaction_read_only !== "on") throw new Error("Capture transaction is not read-only.");

    const requested = [...capturedFunctions, aggregateValidator];
    const captured: CapturedFunction[] = [];
    for (const expected of requested) {
      const result = await client.query<{
        definition: string;
        service_role_execute: boolean;
        authenticated_execute: boolean;
        anon_execute: boolean;
      }>(`
        select pg_get_functiondef($1::regprocedure) definition,
          has_function_privilege('service_role', $1::regprocedure, 'EXECUTE') service_role_execute,
          has_function_privilege('authenticated', $1::regprocedure, 'EXECUTE') authenticated_execute,
          has_function_privilege('anon', $1::regprocedure, 'EXECUTE') anon_execute
      `, [expected.signature]);
      const row = result.rows[0];
      if (!row) throw new Error(`Missing Production definition for ${expected.signature}.`);
      const definitionSha256 = sha256(row.definition);
      if (definitionSha256 !== expected.expectedHash) {
        throw new Error(`Production definition drift for ${expected.signature}: ${definitionSha256}.`);
      }
      captured.push({
        signature: expected.signature,
        definition: row.definition,
        definitionSha256,
        serviceRoleExecute: row.service_role_execute,
        authenticatedExecute: row.authenticated_execute,
        anonExecute: row.anon_execute,
      });
    }
    await client.query("rollback");

    const aggregate = captured.find((row) => row.signature === aggregateValidator.signature);
    if (!aggregate) throw new Error("Aggregate validator capture is missing.");
    const candidates = captured.filter((row) => row.signature !== aggregateValidator.signature);
    const receipt = {
      contractVersion: "adle_phase_e7b_restoration_receipt_v1",
      productionProjectRef: PRODUCTION_PROJECT_REF,
      baseSha: EXPECTED_BASE_SHA,
      transactionReadOnly: true,
      mutationPerformed: false,
      capturedFunctions: candidates,
      aggregateValidator: aggregate,
    };
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    writeFileSync(restorationPath, restorationSql(candidates, aggregate), "utf8");
    console.log(JSON.stringify({
      status: "captured",
      receiptPath,
      restorationPath,
      functionCount: candidates.length,
      receiptSha256: sha256(JSON.stringify(receipt)),
      restorationSha256: sha256(restorationSql(candidates, aggregate)),
      mutationPerformed: false,
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
