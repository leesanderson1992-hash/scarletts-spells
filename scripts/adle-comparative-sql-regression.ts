/** Disposable in-memory PostgreSQL contract checks, not a staging proof. */
/* eslint-disable @typescript-eslint/no-explicit-any -- isolated PostgreSQL fixture rows are asserted against frozen contracts below */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createDraftDegreeFamilies } from "../lib/adle/inflection/content";
import type { AdjectiveFamilyV1 } from "../lib/adle/inflection/contracts";
import { buildComparativeReleasePackage } from "../lib/adle/inflection/release";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { selectDegreeFamilies } from "../lib/adle/inflection/selection";
import { compileComparativeLesson } from "../lib/adle/inflection/lesson";
import { compileComparativeSnapshotV3 } from "../lib/adle/inflection/snapshot";
import { initialComparativeProgress } from "../lib/adle/inflection/resume";
import { comparativeCompletionFacts } from "../lib/adle/inflection/completion";
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
      create table daily_assignments(id uuid primary key default gen_random_uuid(),child_id uuid,parent_user_id uuid,assignment_date date,title text,status text,target_words text[],review_words text[],assignment_generation_source text,lesson_route_metadata jsonb,compiled_lesson_snapshot jsonb);
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
    const families: AdjectiveFamilyV1[] = createDraftDegreeFamilies().map(f => {
      const words = f.words.map(w => ({ ...w, canonicalWordId: randomUUID() })) as unknown as AdjectiveFamilyV1["words"];
      return { ...f, words, rowStatus: "active", reviewStatus: "approved_for_first_exposure", provenance: { ...f.provenance, reviewerRef: "sql-test-only", approvalRef: "sql-test-only" }, lexicalVerification: { adjective: true, gradable: true, acceptsErEst: true, childSuitable: true, oneSyllable: f.rule === "double_final_consonant", shortVowelBeforeFinalConsonant: f.rule === "double_final_consonant" }, content: { ...f.content, pairedSentence: { ...f.content.pairedSentence, targets: [1, 2].map(i => ({ ...words[i], audioText: words[i].word })) as unknown as AdjectiveFamilyV1["content"]["pairedSentence"]["targets"] } } };
    });
    for (const f of families) {
      await db.query("insert into micro_skill_catalog values($1) on conflict do nothing", [f.microSkillKey]);
      for (const w of f.words) await db.query("insert into canonical_teaching_dictionary_words values($1,$2,'en-GB','active','approved_for_first_exposure')", [w.canonicalWordId, w.word]);
      assert.equal((await db.query("select adle_degree_family_valid_v1($1) ok", [f])).rows[0].ok, true);
    }
    const pkg = buildComparativeReleasePackage(families, "sql-test-only", ["sql-test-only"]);
    const first = await db.query("select publish_adle_comparative_package_v1($1,$2,'sql-test-only') id", [pkg, fingerprintSnapshotValue(pkg)]);
    const retry = await db.query("select publish_adle_comparative_package_v1($1,$2,'sql-test-only') id", [pkg, fingerprintSnapshotValue(pkg)]);
    assert.equal(first.rows[0].id, retry.rows[0].id);
    assert.equal((await db.query("select count(*)::integer n from canonical_teaching_dictionary_adjective_families_v1")).rows[0].n, 24);
    assert.equal((await db.query("select count(*)::integer n from adle_route_activation_revisions")).rows[0].n, 0);
    const bad = { ...families[0], reviewStatus: "in_review" };
    assert.equal((await db.query("select adle_degree_family_valid_v1($1) ok", [bad])).rows[0].ok, false);
    for (const flag of ["adjective","gradable","acceptsErEst","childSuitable"]) assert.equal((await db.query("select adle_degree_family_valid_v1($1) ok",[{...families[0],lexicalVerification:{...families[0].lexicalVerification,[flag]:null}}])).rows[0].ok,false);
    assert.equal((await db.query("select adle_normalize_degree_attempt_v1($1) word",["\uFEFF\tＶＥＲＹ\u000b"])).rows[0].word,"very");
    await assert.rejects(db.query("update canonical_teaching_dictionary_adjective_families_v1 set family_key='edited'"));
    // Execute the new persistence and Finish functions, not just their DDL.
    const microSkills = [...new Set(families.map(f => f.microSkillKey))];
    for (const skill of microSkills) for (const outcomeCase of ["swapped", "misspelt", "no_schedule"] as const) {
      const pool = families.filter(f => f.microSkillKey === skill);
      const child = randomUUID(), parent = randomUUID(), revision = randomUUID();
      const queue: LearningItemFact[] = [pool[0].words[1],pool[0].words[2],pool[1].words[1]].map((w,i) => ({ learningItemId: randomUUID(), canonicalWordId: w.canonicalWordId, childId: child, microSkillKey: skill, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "sql-test-only", sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: `2026-09-${20+i}`, rowStatus: "active" }));
      const selection = selectDegreeFamilies(child,skill,pool,queue); assert.ok(selection.ok);
      const lesson = compileComparativeLesson(selection,`sql:${child}`);
      const manifest = (await db.query("select * from adle_curriculum_release_manifests where id=$1",[first.rows[0].id])).rows[0];
      const authorities = (await db.query("select * from adle_curriculum_dependency_authorities where semantic_projection->>'microSkillKey'=$1",[skill])).rows;
      const refs = { activationRevisionId: revision, releaseManifestId: manifest.id, releaseKey: manifest.release_key, releaseManifestSha256: manifest.release_manifest_sha256, dependencyFingerprint: manifest.dependency_fingerprint };
      const contentAuthorities = [
        { authorityType: "release_manifest",authorityId:manifest.id,version:"2",sourceHash:manifest.release_manifest_sha256 },
        { authorityType: "activation_revision",authorityId:revision,version:"2",sourceHash:"a".repeat(64) },
        { authorityType: "dependency_set",authorityId:manifest.id,version:"2",sourceHash:manifest.dependency_fingerprint },
        ...authorities.map((a: { authority_type: string; id: string; semantic_fingerprint: string }) => ({ authorityType:a.authority_type,authorityId:a.id,version:"1",sourceHash:a.semantic_fingerprint })),
        { authorityType: "recipe_content",authorityId:authorities[0].id,version:"1",sourceHash:authorities[0].semantic_fingerprint },
      ] as Parameters<typeof compileComparativeSnapshotV3>[0]["contentAuthorities"];
      const compiled = compileComparativeSnapshotV3({ lesson,release:refs,contentAuthorities,childId:child,parentUserId:parent,date:"2026-09-29" });
      await db.query("insert into children values($1,$2,false)",[child,parent]);
      await db.query("insert into adle_route_activation_revisions values($1,'comparative_superlative_word_lab','v1',$2,$3)",[revision,skill,manifest.id]);
      for (const q of queue) await db.query("insert into adle_learning_items(id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,row_status) values($1,$2,$3,$4,'pending','verified_misspelling','active')",[q.learningItemId,child,q.canonicalWordId,skill]);
      const args = [parent,child,"2026-09-29",compiled.header,compiled.items,[],compiled.snapshot];
      const assignment = (await db.query("select persist_adle_comparative_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id",args)).rows[0].id;
      assert.equal((await db.query("select persist_adle_comparative_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id",args)).rows[0].id,assignment);
      const progress = initialComparativeProgress(lesson);
      progress.stageId="reflection"; progress.sortPreludeComplete=true; progress.sortComplete=true; progress.reflection="SQL test only";
      for (const t of lesson.sentenceTasks) progress.sentenceProgress[t.id]={rail:{placedIds:[t.degree==="comparative"?"er":"est"],completed:false},placed:true};
      for (const t of lesson.cleaverTasks) progress.cleaverProgress[t.target.canonicalWordId]={revealed:true,questionShown:true,selectedOptionId:t.question.correctOptionId};
      for (const w of lesson.words) progress.coverAttempts[w.canonicalWordId]=outcomeCase==="misspelt"?"wrong":`\t${w.word.toUpperCase()}\n`;
      for (const [index,t] of lesson.dictationTasks.entries()) { progress.dictationValues[t.id]=outcomeCase==="misspelt"?["wrong","wrong"]:index===0?[t.targets[1].word,t.targets[0].word]:[t.targets[0].word,t.targets[1].word];progress.dictationChecked[t.id]=true; }
      await db.query("insert into adle_specialist_stage_checkpoints values($1,'comparative_superlative_v1','comparative_progress_v1',$2,null)",[assignment,{state:progress}]);
      await assert.rejects(db.query("update adle_specialist_stage_checkpoints set checkpoint_payload=jsonb_set(checkpoint_payload,$2,$3) where daily_assignment_id=$1",[assignment,["state","coverAttempts",lesson.words[0].canonicalWordId],JSON.stringify("edited")]));
      const facts = comparativeCompletionFacts(lesson,{...progress,finished:true});
      const sourceRef=`lesson:${child}:2026-09-29:${skill}`;
      const completion=onLessonCompleted(REVIEW_POLICY_V1,{childId:child,microSkillKey:skill,completedOn:"2026-09-29",sourceRef,bundleId:randomUUID(),producedWords:facts.producedWords,wordPolicies:facts.wordPolicies.map(p=>({...p,scheduleEligible:p.scheduleEligible&&outcomeCase!=="no_schedule"})),learningItems:queue});
      const rows = (await db.query("select * from assignment_items where daily_assignment_id=$1 order by position",[assignment])).rows;
      const items = rows.map((r: Record<string, any>) => ({id:r.id,sourceEntityId:r.source_entity_id,position:r.position,sectionKey:r.metadata.sectionKey,canonicalWordId:r.metadata.canonicalWordId,microSkillKey:skill,adleLearningItemRef:r.metadata.adleLearningItemRef,promptData:r.prompt_data,templateKey:r.template_key,targetWord:r.target_word,status:r.status}));
      const attempts=buildLessonAttemptEvents({context:{childId:child,parentUserId:parent,assignmentId:assignment,planDate:"2026-09-29"},sourceRef,items,controlledAttempts:facts.controlledAttempts,dictationAttempts:facts.dictationAttempts,guidedAttempts:new Map(items.filter((i:{sectionKey:string})=>["lesson_intro","guided_practice"].includes(i.sectionKey)).map((i:{id:string})=>[i.id,"completed"])),probeAttempts:new Map()});
      const finishArgs=[parent,child,assignment,"2026-09-29",skill,sourceRef,items.map((i:{id:string})=>i.id),attempts,completion,{reflectionText:progress.reflection,promptText:lesson.reflectionPrompt,promptKey:`degree:${skill}:reflection:v1`,contentVersion:"comparative_superlative_word_lab:v1"},facts.placementOutcomes];
      const finishSql="select complete_adle_comparative_lesson_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result";
      assert.equal((await db.query(finishSql,finishArgs)).rows[0].result.status,"completed");
      assert.equal((await db.query(finishSql,finishArgs)).rows[0].result.status,"already_completed");
      assert.equal((await db.query("select count(*)::integer n from adle_review_schedule_words where child_id=$1 and row_status='active'",[child])).rows[0].n,outcomeCase==="swapped"?3:0);
      assert.equal((await db.query("select count(*)::integer n from adle_comparative_placement_outcomes where daily_assignment_id=$1 and spelling_correct and not placement_correct",[assignment])).rows[0].n,outcomeCase==="misspelt"?0:2);
    }
    console.log("PASS: PostgreSQL inactive publication, frozen assignments, answer locks and atomic Finish/replay for all four profiles (isolated fixture schema)");
  } finally { await db.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
