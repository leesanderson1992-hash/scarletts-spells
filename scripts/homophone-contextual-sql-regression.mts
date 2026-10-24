import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, resolve } from "node:path";
import approved from "../data/adle/homophone/convergence-v1/approved-lesson-content.json";
import releasePackage from "../data/adle/releases/homophone-convergence-v1/package.json";
import { buildApprovedContextualContent, type PublishedContrastAuthority } from "../lib/adle/homophone/approved-contextual-content";
import { compileConvergenceAssignment } from "../lib/adle/homophone/convergence-assignment";
import { initialHomophoneProgress } from "../lib/adle/homophone/progress";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter)
  .map(path => resolve(path, "../@electric-sql/pglite")).find(existsSync);
if (!root) throw new Error("pglite unavailable; add its node_modules/.bin to PATH");
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
create schema extensions; create schema auth;
create function extensions.digest(bytea,text) returns bytea language sql as $$select sha256($1)$$;
create role anon; create role authenticated; create role service_role;
create table auth.users(id uuid primary key);
create table public.children(id uuid primary key,parent_user_id uuid,is_archived boolean default false);
create table public.micro_skill_catalog(micro_skill_key text primary key);
create table public.canonical_teaching_dictionary_words(id uuid primary key,normalised_word text,
  display_word text,dialect_code text,row_status text,review_status text);
create table public.homophone_contrast_sets(set_key text,revision integer,micro_skill_key text,
  review_status text,semantic_fingerprint text,relation_kind text,primary key(set_key,revision));
create table public.homophone_contrast_set_members(set_key text,revision integer,member_ordinal integer,
  canonical_word_id uuid,intended_sense text,grammatical_role text,target_sentence text);
create table public.adle_curriculum_dependency_authorities(id uuid primary key default gen_random_uuid(),
  authority_key text,authority_type text,schema_version integer,source_classification text,
  manifest_file_sha256 text,authority_manifest jsonb,authority_manifest_sha256 text,
  semantic_projection jsonb,semantic_fingerprint text,source_provenance jsonb,approval_refs jsonb,
  published_by text,unique(authority_type,authority_key),
  constraint adle_curriculum_dependency_authorities_type_check check(authority_type in ('homophone_lesson_content','weak_vowel_lesson_content')));
create table public.adle_curriculum_release_manifests(id uuid primary key default gen_random_uuid(),
  release_key text unique,schema_version integer,manifest_file_sha256 text,manifest_payload jsonb,
  release_manifest_sha256 text,dependency_fingerprint text,route_id text,route_version text,
  activation_route_key text,payload_version integer,approval_refs jsonb,published_by text);
create table public.adle_curriculum_release_dependencies(release_manifest_id uuid,micro_skill_key text,
  authority_type text,authority_key text,authority_schema_version integer,semantic_fingerprint text,
  authority_id uuid,constraint adle_curriculum_release_dependencies_type_check
    check(authority_type in ('homophone_lesson_content','weak_vowel_lesson_content')));
create table public.adle_route_activation_revisions(id uuid primary key default gen_random_uuid(),
  release_manifest_id uuid,route_id text,route_version text,activation_route_key text,micro_skill_key text,
  activation_status text,environment_key text,readiness_report jsonb,
  release_manifest_sha256 text,dependency_fingerprint text,incomplete_assignment_policy text,
  previous_revision_id uuid,change_reason text,changed_by text);
create table public.adle_route_activation_heads(environment_key text,route_id text,
  route_version text,micro_skill_key text,current_revision_id uuid,updated_at timestamptz,
  primary key(environment_key,route_id,route_version,micro_skill_key));
create table public.daily_assignments(id uuid primary key default gen_random_uuid(),child_id uuid,
  parent_user_id uuid,assignment_date date,title text,status text,target_words text[],review_words text[],
  assignment_generation_source text,lesson_route_metadata jsonb,compiled_lesson_snapshot jsonb,
  unique(child_id,assignment_date,title));
create table public.assignment_items(id uuid primary key default gen_random_uuid(),
  daily_assignment_id uuid,child_id uuid,parent_user_id uuid,domain_module text,item_type text,
  source_type text,source_entity_id text,template_key text,target_word text,position integer,
  status text,prompt_data jsonb,metadata jsonb);
create table public.adle_learning_items(id uuid primary key default gen_random_uuid(),child_id uuid,
  canonical_word_id uuid,micro_skill_key text,row_status text,item_status text,
  reteach_priority boolean default false,updated_at timestamptz);
create table public.homophone_assignment_contrast_sets(assignment_id uuid,selected_ordinal integer,
  set_key text,revision integer,semantic_fingerprint text,primary key(assignment_id,selected_ordinal));
create table public.adle_specialist_stage_checkpoints(daily_assignment_id uuid primary key,
  child_id uuid,parent_user_id uuid,adapter_key text,checkpoint_schema_version text,
  lesson_snapshot_fingerprint text,checkpoint_payload jsonb,state_version integer,completed_at timestamptz);
create function public.prevent_adle_release_authority_mutation() returns trigger language plpgsql as
  $$begin raise exception 'immutable'; end;$$;
create function public.adle_lesson_route_metadata_is_valid_v2(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_release_activation_allows_child_v2(uuid,uuid) returns boolean language sql as $$select true$$;
create function public.adle_route_activation_revision_is_current_v2(uuid,uuid,text,text)
  returns boolean language sql as $$select true$$;
create function public.append_adle_specialist_stage_r6(uuid,jsonb,jsonb,jsonb,jsonb)
  returns jsonb language sql as $$select '{}'::jsonb$$;
create function public.adle_generic_lesson_snapshot_is_structurally_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_specialist_lesson_snapshot_is_structurally_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_dynamic_affix_specialist_snapshot_is_structurally_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_prefix_base_specialist_snapshot_is_structurally_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_comparative_snapshot_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_ing_snapshot_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_homophone_snapshot_valid_v3(jsonb) returns boolean language sql as $$select true$$;
create function public.adle_weak_vowel_snapshot_valid_v3(jsonb) returns boolean language sql as $$select true$$;
`);
const canonicalFunctions = readFileSync("supabase/migrations/20260809140000_add_adle_release_authority_foundation.sql", "utf8");
await db.exec(canonicalFunctions.slice(canonicalFunctions.indexOf("create or replace function public.adle_canonical_json_text_v1"),
  canonicalFunctions.indexOf("revoke all on function")));
await db.exec(`create function public.adle_generic_snapshot_json_sha256_v1(jsonb) returns text
  language sql immutable as $$select public.adle_canonical_json_sha256_v1($1)$$;`);
await db.exec(`create function public.adle_snapshot_json_sha256_v1(jsonb) returns text
  language sql immutable as $$select public.adle_canonical_json_sha256_v1($1)$$;
  alter table public.adle_curriculum_dependency_authorities
  add constraint adle_curriculum_dependency_authorities_semantic_hash_check
  check (case when authority_type='compound_structure'
    then semantic_fingerprint=public.adle_snapshot_json_sha256_v1(semantic_projection)
    else semantic_fingerprint=public.adle_canonical_json_sha256_v1(semantic_projection) end);`);
for (const migration of [
  "20261024160000_adle_homophone_contextual_release.sql",
  "20261024161000_adle_homophone_contextual_route.sql",
  "20261024162000_adle_homophone_contextual_evidence.sql",
  "20261024163000_adle_homophone_contextual_activation.sql",
  "20261024164000_adle_homophone_contextual_canonical_hash.sql",
  "20261024165000_adle_homophone_contextual_authority_hash_check.sql",
  "20261024166000_adle_homophone_contextual_item_outcomes.sql",
]) {
  try { await db.exec(readFileSync(`supabase/migrations/${migration}`, "utf8")); }
  catch (error) { const failure = error as Error & { position?: string; where?: string; query?: string };
    console.error(migration, failure.message, failure.position, failure.where);
    process.exit(1); }
}

const source = approved.lessons[0];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const wordIds = new Map(source.sets.flatMap(set => set.members.map(member => member.word))
  .map(word => [word, randomUUID()]));
const authorities: PublishedContrastAuthority[] = source.sets.map(set => ({
  setId: `${set.setKey}@1`, setKey: set.setKey, microSkillKey: source.microSkillKey,
  revision: 1, semanticFingerprint: sha(set.setKey), reviewStatus: "approved",
  relationKind: set.relationKind as PublishedContrastAuthority["relationKind"],
  members: set.members.map(member => ({ ...member, canonicalWordId: wordIds.get(member.word)! })),
}));
const content = buildApprovedContextualContent(source.microSkillKey, authorities);
const snapshot = compileConvergenceAssignment({ content,
  queuedItems: [{ canonicalWordId: authorities[0].members[0].canonicalWordId,
    intakeOn: "2026-10-24", status: "pending" }], masteredWordIds: new Set(), rotationIndex: 0 });
assert.ok(snapshot);
const structural = await db.query<{ valid: boolean }>(
  "select public.adle_homophone_contextual_snapshot_valid_v3($1::jsonb) valid",
  [JSON.stringify(snapshot)]);
assert.equal(structural.rows[0].valid, true, "compiled snapshot must pass database validator");
const tampered = { ...snapshot, contextCheck: { ...snapshot.contextCheck,
  questions: snapshot.contextCheck.questions.slice(1) } };
const rejected = await db.query<{ valid: boolean }>(
  "select public.adle_homophone_contextual_snapshot_valid_v3($1::jsonb) valid",
  [JSON.stringify(tampered)]);
assert.equal(rejected.rows[0].valid, false);
const parentId = randomUUID(), childId = randomUUID(), releaseId = randomUUID();
const authorityId = randomUUID(), revisionId = randomUUID(), learningItemId = randomUUID();
await db.query("insert into auth.users(id) values($1)", [parentId]);
await db.query("insert into public.children(id,parent_user_id) values($1,$2)", [childId,parentId]);
await db.query("insert into public.micro_skill_catalog(micro_skill_key) values($1)", [source.microSkillKey]);
for (const [word, id] of wordIds) await db.query(`insert into public.canonical_teaching_dictionary_words
  (id,normalised_word,display_word,dialect_code,row_status,review_status)
  values($1,$2,$2,'en-GB','active','approved_for_first_exposure')`, [id,word]);
for (const set of authorities) {
  await db.query(`insert into public.homophone_contrast_sets
    (set_key,revision,micro_skill_key,review_status,semantic_fingerprint,relation_kind)
    values($1,1,$2,'approved',$3,$4)`, [set.setKey,source.microSkillKey,set.semanticFingerprint,set.relationKind]);
  for (const [index, member] of set.members.entries()) await db.query(`insert into public.homophone_contrast_set_members
    (set_key,revision,member_ordinal,canonical_word_id,intended_sense,grammatical_role,target_sentence)
    values($1,1,$2,$3,$4,$5,$6)`, [set.setKey,index+1,member.canonicalWordId,
      member.intendedSense,member.grammaticalRole,member.teachingSentence]);
}
await db.query(`insert into public.adle_learning_items
  (id,child_id,canonical_word_id,micro_skill_key,row_status,item_status)
  values($1,$2,$3,$4,'active','pending')`, [learningItemId,childId,authorities[0].members[0].canonicalWordId,source.microSkillKey]);
await db.query(`insert into public.adle_curriculum_release_manifests
  (id,release_key,release_manifest_sha256,dependency_fingerprint,route_id,route_version,
    activation_route_key,payload_version)
  values($1,'fixture',$2,$3,'homophone_contextual_choice','v1','homophone_contextual_choice:v1',1)`,
  [releaseId,sha("manifest"),sha("dependencies")]);
const syntheticProjection = { microSkillKey: source.microSkillKey, content };
const syntheticFingerprint = fingerprintSnapshotValue(syntheticProjection);
await db.query(`insert into public.adle_curriculum_dependency_authorities
  (id,authority_key,authority_type,schema_version,semantic_projection,semantic_fingerprint)
  values($1,'fixture-content','homophone_contextual_content',1,$2::jsonb,$3)`,
  [authorityId,JSON.stringify(syntheticProjection),syntheticFingerprint]);
await db.query(`insert into public.adle_curriculum_release_dependencies
  (release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,
    semantic_fingerprint,authority_id)
  values($1,$2,'homophone_contextual_content','fixture-content',1,$3,$4)`,
  [releaseId,source.microSkillKey,syntheticFingerprint,authorityId]);
await db.query(`insert into public.adle_route_activation_revisions
  (id,release_manifest_id,route_id,route_version,activation_route_key,micro_skill_key,
    activation_status,environment_key,readiness_report)
  values($1,$2,'homophone_contextual_choice','v1','homophone_contextual_choice:v1',$3,
    'enabled','production','{}'::jsonb)`, [revisionId,releaseId,source.microSkillKey]);
const metadata = { metadataSchemaVersion: 2,
  route: { routeId: "homophone_contextual_choice", routeVersion: "v1" },
  recipe: { recipeKey: "homophone_contextual_choice", recipeVersion: "v1" },
  payload: { kind: "homophone_contextual_lesson_v1", version: 1 },
  curriculumRelease: { activationRevisionId: revisionId, releaseManifestId: releaseId,
    releaseKey: "fixture", releaseManifestSha256: sha("manifest"),
    dependencyFingerprint: sha("dependencies") } };
const memberWord = new Map(authorities.flatMap(set => set.members).map(member =>
  [member.canonicalWordId,member.word]));
const items = snapshot.contextCheck.questions.map((question,index) => ({
  childId,parentUserId:parentId,sourceType:"adle_composer",itemType:"adle_lesson_context_choice",
  sourceEntityId:`adl-fixture:${index+1}`,templateKey:"HOMOPHONE_CONTEXT_SENTENCE_CHOICE",
  targetWord:memberWord.get(question.correctWordId),position:index+1,
  promptData:{questionId:question.questionId,setId:question.setId,
    sentenceWithBlank:question.sentenceWithBlank,optionWordIds:question.optionWordIds},
  metadata:{sectionKey:"lesson_context_choice",microSkillKey:source.microSkillKey,
    canonicalWordId:question.correctWordId,
    adleLearningItemRef:question.correctWordId===authorities[0].members[0].canonicalWordId ? learningItemId:null},
}));
const header = { childId,parentUserId:parentId,assignmentDate:"2026-10-24",
  targetWords:[...memberWord.values()],lessonRouteMetadata:metadata };
const persisted = await db.query<{id:string}>(`select public.persist_adle_homophone_contextual_daily_plan_v1(
  $1::uuid,$2::uuid,$3::date,$4::jsonb,$5::jsonb,'[]'::jsonb,$6::jsonb) id`,
  [parentId,childId,"2026-10-24",JSON.stringify(header),JSON.stringify(items),JSON.stringify(snapshot)]);
const assignmentId = persisted.rows[0].id;
const guided = { ...initialHomophoneProgress(),stage:"reflection",binSortCompleted:true,
  balloonCompleted:true,completed:true,reflectionResponse:"The sentence gives a meaning clue.",
  coverAttempts:Object.fromEntries(snapshot.guidedLesson.lesson.coverCheck.map(word=>[word,word])),
  dictationValues:Object.fromEntries(snapshot.guidedLesson.lesson.dictationPassages.map((passage,index)=>
    [String(index),passage.targets])),
  dictationChecked:Object.fromEntries(snapshot.guidedLesson.lesson.dictationPassages.map((_,index)=>
    [String(index),true])) };
const responses = snapshot.contextCheck.questions.map(question => ({
  questionId:question.questionId,selectedWordId:question.correctWordId }));
const state = { schemaVersion:1,stage:"context_check",guided,responses,
  responsesLocked:true,completed:false };
const guidedState = { ...state,stage:"guided",guided:{...guided,completed:false},
  responses:[],responsesLocked:false };
await db.query(`insert into public.adle_specialist_stage_checkpoints
  (daily_assignment_id,child_id,parent_user_id,adapter_key,checkpoint_schema_version,
    lesson_snapshot_fingerprint,checkpoint_payload,state_version)
  values($1,$2,$3,'homophone_contextual_v1','homophone_contextual_progress_v1',$4,
    $5::jsonb,1)`,[assignmentId,childId,parentId,snapshot.sourceFingerprint,JSON.stringify({state:guidedState})]);
await db.query(`update public.adle_specialist_stage_checkpoints
  set checkpoint_payload=$2::jsonb,state_version=2 where daily_assignment_id=$1`,
  [assignmentId,JSON.stringify({state})]);
const finish = await db.query<{result:{status:string}}>(`select public.complete_adle_homophone_contextual_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::date,$5,$6::jsonb) result`,
  [parentId,childId,assignmentId,"2026-10-24",snapshot.sourceFingerprint,JSON.stringify(responses)]);
assert.equal(finish.rows[0].result.status,"completed");
const replay = await db.query<{result:{status:string}}>(`select public.complete_adle_homophone_contextual_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::date,$5,$6::jsonb) result`,
  [parentId,childId,assignmentId,"2026-10-24",snapshot.sourceFingerprint,JSON.stringify(responses)]);
assert.equal(replay.rows[0].result.status,"already_completed");
const evidence = await db.query<{count:number}>(`select count(*)::integer count
  from public.homophone_context_choice_attempts where assignment_id=$1
    and micro_skill_key=$2 and is_correct`,[assignmentId,source.microSkillKey]);
assert.equal(evidence.rows[0].count,responses.length);
const transition = await db.query<{item_status:string}>(`select item_status from public.adle_learning_items
  where id=$1`,[learningItemId]);
assert.equal(transition.rows[0].item_status,"resolved");
await db.exec(`truncate public.homophone_context_choice_attempts,
  public.homophone_context_choice_item_transitions,
  public.adle_specialist_stage_checkpoints,public.homophone_assignment_contrast_sets,
  public.assignment_items,public.daily_assignments,public.adle_learning_items,
  public.adle_route_activation_revisions,public.adle_curriculum_release_dependencies,
  public.adle_route_activation_heads,
  public.adle_curriculum_dependency_authorities,public.adle_curriculum_release_manifests,
  public.homophone_contrast_set_members,public.homophone_contrast_sets,
  public.canonical_teaching_dictionary_words,public.children,auth.users,
  public.micro_skill_catalog cascade;`);
const publishedWords = new Set<string>();
for (const authority of releasePackage.authorities) {
  for (const set of authority.semanticProjection.content.sets) {
    await db.query(`insert into public.homophone_contrast_sets
      (set_key,revision,micro_skill_key,review_status,semantic_fingerprint,relation_kind)
      values($1,$2,$3,'approved',$4,$5)`,[set.setKey,set.revision,
        authority.semanticProjection.microSkillKey,set.semanticFingerprint,set.relationKind]);
    for (const [index, member] of set.members.entries()) {
      if (!publishedWords.has(member.canonicalWordId)) {
        await db.query(`insert into public.canonical_teaching_dictionary_words
          (id,normalised_word,display_word,dialect_code,row_status,review_status)
          values($1,$2,$2,'en-GB','active','approved_for_first_exposure')`,
          [member.canonicalWordId,member.word]);
        publishedWords.add(member.canonicalWordId);
      }
      await db.query(`insert into public.homophone_contrast_set_members
        (set_key,revision,member_ordinal,canonical_word_id,intended_sense,grammatical_role,target_sentence)
        values($1,$2,$3,$4,$5,$6,$7)`,[set.setKey,set.revision,index+1,
          member.canonicalWordId,member.intendedSense,member.grammaticalRole,member.teachingSentence]);
    }
  }
}
const packageFile = readFileSync("data/adle/releases/homophone-convergence-v1/package.json","utf8");
const release = await db.query<{id:string}>(`select public.publish_adle_homophone_contextual_package_v1(
  $1::jsonb,$2,$3) id`,[JSON.stringify(releasePackage),sha(packageFile),"owner-approved-regression"]);
assert.match(release.rows[0].id,/^[0-9a-f-]{36}$/);
const dependencyCount = await db.query<{count:number}>(`select count(*)::integer count
  from public.adle_curriculum_release_dependencies where release_manifest_id=$1`,[release.rows[0].id]);
assert.equal(dependencyCount.rows[0].count,58);
const releaseSha = await db.query<{release_manifest_sha256:string}>(`select release_manifest_sha256
  from public.adle_curriculum_release_manifests where id=$1`,[release.rows[0].id]);
const skillKey = releasePackage.manifest.microSkills[0].microSkillKey;
const activation = await db.query<{id:string}>(`select public.set_adle_homophone_contextual_activation_v1(
  $1,$2,'production','enabled',$3::jsonb,null,'owner-approved-regression','local fixture') id`,
  [releaseSha.rows[0].release_manifest_sha256,skillKey,JSON.stringify({ approved:true })]);
assert.match(activation.rows[0].id,/^[0-9a-f-]{36}$/);
console.log("homophone contextual SQL regression passed");
