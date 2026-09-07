/** Explicitly invoked disposable S4 proof; never targets production. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const REF = "jlhotktspjvffslvuyfz";
const ROOT = ".tmp/word-skill-review-staging";
const FILE = `${ROOT}/fixture.json`;
const CLI = process.env.WRITING_PROOF_SUPABASE_CLI;
assert.ok(CLI, "WRITING_PROOF_SUPABASE_CLI required");
const command = process.argv[2];
function run(args) {
  const r = spawnSync(CLI, args, { encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) throw new Error(r.stderr || "Staging command failed");
  return r.stdout;
}
function query(sql) {
  const path = `${ROOT}/proof.sql`; writeFileSync(path, sql, { mode: 0o600 });
  try { const out = run(["db", "query", "--linked", "--project-ref", REF, "--output", "json", "--file", path]); return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)).rows; }
  finally { unlinkSync(path); }
}
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
const save = f => writeFileSync(FILE, JSON.stringify(f, null, 2), { mode: 0o600 });
if (command === "apply") {
  const name = "20260906140000_add_word_skill_review_workflow.sql";
  const sql = readFileSync(`supabase/migrations/${name}`, "utf8");
  assert.ok(!sql.includes("$s4migration$"));
  const before = query("select version from supabase_migrations.schema_migrations where version='20260906140000';");
  if (!before.length) query(`begin; set local lock_timeout='5s'; set local statement_timeout='30s'; ${sql}
    insert into supabase_migrations.schema_migrations(version,name,statements) values('20260906140000','add_word_skill_review_workflow',array[$s4migration$${sql}$s4migration$]); notify pgrst,'reload schema'; commit; select true as applied;`);
  console.log(JSON.stringify({ status: before.length ? "already_applied" : "applied", project: REF, migration: name, sha256: createHash("sha256").update(sql).digest("hex") }));
} else {
  const out = run(["projects", "api-keys", "--project-ref", REF, "--output", "json"]);
  const keys = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
  const key = keys.find(k => k.name === "service_role")?.api_key; assert.ok(key);
  const client = createClient(`https://${REF}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const protectedTables = ["adle_learning_items", "child_gold_coin_ledger_events", "child_gold_bar_ledger_events", "adle_authentic_use_events", "adle_review_schedule_words", "writing_source_snapshots"];
  const counts = async () => Object.fromEntries(await Promise.all(protectedTables.map(async t => { const r = await client.from(t).select("id", { count: "exact", head: true }); check(r); return [t, r.count]; })));
  if (command === "setup") {
    assert.ok(!existsSync(FILE));
    const controls = check(await client.from("adle_word_skill_review_controls").select("*").eq("environment_key", "local").single());
    assert.ok(!controls.review_enabled && !controls.publication_enabled && !controls.withdrawal_enabled);
    const f = { tag: randomUUID(), password: `S4-proof-${randomUUID()}!`, baseline: await counts() };
    f.email = `s4-${f.tag}@example.test`; save(f);
    f.actor = check(await client.auth.admin.createUser({ email: f.email, password: f.password, email_confirm: true })).user.id; save(f);
    f.candidates = [
      { canonicalWordId: "3b2cd8ae-da07-561c-b3a9-fba14f5874c5", microSkillKey: "D4_PAT_WA_WOR_WA", relationshipRole: "demonstrates", sourceReference: "Disposable duplicate of existing approved wash mapping", licenceReference: "Original synthetic proof", method: "existing_authority" },
      { canonicalWordId: "3b2cd8ae-da07-561c-b3a9-fba14f5874c5", microSkillKey: "D4_MOR_BASE_WORDS_IDENTIFY_BASE", relationshipRole: "demonstrates", sourceReference: "Disposable rejection fixture; not a curriculum assertion", licenceReference: "Original synthetic proof", method: "deterministic_candidate" },
    ]; save(f);
    check(await client.from("adle_word_skill_review_controls").update({ review_enabled: true, publication_enabled: true, withdrawal_enabled: true }).eq("environment_key", "local"));
    console.log(JSON.stringify({ status: "fixture_ready", environment: "local", database: "staging" }));
  } else {
    const f = JSON.parse(readFileSync(FILE, "utf8"));
    const packages = check(await client.from("adle_word_skill_candidate_packages").select("*").eq("created_by", f.actor));
    if (command === "restart") {
      assert.equal(f.cleaned, true, "Restart only a cleaned disposable fixture");
      check(await client.auth.admin.createUser({ id: f.actor, email: f.email, password: f.password, email_confirm: true }));
      f.tag = randomUUID(); f.cleaned = false; f.verified = false; save(f);
      check(await client.from("adle_word_skill_review_controls").update({ review_enabled: true, publication_enabled: true, withdrawal_enabled: true }).eq("environment_key", "local"));
      console.log(JSON.stringify({ status: "fixture_restarted" }));
    } else if (command === "verify-runtime") {
      const { loadPublishedWritingAssociations } = await import("../lib/writing-engine/whole-writing/knowledge-repository.ts");
      const { loadCanonicalWordSkillRelationshipAuthority } = await import("../lib/adle/word-skill-relationships/repository.ts");
      const local = await loadPublishedWritingAssociations(client, "local");
      const staging = await loadPublishedWritingAssociations(client, "staging");
      const result = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: "local", explicitReviewedAssociations: local });
      assert.equal(local.length, 1); assert.equal(staging.length, 0);
      assert.equal(result.reconciliation.deduplicatedExactPairCount, 44);
      assert.equal(result.reconciliation.explicitReviewedPairCount, 1);
      assert.ok(!local.some(p => p.microSkillKey === f.candidates[1].microSkillKey));
      console.log(JSON.stringify({ status: "runtime_verified", effectivePairs: 44, reviewedPairs: 1, otherEnvironmentPairs: 0, rejectedPairExcluded: true }));
    } else if (command === "verify") {
      assert.equal(packages.length, 1);
      const pack = packages[0]; assert.equal(pack.environment_key, "local"); assert.deepEqual(pack.candidates, f.candidates);
      const review = check(await client.from("adle_word_skill_package_reviews").select("*").eq("package_id", pack.id).single());
      assert.deepEqual(review.decisions, ["approved", "rejected"]); assert.equal(review.reviewed_by, f.actor);
      const publication = check(await client.from("adle_word_skill_package_publications").select("*").eq("package_id", pack.id).single());
      const pairs = check(await client.from("adle_reviewed_word_skill_pairs").select("*").eq("release_id", publication.release_id));
      assert.equal(pairs.length, 1); assert.equal(pairs[0].micro_skill_key, f.candidates[0].microSkillKey);
      assert.ok(check(await client.from("adle_reviewed_word_skill_withdrawals").select("release_id").eq("release_id", publication.release_id).single()));
      const { loadPublishedWritingAssociations } = await import("../lib/writing-engine/whole-writing/knowledge-repository.ts");
      const associations = await loadPublishedWritingAssociations(client, "local");
      assert.equal(associations.length, 1); assert.equal(associations[0].rowStatus, "inactive");
      assert.deepEqual(await counts(), f.baseline);
      f.packageId = pack.id; f.releaseId = publication.release_id; f.verified = true; save(f);
      console.log(JSON.stringify({ status: "verified", candidates: 2, approved: 1, rejected: 1, publishedPairs: 1, withdrawn: true, noLearningConsequences: true }));
    } else if (command === "cleanup") {
      check(await client.from("adle_word_skill_review_controls").update({ review_enabled: false, publication_enabled: false, withdrawal_enabled: false }).eq("environment_key", "local"));
      assert.match(f.actor, /^[0-9a-f-]{36}$/);
      // Only receipts owned by this exact disposable actor are removed.
      query(`begin;
        create temporary table s4_fixture_releases as select release_id from adle_word_skill_package_publications where package_id in (select id from adle_word_skill_candidate_packages where created_by='${f.actor}');
        delete from writing_enrichment_replay_work where release_id in (select release_id from s4_fixture_releases);
        delete from adle_word_skill_package_publications where package_id in (select id from adle_word_skill_candidate_packages where created_by='${f.actor}');
        delete from adle_word_skill_package_reviews where package_id in (select id from adle_word_skill_candidate_packages where created_by='${f.actor}');
        delete from adle_word_skill_candidate_packages where created_by='${f.actor}';
        delete from adle_reviewed_word_skill_withdrawals where release_id in (select release_id from s4_fixture_releases);
        delete from adle_reviewed_word_skill_pairs where release_id in (select release_id from s4_fixture_releases);
        delete from adle_reviewed_word_skill_releases where id in (select release_id from s4_fixture_releases);
        commit; select true as cleaned;`);
      check(await client.auth.admin.deleteUser(f.actor));
      assert.deepEqual(await counts(), f.baseline);
      assert.equal(check(await client.from("adle_word_skill_candidate_packages").select("id").eq("created_by", f.actor)).length, 0);
      if (f.releaseId) {
        assert.equal(check(await client.from("adle_reviewed_word_skill_releases").select("id").eq("id", f.releaseId)).length, 0);
        assert.equal(check(await client.from("adle_reviewed_word_skill_pairs").select("id").eq("release_id", f.releaseId)).length, 0);
      }
      const controls = check(await client.from("adle_word_skill_review_controls").select("review_enabled,publication_enabled,withdrawal_enabled"));
      assert.ok(controls.every(c => !c.review_enabled && !c.publication_enabled && !c.withdrawal_enabled));
      f.cleaned = true; save(f); console.log(JSON.stringify({ status: "cleanup_verified", noLearningConsequences: true }));
    } else throw new Error("Use apply, setup, restart, verify-runtime, verify or cleanup");
  }
}
