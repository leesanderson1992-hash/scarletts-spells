/** Disposable in-memory PostgreSQL schema and contract check; not a staging proof. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { ingPreviewPool } from "../lib/adle/ing/preview-fixture";
import { ING_MICRO_SKILLS } from "../lib/adle/ing/contracts";
import { buildIngReleasePackage } from "../lib/adle/ing/release";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { selectIngWords, compileIngLesson } from "../lib/adle/ing/lesson";
import { compileIngSnapshotV3 } from "../lib/adle/ing/snapshot";
import { initialIngProgress } from "../lib/adle/ing/progress";
import { initialIngScrabbleBoard, moveIngTile } from "../lib/adle/ing/scrabble";
import { ingCompletionFacts } from "../lib/adle/ing/completion";
import { onLessonCompleted } from "../lib/adle/composer-completions";
import { REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import { buildLessonAttemptEvents } from "../lib/adle/assignment-attempt-events";
import type { LearningItemFact } from "../lib/adle/learning-items";
async function main() {
  const require = createRequire(import.meta.url);
  const root = process.env.PATH?.split(delimiter).map(p => resolve(p, "../@electric-sql/pglite")).find(p => existsSync(p));
  if (!root) throw new Error("Run with: npx --package=@electric-sql/pglite --package=tsx -c 'tsx scripts/adle-comparative-sql-regression.ts'");
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
      create table adle_route_activation_revisions(id uuid primary key,route_id text,route_version text,micro_skill_key text,release_manifest_id uuid);
      create table daily_assignments(id uuid primary key default gen_random_uuid(),child_id uuid,parent_user_id uuid,assignment_date date,title text,status text,target_words text[],review_words text[],assignment_generation_source text,lesson_route_metadata jsonb,compiled_lesson_snapshot jsonb,compiled_review_snapshot jsonb);
      create table adle_today_session_orchestrations(daily_assignment_id uuid primary key,child_id uuid,parent_user_id uuid,assignment_date date,major_stage text,review_generation_status text,specialist_generation_status text,specialist_started_at timestamptz);
      create table assignment_items(id uuid primary key default gen_random_uuid(),daily_assignment_id uuid,child_id uuid,parent_user_id uuid,domain_module text,item_type text,source_type text,source_entity_id text,template_key text,target_word text,position int,status text,prompt_data jsonb,metadata jsonb);
      create table children(id uuid,parent_user_id uuid,is_archived boolean);
      create table adle_learning_items(id uuid,child_id uuid,canonical_word_id uuid,micro_skill_key text,row_status text,item_status text,source_kind text,reteach_priority boolean,ejected_on date,updated_at timestamptz);
      create table adle_specialist_stage_checkpoints(daily_assignment_id uuid primary key,adapter_key text,checkpoint_schema_version text,checkpoint_payload jsonb,completed_at timestamptz);
      create function prevent_adle_release_authority_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
      create function adle_lesson_route_metadata_is_valid_v2(jsonb) returns boolean language sql as $$select true$$;
      create function adle_release_activation_allows_child_v2(uuid,uuid) returns boolean language sql as $$select true$$;
      create function adle_route_activation_revision_is_current_v2(uuid,uuid,text,text) returns boolean language sql as $$select true$$;
      create function append_adle_specialist_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
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
    for (const name of ["adle_generic_lesson_snapshot_is_structurally_valid_v2", "adle_generic_lesson_snapshot_is_structurally_valid_v3", "adle_specialist_lesson_snapshot_is_structurally_valid_v3", "adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3", "adle_prefix_base_specialist_snapshot_is_structurally_valid_v3"]) await db.exec(`create function ${name}(jsonb) returns boolean language sql as $$select true$$;`);
    await db.exec(readFileSync("supabase/migrations/20260930120000_add_comparative_superlative_adle_v1.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20260930121000_add_comparative_superlative_finish_v1.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261002110000_comparative_four_question_sequence.sql", "utf8"));
    for (const filename of ["20261002120500_add_ing_endings_adle_v1.sql", "20261002121000_add_ing_endings_assignment_v1.sql", "20261002122000_add_ing_endings_finish_v1.sql", "20261003200000_fix_ing_session_orchestration.sql", "20261003210000_fix_ing_finish_checkpoint_guard.sql"]) await db.exec(readFileSync(`supabase/migrations/${filename}`, "utf8"));
    await db.exec(`
      create function test_converge_ing_completion() returns trigger language plpgsql as $$begin
        if old.status is distinct from 'completed' and new.status='completed' then
          update adle_specialist_stage_checkpoints set completed_at=coalesce(completed_at,clock_timestamp()) where daily_assignment_id=new.id;
        end if;
        return new;
      end$$;
      create trigger test_converge_ing_completion after update on daily_assignments for each row execute function test_converge_ing_completion();
    `);
    const collationProbe = { reviewerRef: "Katie Sanderson", reviewStatus: "approved_for_first_exposure" };
    assert.equal((await db.query("select adle_ing_snapshot_json_sha256_v1($1) hash", [collationProbe])).rows[0].hash, fingerprintSnapshotValue(collationProbe));
    const approved = ING_MICRO_SKILLS.flatMap(skill => ingPreviewPool(skill).map(word => ({ ...word, canonicalWordId: randomUUID(), rowStatus: "active" as const, reviewStatus: "approved_for_first_exposure" as const, reviewerRef: "sql-test-only", approvalRef: "sql-test-only", sourceRefs: ["sql-test-only"] })));
    for (const word of approved) {
      await db.query("insert into micro_skill_catalog values($1) on conflict do nothing", [word.microSkillKey]);
      await db.query("insert into canonical_teaching_dictionary_words values($1,$2,'en-GB','active','approved_for_first_exposure')", [word.canonicalWordId, word.word]);
      assert.equal((await db.query("select adle_ing_word_valid_v1($1) ok", [word])).rows[0].ok, true);
    }
    for (const invalid of [
      { ...approved[0], reviewStatus: null },
      { ...approved[0], word: "jumped" },
      { ...approved[0], dictationSentence: "The child jumps.", audioText: "The child jumps." },
      { ...approved[0], sourceRefs: [] },
    ]) assert.equal((await db.query("select adle_ing_word_valid_v1($1) ok", [invalid])).rows[0].ok, false);
    const pkg = buildIngReleasePackage(approved, "sql-test-only", ["sql-test-only"]);
    const publish = "select publish_adle_ing_package_v1($1,$2,'sql-test-only') id";
    const first = await db.query(publish, [pkg, fingerprintSnapshotValue(pkg)]);
    const retry = await db.query(publish, [pkg, fingerprintSnapshotValue(pkg)]);
    assert.equal(first.rows[0].id, retry.rows[0].id);
    assert.equal((await db.query("select count(*)::integer n from adle_route_activation_revisions")).rows[0].n, 0);
    for (const skill of ING_MICRO_SKILLS) for (const queuedCount of [1, 6]) {
      const pool = approved.filter(word => word.microSkillKey === skill);
      const child = randomUUID(), parent = randomUUID(), revision = randomUUID();
      const queue: LearningItemFact[] = pool.slice(0, queuedCount).map((word, index) => ({ learningItemId: randomUUID(), canonicalWordId: word.canonicalWordId, childId: child, microSkillKey: skill,
        itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "sql-test-only", sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: `2026-09-${20 + index}`, rowStatus: "active" }));
      const selected = selectIngWords(child, skill, pool, queue); assert(selected.ok);
      const lesson = compileIngLesson(selected, `sql:${child}`);
      const manifest = (await db.query("select * from adle_curriculum_release_manifests where id=$1", [first.rows[0].id])).rows[0];
      const authorities = (await db.query("select * from adle_curriculum_dependency_authorities where semantic_projection->>'microSkillKey'=$1", [skill])).rows;
      const refs = { activationRevisionId: revision, releaseManifestId: manifest.id, releaseKey: manifest.release_key, releaseManifestSha256: manifest.release_manifest_sha256, dependencyFingerprint: manifest.dependency_fingerprint };
      const teaching = authorities.find((authority: { authority_type: string }) => authority.authority_type === "teaching_content");
      const contentAuthorities = [
        { authorityType: "release_manifest", authorityId: manifest.id, version: "2", sourceHash: manifest.release_manifest_sha256 },
        { authorityType: "activation_revision", authorityId: revision, version: "2", sourceHash: "a".repeat(64) },
        { authorityType: "dependency_set", authorityId: manifest.id, version: "2", sourceHash: manifest.dependency_fingerprint },
        ...authorities.map((authority: { authority_type: string; id: string; semantic_fingerprint: string }) => ({ authorityType: authority.authority_type, authorityId: authority.id, version: "1", sourceHash: authority.semantic_fingerprint })),
        { authorityType: "recipe_content", authorityId: teaching.id, version: "1", sourceHash: teaching.semantic_fingerprint },
      ] as Parameters<typeof compileIngSnapshotV3>[0]["contentAuthorities"];
      const compiled = compileIngSnapshotV3({ lesson, release: refs, contentAuthorities, childId: child, parentUserId: parent, date: "2026-10-02" });
      assert.equal((await db.query("select adle_ing_snapshot_valid_v3($1) ok", [compiled.snapshot])).rows[0].ok, true);
      await db.query("insert into children values($1,$2,false)", [child, parent]);
      await db.query("insert into adle_route_activation_revisions values($1,'ing_endings_word_lab','v1',$2,$3)", [revision, skill, manifest.id]);
      for (const item of queue) await db.query("insert into adle_learning_items(id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,row_status) values($1,$2,$3,$4,'pending','verified_misspelling','active')", [item.learningItemId, child, item.canonicalWordId, skill]);
      const args = [parent, child, "2026-10-02", compiled.header, compiled.items, [], compiled.snapshot];
      const assignment = (await db.query("select persist_adle_ing_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id", args)).rows[0].id;
      assert.equal((await db.query("select persist_adle_ing_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id", args)).rows[0].id, assignment);
      assert.equal((await db.query("select count(*)::integer n from adle_today_session_orchestrations where daily_assignment_id=$1 and major_stage='specialist_lesson' and specialist_generation_status='ready'", [assignment])).rows[0].n, 1);
      const progress = initialIngProgress(lesson);
      progress.stageId = "reflection"; progress.teachingPageIndex = 2; progress.reflection = "I will check the ending.";
      progress.meaningConnected = [0, 2, 4].map(index => lesson.words[index].canonicalWordId);
      for (const index of [1, 3, 5]) {
        const word = lesson.words[index]; let board = initialIngScrabbleBoard(word); let retained = 0;
        while (word.base[retained] && word.base[retained] === word.word[retained]) retained++;
        for (let i = retained; i < word.base.length; i++) board = moveIngTile(board, `base:${i}`, { kind: "bank" });
        for (let i = retained; i < word.word.length; i++) board = moveIngTile(board, `required:${i - retained}`, { kind: "slot", index: i });
        progress.scrabbleBoards[word.canonicalWordId] = board; progress.scrabbleComplete.push(word.canonicalWordId);
      }
      for (const target of lesson.queuedTargets) progress.cleaverProgress[target.canonicalWordId] = { revealed: true, questionShown: true, selectedOptionId: "0" };
      for (const word of lesson.words) {
        progress.coverAttempts[word.canonicalWordId] = word.word;
        progress.dictationValues[word.canonicalWordId] = word.word;
        progress.dictationChecked.push(word.canonicalWordId);
      }
      await db.query("insert into adle_specialist_stage_checkpoints values($1,'ing_endings_v1','ing_progress_v1',$2,null)", [assignment, { state: progress }]);
      await assert.rejects(db.query("update adle_specialist_stage_checkpoints set checkpoint_payload=jsonb_set(checkpoint_payload,$2,$3) where daily_assignment_id=$1", [assignment, ["state", "coverAttempts", lesson.words[0].canonicalWordId], JSON.stringify("edited")]));
      const facts = ingCompletionFacts(lesson, { ...progress, finished: true });
      const sourceRef = `lesson:${child}:2026-10-02:${skill}`;
      const completion = onLessonCompleted(REVIEW_POLICY_V1, { childId: child, microSkillKey: skill, completedOn: "2026-10-02", sourceRef, bundleId: randomUUID(), producedWords: facts.producedWords, wordPolicies: facts.wordPolicies, learningItems: queue });
      const rows = (await db.query("select * from assignment_items where daily_assignment_id=$1 order by position", [assignment])).rows;
      const items = rows.map((row: Record<string, unknown>) => ({ id: row.id, sourceEntityId: row.source_entity_id, position: row.position,
        sectionKey: (row.metadata as Record<string, unknown>).sectionKey, canonicalWordId: (row.metadata as Record<string, unknown>).canonicalWordId,
        microSkillKey: skill, adleLearningItemRef: (row.metadata as Record<string, unknown>).adleLearningItemRef, promptData: row.prompt_data,
        templateKey: row.template_key, targetWord: row.target_word, status: row.status }));
      const attempts = buildLessonAttemptEvents({ context: { childId: child, parentUserId: parent, assignmentId: assignment, planDate: "2026-10-02" }, sourceRef, items: items as Parameters<typeof buildLessonAttemptEvents>[0]["items"],
        controlledAttempts: facts.controlledAttempts, dictationAttempts: facts.dictationAttempts, guidedAttempts: new Map(items.filter((item: { sectionKey: unknown }) => item.sectionKey === "lesson_intro" || item.sectionKey === "guided_practice").map((item: { id: unknown }) => [item.id as string, "completed"])), probeAttempts: new Map() });
      const finishArgs = [parent, child, assignment, "2026-10-02", skill, sourceRef, items.map((item: { id: unknown }) => item.id), attempts, completion,
        { reflectionText: progress.reflection, promptText: lesson.reflectionPrompt, promptKey: `ing:${skill}:reflection:v1`, contentVersion: "ing_endings_word_lab:v1" }];
      const finishSql = "select complete_adle_ing_lesson_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result";
      assert.equal((await db.query(finishSql, finishArgs)).rows[0].result.status, "completed");
      assert.equal((await db.query(finishSql, finishArgs)).rows[0].result.status, "already_completed");
      assert.equal((await db.query("select count(*)::integer n from adle_taught_word_history where child_id=$1", [child])).rows[0].n, queuedCount);
    }
    console.log("PASS: -ing SQL publication, assignment, frozen answers and atomic Finish/replay for all four rules");
  } finally { await db.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
