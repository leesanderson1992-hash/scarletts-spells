#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_ADLE_RELEASE_AUTHORITY_FOUNDATION_LOCALLY";
if (process.argv[2] !== CONFIRMATION) {
  throw new Error(`Refusing local fixture proof without: -- ${CONFIRMATION}`);
}

const container = process.env.ADLE_LOCAL_SUPABASE_DB_CONTAINER?.trim()
  || "supabase_db_scarletts-spells";
function psql(sql: string): string {
  return execFileSync("docker", [
    "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-At",
  ], { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

const contract = JSON.parse(psql(`
  select jsonb_build_object(
    'dependencyAuthorities', to_regclass('public.adle_curriculum_dependency_authorities') is not null,
    'releaseManifests', to_regclass('public.adle_curriculum_release_manifests') is not null,
    'activationRevisions', to_regclass('public.adle_route_activation_revisions') is not null,
    'activationHeads', to_regclass('public.adle_route_activation_heads') is not null,
    'serviceClosurePublisher', has_function_privilege('service_role', 'public.publish_adle_teaching_dictionary_closure_v1(jsonb,text,jsonb,text,text)', 'EXECUTE'),
    'serviceReleasePublisher', has_function_privilege('service_role', 'public.publish_adle_curriculum_release_v2(jsonb,text,text)', 'EXECUTE'),
    'serviceActivationWriter', has_function_privilege('service_role', 'public.set_adle_route_activation_revision_v2(text,text,text,text,text,jsonb,uuid,text,text)', 'EXECUTE'),
    'anonActivationWriter', has_function_privilege('anon', 'public.set_adle_route_activation_revision_v2(text,text,text,text,text,jsonb,uuid,text,text)', 'EXECUTE'),
    'authenticatedActivationWriter', has_function_privilege('authenticated', 'public.set_adle_route_activation_revision_v2(text,text,text,text,text,jsonb,uuid,text,text)', 'EXECUTE')
  );
`).trim()) as Record<string, unknown>;
for (const key of [
  "dependencyAuthorities", "releaseManifests", "activationRevisions",
  "activationHeads", "serviceClosurePublisher", "serviceReleasePublisher",
  "serviceActivationWriter",
]) {
  if (contract[key] !== true) throw new Error(`Missing BW-2A-1 contract ${key}: ${JSON.stringify(contract)}`);
}
if (contract.anonActivationWriter !== false || contract.authenticatedActivationWriter !== false) {
  throw new Error(`BW-2A-1 write grants are too broad: ${JSON.stringify(contract)}`);
}

const sql = readFileSync(
  resolve("scripts/sql/prove-adle-release-authority-foundation-local.sql"),
  "utf8",
);
const output = psql(sql);
const line = output.split("\n").find((entry) => entry.includes("BW2A1_RECEIPT:"));
if (!line) throw new Error(`BW-2A-1 local proof returned no receipt:\n${output}`);
const receipt = JSON.parse(line.slice(line.indexOf("BW2A1_RECEIPT:") + "BW2A1_RECEIPT:".length));
const residue = Number(psql(`
  select count(*) from public.adle_curriculum_dependency_authorities
  where source_provenance->>'proofTag' = 'bw2a1_release_authority_local_proof';
`).trim());
if (residue !== 0) throw new Error(`BW-2A-1 proof fixture residue remains: ${residue}`);

console.log(JSON.stringify({ ...receipt, contract, fixtureResidue: residue }, null, 2));
