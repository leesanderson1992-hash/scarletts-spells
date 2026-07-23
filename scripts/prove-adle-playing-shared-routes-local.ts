import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_ADLE_PLAYING_SHARED_ROUTES_LOCALLY";
if (process.argv[2] !== CONFIRMATION) {
  throw new Error(`Refusing local fixture proof without: -- ${CONFIRMATION}`);
}

const root = process.cwd();
const sqlPath = resolve(root, "scripts/sql/prove-adle-playing-shared-routes-local.sql");
const protectedTables = [
  "children", "adle_learning_items", "daily_assignments", "assignment_items",
  "adle_review_schedule_words", "adle_review_outcome_events",
  "learning_item_evidence", "spelling_reward_events", "child_gold_coin_ledger_events",
  "child_word_treasures", "child_word_treasure_events",
] as const;

function psql(sql: string): string {
  return execFileSync("docker", [
    "exec", "-i", "supabase_db_scarletts-spells", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At",
  ], { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

const snapshotSql = `select jsonb_object_agg(table_name,row_count order by table_name) from (${protectedTables
  .map((table) => `select '${table}'::text table_name,count(*)::bigint row_count from public.${table}`)
  .join(" union all ")}) counts;`;
const before = JSON.parse(psql(snapshotSql).trim()) as Record<string, number>;
const proofOutput = psql(readFileSync(sqlPath, "utf8"));
const proofLine = proofOutput.split("\n").find((line) => line.includes('"proofTag": "adle_playing_shared_routes_local_proof"'));
if (!proofLine) throw new Error(`Local proof returned no receipt:\n${proofOutput}`);
const proof = JSON.parse(proofLine) as Record<string, unknown>;
const after = JSON.parse(psql(snapshotSql).trim()) as Record<string, number>;
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(`Protected local state changed despite proof rollback: ${JSON.stringify({ before, after })}`);
}
const residue = Number(psql("select count(*) from public.children where notes='adle_playing_shared_routes_local_proof';").trim());
if (residue !== 0) throw new Error(`Local proof fixture residue remains: ${residue}`);

const receipt = {
  ...proof,
  protectedStateUnchanged: true,
  fixtureResidue: residue,
  verifiedAt: new Date().toISOString(),
};
const outputDir = resolve(root, "outputs/adle-playing-shared-routes-proof");
mkdirSync(outputDir, { recursive: true });
const receiptPath = resolve(outputDir, "local-proof-receipt.json");
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
