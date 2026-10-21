import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { buildWeakVowelReleasePackage } from "../lib/adle/weak-vowel/release";
import { prepareLessonFromPublishedWeakVowelWords, type PublishedWeakVowelWord } from "../lib/adle/weak-vowel/governed-content";
import { compileWeakVowelSnapshotV3 } from "../lib/adle/weak-vowel/snapshot";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { childAllowlistActivationReport } from "../lib/adle/route-activation-scope";
import { initialWeakVowelProgress } from "../lib/adle/weak-vowel/progress";
import { weakVowelAttemptEvents } from "../lib/adle/weak-vowel/completion";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";
import { WEAK_VOWEL_MICRO_SKILLS } from "../lib/adle/word-lab/weak-vowel-dinner";
import type { WeakVowelMicroSkill } from "../lib/adle/weak-vowel/lesson";

const files = [
  "20261021211000_adle_weak_vowel_release.sql",
  "20261021212000_adle_weak_vowel_assignment.sql",
  "20261021213000_adle_weak_vowel_finish.sql",
];
const envIndex = process.argv.indexOf("--env-file");
if (envIndex >= 0) process.loadEnvFile(resolve(process.argv[envIndex + 1]));
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(url, "PRODUCTION_DATABASE_URL_REQUIRED");
const target = new URL(url);
assert(target.username.includes("wwohrqtunajrbwxyssjf") && target.hostname.endsWith("pooler.supabase.com"),
  "PRODUCTION_DATABASE_TARGET_MISMATCH");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '90s'");
    for (const file of files) {
      const raw = readFileSync(resolve("supabase/migrations", file), "utf8");
      const sql = raw.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
      await client.query(sql);
    }
    const snapshotIndex = process.argv.indexOf("--snapshot-file");
    if (snapshotIndex >= 0) {
      const snapshot = JSON.parse(readFileSync(resolve(process.argv[snapshotIndex + 1]), "utf8")) as Record<string, unknown>;
      const valid = await client.query<{ valid: boolean }>(
        "SELECT public.adle_weak_vowel_snapshot_valid_v3($1::jsonb) valid", [snapshot]);
      assert.equal(valid.rows[0]?.valid, true, "VALID_FROZEN_SNAPSHOT_REJECTED");
      const tampered = structuredClone(snapshot) as { payload: { resolvedLesson: { words: unknown[] } } };
      tampered.payload.resolvedLesson.words.pop();
      const invalid = await client.query<{ valid: boolean }>(
        "SELECT public.adle_weak_vowel_snapshot_valid_v3($1::jsonb) valid", [tampered]);
      assert.equal(invalid.rows[0]?.valid, false, "TAMPERED_SNAPSHOT_ACCEPTED");
    }
    const pkg = buildWeakVowelReleasePackage({ releaseKey: "weak-vowel-owner-approved-2026-10-21",
      approvalRefs: ["owner-approved-weak-vowel-content-and-design-2026-10-21"] });
    const fileSha = createHash("sha256").update(`${JSON.stringify(pkg, null, 2)}\n`).digest("hex");
    const release = await client.query<{ id: string }>(
      "SELECT public.publish_adle_weak_vowel_package_v1($1::jsonb,$2,$3) id",
      [pkg, fileSha, "Katie Sanderson approved weak-vowel lessons"]);
    assert(release.rows[0]?.id, "RELEASE_INSERT_FAILED");
    const counts = await client.query<{ skills: number; authorities: number }>(`
      SELECT count(distinct d.micro_skill_key)::int skills,count(*)::int authorities
      FROM public.adle_curriculum_release_dependencies d
      WHERE d.release_manifest_id=$1 AND d.authority_type='weak_vowel_lesson_content'`,
    [release.rows[0].id]);
    assert.equal(counts.rows[0]?.skills, 8);
    assert.equal(counts.rows[0]?.authorities, 8);
    const second = await client.query<{ id: string }>(
      "SELECT public.publish_adle_weak_vowel_package_v1($1::jsonb,$2,$3) id",
      [pkg, fileSha, "Katie Sanderson approved weak-vowel lessons"]);
    assert.equal(second.rows[0]?.id, release.rows[0].id, "RELEASE_REPLAY_CHANGED_ID");
    const writerIndex = process.argv.indexOf("--writer-proof");
    if (writerIndex >= 0) {
      const parentId = process.env.ADMIN_USER_IDS?.split(",").map((id) => id.trim()).find(Boolean);
      assert(parentId, "ROLLBACK_PROOF_PARENT_REQUIRED");
      const child = await client.query<{ id: string }>(
        "INSERT INTO public.children(parent_user_id,first_name) VALUES ($1,'ADLE Rollback Proof') RETURNING id", [parentId]);
      console.log("rollback writer proof: synthetic child ready");
      const childId = child.rows[0].id;
      const skillArg = process.argv.indexOf("--skill");
      const skill = (skillArg >= 0 ? process.argv[skillArg + 1] : "D4_SCHWA_FINAL_A_FINAL") as WeakVowelMicroSkill;
      assert(WEAK_VOWEL_MICRO_SKILLS.includes(skill), "ROLLBACK_PROOF_SKILL_INVALID");
      const source = await client.query<{
        content_version_id: string; canonical_word_id: string; micro_skill_key: string;
        source_fingerprint: string; content_sha256: string; dictionary_fingerprint: string;
        current_dictionary_fingerprint: string; word_audio_sha256: string; sentence_audio_sha256: string;
        display_word: string; definition: string; dictation_sentence: string;
        content: PublishedWeakVowelWord["routeContent"];
      }>(`SELECT p.content_version_id,p.canonical_word_id,p.micro_skill_key,
        p.source_fingerprint,p.content_sha256,p.dictionary_fingerprint,
        public.teaching_dictionary_route_dictionary_fingerprint(p.canonical_word_id) current_dictionary_fingerprint,
        p.word_audio_sha256,p.sentence_audio_sha256,w.display_word,d.definition,s.dictation_sentence,
        version.content
        FROM public.adle_weak_vowel_content_publications p
        JOIN public.teaching_dictionary_route_content_versions version ON version.id=p.content_version_id
        JOIN public.canonical_teaching_dictionary_words w ON w.id=p.canonical_word_id
        JOIN LATERAL (SELECT definition FROM public.teaching_dictionary_definition_versions
          WHERE canonical_word_id=p.canonical_word_id AND route_id IS NULL
          ORDER BY published_at DESC,id DESC LIMIT 1) d ON true
        JOIN LATERAL (SELECT dictation_sentence FROM public.canonical_teaching_dictionary_dictation_sentences
          WHERE canonical_word_id=p.canonical_word_id AND row_status='active'
            AND review_status='approved_for_first_exposure'
          ORDER BY created_at DESC,id DESC LIMIT 1) s ON true
        WHERE p.micro_skill_key=$1 ORDER BY w.display_word LIMIT 4`, [skill]);
      assert.equal(source.rows.length, 4, "FOUR_PUBLISHED_WORDS_REQUIRED");
      console.log("rollback writer proof: four published words loaded");
      const published: PublishedWeakVowelWord[] = source.rows.map((row) => ({
        contentVersionId: row.content_version_id, canonicalWordId: row.canonical_word_id,
        microSkillKey: skill, spelling: row.display_word, sourceFingerprint: row.source_fingerprint,
        contentSha256AtPublication: row.content_sha256,
        dictionaryFingerprintAtReview: row.dictionary_fingerprint,
        currentDictionaryFingerprint: row.current_dictionary_fingerprint,
        wordAudioSha256AtPublication: row.word_audio_sha256,
        sentenceAudioSha256AtPublication: row.sentence_audio_sha256,
        definition: row.definition, sentence: row.dictation_sentence, routeContent: row.content,
      }));
      const learningItem = await client.query<{ id: string }>(`
        INSERT INTO public.adle_learning_items
          (child_id,canonical_word_id,micro_skill_key,source_kind,source_ref,intake_on,item_status,row_status)
        VALUES ($1,$2,$3,'verified_misspelling','rollback-only-proof',current_date,'pending','active')
        RETURNING id`, [childId, published[0].canonicalWordId, skill]);
      const slots = published.map((word, index) => ({ canonicalWordId: word.canonicalWordId,
        provenance: index === 0 ? "learning_item" as const : "stretch" as const,
        learningItemId: index === 0 ? learningItem.rows[0].id : null, complexityLevel: null }));
      const prepared = prepareLessonFromPublishedWeakVowelWords({
        assignmentKey: `${childId}:2026-10-21:${skill}`, microSkillKey: skill, slots, published,
        currentAssignedPairs: published.map((word) => ({ canonicalWordId: word.canonicalWordId,
          microSkillKey: skill, assignmentStatus: "assigned" as const })), currentFamilyAuthorities: [],
      });
      assert(prepared.lesson, `SELECTED_CONTENT_BLOCKED:${JSON.stringify(prepared.blockers)}`);
      console.log("rollback writer proof: selected lesson prepared");
      const manifest = await client.query<{ release_manifest_sha256: string; dependency_fingerprint: string; release_key: string }>(
        "SELECT release_manifest_sha256,dependency_fingerprint,release_key FROM public.adle_curriculum_release_manifests WHERE id=$1",
        [release.rows[0].id]);
      const revision = await client.query<{ id: string }>(
        "SELECT public.set_adle_route_activation_revision_v2($1,$2,'production','enabled','allow_existing',$3::jsonb,NULL,$4,$5) id",
        [manifest.rows[0].release_manifest_sha256, skill, childAllowlistActivationReport([childId]),
          "weak-vowel-rollback-proof", "Synthetic child in rolled-back transaction"]);
      console.log("rollback writer proof: scoped revision ready");
      const refs = { activationRevisionId: revision.rows[0].id, releaseManifestId: release.rows[0].id,
        releaseKey: manifest.rows[0].release_key,
        releaseManifestSha256: manifest.rows[0].release_manifest_sha256,
        dependencyFingerprint: manifest.rows[0].dependency_fingerprint };
      const compiled = compileWeakVowelSnapshotV3({ lesson: prepared.lesson, release: refs,
        childId, parentUserId: parentId, date: "2026-10-21", contentAuthorities: [
          { authorityType: "release_manifest", authorityId: refs.releaseManifestId, version: "2", sourceHash: refs.releaseManifestSha256 },
          { authorityType: "activation_revision", authorityId: refs.activationRevisionId, version: "2", sourceHash: "c".repeat(64) },
          { authorityType: "dependency_set", authorityId: refs.releaseManifestId, version: "2", sourceHash: refs.dependencyFingerprint },
          ...prepared.lesson.words.map((word) => ({ authorityType: "teaching_content" as const,
            authorityId: word.dinner.contentVersion, version: "1", sourceHash: word.routeContentSha256! })),
        ] });
      assert.equal(fingerprintSnapshotValue({ ...compiled.snapshot, provenance: {
        sourceKind: "compiled_specialist_assignment", fingerprintAlgorithm: "sha256", fingerprintVersion: 1,
      } }), compiled.snapshot.provenance.sourceFingerprint);
      const created = await client.query<{ id: string }>(
        "SELECT public.persist_adle_weak_vowel_daily_plan_v3($1,$2,$3,$4::jsonb,$5::jsonb,'[]'::jsonb,$6::jsonb) id",
        [parentId, childId, "2026-10-21", JSON.stringify(compiled.header),
          JSON.stringify(compiled.items), JSON.stringify(compiled.snapshot)]);
      console.log("rollback writer proof: assignment inserted");
      assert(created.rows[0]?.id, "WEAK_VOWEL_ASSIGNMENT_WRITER_FAILED");
      const itemCount = await client.query<{ n: number }>(
        "SELECT count(*)::int n FROM public.assignment_items WHERE daily_assignment_id=$1", [created.rows[0].id]);
      assert.equal(itemCount.rows[0]?.n, 17, "WEAK_VOWEL_ASSIGNMENT_ITEMS_INCOMPLETE");
      const replay = await client.query<{ id: string }>(
        "SELECT public.persist_adle_weak_vowel_daily_plan_v3($1,$2,$3,$4::jsonb,$5::jsonb,'[]'::jsonb,$6::jsonb) id",
        [parentId, childId, "2026-10-21", JSON.stringify(compiled.header),
          JSON.stringify(compiled.items), JSON.stringify(compiled.snapshot)]);
      assert.equal(replay.rows[0]?.id, created.rows[0].id, "ASSIGNMENT_REPLAY_DUPLICATED");
      const progress = { ...initialWeakVowelProgress(prepared.lesson), stageId: "reflection" as const,
        dinnerResponse: { guided: true, words: prepared.lesson.words.map((word) => ({ canonicalWordId: word.canonicalWordId })) },
        detectiveResponse: { guided: true, words: prepared.lesson.words.map((word) => ({ canonicalWordId: word.canonicalWordId })) },
        coverAttempts: Object.fromEntries(prepared.lesson.words.map((word) => [word.canonicalWordId, word.spelling])),
        dictationAttempts: Object.fromEntries(prepared.lesson.words.map((word) => [word.canonicalWordId, word.dictation.sentence])),
        dictationChecked: prepared.lesson.words.map((word) => word.canonicalWordId),
        reflection: "I will listen for the quiet vowel and remember its letter." };
      await client.query(`INSERT INTO public.adle_specialist_stage_checkpoints
        (daily_assignment_id,child_id,parent_user_id,adapter_key,checkpoint_schema_version,
         lesson_snapshot_fingerprint,checkpoint_payload,state_version)
        VALUES ($1,$2,$3,'weak_vowel_v1','weak_vowel_progress_v1',$4,$5::jsonb,1)`,
      [created.rows[0].id, childId, parentId, compiled.snapshot.provenance.sourceFingerprint,
        JSON.stringify({ state: progress })]);
      await client.query("SAVEPOINT changed_hidden_answer");
      try {
        await client.query(`UPDATE public.adle_specialist_stage_checkpoints SET
          checkpoint_payload=jsonb_set(checkpoint_payload,$2::text[],'"forged"'::jsonb)
          WHERE daily_assignment_id=$1`, [created.rows[0].id,
          ["state", "coverAttempts", prepared.lesson.words[0].canonicalWordId]]);
        throw new Error("HIDDEN_ANSWER_REWRITE_ACCEPTED");
      } catch (error) {
        if (error instanceof Error && error.message === "HIDDEN_ANSWER_REWRITE_ACCEPTED") throw error;
        await client.query("ROLLBACK TO SAVEPOINT changed_hidden_answer");
      }
      const itemRows = await client.query<{
        id: string; source_entity_id: string; position: number; status: string;
        target_word: string | null; metadata: Record<string, unknown>;
        prompt_data: Record<string, unknown>; template_key: string;
      }>(`SELECT id,source_entity_id,position,status,target_word,metadata,prompt_data,template_key
        FROM public.assignment_items WHERE daily_assignment_id=$1 ORDER BY position`, [created.rows[0].id]);
      const items: AdleSessionItem[] = itemRows.rows.map((row) => ({ id: row.id,
        sourceEntityId: row.source_entity_id, position: row.position, status: row.status,
        targetWord: row.target_word, templateKey: row.template_key,
        canonicalWordId: typeof row.metadata.canonicalWordId === "string" ? row.metadata.canonicalWordId : null,
        microSkillKey: skill,
        adleLearningItemRef: typeof row.metadata.adleLearningItemRef === "string" ? row.metadata.adleLearningItemRef : null,
        sectionKey: String(row.metadata.sectionKey), promptData: row.prompt_data, itemMetadata: row.metadata }));
      const attempts = weakVowelAttemptEvents({ snapshot: compiled.snapshot, progress, items,
        childId, parentUserId: parentId, assignmentId: created.rows[0].id, planDate: "2026-10-21" });
      const sourceRef = `lesson:${childId}:2026-10-21:${skill}`;
      const completion = { bundle: null, scheduleWords: [], itemTransitions: [],
        taughtEvents: [{ childId, canonicalWordId: prepared.lesson.words[0].canonicalWordId,
          eventKind: "taught", occurredOn: "2026-10-21", sourceRef,
          attemptText: prepared.lesson.words[0].spelling }] };
      const reflection = { childId, parentUserId: parentId, assignmentId: created.rows[0].id,
        microSkillKey: skill, contentVersion: "weak_vowel_word_lab:v1",
        promptKey: `weak-vowel:${skill}:reflection:v1`,
        promptText: prepared.lesson.reflectionPrompt, reflectionText: progress.reflection };
      const finishArgs = [parentId, childId, created.rows[0].id, "2026-10-21", skill,
        sourceRef, items.map((item) => item.id), JSON.stringify(attempts),
        JSON.stringify(completion), JSON.stringify(reflection)] as const;
      const finished = await client.query<{ outcome: { status: string } }>(
        "SELECT public.complete_adle_weak_vowel_lesson_v1($1,$2,$3,$4,$5,$6,$7::uuid[],$8::jsonb,$9::jsonb,$10::jsonb) outcome",
        finishArgs);
      assert.equal(finished.rows[0]?.outcome.status, "completed", "FINISH_NOT_COMMITTED");
      const repeated = await client.query<{ outcome: { status: string } }>(
        "SELECT public.complete_adle_weak_vowel_lesson_v1($1,$2,$3,$4,$5,$6,$7::uuid[],$8::jsonb,$9::jsonb,$10::jsonb) outcome",
        finishArgs);
      assert.equal(repeated.rows[0]?.outcome.status, "already_completed", "FINISH_NOT_IDEMPOTENT");
      const evidence = await client.query<{ guided: number; controlled: number; total: number }>(`
        SELECT count(*) FILTER (WHERE evidence_class='guided_practice_attempt' AND is_correct IS NULL)::int guided,
          count(*) FILTER (WHERE evidence_class='first_exposure_lesson_attempt' AND is_correct=true)::int controlled,
          count(*)::int total FROM public.adle_assignment_attempt_events
          WHERE daily_assignment_id=$1`, [created.rows[0].id]);
      assert.deepEqual(evidence.rows[0], { guided: 9, controlled: 8, total: 17 },
        "GUIDED_OR_CONTROLLED_EVIDENCE_MISCLASSIFIED");
    }
    const malformed = structuredClone(pkg);
    malformed.authorities[0].semanticProjection.teachingTemplateSha256 = "0".repeat(64);
    await client.query("SAVEPOINT malformed_package");
    try {
      await client.query("SELECT public.publish_adle_weak_vowel_package_v1($1::jsonb,$2,$3)",
        [malformed, fileSha, "rollback proof"]);
      throw new Error("MALFORMED_PACKAGE_ACCEPTED");
    } catch (error) {
      if (error instanceof Error && error.message === "MALFORMED_PACKAGE_ACCEPTED") throw error;
      await client.query("ROLLBACK TO SAVEPOINT malformed_package");
    }
    const heads = await client.query<{ n: number }>(
      "SELECT count(*)::int n FROM public.adle_route_activation_heads WHERE route_id='weak_vowel_word_lab'");
    assert.equal(heads.rows[0]?.n, writerIndex >= 0 ? 1 : 0, "PROOF_ACTIVATION_COUNT_CHANGED");
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ target: "production", proof: "rollback_only", migrations: files.length,
      releaseAuthorities: 8, activationHeads: 0, malformedPackageRejected: true,
      frozenSnapshotChecked: snapshotIndex >= 0, writerChecked: writerIndex >= 0,
      changesCommitted: false }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error));
  if (error && typeof error === "object" && "where" in error) console.error(String(error.where).slice(0, 1200));
  process.exitCode = 1; });
