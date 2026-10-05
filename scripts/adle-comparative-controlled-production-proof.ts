import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { buildLessonAttemptEvents } from "../lib/adle/assignment-attempt-events";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { onLessonCompleted } from "../lib/adle/composer-completions";
import { comparativeCompletionFacts } from "../lib/adle/inflection/completion";
import { compileComparativeLesson } from "../lib/adle/inflection/lesson";
import { initialComparativeProgress } from "../lib/adle/inflection/resume";
import { selectDegreeFamilies } from "../lib/adle/inflection/selection";
import { compileComparativeSnapshotV3 } from "../lib/adle/inflection/snapshot";

const DATABASE_URL = process.env.ADLE_PRODUCTION_DATABASE_URL;
if (!DATABASE_URL) throw new Error("ADLE_PRODUCTION_DATABASE_URL is required");

const CHILD = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const PARENT = "a28d4885-8328-4853-ba11-6c676619b9ea";
const RELEASE_KEY = "comparative_superlative_word_lab_v1_2026_10_02";
const RUNS = [
  ["D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR", "2026-10-02"],
  ["D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E", "2026-10-03"],
  ["D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I", "2026-10-04"],
  ["D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLE_FINAL_CONSONANT", "2026-10-05"],
] as const;

const db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const json = (value: unknown) => JSON.stringify(value);

async function prove(skill: string, date: string) {
  const release = (await db.query(`select id,release_key,release_manifest_sha256,dependency_fingerprint
    from public.adle_curriculum_release_manifests where release_key=$1`, [RELEASE_KEY])).rows[0];
  if (!release) throw new Error("comparative_release_missing");
  const revision = (await db.query(`select r.* from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.route_id='comparative_superlative_word_lab'
      and h.route_version='v1' and h.micro_skill_key=$1`, [skill])).rows[0];
  if (!revision || revision.activation_status !== "enabled" || revision.readiness_report?.scope?.kind !== "child_allowlist"
    || !revision.readiness_report.scope.childIds?.includes(CHILD)) throw new Error(`proof_scope_unavailable:${skill}`);
  const dependencies = (await db.query(`select d.authority_type,a.id,a.semantic_projection,a.semantic_fingerprint
    from public.adle_curriculum_release_dependencies d join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=$1 and d.micro_skill_key=$2`, [release.id, skill])).rows;
  const authority = (kind: string) => dependencies.find((row) => row.authority_type === kind);
  const families = authority("adjective_degree_families")?.semantic_projection?.families;
  const teaching = authority("teaching_content");
  const closure = authority("teaching_dictionary_closure");
  if (!Array.isArray(families) || !teaching || !closure) throw new Error(`proof_dependencies_missing:${skill}`);
  const itemRows = (await db.query(`select id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,
    source_attempt_text,reteach_priority,ejected_on,intake_on,row_status from public.adle_learning_items
    where child_id=$1 and micro_skill_key=$2 and row_status='active' order by intake_on,id`, [CHILD, skill])).rows;
  const items = itemRows.map((row) => ({ learningItemId: row.id, childId: row.child_id, canonicalWordId: row.canonical_word_id,
    microSkillKey: row.micro_skill_key, itemStatus: row.item_status, sourceKind: row.source_kind, sourceRef: row.source_ref,
    sourceAttemptText: row.source_attempt_text, reteachPriority: row.reteach_priority, ejectedOn: row.ejected_on, intakeOn: row.intake_on, rowStatus: row.row_status }));
  const selection = selectDegreeFamilies(CHILD, skill as never, families, items);
  if (!selection.ok) throw new Error(`proof_selection:${selection.blockers.join(",")}`);
  const lesson = compileComparativeLesson(selection, `adle:${CHILD}:${date}:${skill}`);
  lesson.teaching.pages = [teaching.semantic_projection.sharedPage, {
    ...teaching.semantic_projection.rulePage,
    examples: lesson.families.map((family) => ({ text: family.words.map((word) => word.word).join(" → "), explanation: family.meaning })),
  }];
  lesson.reflectionPrompt = teaching.semantic_projection.reflectionPrompt;
  const sourceHash = (value: unknown) => fingerprintSnapshotValue(JSON.parse(JSON.stringify(value)));
  const compiled = compileComparativeSnapshotV3({ lesson, childId: CHILD, parentUserId: PARENT, date,
    release: { activationRevisionId: revision.id, releaseManifestId: release.id, releaseKey: release.release_key,
      releaseManifestSha256: release.release_manifest_sha256, dependencyFingerprint: release.dependency_fingerprint },
    contentAuthorities: [
      { authorityType: "release_manifest", authorityId: release.id, version: "2", sourceHash: release.release_manifest_sha256 },
      { authorityType: "activation_revision", authorityId: revision.id, version: "2", sourceHash: sourceHash(revision) },
      { authorityType: "dependency_set", authorityId: release.id, version: "2", sourceHash: release.dependency_fingerprint },
      { authorityType: "adjective_degree_families", authorityId: authority("adjective_degree_families").id, version: "1", sourceHash: authority("adjective_degree_families").semantic_fingerprint },
      { authorityType: "teaching_content", authorityId: teaching.id, version: "1", sourceHash: teaching.semantic_fingerprint },
      { authorityType: "teaching_dictionary_closure", authorityId: closure.id, version: "1", sourceHash: closure.semantic_fingerprint },
      { authorityType: "recipe_content", authorityId: teaching.id, version: "1", sourceHash: teaching.semantic_fingerprint },
    ],
  });
  const persisted = await db.query(`select public.persist_adle_comparative_daily_plan_v3($1,$2,$3,$4::jsonb,$5::jsonb,'[]'::jsonb,$6::jsonb) id`,
    [PARENT, CHILD, date, json(compiled.header), json(compiled.items), json(compiled.snapshot)]);
  const assignmentId = persisted.rows[0].id;
  const progress = initialComparativeProgress(lesson);
  progress.stageId = "reflection"; progress.teachingPageIndex = 2; progress.sentenceIndex = 5;
  progress.sortPreludeComplete = true; progress.sortComplete = true; progress.cleaverIndex = lesson.cleaverTasks.length - 1;
  progress.coverIndex = 5; progress.dictationIndex = 1;
  for (const task of lesson.sentenceTasks) progress.sentenceProgress[task.id] = { rail: { placedIds: [task.degree === "comparative" ? "er" : "est"], completed: true }, placed: true };
  for (const task of lesson.cleaverTasks) progress.cleaverProgress[task.target.canonicalWordId] = { revealed: true, questionShown: true, selectedOptionId: task.question.correctOptionId, splitMisses: 0 };
  for (const word of lesson.words) { progress.coverProgress[word.canonicalWordId] = { state: "check", attempt: word.word }; progress.coverAttempts[word.canonicalWordId] = word.word; }
  for (const sentence of lesson.dictationTasks) { progress.dictationValues[sentence.id] = [sentence.targets[0].word, sentence.targets[1].word]; progress.dictationChecked[sentence.id] = true; }
  progress.reflection = "I will remember which spelling change helps the ending fit the word.";
  await db.query(`insert into public.adle_specialist_stage_checkpoints(daily_assignment_id,child_id,parent_user_id,adapter_key,checkpoint_schema_version,lesson_snapshot_fingerprint,checkpoint_payload)
    values($1,$2,$3,'comparative_superlative_v1','comparative_progress_v1',$4,$5::jsonb) on conflict (daily_assignment_id) do nothing`,
    [assignmentId, CHILD, PARENT, compiled.snapshot.provenance.sourceFingerprint, json({ state: progress })]);
  const assignmentItems = (await db.query(`select id,source_entity_id,position,status,metadata,prompt_data,template_key,target_word from public.assignment_items where daily_assignment_id=$1 order by position`, [assignmentId])).rows.map((row) => ({
    id: row.id, sourceEntityId: row.source_entity_id ?? "", position: row.position, status: row.status,
    canonicalWordId: row.metadata?.canonicalWordId ?? null, microSkillKey: row.metadata?.microSkillKey ?? null,
    sectionKey: row.metadata?.sectionKey ?? "", adleLearningItemRef: row.metadata?.adleLearningItemRef ?? null,
    templateKey: row.template_key ?? "", targetWord: row.target_word, promptData: row.prompt_data ?? {},
  }));
  const finished = { ...progress, finished: true };
  const facts = comparativeCompletionFacts(lesson, finished);
  const sourceRef = `lesson:${CHILD}:${date}:${skill}`;
  const policyRow = (await db.query(`select schedule_policy_version,interval_ladder_days,catch_up_offsets_days,session_cap,pre_retirement_check_gap_days
    from public.adle_review_policy_versions where is_active=true`)).rows;
  if (policyRow.length !== 1) throw new Error("proof_review_policy_missing");
  const policy = { schedulePolicyVersion: policyRow[0].schedule_policy_version, intervalLadderDays: policyRow[0].interval_ladder_days,
    catchUpOffsetsDays: policyRow[0].catch_up_offsets_days, sessionCap: policyRow[0].session_cap, preRetirementCheckGapDays: policyRow[0].pre_retirement_check_gap_days };
  const completion = onLessonCompleted(policy, { childId: CHILD, microSkillKey: skill, completedOn: date, sourceRef, bundleId: randomUUID(),
    producedWords: facts.producedWords, wordPolicies: facts.wordPolicies, learningItems: items });
  const attempts = buildLessonAttemptEvents({ context: { childId: CHILD, parentUserId: PARENT, assignmentId, planDate: date }, sourceRef,
    items: assignmentItems, controlledAttempts: facts.controlledAttempts, dictationAttempts: facts.dictationAttempts,
    guidedAttempts: new Map(assignmentItems.filter((item) => item.sectionKey === "lesson_intro" || item.sectionKey === "guided_practice").map((item) => [item.id, "completed"])), probeAttempts: new Map(), correctness: "exact_governed_form" })
    .map((event) => lesson.words.find((word) => word.canonicalWordId === event.canonicalWordId)?.degree === "base" ? { ...event, microSkillKey: null } : event);
  const params = [PARENT, CHILD, assignmentId, date, skill, sourceRef, assignmentItems.map((item) => item.id), json(attempts), json(completion), json({ childId: CHILD, parentUserId: PARENT, assignmentId, microSkillKey: skill, contentVersion: "comparative_superlative_word_lab:v1", promptKey: `degree:${skill}:reflection:v1`, promptText: lesson.reflectionPrompt, reflectionText: progress.reflection }), json(facts.placementOutcomes)];
  const first = (await db.query(`select public.complete_adle_comparative_lesson_v1($1,$2,$3,$4,$5,$6,$7::uuid[],$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb) result`, params)).rows[0].result;
  const replay = (await db.query(`select public.complete_adle_comparative_lesson_v1($1,$2,$3,$4,$5,$6,$7::uuid[],$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb) result`, params)).rows[0].result;
  const reloaded = (await db.query(`select a.status,c.checkpoint_payload->'state' state,(select count(*)::int from public.adle_comparative_placement_outcomes where daily_assignment_id=a.id) placements
    from public.daily_assignments a join public.adle_specialist_stage_checkpoints c on c.daily_assignment_id=a.id where a.id=$1`, [assignmentId])).rows[0];
  if (first.status !== "completed" || replay.status !== "already_completed" || reloaded.status !== "completed" || reloaded.state.finished !== true || reloaded.placements !== 4) throw new Error(`proof_finish_or_replay_failed:${skill}`);
  return { skill, assignmentId, itemCount: assignmentItems.length, first: first.status, replay: replay.status, reloaded: reloaded.status, placements: reloaded.placements };
}

async function main() {
  await db.connect();
  try {
    const proofs = [];
    for (const [skill, date] of RUNS) proofs.push(await prove(skill, date));
    console.log(JSON.stringify({ status: "verified", proofs }, null, 2));
  }
  finally { await db.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
