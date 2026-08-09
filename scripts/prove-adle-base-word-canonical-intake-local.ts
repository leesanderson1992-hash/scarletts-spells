#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_ADLE_BASE_WORD_CANONICAL_INTAKE_LOCALLY";
if (process.argv[2] !== CONFIRMATION) {
  throw new Error(`Refusing local fixture proof without: -- ${CONFIRMATION}`);
}
const container = process.env.ADLE_LOCAL_SUPABASE_DB_CONTAINER?.trim() ||
  "supabase_db_scarletts-spells";
execFileSync("npx", ["tsx", "scripts/adle-base-word-release-authority-regression.ts"], {
  stdio: "inherit",
});
function psql(sql: string): string {
  return execFileSync("docker", [
    "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At",
  ], { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}
const contract = JSON.parse(psql(`
  select jsonb_build_object(
    'functionCount', count(*),
    'signature', min(pg_get_function_identity_arguments(procedure.oid)),
    'serviceExecute', bool_and(has_function_privilege('service_role', procedure.oid, 'EXECUTE')),
    'anonExecute', bool_or(has_function_privilege('anon', procedure.oid, 'EXECUTE')),
    'authenticatedExecute', bool_or(has_function_privilege('authenticated', procedure.oid, 'EXECUTE')),
    'publicExecute', bool_or(has_function_privilege('public', procedure.oid, 'EXECUTE'))
  )
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'adle_persist_canonical_intake';
`).trim()) as Record<string, unknown>;
if (contract.functionCount !== 1) throw new Error(`Expected one persistence RPC: ${JSON.stringify(contract)}`);
const signature = String(contract.signature ?? "");
if (signature.split(",").length !== 15 || !signature.endsWith("p_dependency_fingerprint text")) {
  throw new Error(`Unexpected canonical-intake persistence signature: ${signature}`);
}
if (contract.serviceExecute !== true || contract.anonExecute !== false || contract.authenticatedExecute !== false || contract.publicExecute !== false) {
  throw new Error(`Unexpected canonical-intake persistence grants: ${JSON.stringify(contract)}`);
}
const output = psql(readFileSync(resolve("scripts/sql/prove-adle-base-word-canonical-intake-local.sql"), "utf8"));
const receiptLine = output.split("\n").find((line) => line.includes("BW2A2_RECEIPT:"));
if (!receiptLine) throw new Error(`Local proof returned no receipt:\n${output}`);
const receipt = JSON.parse(receiptLine.slice(receiptLine.indexOf("BW2A2_RECEIPT:") + "BW2A2_RECEIPT:".length));
const residue = Number(psql(`
  select count(*) from public.adle_curriculum_dependency_authorities
  where authority_key like 'bw2a2\\_%' escape '\\';
`).trim());
if (residue !== 0) throw new Error(`BW-2A-2 proof fixture residue remains: ${residue}`);
console.log(JSON.stringify({ ...receipt, fixtureResidue: residue }, null, 2));
