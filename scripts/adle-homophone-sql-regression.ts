/** Disposable PostgreSQL contract check. It never touches learner or staging data. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { HOMOPHONE_LESSONS, compileHomophoneLessonSnapshot } from "../lib/adle/homophone/lesson";
import { buildHomophoneReleasePackage } from "../lib/adle/homophone/release";
import { compileHomophoneSnapshotV3 } from "../lib/adle/homophone/snapshot";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { initialHomophoneProgress } from "../lib/adle/homophone/progress";
import { homophoneAttemptEvents, homophoneCompletionFacts } from "../lib/adle/homophone/completion";
import { onLessonCompleted } from "../lib/adle/composer-completions";
import { REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import type { LearningItemFact } from "../lib/adle/learning-items";

async function main() {
  const require = createRequire(import.meta.url);
  const root = process.env.PATH?.split(delimiter).map(path => resolve(path, "../@electric-sql/pglite")).find(existsSync);
  if (!root) throw new Error("Run with npx --package=@electric-sql/pglite --package=tsx -c 'tsx scripts/adle-homophone-sql-regression.ts'");
  const { PGlite } = require(root);
  const { pgcrypto } = require(resolve(root, "dist/contrib/pgcrypto.cjs"));
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema extensions; create extension pgcrypto with schema extensions;
      create table micro_skill_catalog(micro_skill_key text primary key);
      create table canonical_teaching_dictionary_words(id uuid primary key,display_word text,dialect_code text,row_status text,review_status text);
      create table adle_curriculum_dependency_authorities(id uuid primary key default gen_random_uuid(),authority_key text,authority_type text,schema_version int,source_classification text,manifest_file_sha256 text,authority_manifest jsonb,authority_manifest_sha256 text,semantic_projection jsonb,semantic_fingerprint text,source_provenance jsonb,approval_refs jsonb,published_by text,unique(authority_type,authority_key),constraint adle_curriculum_dependency_authorities_type_check check(true));
      create table adle_curriculum_release_manifests(id uuid primary key default gen_random_uuid(),release_key text unique,schema_version int,manifest_file_sha256 text,manifest_payload jsonb,release_manifest_sha256 text,dependency_fingerprint text,route_id text,route_version text,activation_route_key text,payload_version int,approval_refs jsonb,published_by text);
      create table adle_curriculum_release_dependencies(release_manifest_id uuid,micro_skill_key text,authority_type text,authority_key text,authority_schema_version int,semantic_fingerprint text,authority_id uuid,constraint adle_curriculum_release_dependencies_type_check check(true));
      create table adle_route_activation_revisions(id uuid primary key default gen_random_uuid(),environment_key text,release_manifest_id uuid,release_manifest_sha256 text,dependency_fingerprint text,route_id text,route_version text,activation_route_key text,micro_skill_key text,activation_status text,incomplete_assignment_policy text,readiness_report jsonb,previous_revision_id uuid,change_reason text,changed_by text);
      create table adle_route_activation_heads(environment_key text,route_id text,route_version text,micro_skill_key text,current_revision_id uuid,updated_at timestamptz,primary key(environment_key,route_id,route_version,micro_skill_key));
      create table daily_assignments(id uuid primary key default gen_random_uuid(),child_id uuid,parent_user_id uuid,assignment_date date,title text,status text,target_words text[],review_words text[],assignment_generation_source text,lesson_route_metadata jsonb,compiled_lesson_snapshot jsonb,compiled_review_snapshot jsonb);
      create table adle_today_session_orchestrations(daily_assignment_id uuid primary key,child_id uuid,parent_user_id uuid,assignment_date date,major_stage text,review_generation_status text,specialist_generation_status text,specialist_started_at timestamptz);
      create table assignment_items(id uuid primary key default gen_random_uuid(),daily_assignment_id uuid,child_id uuid,parent_user_id uuid,domain_module text,item_type text,source_type text,source_entity_id text,template_key text,target_word text,position int,status text,prompt_data jsonb,metadata jsonb);
      create table children(id uuid,parent_user_id uuid,is_archived boolean);
      create table adle_learning_items(id uuid,child_id uuid,canonical_word_id uuid,micro_skill_key text,row_status text,item_status text,source_kind text,reteach_priority boolean,ejected_on date,updated_at timestamptz);
      create table adle_specialist_stage_checkpoints(daily_assignment_id uuid primary key,child_id uuid,parent_user_id uuid,adapter_key text,checkpoint_schema_version text,checkpoint_payload jsonb,lesson_snapshot_fingerprint text,state_version int,completed_at timestamptz,updated_at timestamptz);
      create function adle_lesson_route_metadata_is_valid_v2(jsonb) returns boolean language sql as $$select true$$;
      create function adle_release_activation_allows_child_v2(uuid,uuid) returns boolean language sql as $$select true$$;
      create function adle_route_activation_revision_is_current_v2(uuid,uuid,text,text) returns boolean language sql as $$select true$$;
      create function append_adle_specialist_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function adle_normalize_degree_attempt_v1(text) returns text language sql immutable as $$select lower(btrim($1))$$;
      create table adle_review_bundles(id uuid,child_id uuid,source_ref text,interval_index int,next_due_on date,schedule_policy_version text,bundle_status text,row_status text);
      create table adle_review_schedule_words(id uuid default gen_random_uuid(),child_id uuid,canonical_word_id uuid,bundle_id uuid,membership_status text,catch_up_stage int,next_retest_due_on date,failed_review_on date,pre_retirement_check_due_on date,last_28_day_review_on date,reteach_cycle_count int,taught_on date,row_status text,updated_at timestamptz);
      create table adle_review_schedule_word_routes(schedule_word_id uuid,learning_item_id uuid,micro_skill_key text,attached_on date,attachment_ordinal int,row_status text);
      create table adle_taught_word_history(child_id uuid,canonical_word_id uuid,event_kind text,occurred_on date,source_ref text,row_status text,attempt_text text);
      create table adle_assignment_attempt_events(id uuid default gen_random_uuid(),child_id uuid,parent_user_id uuid,daily_assignment_id uuid,assignment_item_id uuid,canonical_word_id uuid,micro_skill_key text,section_key text,template_key text,target_word text,attempt_text text,is_correct boolean,attempt_kind text,evidence_class text,source_ref text,unique(assignment_item_id,attempt_kind,source_ref));
      create table adle_assignment_attempt_event_routes(attempt_event_id uuid,learning_item_id uuid,micro_skill_key text,unique(attempt_event_id,learning_item_id));
      create table adle_child_learning_reflections(child_id uuid,parent_user_id uuid,daily_assignment_id uuid,micro_skill_key text,content_version text,prompt_key text,prompt_text text,reflection_text text,updated_at timestamptz,unique(daily_assignment_id,prompt_key));
    `);
    const foundation = readFileSync("supabase/migrations/20260809140000_add_adle_release_authority_foundation.sql", "utf8");
    await db.exec(foundation.slice(foundation.indexOf("create or replace function public.adle_canonical_json_text_v1"), foundation.indexOf("revoke all on function public.adle_canonical_json_text_v1")));
    await db.exec("create function adle_generic_snapshot_json_sha256_v1(jsonb) returns text language sql as $$select adle_canonical_json_sha256_v1($1)$$;");
    for (const name of ["adle_generic_lesson_snapshot_is_structurally_valid_v3", "adle_specialist_lesson_snapshot_is_structurally_valid_v3", "adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3", "adle_prefix_base_specialist_snapshot_is_structurally_valid_v3", "adle_comparative_snapshot_valid_v3", "adle_ing_snapshot_valid_v3"]) {
      await db.exec(`create function ${name}(jsonb) returns boolean language sql as $$select true$$;`);
    }
    for (const file of ["20261012170000_adle_homophone_route_v2.sql", "20261012170500_adle_homophone_release_v2.sql", "20261012171000_adle_homophone_finish_v2.sql", "20261012171500_adle_homophone_activation_dependency_count.sql", "20261012172000_adle_homophone_parent_checkpoint.sql", "20261012172500_adle_homophone_checkpoint_idempotent_completion.sql"]) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
    await db.exec(`create function test_homophone_completion_convergence() returns trigger language plpgsql as $$
      begin if old.status is distinct from 'completed' and new.status='completed' then
        update adle_specialist_stage_checkpoints set completed_at=coalesce(completed_at,clock_timestamp())
        where daily_assignment_id=new.id;
      end if; return new; end $$;
      create trigger test_homophone_completion_convergence after update on daily_assignments
      for each row execute function test_homophone_completion_convergence();`);
    const canonicalWords: Record<string, Record<string, string>> = {};
    for (const lesson of HOMOPHONE_LESSONS) {
      await db.query("insert into micro_skill_catalog values($1)", [lesson.microSkillKey]);
      canonicalWords[lesson.microSkillKey] = {};
      for (const word of lesson.words) {
        const canonicalWordId = randomUUID();
        canonicalWords[lesson.microSkillKey][word.word] = canonicalWordId;
        await db.query("insert into canonical_teaching_dictionary_words values($1,$2,'en-GB','active','approved_for_first_exposure')", [canonicalWordId, word.word]);
      }
    }
    const pkg = buildHomophoneReleasePackage({ releaseKey: "homophone-v4-sql-regression", approvalRefs: ["owner-approved-v4"], canonicalWords });
    const published = await db.query("select publish_adle_homophone_package_v2($1,$2,'sql-regression') id", [pkg, fingerprintSnapshotValue(pkg)]);
    assert.equal((await db.query("select publish_adle_homophone_package_v2($1,$2,'sql-regression') id", [pkg, fingerprintSnapshotValue(pkg)])).rows[0].id, published.rows[0].id);
    assert.equal((await db.query("select count(*)::int n from adle_curriculum_dependency_authorities")).rows[0].n, 14);
    assert.equal((await db.query("select count(*)::int n from adle_route_activation_revisions")).rows[0].n, 0);
    for (const lesson of HOMOPHONE_LESSONS) {
      const childId = randomUUID(), parentUserId = randomUUID(), revisionId = randomUUID(), authorityId = randomUUID();
      const compiled = compileHomophoneSnapshotV3({ lesson: compileHomophoneLessonSnapshot(lesson.microSkillKey),
        bindings: lesson.words.map((word, index) => ({ word: word.word, canonicalWordId: canonicalWords[lesson.microSkillKey][word.word], learningItemId: index === 0 ? randomUUID() : null })),
        release: { activationRevisionId: revisionId, releaseManifestId: published.rows[0].id, releaseKey: "homophone-v4-sql-regression",
          releaseManifestSha256: "a".repeat(64), dependencyFingerprint: "b".repeat(64) },
        contentAuthorities: [
          { authorityType: "release_manifest", authorityId: published.rows[0].id, version: "2", sourceHash: "a".repeat(64) },
          { authorityType: "activation_revision", authorityId: revisionId, version: "2", sourceHash: "c".repeat(64) },
          { authorityType: "dependency_set", authorityId: published.rows[0].id, version: "2", sourceHash: "b".repeat(64) },
          { authorityType: "teaching_content", authorityId, version: "1", sourceHash: "d".repeat(64) },
        ], childId, parentUserId, date: "2026-10-12" });
      assert.equal((await db.query("select adle_homophone_snapshot_valid_v3($1) ok", [compiled.snapshot])).rows[0].ok, true, lesson.microSkillKey);
      const changed = structuredClone(compiled.snapshot);
      changed.payload.resolvedLesson.lesson.words[0].memoryCue = "tampered";
      assert.equal((await db.query("select adle_homophone_snapshot_valid_v3($1) ok", [changed])).rows[0].ok, false);
    }
    for (const lesson of [HOMOPHONE_LESSONS.find(entry => entry.words.length === 2)!, HOMOPHONE_LESSONS.find(entry => entry.words.length === 4)!]) {
      const childId = randomUUID(), parentUserId = randomUUID(), learningItemId = randomUUID();
      const manifest = (await db.query("select * from adle_curriculum_release_manifests where id=$1", [published.rows[0].id])).rows[0];
      const authority = (await db.query("select * from adle_curriculum_dependency_authorities where semantic_projection->>'microSkillKey'=$1", [lesson.microSkillKey])).rows[0];
      await db.query("insert into children values($1,$2,false)", [childId, parentUserId]);
      const readinessReport = { schemaVersion: 1, scope: { kind: "child_allowlist", childIds: [childId] }, emergencyDisableAvailable: true };
      const revisionId = (await db.query("select set_adle_route_activation_revision_v2($1,$2,'local','enabled','allow_existing',$3,null,'sql-regression','fixture activation') id",
        [manifest.release_manifest_sha256, lesson.microSkillKey, readinessReport])).rows[0].id;
      assert.equal((await db.query("select set_adle_route_activation_revision_v2($1,$2,'local','enabled','allow_existing',$3,$4,'sql-regression','idempotent replay') id",
        [manifest.release_manifest_sha256, lesson.microSkillKey, readinessReport, revisionId])).rows[0].id, revisionId);
      await db.query("insert into adle_learning_items(id,child_id,canonical_word_id,micro_skill_key,row_status,item_status,source_kind,reteach_priority) values($1,$2,$3,$4,'active','pending','verified_misspelling',false)",
        [learningItemId, childId, canonicalWords[lesson.microSkillKey][lesson.words[0].word], lesson.microSkillKey]);
      const compiled = compileHomophoneSnapshotV3({ lesson: compileHomophoneLessonSnapshot(lesson.microSkillKey),
        bindings: lesson.words.map((word, index) => ({ word: word.word, canonicalWordId: canonicalWords[lesson.microSkillKey][word.word], learningItemId: index === 0 ? learningItemId : null })),
        release: { activationRevisionId: revisionId, releaseManifestId: manifest.id, releaseKey: manifest.release_key,
          releaseManifestSha256: manifest.release_manifest_sha256, dependencyFingerprint: manifest.dependency_fingerprint },
        contentAuthorities: [
          { authorityType: "release_manifest", authorityId: manifest.id, version: "2", sourceHash: manifest.release_manifest_sha256 },
          { authorityType: "activation_revision", authorityId: revisionId, version: "2", sourceHash: "c".repeat(64) },
          { authorityType: "dependency_set", authorityId: manifest.id, version: "2", sourceHash: manifest.dependency_fingerprint },
          { authorityType: "teaching_content", authorityId: authority.id, version: "1", sourceHash: authority.semantic_fingerprint },
        ], childId, parentUserId, date: "2026-10-12" });
      const args = [parentUserId, childId, "2026-10-12", compiled.header, compiled.items, [], compiled.snapshot];
      const assignmentId = (await db.query("select persist_adle_homophone_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id", args)).rows[0].id;
      assert.equal((await db.query("select persist_adle_homophone_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id", args)).rows[0].id, assignmentId);
      const progress = initialHomophoneProgress();
      progress.stage = "reflection"; progress.binSortCompleted = true; progress.balloonCompleted = true; progress.reflectionResponse = "I will use the meaning clue.";
      for (const word of lesson.words) progress.coverAttempts[word.word] = word.word;
      lesson.dictationPassages.forEach((passage, index) => { progress.dictationValues[String(index)] = [...passage.targets]; progress.dictationChecked[String(index)] = true; });
      const checkpointArgs = [assignmentId, childId, parentUserId, compiled.snapshot.provenance.sourceFingerprint, { state: progress }, 0];
      assert.equal((await db.query("select persist_adle_homophone_checkpoint_v2($1,$2,$3,$4,$5,$6) result", checkpointArgs)).rows[0].result.stateVersion, 1);
      const altered = structuredClone(progress); altered.coverAttempts[lesson.words[0].word] = "altered";
      await assert.rejects(db.query("update adle_specialist_stage_checkpoints set checkpoint_payload=$2 where daily_assignment_id=$1", [assignmentId, { state: altered }]));
      const itemRows = (await db.query("select * from assignment_items where daily_assignment_id=$1 order by position", [assignmentId])).rows;
      const items = itemRows.map((item: Record<string, any>) => ({ id: item.id, sourceEntityId: item.source_entity_id, position: item.position,
        sectionKey: item.metadata.sectionKey, templateKey: item.template_key, canonicalWordId: item.metadata.canonicalWordId,
        targetWord: item.target_word, promptData: item.prompt_data, itemMetadata: item.metadata, microSkillKey: lesson.microSkillKey }));
      const completeProgress = { ...progress, completed: true };
      const facts = homophoneCompletionFacts(compiled.snapshot, completeProgress);
      const learningItems: LearningItemFact[] = [{ learningItemId, childId, canonicalWordId: canonicalWords[lesson.microSkillKey][lesson.words[0].word],
        microSkillKey: lesson.microSkillKey, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "sql-test",
        sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: "2026-10-12", rowStatus: "active" }];
      const sourceRef = `lesson:${childId}:2026-10-12:${lesson.microSkillKey}`;
      const completion = onLessonCompleted(REVIEW_POLICY_V1, { childId, microSkillKey: lesson.microSkillKey, completedOn: "2026-10-12",
        sourceRef, bundleId: randomUUID(), producedWords: facts.producedWords, wordPolicies: facts.wordPolicies, learningItems });
      const attempts = homophoneAttemptEvents({ snapshot: compiled.snapshot, progress: completeProgress,
        items, childId, parentUserId, assignmentId, planDate: "2026-10-12" });
      const reflection = { childId, parentUserId, assignmentId, microSkillKey: lesson.microSkillKey, contentVersion: "homophone_word_lab:v2",
        promptKey: `homophone:${lesson.microSkillKey}:reflection:v2`, promptText: "Which clue will help you choose these words next time?",
        reflectionText: progress.reflectionResponse };
      const finishArgs = [parentUserId, childId, assignmentId, "2026-10-12", lesson.microSkillKey, sourceRef, items.map((item: { id: string }) => item.id), attempts, completion, reflection];
      const finished = await db.query("select complete_adle_homophone_lesson_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result", finishArgs);
      assert.equal(finished.rows[0].result.status, "completed");
      assert.equal((await db.query("select complete_adle_homophone_lesson_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result", finishArgs)).rows[0].result.status, "already_completed");
      assert.equal((await db.query("select count(*)::int n from adle_assignment_attempt_events where daily_assignment_id=$1", [assignmentId])).rows[0].n, compiled.items.length);
    }
    console.log("Homophone SQL contract passed: inactive release, 14 snapshots, governed activation, 2/4-word Finish and retry.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
