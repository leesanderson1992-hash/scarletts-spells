/** Compile and finish an ADLE staging assignment from the CSV-approved boxing meaning. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildIngReleasePackage } from "../lib/adle/ing/release";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { initialIngProgress } from "../lib/adle/ing/progress";
import { initialIngScrabbleBoard, moveIngTile } from "../lib/adle/ing/scrabble";
import { ingCompletionFacts } from "../lib/adle/ing/completion";
import { onLessonCompleted } from "../lib/adle/composer-completions";
import { REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import { buildLessonAttemptEvents } from "../lib/adle/assignment-attempt-events";
import type { LearningItemFact } from "../lib/adle/learning-items";
import type { IngDictionaryWordV1 } from "../lib/adle/ing/contracts";

assert(process.argv.includes("--run-staging-lesson"), "STAGING_PROOF_FLAG_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0], "qkpjbajicacbrphthibk");
const parent = process.env.STAGING_ADMIN_USER_ID;
assert(parent);
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "staging";
const { createServiceRoleClient } = await import("../lib/supabase/service-role");
const { prepareIngAssignment } = await import("../lib/adle/ing/readiness-loader");
const { loadLessonReadiness } = await import("../lib/teaching-dictionary-manager/lesson-preflight");
const { loadRouteWordStatuses } = await import("../lib/teaching-dictionary-manager/route-word-status-service");
const client = createServiceRoleClient();
const skill = "D4_INF_ING_ENDINGS_REGULAR";
const routeId = "ing_endings_word_lab";
const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
const date = new Date().toISOString().slice(0, 10);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
let activation: { old: Record<string, string | object>; newId: string } | undefined;
try {
  const lessons = await loadLessonReadiness({ routeId });
  const lesson = lessons.find(row => row.routeId === routeId && row.microSkillKey === skill);
  assert(lesson, "The staging -ing lesson must exist");
  const statuses = await loadRouteWordStatuses({ routeId, microSkillKey: skill, lesson });
  const imported = statuses.words.find(row => row.wordId === wordId);
  assert.equal(imported?.selectedSenseId, "boxing-verb-packing");
  assert(imported.approvedIngWord, "CSV approval must create a current lesson candidate");
  const target = imported.approvedIngWord;
  const head = (await db.query(`select r.* from adle_route_activation_heads h
    join adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='staging' and h.route_id=$1 and h.micro_skill_key=$2`, [routeId, skill])).rows[0];
  const originalScope = head.readiness_report.scope;
  assert.equal(originalScope.kind, "child_allowlist", "Preserve the existing disposable child scope");
  const available = (await db.query(`select a.semantic_projection->'words' words
    from adle_curriculum_release_dependencies d join adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=$1 and a.authority_type='ing_word_members'`, [head.release_manifest_id])).rows
    .flatMap(row => row.words as IngDictionaryWordV1[]);
  const words = [...available.filter(word => word.word !== target.word && word.canonicalWordId !== wordId), target];
  const pkg = buildIngReleasePackage(words, `staging:reviewed-csv-proof:${fingerprintSnapshotValue(words).slice(0,24)}`,
    [...new Set(words.map(word => word.approvalRef!))]);
  // Publication uses the database's established collation for release hashes.
  const releaseHash = async (value: unknown) => (await db.query(
    "select adle_generic_snapshot_json_sha256_v1($1::jsonb) hash", [value])).rows[0].hash as string;
  const hashes = new Map<string, string>();
  for (const authority of pkg.authorities)
    hashes.set(authority.authorityKey, await releaseHash(authority.semanticProjection));
  for (const authority of pkg.authorities) authority.semanticFingerprint = hashes.get(authority.authorityKey)!;
  for (const entry of pkg.manifest.microSkills) for (const dependency of entry.dependencies)
    dependency.semanticFingerprint = hashes.get(dependency.authorityKey)!;
  pkg.packageSha256 = await releaseHash({ schemaVersion: pkg.schemaVersion, activation: pkg.activation,
    manifest: pkg.manifest, authorities: pkg.authorities });
  const child = randomUUID();
  const learningItemId = randomUUID();
  const sourceRef = `staging-reviewed-csv-proof:${child}`;
  const queue: LearningItemFact[] = [{ learningItemId, canonicalWordId: wordId, childId: child,
    microSkillKey: skill, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef,
    sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: date, rowStatus: "active" }];
  await db.query("begin");
  const releaseId = (await db.query("select public.publish_adle_ing_package_v1($1,$2,$3) id",
    [pkg, fingerprintSnapshotValue(pkg), parent])).rows[0].id;
  const release = (await db.query("select * from adle_curriculum_release_manifests where id=$1", [releaseId])).rows[0];
  assert(release, "Published release must be readable");
  await db.query("insert into children(id,parent_user_id,first_name) values($1,$2,$3)", [child, parent, "ADLE CSV staging proof"]);
  await db.query(`insert into adle_learning_items(id,child_id,canonical_word_id,micro_skill_key,source_kind,source_ref,intake_on,item_status,row_status)
    values($1,$2,$3,$4,'verified_misspelling',$5,$6,'pending','active')`, [learningItemId, child, wordId, skill, sourceRef, date]);
  const change = `select public.set_adle_route_activation_revision_v2($1,$2,'staging',$3,$4,$5,$6,$7,$8) id`;
  const revision = (await db.query(change, [release.release_manifest_sha256, skill, "enabled", "allow_existing",
    { ...head.readiness_report, scope: { kind: "child_allowlist", childIds: [...originalScope.childIds, child] } },
    head.id, parent, "Disposable CSV-to-ADLE lesson proof"])).rows[0].id;
  await db.query("commit");
  activation = { old: head, newId: revision };
  const prepared = await prepareIngAssignment({ client, childId: child, parentUserId: parent,
    date, microSkillKey: skill, learningItems: queue, environmentKey: "staging" });
  assert(prepared.status === "ready", JSON.stringify(prepared));
  const compiled = prepared.snapshot.payload.resolvedLesson;
  assert(compiled.queuedTargets.some(word => word.canonicalWordId === wordId));
  assert.equal(compiled.words.find(word => word.canonicalWordId === wordId)?.meaning, target.meaning);
  const args = [parent, child, date, prepared.header, JSON.stringify(prepared.items), "[]", prepared.snapshot];
  const persist = "select persist_adle_ing_daily_plan_v3($1,$2,$3,$4,$5,$6,$7) id";
  const assignment = (await db.query(persist, args)).rows[0].id;
  assert.equal((await db.query(persist, args)).rows[0].id, assignment);
  const progress = initialIngProgress(compiled);
  progress.stageId = "reflection";
  progress.teachingPageIndex = 2;
  progress.reflection = "I will check the base word before adding the ending.";
  progress.meaningConnected = [0, 2, 4].map(index => compiled.words[index].canonicalWordId);
  for (const index of [1, 3, 5]) {
    const word = compiled.words[index];
    let board = initialIngScrabbleBoard(word);
    let retained = 0;
    while (word.base[retained] && word.base[retained] === word.word[retained]) retained++;
    for (let i = retained; i < word.base.length; i++) board = moveIngTile(board, `base:${i}`, { kind: "bank" });
    for (let i = retained; i < word.word.length; i++) board = moveIngTile(board, `required:${i-retained}`, { kind: "slot", index: i });
    progress.scrabbleBoards[word.canonicalWordId] = board;
    progress.scrabbleComplete.push(word.canonicalWordId);
  }
  for (const word of compiled.queuedTargets) progress.cleaverProgress[word.canonicalWordId] = { revealed: true, questionShown: true, selectedOptionId: "0" };
  for (const word of compiled.words) {
    progress.coverAttempts[word.canonicalWordId] = word.word;
    progress.dictationValues[word.canonicalWordId] = word.word;
    progress.dictationChecked.push(word.canonicalWordId);
  }
  await db.query(`insert into adle_specialist_stage_checkpoints
    (daily_assignment_id,child_id,parent_user_id,adapter_key,checkpoint_schema_version,checkpoint_payload,lesson_snapshot_fingerprint,state_version)
    values($1,$2,$3,'ing_endings_v1','ing_progress_v1',$4,$5,1)`,
    [assignment, child, parent, { state: progress }, prepared.snapshot.provenance.sourceFingerprint]);
  const facts = ingCompletionFacts(compiled, { ...progress, finished: true });
  const completionRef = `lesson:${child}:${date}:${skill}`;
  const completion = onLessonCompleted(REVIEW_POLICY_V1, { childId: child, microSkillKey: skill,
    completedOn: date, sourceRef: completionRef, bundleId: randomUUID(), producedWords: facts.producedWords,
    wordPolicies: facts.wordPolicies, learningItems: queue });
  const rows = (await db.query("select * from assignment_items where daily_assignment_id=$1 order by position", [assignment])).rows;
  const items = rows.map(row => ({ id: row.id, sourceEntityId: row.source_entity_id, position: row.position,
    sectionKey: row.metadata.sectionKey, canonicalWordId: row.metadata.canonicalWordId, microSkillKey: skill,
    adleLearningItemRef: row.metadata.adleLearningItemRef, promptData: row.prompt_data, templateKey: row.template_key,
    targetWord: row.target_word, status: row.status }));
  const attempts = buildLessonAttemptEvents({ context: { childId: child, parentUserId: parent, assignmentId: assignment, planDate: date },
    sourceRef: completionRef, items, controlledAttempts: facts.controlledAttempts, dictationAttempts: facts.dictationAttempts,
    guidedAttempts: new Map(items.filter(item => ["lesson_intro","guided_practice"].includes(item.sectionKey)).map(item => [item.id, "completed"])),
    probeAttempts: new Map() });
  const finishArgs = [parent, child, assignment, date, skill, completionRef, items.map(item => item.id),
    JSON.stringify(attempts), completion, { reflectionText: progress.reflection, promptText: compiled.reflectionPrompt,
      promptKey: `ing:${skill}:reflection:v1`, contentVersion: "ing_endings_word_lab:v1" }];
  const finish = "select complete_adle_ing_lesson_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result";
  const completed = (await db.query(finish, finishArgs)).rows[0].result;
  assert.equal(completed.status, "completed", JSON.stringify(completed));
  assert.equal((await db.query(finish, finishArgs)).rows[0].result.status, "already_completed");
  const readback = (await db.query(`select status,(select count(*)::int from assignment_items
    where daily_assignment_id=$1 and status='completed') completed_items from daily_assignments where id=$1`, [assignment])).rows[0];
  assert.equal(readback.status, "completed");
  assert.equal(readback.completed_items, items.length);
  console.log(JSON.stringify({ assignment, child, date, target: target.word, meaning: target.meaning,
    items: items.length, attempts: attempts.length, finishReplay: "already_completed" }));
} finally {
  await db.query("rollback").catch(() => {});
  if (activation) {
    const { old, newId } = activation;
    await db.query(`select public.set_adle_route_activation_revision_v2($1,$2,'staging',$3,$4,$5,$6,$7,$8)`,
      [old.release_manifest_sha256, skill, old.activation_status, old.incomplete_assignment_policy,
        old.readiness_report, newId, parent, "Restore prior staging lesson scope after CSV proof"]);
  }
  await db.end();
}
