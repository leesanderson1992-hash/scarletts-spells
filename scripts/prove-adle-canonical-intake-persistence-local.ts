#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_ADLE_CANONICAL_INTAKE_PERSISTENCE_LOCALLY";
if (process.argv[2] !== CONFIRMATION) {
  throw new Error(`Refusing local fixture proof without: -- ${CONFIRMATION}`);
}

const root = process.cwd();
const sqlPath = resolve(root, "scripts/sql/prove-adle-canonical-intake-persistence-local.sql");
const container = process.env.ADLE_LOCAL_SUPABASE_DB_CONTAINER?.trim() || "supabase_db_scarletts-spells";

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
    'normalizedHash', min(encode(extensions.digest(
      regexp_replace(pg_get_functiondef(procedure.oid), '\\s+', ' ', 'g'),
      'sha256'
    ), 'hex')),
    'serviceExecute', bool_and(has_function_privilege('service_role', procedure.oid, 'EXECUTE')),
    'anonExecute', bool_or(has_function_privilege('anon', procedure.oid, 'EXECUTE')),
    'authenticatedExecute', bool_or(has_function_privilege('authenticated', procedure.oid, 'EXECUTE')),
    'publicExecute', bool_or(has_function_privilege('public', procedure.oid, 'EXECUTE'))
  )
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'adle_persist_canonical_intake';
`).trim()) as Record<string, unknown>;

if (contract.functionCount !== 1) throw new Error(`Expected one canonical-intake persistence function: ${JSON.stringify(contract)}`);
const signature = String(contract.signature ?? "");
if (signature.split(",").length !== 11 || !signature.endsWith("p_route_id text, p_route_version text")) {
  throw new Error(`Unexpected canonical-intake persistence signature: ${signature}`);
}
if (contract.serviceExecute !== true || contract.anonExecute !== false || contract.authenticatedExecute !== false || contract.publicExecute !== false) {
  throw new Error(`Unexpected canonical-intake persistence grants: ${JSON.stringify(contract)}`);
}

const proofOutput = psql(readFileSync(sqlPath, "utf8"));
const receiptLine = proofOutput.split("\n").find((line) => line.includes("BW0_RECEIPT:"));
if (!receiptLine) throw new Error(`Local proof returned no receipt:\n${proofOutput}`);
const receipt = JSON.parse(receiptLine.slice(receiptLine.indexOf("BW0_RECEIPT:") + "BW0_RECEIPT:".length));

console.log(JSON.stringify({
  ...receipt,
  function: contract,
  protectedStateUnchanged: true,
}, null, 2));
